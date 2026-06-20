import os
from datetime import datetime, timezone
from functools import wraps

import bcrypt
import jwt
from bson import ObjectId
from dotenv import load_dotenv
from flask import Flask, g, jsonify, request
from flask_cors import CORS
from pymongo import MongoClient

load_dotenv()

app = Flask(__name__)
CORS(app)

JWT_SECRET = os.getenv("JWT_SECRET", "indravani-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"

client = MongoClient(os.getenv("MONGO_URI"))

try:
    client.admin.command("ping")
    print("MongoDB Connected Successfully")
except Exception as e:
    print("MongoDB Connection Error:")
    print(e)

db = client["indravani_weather_db"]
users = db["users"]
user_profiles = db["user_profiles"]

users.create_index("email", unique=True)
user_profiles.create_index("userId", unique=True)


def utc_now():
    return datetime.now(timezone.utc)


def serialize_user(doc):
    return {
        "id": str(doc["_id"]),
        "fullName": doc["fullName"],
        "email": doc["email"],
        "organization": doc.get("organization"),
    }


def serialize_profile(doc):
    if not doc:
        return {
            "role": None,
            "purposes": [],
            "onboardingComplete": False,
        }
    return {
        "role": doc.get("role"),
        "purposes": doc.get("purposes", []),
        "onboardingComplete": doc.get("onboardingComplete", False),
    }


def create_token(user_id):
    return jwt.encode({"sub": str(user_id)}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_profile_for_user(user_id):
    return user_profiles.find_one({"userId": ObjectId(user_id)})


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

            user = users.find_one({"_id": ObjectId(user_id)})
            if not user:
                return jsonify({"success": False, "error": "User not found"}), 401

            g.user = user
            g.user_id = user_id
        except jwt.InvalidTokenError:
            return jsonify({"success": False, "error": "Invalid token"}), 401

        return f(*args, **kwargs)

    return decorated


@app.route("/")
def home():
    return {"message": "Backend Running"}


@app.route("/signup", methods=["POST"])
def signup():
    data = request.get_json(silent=True) or {}

    full_name = (data.get("fullName") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    organization = (data.get("organization") or "").strip() or None

    if not full_name or not email or not password:
        return jsonify({"success": False, "error": "Full name, email, and password are required."}), 400

    if users.find_one({"email": email}):
        return jsonify({"success": False, "error": "An account with this email already exists."}), 409

    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    now = utc_now()

    user_doc = {
        "fullName": full_name,
        "email": email,
        "passwordHash": password_hash,
        "organization": organization,
        "createdAt": now,
    }

    result = users.insert_one(user_doc)
    user_id = result.inserted_id

    user_profiles.insert_one(
        {
            "userId": user_id,
            "role": None,
            "purposes": [],
            "onboardingComplete": False,
            "updatedAt": now,
        }
    )

    user = users.find_one({"_id": user_id})
    token = create_token(user_id)

    return jsonify(
        {
            "success": True,
            "user": serialize_user(user),
            "token": token,
        }
    )


@app.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"success": False, "error": "Email and password are required."}), 400

    user = users.find_one({"email": email})
    if not user:
        return jsonify({"success": False, "error": "Invalid email or password."}), 401

    stored_hash = user.get("passwordHash")
    if not stored_hash or not bcrypt.checkpw(password.encode("utf-8"), stored_hash):
        return jsonify({"success": False, "error": "Invalid email or password."}), 401

    profile_doc = get_profile_for_user(user["_id"])
    token = create_token(user["_id"])

    return jsonify(
        {
            "success": True,
            "user": serialize_user(user),
            "profile": serialize_profile(profile_doc),
            "token": token,
        }
    )


@app.route("/users/me/profile", methods=["GET"])
@require_auth
def get_profile():
    profile_doc = get_profile_for_user(g.user["_id"])
    return jsonify(serialize_profile(profile_doc))


@app.route("/users/me/profile", methods=["PATCH"])
@require_auth
def update_profile():
    data = request.get_json(silent=True) or {}
    updates = {"updatedAt": utc_now()}

    if "role" in data:
        updates["role"] = data.get("role")

    if "purposes" in data:
        updates["purposes"] = data.get("purposes") or []

    if "onboardingComplete" in data:
        updates["onboardingComplete"] = bool(data.get("onboardingComplete"))

    user_profiles.update_one(
        {"userId": g.user["_id"]},
        {"$set": updates},
        upsert=True,
    )

    return jsonify({"success": True})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
