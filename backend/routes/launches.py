from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from flask import Blueprint, g, jsonify, request

from auth_utils import log_activity, require_auth, utc_now

launches_bp = Blueprint("launches", __name__)

REQUIRED_CSV_COLUMNS = {
    "pressure_hPa",
    "geopotential_height_m",
    "temperature_C",
    "dew_point_temperature_C",
    "relative_humidity_%",
    "wind_speed_m_s",
    "wind_direction_degree",
    "latitude",
    "longitude",
    "altitude_m",
}

LAUNCH_STATUSES = {"draft", "ready", "live", "completed", "cancelled"}


def _isoformat(value):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _parse_object_id(value, label="id"):
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise ValueError(f"Invalid {label}.")


def _as_string(data, field, required=True, max_length=160):
    value = data.get(field)
    if value is None:
        if required:
            raise ValueError(f"{field} is required.")
        return None
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string.")
    cleaned = value.strip()
    if required and not cleaned:
        raise ValueError(f"{field} is required.")
    if len(cleaned) > max_length:
        raise ValueError(f"{field} must be {max_length} characters or fewer.")
    return cleaned or None


def _as_number(data, field, required=False):
    value = data.get(field)
    if value in (None, ""):
        if required:
            raise ValueError(f"{field} is required.")
        return None
    if isinstance(value, bool):
        raise ValueError(f"{field} must be a number.")
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field} must be a number.")


def _parse_timestamp(value):
    if value in (None, ""):
        return utc_now()
    if not isinstance(value, str):
        raise ValueError("timestamp must be an ISO 8601 string.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("timestamp must be an ISO 8601 string.") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _validate_launch_payload(data):
    if not isinstance(data, dict):
        raise ValueError("Request body must be a JSON object.")

    launch = {
        "station": _as_string(data, "station"),
        "launchDate": _as_string(data, "launchDate", max_length=20),
        "launchTime": _as_string(data, "launchTime", max_length=20),
        "balloonId": _as_string(data, "balloonId", max_length=100),
        "radiosondeId": _as_string(data, "radiosondeId", max_length=100),
        "operator": _as_string(data, "operator", required=False),
        "status": data.get("status") or "draft",
    }
    if launch["status"] not in LAUNCH_STATUSES:
        raise ValueError("status is not supported.")

    surface_data = data.get("surfaceData") or {}
    if not isinstance(surface_data, dict):
        raise ValueError("surfaceData must be a JSON object.")

    surface = {
        "temperature": _as_number(surface_data, "temperature"),
        "pressure": _as_number(surface_data, "pressure"),
        "humidity": _as_number(surface_data, "humidity"),
        "dewPoint": _as_number(surface_data, "dewPoint"),
        "windSpeed": _as_number(surface_data, "windSpeed"),
        "windDirection": _as_number(surface_data, "windDirection"),
        "latitude": _as_number(surface_data, "latitude"),
        "longitude": _as_number(surface_data, "longitude"),
        "altitude": _as_number(surface_data, "altitude"),
    }

    return launch, surface


def _serialize_launch(doc, surface=None):
    payload = {
        "id": str(doc["_id"]),
        "userId": str(doc["userId"]),
        "station": doc.get("station"),
        "launchDate": doc.get("launchDate"),
        "launchTime": doc.get("launchTime"),
        "balloonId": doc.get("balloonId"),
        "radiosondeId": doc.get("radiosondeId"),
        "operator": doc.get("operator"),
        "status": doc.get("status", "draft"),
        "createdAt": _isoformat(doc.get("createdAt")),
        "updatedAt": _isoformat(doc.get("updatedAt")),
        "startedAt": _isoformat(doc.get("startedAt")),
    }
    if surface:
        payload["surfaceData"] = {
            "temperature": surface.get("temperature"),
            "pressure": surface.get("pressure"),
            "humidity": surface.get("humidity"),
            "dewPoint": surface.get("dewPoint"),
            "windSpeed": surface.get("windSpeed"),
            "windDirection": surface.get("windDirection"),
            "latitude": surface.get("latitude"),
            "longitude": surface.get("longitude"),
            "altitude": surface.get("altitude"),
        }
    return payload


def _launch_query(launch_id):
    return {"_id": _parse_object_id(launch_id, "launch id"), "userId": g.user["_id"]}


def _row_to_telemetry(launch_id, row, index):
    if not isinstance(row, dict):
        raise ValueError(f"Row {index + 1} must be an object.")
    missing = sorted(REQUIRED_CSV_COLUMNS - set(row.keys()))
    if missing:
        raise ValueError(f"Missing CSV column: {missing[0]}.")

    return {
        "launchId": launch_id,
        "timestamp": utc_now(),
        "pressure": _as_number(row, "pressure_hPa"),
        "temperature": _as_number(row, "temperature_C"),
        "humidity": _as_number(row, "relative_humidity_%"),
        "latitude": _as_number(row, "latitude"),
        "longitude": _as_number(row, "longitude"),
        "altitude": _as_number(row, "altitude_m"),
        "windSpeed": _as_number(row, "wind_speed_m_s"),
        "windDirection": _as_number(row, "wind_direction_degree"),
        "geopotentialHeight": _as_number(row, "geopotential_height_m"),
        "dewPoint": _as_number(row, "dew_point_temperature_C"),
        "source": "csv",
    }


def _surface_from_csv_row(launch_id, row):
    return {
        "launchId": launch_id,
        "temperature": _as_number(row, "temperature_C"),
        "pressure": _as_number(row, "pressure_hPa"),
        "humidity": _as_number(row, "relative_humidity_%"),
        "dewPoint": _as_number(row, "dew_point_temperature_C"),
        "windSpeed": _as_number(row, "wind_speed_m_s"),
        "windDirection": _as_number(row, "wind_direction_degree"),
        "latitude": _as_number(row, "latitude"),
        "longitude": _as_number(row, "longitude"),
        "altitude": _as_number(row, "altitude_m"),
    }


@launches_bp.route("/launches", methods=["POST"])
@require_auth
def create_launch():
    try:
        launch_fields, surface_fields = _validate_launch_payload(request.get_json(silent=True))
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    now = utc_now()
    launch_doc = {
        **launch_fields,
        "userId": g.user["_id"],
        "createdAt": now,
        "updatedAt": now,
    }
    result = g.db["launches"].insert_one(launch_doc)
    launch_doc["_id"] = result.inserted_id

    surface_doc = {
        **surface_fields,
        "launchId": result.inserted_id,
        "createdAt": now,
        "updatedAt": now,
    }
    g.db["initial_surface_data"].insert_one(surface_doc)

    log_activity("create_launch", "launch", str(result.inserted_id), {"station": launch_doc["station"]})
    return jsonify({"success": True, "launch": _serialize_launch(launch_doc, surface_doc)}), 201


@launches_bp.route("/launches/<launch_id>", methods=["GET"])
@require_auth
def get_launch(launch_id):
    try:
        query = _launch_query(launch_id)
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    launch = g.db["launches"].find_one(query)
    if not launch:
        return jsonify({"success": False, "error": "Launch not found."}), 404

    surface = g.db["initial_surface_data"].find_one({"launchId": launch["_id"]})
    telemetry_count = g.db["live_telemetry"].count_documents({"launchId": launch["_id"]})
    return jsonify(
        {
            "success": True,
            "launch": _serialize_launch(launch, surface),
            "telemetryCount": telemetry_count,
        }
    )


@launches_bp.route("/launches/<launch_id>/upload-csv", methods=["POST"])
@require_auth
def upload_launch_csv(launch_id):
    try:
        query = _launch_query(launch_id)
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    launch = g.db["launches"].find_one(query)
    if not launch:
        return jsonify({"success": False, "error": "Launch not found."}), 404

    data = request.get_json(silent=True) or {}
    rows = data.get("rows")
    if not isinstance(rows, list) or not rows:
        return jsonify({"success": False, "error": "rows must be a non-empty array."}), 400

    try:
        telemetry_docs = [_row_to_telemetry(launch["_id"], row, index) for index, row in enumerate(rows)]
        surface_doc = _surface_from_csv_row(launch["_id"], rows[0])
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    now = utc_now()
    for doc in telemetry_docs:
        doc["createdAt"] = now

    g.db["live_telemetry"].delete_many({"launchId": launch["_id"], "source": "csv"})
    g.db["live_telemetry"].insert_many(telemetry_docs)
    g.db["initial_surface_data"].update_one(
        {"launchId": launch["_id"]},
        {"$set": {**surface_doc, "updatedAt": now}, "$setOnInsert": {"createdAt": now}},
        upsert=True,
    )
    g.db["launches"].update_one(
        {"_id": launch["_id"]},
        {"$set": {"status": "ready", "updatedAt": now}},
    )

    log_activity(
        "upload_launch_csv",
        "launch",
        str(launch["_id"]),
        {"rowCount": len(telemetry_docs), "station": launch.get("station")},
    )
    return jsonify(
        {
            "success": True,
            "rowCount": len(telemetry_docs),
            "surfaceData": {key: value for key, value in surface_doc.items() if key != "launchId"},
            "status": "ready",
        }
    )


@launches_bp.route("/launches/<launch_id>/start", methods=["POST"])
@require_auth
def start_launch(launch_id):
    try:
        query = _launch_query(launch_id)
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    launch = g.db["launches"].find_one(query)
    if not launch:
        return jsonify({"success": False, "error": "Launch not found."}), 404

    now = utc_now()
    g.db["launches"].update_one(
        {"_id": launch["_id"]},
        {"$set": {"status": "live", "startedAt": now, "updatedAt": now}},
    )
    launch.update({"status": "live", "startedAt": now, "updatedAt": now})

    log_activity("start_launch", "launch", str(launch["_id"]), {"station": launch.get("station")})
    return jsonify({"success": True, "launch": _serialize_launch(launch)})


@launches_bp.route("/telemetry", methods=["POST"])
@require_auth
def create_live_telemetry():
    data = request.get_json(silent=True) or {}
    try:
        launch_id = _parse_object_id(data.get("launchId"), "launch id")
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    launch = g.db["launches"].find_one({"_id": launch_id, "userId": g.user["_id"]})
    if not launch:
        return jsonify({"success": False, "error": "Launch not found."}), 404

    try:
        telemetry = {
            "launchId": launch_id,
            "timestamp": _parse_timestamp(data.get("timestamp")),
            "pressure": _as_number(data, "pressure"),
            "temperature": _as_number(data, "temperature"),
            "humidity": _as_number(data, "humidity"),
            "latitude": _as_number(data, "latitude"),
            "longitude": _as_number(data, "longitude"),
            "altitude": _as_number(data, "altitude"),
            "windSpeed": _as_number(data, "windSpeed"),
            "windDirection": _as_number(data, "windDirection"),
            "source": _as_string(data, "source", required=False, max_length=40) or "manual",
            "createdAt": utc_now(),
        }
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    result = g.db["live_telemetry"].insert_one(telemetry)
    log_activity("ingest_telemetry", "launch", str(launch_id), {"telemetryId": str(result.inserted_id)})
    return jsonify({"success": True, "id": str(result.inserted_id)}), 201
