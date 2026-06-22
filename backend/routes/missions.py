import json
from datetime import datetime, timezone
from uuid import uuid4

from bson import ObjectId
from bson.errors import InvalidId
from flask import Blueprint, g, jsonify, request
from pymongo.errors import DuplicateKeyError

from auth_utils import log_activity, require_auth, utc_now

missions_bp = Blueprint("missions", __name__, url_prefix="/api/missions")

SUMMARY_FIELDS = {
    "telemetrySummary",
    "atmosphericSummary",
    "weatherSummary",
    "trajectorySummary",
}
EDITABLE_FIELDS = {
    "missionName",
    "stationId",
    "stationName",
    "launchTime",
    "status",
    "maxAltitude",
    "duration",
    *SUMMARY_FIELDS,
}
REQUIRED_FIELDS = {"missionName", "stationId", "stationName", "launchTime", "status"}


def isoformat(value):
    return value.isoformat() if isinstance(value, datetime) else value


def serialize_mission(doc):
    return {
        "id": str(doc["_id"]),
        "missionId": doc["missionId"],
        "userId": str(doc["userId"]),
        "missionName": doc["missionName"],
        "stationId": doc["stationId"],
        "stationName": doc["stationName"],
        "launchTime": isoformat(doc["launchTime"]),
        "status": doc["status"],
        "maxAltitude": doc.get("maxAltitude"),
        "duration": doc.get("duration"),
        "telemetrySummary": doc.get("telemetrySummary", {}),
        "atmosphericSummary": doc.get("atmosphericSummary", {}),
        "weatherSummary": doc.get("weatherSummary", {}),
        "trajectorySummary": doc.get("trajectorySummary", {}),
        "createdAt": isoformat(doc["createdAt"]),
        "updatedAt": isoformat(doc["updatedAt"]),
    }


def parse_launch_time(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("launchTime must be an ISO 8601 datetime string.")

    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("launchTime must be an ISO 8601 datetime string.") from exc

    if parsed.tzinfo is None:
        raise ValueError("launchTime must include a timezone.")
    return parsed.astimezone(timezone.utc)


def validate_summary(field, value):
    if not isinstance(value, dict):
        raise ValueError(f"{field} must be a JSON object.")

    def validate_keys(item, depth=0):
        if depth > 10:
            raise ValueError(f"{field} cannot be nested more than 10 levels.")
        if isinstance(item, dict):
            for key, nested_value in item.items():
                if not isinstance(key, str) or key.startswith("$") or "." in key:
                    raise ValueError(f"{field} contains an invalid key.")
                validate_keys(nested_value, depth + 1)
        elif isinstance(item, list):
            for nested_value in item:
                validate_keys(nested_value, depth + 1)

    validate_keys(value)
    if len(json.dumps(value, separators=(",", ":"))) > 262144:
        raise ValueError(f"{field} must be 256 KB or smaller.")
    return value


def validate_mission_payload(data, creating=False):
    if not isinstance(data, dict):
        raise ValueError("Request body must be a JSON object.")

    allowed_fields = EDITABLE_FIELDS | ({"missionId"} if creating else set())
    unknown_fields = set(data) - allowed_fields
    if unknown_fields:
        raise ValueError(f"Unsupported mission field: {sorted(unknown_fields)[0]}.")
    if not data:
        raise ValueError("At least one mission field is required.")

    if creating:
        missing = sorted(field for field in REQUIRED_FIELDS if field not in data)
        if missing:
            raise ValueError(f"Missing required field: {missing[0]}.")

    result = {}
    string_limits = {
        "missionName": 200,
        "stationId": 100,
        "stationName": 200,
        "status": 50,
    }
    for field, max_length in string_limits.items():
        if field in data:
            value = data[field]
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"{field} must be a non-empty string.")
            if len(value.strip()) > max_length:
                raise ValueError(f"{field} must be {max_length} characters or fewer.")
            result[field] = value.strip()

    if "missionId" in data:
        mission_id = data["missionId"]
        if not isinstance(mission_id, str) or not mission_id.strip():
            raise ValueError("missionId must be a non-empty string.")
        if len(mission_id.strip()) > 100:
            raise ValueError("missionId must be 100 characters or fewer.")
        result["missionId"] = mission_id.strip()

    if "launchTime" in data:
        result["launchTime"] = parse_launch_time(data["launchTime"])

    for field in ("maxAltitude", "duration"):
        if field in data:
            value = data[field]
            if value is not None:
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    raise ValueError(f"{field} must be a non-negative number or null.")
                if value < 0:
                    raise ValueError(f"{field} must be a non-negative number or null.")
            result[field] = value

    for field in SUMMARY_FIELDS:
        if field in data:
            result[field] = validate_summary(field, data[field])

    return result


def mission_query(mission_id):
    identifiers = [{"missionId": mission_id}]
    try:
        identifiers.append({"_id": ObjectId(mission_id)})
    except (InvalidId, TypeError):
        pass
    return {"userId": g.user["_id"], "$or": identifiers}


@missions_bp.route("", methods=["GET"])
@require_auth
def list_missions():
    cursor = g.db["missions"].find({"userId": g.user["_id"]}).sort("createdAt", -1)
    return jsonify({"success": True, "missions": [serialize_mission(doc) for doc in cursor]})


@missions_bp.route("/<mission_id>", methods=["GET"])
@require_auth
def get_mission(mission_id):
    mission = g.db["missions"].find_one(mission_query(mission_id))
    if not mission:
        return jsonify({"success": False, "error": "Mission not found."}), 404
    return jsonify({"success": True, "mission": serialize_mission(mission)})


@missions_bp.route("", methods=["POST"])
@require_auth
def create_mission():
    try:
        fields = validate_mission_payload(request.get_json(silent=True), creating=True)
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    now = utc_now()
    mission = {
        **fields,
        "missionId": fields.get("missionId") or str(uuid4()),
        "userId": g.user["_id"],
        "createdAt": now,
        "updatedAt": now,
    }
    for field in SUMMARY_FIELDS:
        mission.setdefault(field, {})

    try:
        result = g.db["missions"].insert_one(mission)
    except DuplicateKeyError:
        return jsonify({"success": False, "error": "A mission with this missionId already exists."}), 409

    mission["_id"] = result.inserted_id
    log_activity("create_mission", "mission", str(result.inserted_id), {"missionId": mission["missionId"]})
    return jsonify({"success": True, "mission": serialize_mission(mission)}), 201


@missions_bp.route("/<mission_id>", methods=["PUT"])
@require_auth
def update_mission(mission_id):
    try:
        updates = validate_mission_payload(request.get_json(silent=True))
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    updates["updatedAt"] = utc_now()
    result = g.db["missions"].update_one(mission_query(mission_id), {"$set": updates})
    if result.matched_count == 0:
        return jsonify({"success": False, "error": "Mission not found."}), 404

    mission = g.db["missions"].find_one(mission_query(mission_id))
    log_activity("update_mission", "mission", str(mission["_id"]), {"missionId": mission["missionId"]})
    return jsonify({"success": True, "mission": serialize_mission(mission)})


@missions_bp.route("/<mission_id>", methods=["DELETE"])
@require_auth
def delete_mission(mission_id):
    mission = g.db["missions"].find_one(mission_query(mission_id), {"missionId": 1})
    if not mission:
        return jsonify({"success": False, "error": "Mission not found."}), 404

    g.db["missions"].delete_one({"_id": mission["_id"], "userId": g.user["_id"]})
    log_activity("delete_mission", "mission", str(mission["_id"]), {"missionId": mission["missionId"]})
    return jsonify({"success": True})
