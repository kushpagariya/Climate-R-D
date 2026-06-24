import os
import re

import bcrypt
from bson import ObjectId
from dotenv import load_dotenv
from flask import Flask, g, jsonify, request
from flask_cors import CORS
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

from routes.balloons import balloons_bp
from auth_utils import create_token, require_auth, utc_now, log_activity
from routes.activity import activity_bp
from routes.analysis import analysis_bp
from routes.favorites import favorites_bp
from routes.history import history_bp
from routes.missions import missions_bp
from routes.radiosonde import radiosonde_bp
from routes.stations import stations_bp
from routes.datasets import datasets_bp
from routes.analytics import analytics_bp
from routes.data_quality import data_quality_bp
from routes.dashboard import dashboard_bp
from routes.weather import weather_bp
from routes.atmosphere import atmosphere_bp
from routes.telemetry import telemetry_bp

load_dotenv()

app = Flask(__name__)
CORS(app)

import certifi
client = MongoClient(os.getenv("MONGO_URI"), tlsCAFile=certifi.where())

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
weather_stations = db["weather_stations"]
datasets = db["datasets"]
weather_records = db["weather_records"]
missions = db["missions"]

users.create_index("email", unique=True)
user_profiles.create_index("userId", unique=True)
graph_history.create_index([("userId", 1), ("createdAt", -1)])
saved_analyses.create_index([("userId", 1), ("createdAt", -1)])
favorites.create_index([("userId", 1), ("createdAt", -1)])
activity_logs.create_index([("userId", 1), ("createdAt", -1)])
radiosonde_history.create_index([("stationId", 1), ("date", 1), ("time", 1)])
radiosonde_history.create_index([("stationId", 1), ("recordType", 1), ("createdAt", -1)])
radiosonde_history.create_index([("recordType", 1), ("metadata.serial", 1)])
radiosonde_history.create_index([("recordType", 1), ("updatedAt", -1)])
weather_stations.create_index("stationId", unique=True)
datasets.create_index([("stationId", 1), ("createdAt", -1)])
weather_records.create_index([("stationId", 1), ("date", 1), ("time", 1)])
weather_records.create_index([("stationId", 1), ("date", 1), ("time", 1), ("serial", 1)])
missions.create_index("missionId", unique=True)
missions.create_index([("userId", 1), ("createdAt", -1)])

PROFILE_ROLES = {
    "student",
    "teacher",
    "researcher",
    "climate-scientist",
    "weather-analyst",
    "organization-employee",
}
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def serialize_user(doc):
    profile = user_profiles.find_one(
        {"userId": doc["_id"]}
    ) or {}

    return {
        "id": str(doc["_id"]),
        "fullName": doc["fullName"],
        "email": doc["email"],
        "organization": doc.get("organization"),

        "role": profile.get("role"),
        "purposes": profile.get("purposes", []),
        "onboardingComplete": profile.get(
            "onboardingComplete",
            False
        ),
        "hasSeenPreLaunch": profile.get(
            "hasSeenPreLaunch",
            False
        ),
    }


def serialize_profile(doc):
    if not doc:
        return {
            "role": None,
            "purposes": [],
            "onboardingComplete": False,
            "hasSeenPreLaunch": False,
        }

    return {
        "role": doc.get("role"),
        "purposes": doc.get("purposes", []),
        "onboardingComplete": doc.get(
            "onboardingComplete",
            False
        ),
        "hasSeenPreLaunch": doc.get(
            "hasSeenPreLaunch",
            False
        ),
    }


def serialize_api_profile(user, profile):
    created_at = profile.get("createdAt") or user.get("createdAt")
    updated_at = profile.get("updatedAt") or created_at
    return {
        "name": user.get("fullName", ""),
        "email": user.get("email", ""),
        "role": profile.get("role"),
        "purpose": profile.get("purpose"),
        "onboardingComplete": profile.get("onboardingComplete", False),
        "hasSeenPreLaunch": profile.get("hasSeenPreLaunch", False),
        "createdAt": created_at.isoformat() if created_at else None,
        "updatedAt": updated_at.isoformat() if updated_at else None,
    }


def validate_profile_payload(data):
    if not isinstance(data, dict):
        return None, "Request body must be a JSON object."

    mutable_fields = {
        "name",
        "email",
        "role",
        "purpose",
        "onboardingComplete",
        "hasSeenPreLaunch",
    }
    unknown_fields = set(data) - mutable_fields
    if unknown_fields:
        return None, f"Unsupported profile field: {sorted(unknown_fields)[0]}."
    if not data:
        return None, "At least one profile field is required."

    updates = {}
    if "name" in data:
        if not isinstance(data["name"], str) or not data["name"].strip():
            return None, "name must be a non-empty string."
        if len(data["name"].strip()) > 120:
            return None, "name must be 120 characters or fewer."
        updates["name"] = data["name"].strip()

    if "email" in data:
        if not isinstance(data["email"], str):
            return None, "email must be a string."
        email = data["email"].strip().lower()
        if len(email) > 254 or not EMAIL_PATTERN.fullmatch(email):
            return None, "email must be a valid email address."
        updates["email"] = email

    if "role" in data:
        role = data["role"]
        if role is not None and role not in PROFILE_ROLES:
            return None, "role is not supported."
        updates["role"] = role

    if "purpose" in data:
        purpose = data["purpose"]
        if purpose is not None:
            if not isinstance(purpose, str) or not purpose.strip():
                return None, "purpose must be a non-empty string or null."
            if len(purpose.strip()) > 200:
                return None, "purpose must be 200 characters or fewer."
            purpose = purpose.strip()
        updates["purpose"] = purpose

    for field in ("onboardingComplete", "hasSeenPreLaunch"):
        if field in data:
            if not isinstance(data[field], bool):
                return None, f"{field} must be a boolean."
            updates[field] = data[field]

    return updates, None


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
            "hasSeenPreLaunch": False,
            "createdAt": now,
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
        role = data.get("role")
        if role is not None and role not in PROFILE_ROLES:
            return jsonify({"success": False, "error": "role is not supported."}), 400
        updates["role"] = role

    if "purposes" in data:
        purposes = data.get("purposes")
        if not isinstance(purposes, list) or any(
            not isinstance(item, str) or not item.strip() for item in purposes
        ):
            return jsonify({"success": False, "error": "purposes must be an array of strings."}), 400
        updates["purposes"] = [item.strip() for item in purposes]

    if "onboardingComplete" in data:
        if not isinstance(data.get("onboardingComplete"), bool):
            return jsonify({"success": False, "error": "onboardingComplete must be a boolean."}), 400
        updates["onboardingComplete"] = data["onboardingComplete"]

    if "hasSeenPreLaunch" in data:
        if not isinstance(data.get("hasSeenPreLaunch"), bool):
            return jsonify({"success": False, "error": "hasSeenPreLaunch must be a boolean."}), 400
        updates["hasSeenPreLaunch"] = data["hasSeenPreLaunch"]

    user_profiles.update_one(
        {"userId": g.user["_id"]},
        {"$set": updates},
        upsert=True,
    )

    return jsonify({"success": True})


@app.route("/api/profile", methods=["GET"])
@require_auth
def get_api_profile():
    profile = get_profile_for_user(g.user["_id"]) or {}
    return jsonify({"success": True, "profile": serialize_api_profile(g.user, profile)})


@app.route("/api/profile", methods=["PUT"])
@require_auth
def update_api_profile():
    data = request.get_json(silent=True)
    updates, error = validate_profile_payload(data)
    if error:
        return jsonify({"success": False, "error": error}), 400

    user_updates = {}
    if "name" in updates:
        user_updates["fullName"] = updates.pop("name")
    if "email" in updates:
        email = updates.pop("email")
        existing = users.find_one({"email": email, "_id": {"$ne": g.user["_id"]}})
        if existing:
            return jsonify({"success": False, "error": "An account with this email already exists."}), 409
        user_updates["email"] = email

    now = utc_now()
    if user_updates:
        user_updates["updatedAt"] = now
        try:
            users.update_one({"_id": g.user["_id"]}, {"$set": user_updates})
        except DuplicateKeyError:
            return jsonify({"success": False, "error": "An account with this email already exists."}), 409

    updates["updatedAt"] = now
    user_profiles.update_one(
        {"userId": g.user["_id"]},
        {
            "$set": updates,
            "$setOnInsert": {"createdAt": g.user.get("createdAt", now)},
        },
        upsert=True,
    )

    user = users.find_one({"_id": g.user["_id"]})
    profile = get_profile_for_user(g.user["_id"]) or {}
    return jsonify({"success": True, "profile": serialize_api_profile(user, profile)})


app.register_blueprint(history_bp)
app.register_blueprint(analysis_bp)
app.register_blueprint(favorites_bp)
app.register_blueprint(activity_bp)
app.register_blueprint(radiosonde_bp)
app.register_blueprint(stations_bp)
app.register_blueprint(datasets_bp)
app.register_blueprint(analytics_bp)
app.register_blueprint(data_quality_bp)
app.register_blueprint(missions_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(weather_bp)
app.register_blueprint(atmosphere_bp)
app.register_blueprint(telemetry_bp)
app.register_blueprint(balloons_bp)

if __name__ == "__main__":
    app.run(debug=True, port=5000)