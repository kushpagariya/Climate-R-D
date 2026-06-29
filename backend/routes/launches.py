from datetime import datetime, time, timedelta, timezone

from bson import ObjectId
from bson.errors import InvalidId
from flask import Blueprint, g, jsonify, request

from auth_utils import log_activity, require_auth, utc_now

launches_bp = Blueprint("launches", __name__)

import re

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

CSV_ALIASES = {
    "pressure_hPa": ["Pressure(hPa)", "Pressure", "pressure", "PRESSURE", "pressure hpa"],
    "geopotential_height_m": ["Height(m)", "Height", "Geopotential Height", "Geopot"],
    "temperature_C": ["Temp(°C)", "Temperature", "Temp", "Air Temperature"],
    "dew_point_temperature_C": ["DewPt(°C)", "Dew Point", "DewPoint"],
    "relative_humidity_%": ["RH(%)", "RH", "Humidity", "Relative Humidity"],
    "wind_speed_m_s": ["Wind(m/s)", "Wind Speed", "WindSpeed"],
    "wind_direction_degree": ["Dir(°)", "Direction", "Wind Direction"],
    "latitude": ["Latitude", "Lat"],
    "longitude": ["Longitude", "Lon", "Lng"],
    "altitude_m": ["Altitude", "Altitude(m)", "Alt"],
    "seconds_from_launch": ["Time", "Second", "Seconds", "seconds_from_launch", "sec"],
}

LAUNCH_STATUSES = {"draft", "ready", "live", "completed", "cancelled"}
SURFACE_DATA_SOURCES = {"upload", "manual", "upload_with_manual_override"}
DEFAULT_TELEMETRY_LIMIT = 100
MAX_TELEMETRY_LIMIT = 500

def _normalize_column_name(col):
    c = str(col).lower()
    c = re.sub(r'[\s_\-\(\)°%]', '', c)
    return c


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


def _parse_optional_timestamp(value, label="timestamp"):
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        raise ValueError(f"{label} must be an ISO 8601 string.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{label} must be an ISO 8601 string.") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _parse_limit(value):
    if value in (None, ""):
        return DEFAULT_TELEMETRY_LIMIT
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise ValueError("limit must be an integer.")
    if parsed <= 0:
        raise ValueError("limit must be greater than zero.")
    return min(parsed, MAX_TELEMETRY_LIMIT)


def _parse_after_second(value):
    if value in (None, ""):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        raise ValueError("afterSecond must be a number.")
    if not parsed == parsed:
        raise ValueError("afterSecond must be a number.")
    return parsed


def _parse_launch_datetime(launch, metadata=None):
    launch_date = (metadata or {}).get("launchDate") or launch.get("launchDate")
    launch_time = (metadata or {}).get("launchTime") or launch.get("launchTime")
    if not launch_date or not launch_time:
        return utc_now()

    try:
        parsed_date = datetime.strptime(launch_date, "%Y-%m-%d").date()
        parsed_time = datetime.strptime(launch_time[:5], "%H:%M").time()
    except (TypeError, ValueError):
        return utc_now()

    return datetime.combine(parsed_date, parsed_time, tzinfo=timezone.utc)


def _row_second(row, index):
    value = row.get("seconds_from_launch")
    if value in (None, ""):
        return index
    if isinstance(value, bool):
        return index
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return index
    if not parsed == parsed:
        return index
    return int(round(parsed))


def _validate_launch_payload(data):
    if not isinstance(data, dict):
        raise ValueError("Request body must be a JSON object.")

    launch = {
        "station": _as_string(data, "station"),
        "launchDate": _as_string(data, "launchDate", max_length=20),
        "launchTime": _as_string(data, "launchTime", max_length=20),
        "balloonId": _as_string(data, "balloonId", max_length=100),
        "radiosondeId": _as_string(data, "radiosondeId", max_length=100),
        "sondeNumber": _as_string(data, "sondeNumber", required=False, max_length=100),
        "sourceFileName": _as_string(data, "sourceFileName", required=False, max_length=180),
        "operator": _as_string(data, "operator", required=False),
        "status": data.get("status") or "draft",
    }
    if launch["status"] not in LAUNCH_STATUSES:
        raise ValueError("status is not supported.")

    surface_data = data.get("surfaceData") or {}
    if not isinstance(surface_data, dict):
        raise ValueError("surfaceData must be a JSON object.")
    surface_source = surface_data.get("source")
    if surface_source in (None, ""):
        surface_source = None
    elif not isinstance(surface_source, str) or surface_source not in SURFACE_DATA_SOURCES:
        raise ValueError("surfaceData.source is not supported.")

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
    if surface_source:
        surface["source"] = surface_source

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
        "sondeNumber": doc.get("sondeNumber"),
        "sourceFileName": doc.get("sourceFileName"),
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
            "source": surface.get("source"),
        }
    return payload


def _launch_query(launch_id):
    return {"_id": _parse_object_id(launch_id, "launch id"), "userId": g.user["_id"]}


def _row_to_telemetry(launch_id, row, index, base_timestamp=None, source="csv"):
    if not isinstance(row, dict):
        raise ValueError(f"Row {index + 1} must be an object.")
        
    # Alias mapping layer
    mapped_row = {}
    for k, v in row.items():
        norm_k = _normalize_column_name(k)
        mapped_key = k
        for canon, aliases in CSV_ALIASES.items():
            valid_norms = [_normalize_column_name(a) for a in aliases] + [_normalize_column_name(canon)]
            if norm_k in valid_norms:
                mapped_key = canon
                break
        mapped_row[mapped_key] = v
        
    row = mapped_row

    missing = sorted(REQUIRED_CSV_COLUMNS - set(row.keys()))
    if missing:
        canon = missing[0]
        aliases = CSV_ALIASES.get(canon, [])
        aliases_str = ", ".join(aliases)
        raise ValueError(f"Missing required column:\n{canon}\n\nAccepted aliases:\n{aliases_str}")

    second = _row_second(row, index)
    timestamp = (base_timestamp or utc_now()) + timedelta(seconds=second)

    return {
        "launchId": launch_id,
        "second": second,
        "timestamp": timestamp,
        "pressure": _as_number(row, "pressure_hPa"),
        "temperature": _as_number(row, "temperature_C"),
        "humidity": _as_number(row, "relative_humidity_%"),
        "latitude": _as_number(row, "latitude"),
        "longitude": _as_number(row, "longitude"),
        "altitude": _as_number(row, "altitude_m"),
        "windSpeed": _as_number(row, "wind_speed_m_s"),
        "windDirection": _as_number(row, "wind_direction_degree"),
        "geopotentialHeight": _as_number(row, "geopotential_height_m"),
        "geopotential": _as_number(row, "geopotential_height_m"),
        "dewPoint": _as_number(row, "dew_point_temperature_C"),
        "source": source,
    }


def _serialize_telemetry(doc):
    return {
        "id": str(doc.get("_id")),
        "launchId": str(doc.get("launchId")),
        "second": doc.get("second"),
        "timestamp": _isoformat(doc.get("timestamp")),
        "pressure": doc.get("pressure"),
        "temperature": doc.get("temperature"),
        "humidity": doc.get("humidity"),
        "latitude": doc.get("latitude"),
        "longitude": doc.get("longitude"),
        "altitude": doc.get("altitude"),
        "windSpeed": doc.get("windSpeed"),
        "windDirection": doc.get("windDirection"),
        "geopotential": doc.get("geopotential"),
        "geopotentialHeight": doc.get("geopotentialHeight"),
        "dewPoint": doc.get("dewPoint"),
        "source": doc.get("source"),
        "createdAt": _isoformat(doc.get("createdAt")),
    }


def _build_telemetry_cursor_query(launch_id, after_second=None, after_timestamp=None):
    filters = [{"launchId": launch_id}]
    if after_second is not None:
        filters.append({"second": {"$gt": after_second}})
    if after_timestamp is not None:
        filters.append({"timestamp": {"$gt": after_timestamp}})
    if len(filters) == 1:
        return filters[0]
    return {"$and": filters}


def _telemetry_collection_for_launch(launch_id):
    if g.db["telemetry"].find_one({"launchId": launch_id}, {"_id": 1}):
        return "telemetry"
    return "live_telemetry"


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
        "source": "upload",
    }


def _serialize_surface_data(surface):
    return {
        "temperature": surface.get("temperature"),
        "pressure": surface.get("pressure"),
        "humidity": surface.get("humidity"),
        "dewPoint": surface.get("dewPoint"),
        "windSpeed": surface.get("windSpeed"),
        "windDirection": surface.get("windDirection"),
        "latitude": surface.get("latitude"),
        "longitude": surface.get("longitude"),
        "altitude": surface.get("altitude"),
        "source": surface.get("source"),
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
    metadata = data.get("metadata") or {}
    if not isinstance(metadata, dict):
        return jsonify({"success": False, "error": "metadata must be a JSON object."}), 400
    source = metadata.get("sourceFormat") or "csv"
    if not isinstance(source, str) or source.lower() not in {"csv", "txt", "dat"}:
        source = "csv"
    source = source.lower()

    try:
        base_timestamp = _parse_launch_datetime(launch, metadata)
        telemetry_docs = [
            _row_to_telemetry(launch["_id"], row, index, base_timestamp=base_timestamp, source=source)
            for index, row in enumerate(rows)
        ]
        surface_doc = _surface_from_csv_row(launch["_id"], rows[0])
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    now = utc_now()
    for doc in telemetry_docs:
        doc["createdAt"] = now

    g.db["live_telemetry"].delete_many({"launchId": launch["_id"], "source": {"$in": ["csv", "txt", "dat"]}})
    g.db["live_telemetry"].insert_many(telemetry_docs)
    g.db["telemetry"].delete_many({"launchId": launch["_id"], "source": {"$in": ["csv", "txt", "dat"]}})
    g.db["telemetry"].insert_many([dict(doc) for doc in telemetry_docs])
    existing_surface = g.db["initial_surface_data"].find_one({"launchId": launch["_id"]})
    surface_source = (existing_surface or {}).get("source")
    should_update_surface = surface_source in (None, "upload")
    if should_update_surface:
        g.db["initial_surface_data"].update_one(
            {"launchId": launch["_id"]},
            {"$set": {**surface_doc, "updatedAt": now}, "$setOnInsert": {"createdAt": now}},
            upsert=True,
        )
        response_surface = surface_doc
    else:
        response_surface = existing_surface or surface_doc
    launch_updates = {
        "status": "ready",
        "updatedAt": now,
        "telemetrySource": source,
    }
    if data.get("fileName"):
        launch_updates["sourceFileName"] = str(data.get("fileName"))[:180]
    if metadata.get("sondeNumber"):
        launch_updates["sondeNumber"] = str(metadata.get("sondeNumber"))[:100]
    g.db["launches"].update_one({"_id": launch["_id"]}, {"$set": launch_updates})

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
            "surfaceData": _serialize_surface_data(response_surface),
            "status": "ready",
        }
    )


@launches_bp.route("/launches/<launch_id>/telemetry", methods=["GET"])
@require_auth
def get_launch_telemetry(launch_id):
    try:
        query = _launch_query(launch_id)
        after_second = _parse_after_second(request.args.get("afterSecond"))
        after_timestamp = _parse_optional_timestamp(request.args.get("afterTimestamp"), "afterTimestamp")
        limit = _parse_limit(request.args.get("limit"))
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    launch = g.db["launches"].find_one(query)
    if not launch:
        return jsonify({"success": False, "error": "Launch not found."}), 404

    collection_name = _telemetry_collection_for_launch(launch["_id"])
    telemetry_query = _build_telemetry_cursor_query(
        launch["_id"],
        after_second=after_second,
        after_timestamp=after_timestamp,
    )
    docs = list(
        g.db[collection_name]
        .find(telemetry_query)
        .sort([("second", 1), ("timestamp", 1), ("_id", 1)])
        .limit(limit)
    )

    return jsonify(
        {
            "success": True,
            "telemetry": [_serialize_telemetry(doc) for doc in docs],
            "count": len(docs),
            "limit": limit,
            "sourceCollection": collection_name,
            "hasMore": len(docs) == limit,
        }
    )


@launches_bp.route("/launches/<launch_id>/telemetry", methods=["POST"])
@require_auth
def create_launch_telemetry(launch_id):
    try:
        query = _launch_query(launch_id)
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    launch = g.db["launches"].find_one(query)
    if not launch:
        return jsonify({"success": False, "error": "Launch not found."}), 404

    data = request.get_json(silent=True) or {}
    try:
        telemetry = {
            "launchId": launch["_id"],
            "second": _as_number(data, "second"),
            "timestamp": _parse_timestamp(data.get("timestamp")),
            "pressure": _as_number(data, "pressure"),
            "temperature": _as_number(data, "temperature"),
            "humidity": _as_number(data, "humidity"),
            "latitude": _as_number(data, "latitude"),
            "longitude": _as_number(data, "longitude"),
            "altitude": _as_number(data, "altitude"),
            "windSpeed": _as_number(data, "windSpeed"),
            "windDirection": _as_number(data, "windDirection"),
            "geopotential": _as_number(data, "geopotential"),
            "geopotentialHeight": _as_number(data, "geopotentialHeight"),
            "dewPoint": _as_number(data, "dewPoint"),
            "source": _as_string(data, "source", required=False, max_length=40) or "manual",
            "createdAt": utc_now(),
        }
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    live_result = g.db["live_telemetry"].insert_one(dict(telemetry))
    telemetry_result = g.db["telemetry"].insert_one({**telemetry, "_id": ObjectId()})
    log_activity(
        "ingest_launch_telemetry",
        "launch",
        str(launch["_id"]),
        {"telemetryId": str(telemetry_result.inserted_id), "liveTelemetryId": str(live_result.inserted_id)},
    )
    telemetry["_id"] = telemetry_result.inserted_id
    return jsonify({"success": True, "telemetry": _serialize_telemetry(telemetry)}), 201


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
            "second": _as_number(data, "second"),
            "timestamp": _parse_timestamp(data.get("timestamp")),
            "pressure": _as_number(data, "pressure"),
            "temperature": _as_number(data, "temperature"),
            "humidity": _as_number(data, "humidity"),
            "latitude": _as_number(data, "latitude"),
            "longitude": _as_number(data, "longitude"),
            "altitude": _as_number(data, "altitude"),
            "windSpeed": _as_number(data, "windSpeed"),
            "windDirection": _as_number(data, "windDirection"),
            "geopotential": _as_number(data, "geopotential"),
            "geopotentialHeight": _as_number(data, "geopotential"),
            "dewPoint": _as_number(data, "dewPoint"),
            "source": _as_string(data, "source", required=False, max_length=40) or "manual",
            "createdAt": utc_now(),
        }
    except ValueError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    result = g.db["live_telemetry"].insert_one(telemetry)
    g.db["telemetry"].insert_one({**telemetry, "_id": ObjectId()})
    log_activity("ingest_telemetry", "launch", str(launch_id), {"telemetryId": str(result.inserted_id)})
    return jsonify({"success": True, "id": str(result.inserted_id)}), 201
