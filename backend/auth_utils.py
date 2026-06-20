import os
from datetime import datetime, timezone
from functools import wraps

import jwt
from bson import ObjectId
from flask import g, jsonify, request

JWT_SECRET = os.getenv("JWT_SECRET", "indravani-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"


def utc_now():
    return datetime.now(timezone.utc)


def create_token(user_id):
    return jwt.encode({"sub": str(user_id)}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"success": False, "error": "Unauthorized"}), 401

        token = auth_header[7:]
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user_id = payload.get("sub")
            if not user_id:
                return jsonify({"success": False, "error": "Invalid token"}), 401

            users = g.db["users"]
            user = users.find_one({"_id": ObjectId(user_id)})
            if not user:
                return jsonify({"success": False, "error": "User not found"}), 401

            g.user = user
            g.user_id = str(user["_id"])
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
