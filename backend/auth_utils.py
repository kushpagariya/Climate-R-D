import os
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from bson import ObjectId
from bson.errors import InvalidId
from flask import g, jsonify, request

JWT_SECRET = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_HOURS = int(os.getenv("JWT_EXPIRES_HOURS", "24"))


def utc_now():
    return datetime.now(timezone.utc)


def _require_jwt_secret():
    if not JWT_SECRET or JWT_SECRET == "indravani-dev-secret-change-in-production":
        # Allow dev default only when explicitly flagged
        if os.getenv("FLASK_ENV", "").lower() != "development":
            raise RuntimeError("JWT_SECRET must be set to a strong value in production.")


def create_token(user_id):
    _require_jwt_secret()
    secret = JWT_SECRET or "indravani-dev-secret-change-in-production"
    expires_at = utc_now() + timedelta(hours=JWT_EXPIRES_HOURS)
    payload = {
        "sub": str(user_id),
        "exp": expires_at,
        "iat": utc_now(),
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"success": False, "error": "Unauthorized"}), 401

        token = auth_header[7:]
        secret = JWT_SECRET or "indravani-dev-secret-change-in-production"

        try:
            payload = jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])
            user_id = payload.get("sub")
            if not user_id:
                return jsonify({"success": False, "error": "Invalid token"}), 401

            try:
                object_id = ObjectId(user_id)
            except (InvalidId, TypeError):
                return jsonify({"success": False, "error": "Invalid token"}), 401

            users = g.db["users"]
            user = users.find_one({"_id": object_id})
            if not user:
                return jsonify({"success": False, "error": "User not found"}), 401

            g.user = user
            g.user_id = str(user["_id"])
        except jwt.ExpiredSignatureError:
            return jsonify({"success": False, "error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"success": False, "error": "Invalid token"}), 401

        return f(*args, **kwargs)

    return decorated


def log_activity(action, resource_type=None, resource_id=None, metadata=None):
    activity_logs = g.db["activity_logs"]
    activity_logs.insert_one(
        {
            "userId": g.user["_id"],
            "action": action,
            "resourceType": resource_type,
            "resourceId": resource_id,
            "metadata": metadata or {},
            "createdAt": utc_now(),
        }
    )