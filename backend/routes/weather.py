from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from auth_utils import require_auth, utc_now

weather_bp = Blueprint("weather", __name__, url_prefix="/api/weather")


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


def _parse_positive_int(value, default, maximum):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(1, min(parsed, maximum))


def _weather_sort_key():
    return [("date", -1), ("time", -1), ("createdAt", -1)]


def _find_latest_weather_record(db, station_id=None):
    query = {}
    if station_id:
        query["stationId"] = station_id
    return db["weather_records"].find_one(query, sort=_weather_sort_key())


def _find_surface_radiosonde_observation(db, station_id):
    query = {
        "recordType": {"$nin": ["mission", "balloon"]},
        "observations": {"$exists": True, "$ne": []},
    }
    if station_id:
        query["stationId"] = station_id

    doc = db["radiosonde_history"].find_one(query, sort=[("createdAt", -1)])
    if not doc:
        return None

    observations = doc.get("observations") or []
    if not observations:
        return None
    return observations[0]


def _build_record_timestamp(record):
    if not record:
        return None

    created_at = record.get("createdAt")
    if created_at:
        return _isoformat(created_at)

    date_val = record.get("date")
    time_val = record.get("time")
    if date_val and time_val:
        try:
            parsed = datetime.fromisoformat(f"{date_val}T{time_val}")
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.isoformat()
        except ValueError:
            return f"{date_val}T{time_val}"

    if date_val:
        return date_val
    return None


def _estimate_visibility_km(relative_humidity):
    """
    Estimate surface visibility (km) from relative humidity when the
    weather record does not store visibility directly.
    """
    if relative_humidity is None:
        return None
    try:
        rh = float(relative_humidity)
    except (TypeError, ValueError):
        return None

    visibility = max(0.5, min(15.0, 10.0 - (100.0 - rh) * 0.08))
    return _safe_round(visibility, 1)


def _empty_current_weather(station_id=None):
    return {
        "temperature": None,
        "humidity": None,
        "pressure": None,
        "windSpeed": None,
        "windDirection": None,
        "visibility": None,
        "timestamp": None,
        "stationId": station_id,
    }


def _serialize_current_weather(record, surface_obs=None):
    wind_direction = record.get("windDirection")
    visibility = record.get("visibility")

    if surface_obs:
        if wind_direction is None and surface_obs.get("windDirection") is not None:
            wind_direction = surface_obs.get("windDirection")
        if visibility is None:
            visibility = _estimate_visibility_km(surface_obs.get("relativeHumidity"))

    return {
        "temperature": _safe_round(record.get("temperature")),
        "humidity": _safe_round(record.get("humidity")),
        "pressure": _safe_round(record.get("pressure")),
        "windSpeed": _safe_round(record.get("windSpeed")),
        "windDirection": _safe_round(wind_direction, 0)
        if wind_direction is not None
        else None,
        "visibility": visibility,
        "timestamp": _build_record_timestamp(record),
        "stationId": record.get("stationId"),
    }


def _build_hourly_forecast(records):
    hourly = []
    for record in records:
        hourly.append(
            {
                "date": record.get("date"),
                "time": record.get("time"),
                "temperature": _safe_round(record.get("temperature")),
                "humidity": _safe_round(record.get("humidity")),
                "pressure": _safe_round(record.get("pressure")),
                "windSpeed": _safe_round(record.get("windSpeed")),
            }
        )
    return hourly


def _build_daily_forecast(records_col, station_id, allowed_dates=None):
    pipeline = [
        {"$match": {"stationId": station_id}},
        {"$sort": {"date": 1}},
        {
            "$group": {
                "_id": "$date",
                "avgTemp": {"$avg": "$temperature"},
                "avgPressure": {"$avg": "$pressure"},
                "avgHumidity": {"$avg": "$humidity"},
                "avgWind": {"$avg": "$windSpeed"},
                "recordCount": {"$sum": 1},
            }
        },
        {"$sort": {"_id": 1}},
    ]

    daily = []
    for row in records_col.aggregate(pipeline):
        date_val = row.get("_id")
        if allowed_dates is not None and date_val not in allowed_dates:
            continue
        daily.append(
            {
                "date": date_val,
                "temperature": _safe_round(row.get("avgTemp")),
                "humidity": _safe_round(row.get("avgHumidity")),
                "pressure": _safe_round(row.get("avgPressure")),
                "windSpeed": _safe_round(row.get("avgWind")),
                "recordCount": row.get("recordCount", 0),
            }
        )
    return daily


def _build_trends(records_col, station_id, start_date=None, end_date=None, allowed_dates=None):
    match = {"stationId": station_id}
    if start_date or end_date:
        match["date"] = {}
        if start_date:
            match["date"]["$gte"] = start_date
        if end_date:
            match["date"]["$lte"] = end_date

    pipeline = [
        {"$match": match},
        {"$sort": {"date": 1}},
        {
            "$group": {
                "_id": "$date",
                "avgTemp": {"$avg": "$temperature"},
                "avgPressure": {"$avg": "$pressure"},
                "avgHumidity": {"$avg": "$humidity"},
                "avgWind": {"$avg": "$windSpeed"},
            }
        },
        {"$sort": {"_id": 1}},
    ]

    trends = []
    for row in records_col.aggregate(pipeline):
        date_val = row.get("_id")
        if allowed_dates is not None and date_val not in allowed_dates:
            continue
        trends.append(
            {
                "date": date_val,
                "avgTemp": _safe_round(row.get("avgTemp")),
                "avgPressure": _safe_round(row.get("avgPressure")),
                "avgHumidity": _safe_round(row.get("avgHumidity")),
                "avgWind": _safe_round(row.get("avgWind")),
            }
        )
    return trends


@weather_bp.route("/current", methods=["GET"])
@require_auth
def get_current_weather():
    """
    GET /api/weather/current

    Optional query param:
      - stationId
    """
    station_id = (request.args.get("stationId") or "").strip() or None

    try:
        record = _find_latest_weather_record(g.db, station_id)
        if not record:
            return jsonify(
                {
                    "success": True,
                    **_empty_current_weather(station_id),
                    "metadata": {
                        "empty": True,
                        "message": "No weather records found.",
                    },
                }
            )

        surface_obs = _find_surface_radiosonde_observation(
            g.db, record.get("stationId")
        )
        payload = _serialize_current_weather(record, surface_obs)
        return jsonify({"success": True, **payload})

    except Exception as exc:
        return jsonify(
            {
                "success": False,
                "error": "Failed to load current weather.",
                "detail": str(exc),
            }
        ), 500


@weather_bp.route("/forecast", methods=["GET"])
@require_auth
def get_weather_forecast():
    """
    GET /api/weather/forecast

    Required query param:
      - stationId

    Optional query params:
      - days       (default 7, max 14)
      - startDate
      - endDate
    """
    station_id = (request.args.get("stationId") or "").strip()
    if not station_id:
        return jsonify({"success": False, "error": "stationId is required."}), 400

    days = _parse_positive_int(request.args.get("days"), default=7, maximum=14)
    start_date = (request.args.get("startDate") or "").strip() or None
    end_date = (request.args.get("endDate") or "").strip() or None

    try:
        records_col = g.db["weather_records"]
        match = {"stationId": station_id}
        if start_date or end_date:
            match["date"] = {}
            if start_date:
                match["date"]["$gte"] = start_date
            if end_date:
                match["date"]["$lte"] = end_date

        records = list(
            records_col.find(match).sort([("date", 1), ("time", 1)])
        )

        if not records:
            return jsonify(
                {
                    "success": True,
                    "hourly": [],
                    "daily": [],
                    "trends": [],
                    "metadata": {
                        "stationId": station_id,
                        "recordCount": 0,
                        "startDate": None,
                        "endDate": None,
                        "days": days,
                        "generatedAt": _isoformat(utc_now()),
                        "source": "weather_records",
                        "empty": True,
                        "message": "No weather records found for this station.",
                    },
                }
            )

        dates = sorted({record.get("date") for record in records if record.get("date")})
        window_dates = set(dates[-days:]) if dates else set()
        window_records = [
            record for record in records if record.get("date") in window_dates
        ]

        hourly = _build_hourly_forecast(window_records)
        daily = _build_daily_forecast(
            records_col, station_id, allowed_dates=window_dates
        )
        trends = _build_trends(
            records_col,
            station_id,
            start_date=start_date,
            end_date=end_date,
            allowed_dates=window_dates,
        )

        return jsonify(
            {
                "success": True,
                "hourly": hourly,
                "daily": daily,
                "trends": trends,
                "metadata": {
                    "stationId": station_id,
                    "recordCount": len(window_records),
                    "startDate": min(window_dates) if window_dates else None,
                    "endDate": max(window_dates) if window_dates else None,
                    "days": days,
                    "generatedAt": _isoformat(utc_now()),
                    "source": "weather_records",
                },
            }
        )

    except Exception as exc:
        return jsonify(
            {
                "success": False,
                "error": "Failed to load weather forecast.",
                "detail": str(exc),
            }
        ), 500