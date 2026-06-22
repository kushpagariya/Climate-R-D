from datetime import timezone

from flask import Blueprint, g, jsonify

from auth_utils import require_auth, utc_now

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/api")


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