import os

import bcrypt
from bson import ObjectId
from dotenv import load_dotenv
from flask import Flask, g, jsonify, request
from flask_cors import CORS
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

from auth_utils import create_token, require_auth, utc_now, log_activity
from routes.activity import activity_bp
from routes.analysis import analysis_bp
from routes.favorites import favorites_bp
from routes.history import history_bp
from routes.radiosonde import radiosonde_bp

load_dotenv()

app = Flask(__name__)
CORS(app)

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
graph_history = db["graph_history"]
saved_analyses = db["saved_analyses"]
favorites = db["favorites"]
activity_logs = db["activity_logs"]
radiosonde_history = db["radiosonde_history"]

users.create_index("email", unique=True)
user_profiles.create_index("userId", unique=True)
graph_history.create_index([("userId", 1), ("createdAt", -1)])
saved_analyses.create_index([("userId", 1), ("createdAt", -1)])
favorites.create_index([("userId", 1), ("createdAt", -1)])
activity_logs.create_index([("userId", 1), ("createdAt", -1)])
radiosonde_history.create_index([("stationId", 1), ("date", 1), ("time", 1)])
radiosonde_history.create_index([("stationId", 1), ("recordType", 1), ("createdAt", -1)])


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


def get_profile_for_user(user_id):
    return user_profiles.find_one({"userId": user_id})


@app.before_request
def attach_db():
    g.db = db


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

    try:
        result = users.insert_one(user_doc)
    except DuplicateKeyError:
        return jsonify({"success": False, "error": "An account with this email already exists."}), 409

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

    g.user = user
    log_activity(action="signup", resource_type="user", resource_id=str(user_id))

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

    g.user = user
    log_activity(action="login", resource_type="user", resource_id=str(user["_id"]))

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


app.register_blueprint(history_bp)
app.register_blueprint(analysis_bp)
app.register_blueprint(favorites_bp)
app.register_blueprint(activity_bp)
app.register_blueprint(radiosonde_bp)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
