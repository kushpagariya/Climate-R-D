import os
import threading
import time

from flask import Blueprint, g, jsonify, request

from auth_utils import log_activity, require_auth, utc_now
from routes.stations import find_station, resolve_sondehub_site_id
from services.sondehub_service import (
    SondeHubError,
    SondeHubHTTPError,
    SondeHubTimeoutError,
    SondeHubValidationError,
    get_sondehub_service,
    normalize_weather_record,
)

telemetry_bp = Blueprint("telemetry", __name__, url_prefix="/api/telemetry")

CACHE_TTL_SECONDS = int(os.getenv("SONDEHUB_CACHE_SECONDS", "60"))
DEFAULT_LAST_SECONDS = int(os.getenv("SONDEHUB_DEFAULT_LAST_SECONDS", "86400"))

_cache_lock = threading.Lock()
_live_cache = {}


def _parse_last_seconds(value):
    if value is None or value == "":
        return DEFAULT_LAST_SECONDS
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise SondeHubValidationError("lastSeconds must be an integer.")
    if parsed <= 0:
        raise SondeHubValidationError("lastSeconds must be greater than zero.")
    return min(parsed, 7 * 24 * 60 * 60)


def _cache_get(cache_key):
    with _cache_lock:
        entry = _live_cache.get(cache_key)
        if not entry:
            return None
        expires_at, payload = entry
        if time.time() > expires_at:
            _live_cache.pop(cache_key, None)
            return None
        return payload


def _cache_set(cache_key, payload, ttl=CACHE_TTL_SECONDS):
    with _cache_lock:
        _live_cache[cache_key] = (time.time() + ttl, payload)


def _isoformat(value):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _strip_raw_telemetry(telemetry_items):
    cleaned = []
    for item in telemetry_items or []:
        if not isinstance(item, dict):
            continue
        packet = dict(item)
        packet.pop("raw", None)
        cleaned.append(packet)
    return cleaned


def _persist_latest_weather_record(db, station_id, latest_observation):
    if not latest_observation:
        return False

    raw_packet = latest_observation.get("raw")
    if not isinstance(raw_packet, dict):
        return False

    record = normalize_weather_record(raw_packet, station_id=station_id)
    if not record.get("date") or not record.get("time"):
        return False

    query = {
        "stationId": station_id,
        "date": record["date"],
        "time": record["time"],
    }
    if record.get("serial"):
        query["serial"] = record["serial"]

    db["weather_records"].update_one(
        query,
        {"$set": record},
        upsert=True,
    )
    return True


def _persist_latest_sounding(db, station_id, site_id, last_seconds):
    service = get_sondehub_service()
    sounding = service.fetch_latest_site_sounding(
        station_id=station_id,
        site_id=site_id,
        last_seconds=last_seconds,
    )
    if not sounding:
        return None

    date_val = sounding.get("date")
    time_val = sounding.get("time")
    if not date_val or not time_val:
        return None

    history_col = db["radiosonde_history"]
    existing = history_col.find_one(
        {
            "stationId": station_id,
            "date": date_val,
            "time": time_val,
            "recordType": {"$nin": ["mission", "balloon"]},
        }
    )

    now = utc_now()
    doc = {
        **sounding,
        "updatedAt": now,
    }

    if existing:
        history_col.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    **doc,
                    "createdAt": existing.get("createdAt", now),
                }
            },
        )
        return str(existing["_id"])

    doc["createdAt"] = now
    result = history_col.insert_one(doc)
    return str(result.inserted_id)


def _build_stale_payload(db, station_id):
    """
    Fallback when SondeHub is unavailable.
    Uses the latest persisted radiosonde sounding or weather record.
    """
    history_col = db["radiosonde_history"]
    sounding = history_col.find_one(
        {
            "stationId": station_id,
            "recordType": {"$nin": ["mission", "balloon"]},
            "observations": {"$exists": True, "$ne": []},
        },
        sort=[("createdAt", -1)],
    )

    if sounding:
        observations = sounding.get("observations") or []
        trajectory = sounding.get("trajectory") or []
        latest_obs = observations[-1] if observations else None

        pseudo_telemetry = []
        for index, point in enumerate(trajectory):
            obs = observations[index] if index < len(observations) else {}
            pseudo_telemetry.append(
                {
                    "datetime": point.get("timestamp"),
                    "latitude": point.get("lat"),
                    "longitude": point.get("lon"),
                    "altitude": point.get("altitude"),
                    "temperature": obs.get("temperature"),
                    "humidity": obs.get("relativeHumidity"),
                    "pressure": obs.get("pressure"),
                    "windSpeed": obs.get("windSpeed"),
                    "windDirection": obs.get("windDirection"),
                }
            )

        return {
            "stationId": station_id,
            "source": "radiosonde_history",
            "stale": True,
            "packetCount": len(pseudo_telemetry),
            "serials": [
                value
                for value in [((sounding.get("metadata") or {}).get("serial"))]
                if value
            ],
            "telemetry": pseudo_telemetry,
            "latestObservation": latest_obs,
            "soundingId": str(sounding["_id"]),
            "fetchedAt": _isoformat(sounding.get("createdAt")),
            "message": "Serving persisted radiosonde history because live SondeHub data is unavailable.",
        }

    weather = db["weather_records"].find_one(
        {"stationId": station_id},
        sort=[("createdAt", -1), ("date", -1), ("time", -1)],
    )

    if weather:
        latest_obs = {
            "datetime": _isoformat(weather.get("createdAt")),
            "date": weather.get("date"),
            "time": weather.get("time"),
            "temperature": weather.get("temperature"),
            "humidity": weather.get("humidity"),
            "pressure": weather.get("pressure"),
            "windSpeed": weather.get("windSpeed"),
            "windDirection": weather.get("windDirection"),
            "serial": weather.get("serial"),
        }
        return {
            "stationId": station_id,
            "source": "weather_records",
            "stale": True,
            "packetCount": 1,
            "serials": [weather.get("serial")] if weather.get("serial") else [],
            "telemetry": [latest_obs],
            "latestObservation": latest_obs,
            "fetchedAt": _isoformat(weather.get("createdAt")),
            "message": "Serving persisted weather record because live SondeHub data is unavailable.",
        }

    return {
        "stationId": station_id,
        "source": "none",
        "stale": True,
        "packetCount": 0,
        "serials": [],
        "telemetry": [],
        "latestObservation": None,
        "fetchedAt": None,
        "message": "No live or persisted telemetry found for this station.",
    }


def _fetch_live_payload(station_id, site_id, last_seconds, force_refresh=False):
    cache_key = f"{site_id}:{last_seconds}"
    if not force_refresh:
        cached = _cache_get(cache_key)
        if cached is not None:
            payload = dict(cached)
            payload["cacheHit"] = True
            return payload

    service = get_sondehub_service()
    live_data = service.fetch_live_station_data(site_id, last_seconds=last_seconds)

    payload = {
        "stationId": station_id,
        "siteId": site_id,
        "lastSeconds": live_data.get("lastSeconds", last_seconds),
        "source": "sondehub",
        "stale": False,
        "cacheHit": False,
        "packetCount": live_data.get("packetCount", 0),
        "serials": live_data.get("serials") or [],
        "telemetry": _strip_raw_telemetry(live_data.get("telemetry") or []),
        "latestObservation": live_data.get("latestObservation"),
        "fetchedAt": live_data.get("fetchedAt"),
    }

    if payload["latestObservation"] and isinstance(payload["latestObservation"], dict):
        payload["latestObservation"] = dict(payload["latestObservation"])
        payload["latestObservation"].pop("raw", None)

    _cache_set(cache_key, payload)
    return payload


@telemetry_bp.route("/<station_id>", methods=["GET"])
@require_auth
def get_station_telemetry(station_id):
    """
    GET /api/telemetry/<stationId>

    Optional query params:
      - lastSeconds     Window for SondeHub live fetch (default 86400)
      - refresh=true    Bypass in-memory cache
      - persist=true    Persist latest weather record + sounding (default true)
    """
    station, validation_error = find_station(g.db, station_id)
    if validation_error:
        return jsonify({"success": False, "error": validation_error}), 400

    if not station:
        return jsonify({"success": False, "error": "Station not found."}), 404

    resolved_station_id = station.get("stationId")
    site_id = resolve_sondehub_site_id(station)
    if not site_id:
        stale_payload = _build_stale_payload(g.db, resolved_station_id)
        return jsonify(
            {
                "success": True,
                "warning": "Station is not linked to a SondeHub site id.",
                **stale_payload,
                "persisted": False,
            }
        )

    try:
        last_seconds = _parse_last_seconds(request.args.get("lastSeconds"))
    except SondeHubValidationError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    force_refresh = (request.args.get("refresh") or "").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    should_persist = (request.args.get("persist") or "true").strip().lower() not in {
        "0",
        "false",
        "no",
    }

    sondehub_warning = None
    payload = None

    try:
        payload = _fetch_live_payload(
            resolved_station_id,
            site_id,
            last_seconds,
            force_refresh=force_refresh,
        )
    except SondeHubTimeoutError:
        sondehub_warning = "SondeHub request timed out."
    except SondeHubHTTPError as exc:
        sondehub_warning = f"SondeHub returned HTTP {exc.status_code}."
    except SondeHubError as exc:
        sondehub_warning = f"SondeHub request failed: {exc}"

    if payload is None:
        stale_payload = _build_stale_payload(g.db, resolved_station_id)
        log_activity(
            action="view_telemetry",
            resource_type="telemetry",
            resource_id=resolved_station_id,
            metadata={
                "stationId": resolved_station_id,
                "siteId": site_id,
                "stale": True,
                "warning": sondehub_warning,
            },
        )
        return jsonify(
            {
                "success": True,
                "warning": sondehub_warning,
                **stale_payload,
                "persisted": False,
            }
        )

    persisted_weather = False
    sounding_id = None

    if should_persist:
        latest = payload.get("latestObservation")
        if isinstance(latest, dict):
            raw_packet = latest.get("raw")
            if raw_packet is None:
                service = get_sondehub_service()
                live_data = service.fetch_live_station_data(
                    site_id, last_seconds=last_seconds
                )
                live_latest = live_data.get("latestObservation") or {}
                if isinstance(live_latest, dict):
                    latest = live_latest

        persisted_weather = _persist_latest_weather_record(
            g.db, resolved_station_id, latest if isinstance(latest, dict) else None
        )

        try:
            sounding_id = _persist_latest_sounding(
                g.db, resolved_station_id, site_id, last_seconds
            )
        except SondeHubError:
            sounding_id = None

    log_activity(
        action="view_telemetry",
        resource_type="telemetry",
        resource_id=resolved_station_id,
        metadata={
            "stationId": resolved_station_id,
            "siteId": site_id,
            "packetCount": payload.get("packetCount", 0),
            "stale": payload.get("stale", False),
            "cacheHit": payload.get("cacheHit", False),
        },
    )

    response = {
        "success": True,
        "warning": sondehub_warning,
        **payload,
        "persisted": {
            "weatherRecord": persisted_weather,
            "soundingId": sounding_id,
        },
    }
    return jsonify(response)