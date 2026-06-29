from datetime import timezone

from bson import ObjectId
from flask import Blueprint, g, jsonify, request

from auth_utils import require_auth, utc_now

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/api")
DEFAULT_SOUNDING_LIMIT = 5000


def _isoformat(value):
    """Return ISO 8601 string for datetime objects; pass through None."""
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    return value


def _safe_round(value, digits=2):
    """Round a numeric value; return None if the value is not numeric."""
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return None


def _safe_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _launch_time_value(value):
    if not value:
        return None
    return str(value)[:5]


def _profile_level_from_telemetry(doc):
    temperature = _safe_float(doc.get("temperature"))
    dew_point = _safe_float(doc.get("dewPoint"))
    pressure = _safe_float(doc.get("pressure"))
    humidity = _safe_float(doc.get("humidity"))
    height = _safe_float(doc.get("geopotentialHeight"))
    if height is None:
        height = _safe_float(doc.get("geopotential"))
    if height is None:
        height = _safe_float(doc.get("altitude"))

    wind_speed = _safe_float(doc.get("windSpeed"))
    wind_direction = _safe_float(doc.get("windDirection"))

    if pressure is None or height is None:
        return None

    if temperature is None:
        temperature = 0
    if dew_point is None:
        dew_point = temperature
    if humidity is None:
        humidity = 0
    if wind_speed is None:
        wind_speed = 0
    if wind_direction is None:
        wind_direction = 0

    humidity_ice = min(100, humidity * 1.1) if temperature < 0 else humidity
    mixing_ratio = 0.01
    if pressure > 0:
        vapor_pressure = max(0.01, humidity / 100 * 6.112 * (2.71828 ** ((17.67 * dew_point) / (dew_point + 243.5))))
        mixing_ratio = max(0.01, 621.97 * vapor_pressure / max(1, pressure - vapor_pressure))

    return {
        "pressure": round(pressure, 2),
        "height": round(height, 2),
        "temperature": round(temperature, 2),
        "dewPoint": round(dew_point, 2),
        "icePoint": round(temperature - 2, 2) if temperature < 0 else round(dew_point, 2),
        "relativeHumidity": round(humidity, 2),
        "humidityWrtIce": round(humidity_ice, 2),
        "mixingRatio": round(mixing_ratio, 2),
        "windDirection": round(wind_direction, 2),
        "windSpeed": round(wind_speed, 2),
    }


def _calculate_parameters(observations):
    if not observations:
        return {
            "freezingLevel": 0,
            "lcl": 0,
            "tropopause": 0,
            "surfaceTemperature": 0,
            "surfacePressure": 0,
            "surfaceHumidity": 0,
            "maxWindSpeed": 0,
            "maxWindHeight": 0,
            "maxAltitude": 0,
            "cape": 0,
        }

    freezing_level = next(
        (obs.get("height", 0) for obs in observations if obs.get("temperature", 0) <= 0),
        0,
    )
    lcl = 0
    for obs in observations:
        if obs.get("height", 0) >= 3000:
            continue
        if obs.get("temperature", 0) - obs.get("dewPoint", 0) < 2:
            lcl = obs.get("height", 0)
            break

    tropopause = observations[-1].get("height", 0)
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
        1200 if surface.get("temperature", 0) - surface.get("dewPoint", 0) < 5 else 400,
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


def _axis_limits(observations):
    if not observations:
        return None
    temperatures = [obs["temperature"] for obs in observations]
    dew_points = [obs["dewPoint"] for obs in observations]
    pressures = [obs["pressure"] for obs in observations]
    heights = [obs["height"] for obs in observations]
    humidities = [obs["relativeHumidity"] for obs in observations]
    wind_speeds = [obs["windSpeed"] for obs in observations]
    return {
        "temperature": [min(temperatures + dew_points) - 5, max(temperatures + dew_points) + 5],
        "pressure": [max(0, min(pressures) - 25), max(pressures) + 25],
        "altitude": [0, max(heights)],
        "humidity": [0, min(100, max(humidities) + 10)],
        "windSpeed": [0, max(wind_speeds) + 5],
    }


def _serialize_launch_option(launch):
    return {
        "id": str(launch["_id"]),
        "stationId": launch.get("station"),
        "stationName": launch.get("station"),
        "date": launch.get("launchDate"),
        "time": _launch_time_value(launch.get("launchTime")),
        "label": f"{launch.get('station') or 'Launch'} - {launch.get('launchDate') or ''} {_launch_time_value(launch.get('launchTime')) or ''}".strip(),
    }


def _build_launch_query(user_id, station_id=None, date=None, time_value=None):
    query = {"userId": user_id}
    if station_id:
        query["station"] = station_id
    if date:
        query["launchDate"] = date
    if time_value:
        query["launchTime"] = {"$regex": f"^{time_value}"}
    return query


def _launch_id_values(launch_id):
    values = [launch_id, str(launch_id)]
    if not isinstance(launch_id, ObjectId):
        try:
            values.append(ObjectId(launch_id))
        except Exception:
            pass
    return values


def _telemetry_collection_for_launch(db, launch_id):
    query = {"launchId": {"$in": _launch_id_values(launch_id)}}
    if db["telemetry"].find_one(query, {"_id": 1}):
        return "telemetry"
    return "live_telemetry"


def _load_launch_profile(db, launch):
    collection_name = _telemetry_collection_for_launch(db, launch["_id"])
    docs = list(
        db[collection_name]
        .find({"launchId": {"$in": _launch_id_values(launch["_id"])}})
        .sort([("second", 1), ("timestamp", 1), ("_id", 1)])
        .limit(DEFAULT_SOUNDING_LIMIT)
    )
    profile = [
        level
        for level in (_profile_level_from_telemetry(doc) for doc in docs)
        if level is not None
    ]
    profile.sort(key=lambda row: row["height"])
    return profile, collection_name


def _build_atmospheric_summary(db):
    """
    Derive an atmospheric summary from the latest radiosonde sounding.

    Reads from `radiosonde_history` (existing collection).  Falls back
    to an empty dict if no soundings are present.
    """
    try:
        latest_sounding = db["radiosonde_history"].find_one(
            {"recordType": "sounding", "observations": {"$exists": True, "$ne": []}},
            sort=[("createdAt", -1)],
        )
        if not latest_sounding:
            return {}

        observations = latest_sounding.get("observations") or []
        if not observations:
            return {}

        surface = observations[0]

        temps = [o.get("temperature") for o in observations if o.get("temperature") is not None]
        humidities = [o.get("relativeHumidity") for o in observations if o.get("relativeHumidity") is not None]
        pressures = [o.get("pressure") for o in observations if o.get("pressure") is not None]

        avg_temp = (_safe_round(sum(temps) / len(temps)) if temps else None)
        avg_humidity = (_safe_round(sum(humidities) / len(humidities)) if humidities else None)
        surface_pressure = (_safe_round(surface.get("pressure")) if surface else None)

        max_alt = max((o.get("height", 0) for o in observations), default=0)

        # Tropopause: first level where lapse rate < 2 °C/km above 8 000 m
        tropopause = None
        for i in range(1, len(observations) - 1):
            prev_h = observations[i - 1].get("height", 0)
            next_h = observations[i + 1].get("height", 0)
            delta_km = (next_h - prev_h) / 1000.0
            if delta_km == 0:
                continue
            lapse = (
                observations[i - 1].get("temperature", 0) - observations[i + 1].get("temperature", 0)
            ) / delta_km
            if lapse < 2 and observations[i].get("height", 0) > 8000:
                tropopause = observations[i].get("height")
                break

        # Freezing level
        freezing_level = next(
            (o.get("height", 0) for o in observations if o.get("temperature", 0) <= 0),
            None,
        )

        return {
            "avgTemperature": avg_temp,
            "avgHumidity": avg_humidity,
            "surfacePressure": surface_pressure,
            "maxAltitude": max_alt,
            "tropopause": tropopause,
            "freezingLevel": freezing_level,
            "basedOnStationId": latest_sounding.get("stationId"),
            "basedOnDate": latest_sounding.get("date"),
        }
    except Exception:
        return {}


def _build_recent_activity(db, user_id, limit=10):
    """
    Return the last *limit* activity log entries for this user.
    Reads from `activity_logs` (existing collection).
    """
    try:
        cursor = (
            db["activity_logs"]
            .find({"userId": user_id}, {"_id": 0, "userId": 0})
            .sort("createdAt", -1)
            .limit(limit)
        )
        entries = []
        for doc in cursor:
            entries.append(
                {
                    "action": doc.get("action"),
                    "resourceType": doc.get("resourceType"),
                    "resourceId": doc.get("resourceId"),
                    "metadata": doc.get("metadata") or {},
                    "timestamp": _isoformat(doc.get("createdAt")),
                }
            )
        return entries
    except Exception:
        return []


def _latest_telemetry_timestamp(db):
    """
    Return the most-recent `createdAt` across radiosonde_history and
    weather_records (both existing collections).
    """
    try:
        latest_sounding = db["radiosonde_history"].find_one(
            {}, {"createdAt": 1}, sort=[("createdAt", -1)]
        )
        latest_record = db["weather_records"].find_one(
            {}, {"createdAt": 1}, sort=[("createdAt", -1)]
        )

        candidates = []
        if latest_sounding and latest_sounding.get("createdAt"):
            candidates.append(latest_sounding["createdAt"])
        if latest_record and latest_record.get("createdAt"):
            candidates.append(latest_record["createdAt"])

        if not candidates:
            return None
        return _isoformat(max(candidates))
    except Exception:
        return None


@dashboard_bp.route("/dashboard", methods=["GET"])
@require_auth
def get_dashboard():
    """
    GET /api/dashboard

    Returns an aggregated dashboard payload for the authenticated user:
      - activeMissions        int   missions with status != "completed" / "cancelled"
      - totalMissions         int   all missions belonging to the user
      - activeStations        int   all weather_stations documents
      - latestTelemetryTimestamp  ISO string | null
      - atmosphericSummary    dict  derived from the most-recent radiosonde sounding
      - recentActivity        list  last 10 activity_log entries for this user
    """
    try:
        db = g.db
        user_id = g.user["_id"]

        # ── missions ───────────────────────────────────────────────────────────
        inactive_statuses = {"completed", "cancelled"}

        total_missions = db["missions"].count_documents({"userId": user_id})

        # Count missions whose status is NOT a terminal state (case-insensitive)
        active_missions = db["missions"].count_documents(
            {
                "userId": user_id,
                "status": {"$not": {"$in": list(inactive_statuses)}},
            }
        )

        # ── stations ───────────────────────────────────────────────────────────
        active_stations = db["weather_stations"].count_documents({})

        # ── telemetry ──────────────────────────────────────────────────────────
        latest_telemetry_ts = _latest_telemetry_timestamp(db)

        # ── atmospheric summary ────────────────────────────────────────────────
        atmospheric_summary = _build_atmospheric_summary(db)

        # ── recent activity ────────────────────────────────────────────────────
        recent_activity = _build_recent_activity(db, user_id, limit=10)

        return jsonify(
            {
                "success": True,
                "activeMissions": active_missions,
                "totalMissions": total_missions,
                "activeStations": active_stations,
                "latestTelemetryTimestamp": latest_telemetry_ts,
                "atmosphericSummary": atmospheric_summary,
                "recentActivity": recent_activity,
            }
        )

    except Exception as exc:
        # Broad catch so the frontend always gets a structured error
        return jsonify({"success": False, "error": "Failed to load dashboard data.", "detail": str(exc)}), 500


@dashboard_bp.route("/dashboard/sounding", methods=["GET"])
@require_auth
def get_dashboard_sounding():
    """
    GET /api/dashboard/sounding

    Query params:
      - stationId   Launch station string
      - date        Launch date (YYYY-MM-DD)
      - time        Launch time (HH:MM)

    Returns a launch-backed atmospheric profile built from telemetry.
    """
    try:
        db = g.db
        user_id = g.user["_id"]
        station_id = (request.args.get("stationId") or "").strip()
        date = (request.args.get("date") or "").strip()
        time_value = _launch_time_value((request.args.get("time") or "").strip())

        options_cursor = (
            db["launches"]
            .find({"userId": user_id})
            .sort([("launchDate", -1), ("launchTime", -1), ("createdAt", -1)])
            .limit(250)
        )
        launch_options = [_serialize_launch_option(doc) for doc in options_cursor]

        query = _build_launch_query(
            user_id,
            station_id=station_id or None,
            date=date or None,
            time_value=time_value or None,
        )
        launch = db["launches"].find_one(
            query,
            sort=[("launchDate", -1), ("launchTime", -1), ("createdAt", -1)],
        )

        if not launch and not any([station_id, date, time_value]):
            launch = db["launches"].find_one(
                {"userId": user_id},
                sort=[("launchDate", -1), ("launchTime", -1), ("createdAt", -1)],
            )

        if not launch:
            return jsonify(
                {
                    "success": True,
                    "profile": [],
                    "parameters": _calculate_parameters([]),
                    "axisLimits": None,
                    "metadata": {
                        "stationId": station_id or None,
                        "date": date or None,
                        "time": time_value or None,
                        "source": "none",
                        "recordType": "launch-telemetry",
                    },
                    "launch": None,
                    "availableLaunches": launch_options,
                    "message": "No launch found for the selected station, date, and sounding time.",
                }
            )

        profile, source_collection = _load_launch_profile(db, launch)
        parameters = _calculate_parameters(profile)
        message = None
        if not profile:
            message = "This launch has no stored telemetry yet."

        return jsonify(
            {
                "success": True,
                "profile": profile,
                "parameters": parameters,
                "axisLimits": _axis_limits(profile),
                "metadata": {
                    "id": str(launch["_id"]),
                    "stationId": launch.get("station"),
                    "date": launch.get("launchDate"),
                    "time": _launch_time_value(launch.get("launchTime")),
                    "source": source_collection,
                    "recordType": "launch-telemetry",
                    "telemetryCount": len(profile),
                    "sondeNumber": launch.get("sondeNumber") or launch.get("radiosondeId"),
                },
                "launch": _serialize_launch_option(launch),
                "availableLaunches": launch_options,
                "message": message,
            }
        )
    except Exception as exc:
        return jsonify({"success": False, "error": "Failed to load dashboard sounding.", "detail": str(exc)}), 500
