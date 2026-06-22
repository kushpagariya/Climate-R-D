from bson import ObjectId
from flask import Blueprint, g, jsonify, request

from auth_utils import require_auth, utc_now, log_activity

radiosonde_bp = Blueprint("radiosonde", __name__)

SOUNDING_RECORD_TYPES = {"$nin": ["mission", "balloon"]}


def _parse_limit(value, default=50, maximum=500):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(1, min(parsed, maximum))


def calculate_atmospheric_parameters(observations):
    if not observations:
        return {}

    freezing_level = next(
        (obs.get("height", 0) for obs in observations if obs.get("temperature", 0) <= 0),
        0,
    )

    lcl = 0
    for obs in observations:
        depression = obs.get("temperature", 0) - obs.get("dewPoint", 0)
        if depression < 2 and obs.get("height", 0) < 3000:
            lcl = obs.get("height", 0)
            break

    tropopause = 11000
    for i in range(1, len(observations) - 1):
        prev_obs = observations[i - 1]
        next_obs = observations[i + 1]
        height_delta = (next_obs.get("height", 0) - prev_obs.get("height", 0)) / 1000
        if height_delta == 0:
            continue
        lapse_rate = (prev_obs.get("temperature", 0) - next_obs.get("temperature", 0)) / height_delta
        if lapse_rate < 2 and observations[i].get("height", 0) > 8000:
            tropopause = observations[i].get("height", 0)
            break

    surface = observations[0]
    max_wind = max(obs.get("windSpeed", 0) for obs in observations)
    max_wind_obs = next((obs for obs in observations if obs.get("windSpeed", 0) == max_wind), surface)
    cape = max(
        0,
        (1200 if surface.get("temperature", 0) - surface.get("dewPoint", 0) < 5 else 400),
    )

    return {
        "freezingLevel": freezing_level,
        "lcl": lcl,
        "tropopause": tropopause,
        "surfaceTemperature": surface.get("temperature", 0),
        "surfacePressure": surface.get("pressure", 0),
        "surfaceHumidity": surface.get("relativeHumidity", 0),
        "maxWindSpeed": max_wind,
        "maxWindHeight": max_wind_obs.get("height", 0),
        "maxAltitude": observations[-1].get("height", 0),
        "cape": cape,
    }


def serialize_radiosonde_summary(doc):
    metadata = doc.get("metadata") or {}
    label = metadata.get("label")
    if not label and doc.get("date") and doc.get("time"):
        label = f"{doc['date']} {doc['time']}"
    return {
        "id": str(doc["_id"]),
        "stationId": doc.get("stationId"),
        "date": doc.get("date"),
        "time": doc.get("time"),
        "source": doc.get("source", "api"),
        "recordType": doc.get("recordType", "sounding"),
        "label": label or doc.get("stationId"),
        "hasTrajectory": bool(doc.get("trajectory")),
        "createdAt": doc.get("createdAt").isoformat() if doc.get("createdAt") else None,
    }


def serialize_radiosonde_detail(doc):
    observations = doc.get("observations") or []
    return {
        "id": str(doc["_id"]),
        "stationId": doc.get("stationId"),
        "date": doc.get("date"),
        "time": doc.get("time"),
        "profile": observations,
        "observations": observations,
        "parameters": calculate_atmospheric_parameters(observations),
        "trajectory": doc.get("trajectory") or [],
        "events": doc.get("events") or [],
        "source": doc.get("source", "api"),
        "recordType": doc.get("recordType", "sounding"),
        "metadata": doc.get("metadata") or {},
        "createdAt": doc.get("createdAt").isoformat() if doc.get("createdAt") else None,
    }


@radiosonde_bp.route("/radiosonde", methods=["GET"])
@require_auth
def get_radiosonde():
    station_id = request.args.get("stationId")
    date = request.args.get("date")
    time = request.args.get("time")

    if not station_id or not date or not time:
        return jsonify({"success": False, "error": "stationId, date, and time are required."}), 400

    doc = g.db["radiosonde_history"].find_one(
        {
            "stationId": station_id,
            "date": date,
            "time": time,
            "recordType": {"$ne": "mission"},
        }
    )

    if not doc:
        return jsonify({"success": False, "error": "Radiosonde record not found."}), 404

    log_activity(
        action="view_sounding",
        resource_type="radiosonde_history",
        resource_id=str(doc["_id"]),
        metadata={"stationId": station_id, "date": date, "time": time},
    )

    detail = serialize_radiosonde_detail(doc)
    return jsonify(
        {
            "success": True,
            "profile": detail["profile"],
            "parameters": detail["parameters"],
            "metadata": {
                **detail["metadata"],
                "id": detail["id"],
                "stationId": detail["stationId"],
                "date": detail["date"],
                "time": detail["time"],
                "source": detail["source"],
                "recordType": detail["recordType"],
                "createdAt": detail["createdAt"],
            },
        }
    )


@radiosonde_bp.route("/radiosonde/history", methods=["GET"])
@require_auth
def list_radiosonde_history():
    station_id = request.args.get("stationId")
    if not station_id:
        return jsonify({"success": False, "error": "stationId is required."}), 400

    record_type = request.args.get("recordType")
    limit = _parse_limit(request.args.get("limit"), default=50, maximum=500)

    query = {"stationId": station_id}
    if record_type:
        query["recordType"] = record_type
    else:
        query["recordType"] = {"$ne": "mission"}

    cursor = (
        g.db["radiosonde_history"]
        .find(query)
        .sort("createdAt", -1)
        .limit(max(1, min(limit, 500)))
    )

    items = [serialize_radiosonde_summary(doc) for doc in cursor]
    return jsonify({"success": True, "items": items})


@radiosonde_bp.route("/radiosonde/save", methods=["POST"])
@require_auth
def save_radiosonde():
    data = request.get_json(silent=True) or {}
    station_id = data.get("stationId")
    observations = data.get("observations") or data.get("profile")

    if not station_id or not observations:
        return jsonify({"success": False, "error": "stationId and observations are required."}), 400

    record_type = data.get("recordType", "sounding")
    date = data.get("date")
    time = data.get("time")
    now = utc_now()

    doc = {
        "userId": g.user["_id"],
        "stationId": station_id,
        "date": date,
        "time": time,
        "observations": observations,
        "trajectory": data.get("trajectory") or [],
        "events": data.get("events") or [],
        "source": data.get("source", "api"),
        "recordType": record_type,
        "metadata": data.get("metadata") or {},
        "createdAt": now,
    }

    if record_type == "mission":
        existing = g.db["radiosonde_history"].find_one(
            {"stationId": station_id, "recordType": "mission"},
            sort=[("createdAt", -1)],
        )
        if existing:
            g.db["radiosonde_history"].update_one(
                {"_id": existing["_id"]},
                {"$set": {**doc, "createdAt": existing.get("createdAt", now)}},
            )
            saved_id = existing["_id"]
        else:
            result = g.db["radiosonde_history"].insert_one(doc)
            saved_id = result.inserted_id
    elif record_type == "sounding" and date and time:
        existing = g.db["radiosonde_history"].find_one(
            {
                "stationId": station_id,
                "date": date,
                "time": time,
                "recordType": SOUNDING_RECORD_TYPES
            }
        )
        if existing:
            g.db["radiosonde_history"].update_one(
                {"_id": existing["_id"]},
                {"$set": {**doc, "createdAt": existing.get("createdAt", now)}},
            )
            saved_id = existing["_id"]
        else:
            result = g.db["radiosonde_history"].insert_one(doc)
            saved_id = result.inserted_id
    else:
        result = g.db["radiosonde_history"].insert_one(doc)
        saved_id = result.inserted_id

    log_activity(
        action="save_analysis" if record_type == "mission" else "view_sounding",
        resource_type="radiosonde_history",
        resource_id=str(saved_id),
        metadata={"stationId": station_id, "date": date, "time": time, "recordType": record_type},
    )

    return jsonify({"success": True, "id": str(saved_id)})


@radiosonde_bp.route("/radiosonde/<record_id>", methods=["GET"])
@require_auth
def get_radiosonde_by_id(record_id):
    try:
        oid = ObjectId(record_id)
    except Exception:
        return jsonify({"success": False, "error": "Invalid radiosonde id."}), 400

    doc = g.db["radiosonde_history"].find_one({"_id": oid})
    if not doc:
        return jsonify({"success": False, "error": "Radiosonde record not found."}), 404

    log_activity(
        action="view_sounding",
        resource_type="radiosonde_history",
        resource_id=record_id,
        metadata={
            "stationId": doc.get("stationId"),
            "date": doc.get("date"),
            "time": doc.get("time"),
            "recordType": doc.get("recordType"),
        },
    )

    return jsonify({"success": True, **serialize_radiosonde_detail(doc)})
