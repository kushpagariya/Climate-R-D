import math
import os
import re
import threading
import time
from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from auth_utils import log_activity, require_auth, utc_now
from routes.radiosonde import calculate_atmospheric_parameters
from routes.stations import find_station, resolve_sondehub_site_id, serialize_station
from services.sondehub_service import (
    SondeHubError,
    SondeHubHTTPError,
    SondeHubTimeoutError,
    SondeHubValidationError,
    _parse_iso_datetime,
    get_sondehub_service,
    normalize_observation,
    normalize_trajectory_point,
)

balloons_bp = Blueprint("balloons", __name__, url_prefix="/api/balloons")

BALLOON_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._\-]{0,63}$")
ACTIVE_THRESHOLD_SECONDS = int(os.getenv("BALLOON_ACTIVE_THRESHOLD_SECONDS", "1800"))
LANDED_THRESHOLD_SECONDS = int(os.getenv("BALLOON_LANDED_THRESHOLD_SECONDS", "3600"))
CACHE_TTL_SECONDS = int(os.getenv("SONDEHUB_CACHE_SECONDS", "60"))
DEFAULT_LAST_SECONDS = int(os.getenv("SONDEHUB_DEFAULT_LAST_SECONDS", "86400"))
DEFAULT_DISCOVERY_DISTANCE_METERS = float(
    os.getenv("BALLOON_DEFAULT_DISCOVERY_DISTANCE_METERS", "250000")
)

_cache_lock = threading.Lock()
_discovery_cache = {}


def validate_balloon_id(balloon_id):
    cleaned = (balloon_id or "").strip()
    if not cleaned:
        return None, "balloonId is required."
    if len(cleaned) > 64 or not BALLOON_ID_PATTERN.fullmatch(cleaned):
        return None, "balloonId is invalid."
    return cleaned, None


def _parse_positive_int(value, default, maximum):
    if value is None or value == "":
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise SondeHubValidationError("limit must be an integer.")
    if parsed <= 0:
        raise SondeHubValidationError("limit must be greater than zero.")
    return min(parsed, maximum)


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


def _parse_float_param(name, value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        raise SondeHubValidationError(f"{name} must be a number.")


def _isoformat(value):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    return value


def _cache_get(cache_key):
    with _cache_lock:
        entry = _discovery_cache.get(cache_key)
        if not entry:
            return None
        expires_at, payload = entry
        if time.time() > expires_at:
            _discovery_cache.pop(cache_key, None)
            return None
        return payload


def _cache_set(cache_key, payload, ttl=CACHE_TTL_SECONDS):
    with _cache_lock:
        _discovery_cache[cache_key] = (time.time() + ttl, payload)


def _strip_raw(items):
    cleaned = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        packet = dict(item)
        packet.pop("raw", None)
        cleaned.append(packet)
    return cleaned


def _safe_float(value):
    try:
        if value is None:
            return None
        number = float(value)
        if math.isnan(number) or math.isinf(number):
            return None
        return number
    except (TypeError, ValueError):
        return None


def _infer_phase(vertical_velocity, altitude):
    if altitude is not None and altitude < 100:
        return "complete"
    if vertical_velocity is not None and vertical_velocity < -1:
        return "descending"
    return "ascending"


def _derive_status(latest_dt, vertical_velocity, altitude, now):
    if latest_dt is None:
        return "unknown"

    age_seconds = (now - latest_dt).total_seconds()
    if age_seconds > LANDED_THRESHOLD_SECONDS:
        return "landed"
    if altitude is not None and altitude < 200 and age_seconds > 600:
        return "landed"
    if vertical_velocity is not None and vertical_velocity < -2:
        return "descending"
    if age_seconds <= ACTIVE_THRESHOLD_SECONDS:
        return "active"
    return "inactive"


def _compute_max_altitude(telemetry_packets):
    altitudes = [
        _safe_float(packet.get("altitude"))
        for packet in telemetry_packets or []
        if _safe_float(packet.get("altitude")) is not None
    ]
    return max(altitudes) if altitudes else None


def _build_current_position(latest_packet, now):
    if not latest_packet:
        return None

    latest_dt = _parse_iso_datetime(latest_packet.get("datetime")) or _parse_iso_datetime(
        latest_packet.get("timeReceived")
    )
    altitude = _safe_float(latest_packet.get("altitude"))
    vertical_velocity = _safe_float(latest_packet.get("verticalVelocity"))

    return {
        "lat": _safe_float(latest_packet.get("latitude")),
        "lon": _safe_float(latest_packet.get("longitude")),
        "altitude": altitude,
        "timestamp": _isoformat(latest_dt),
        "phase": _infer_phase(vertical_velocity, altitude),
        "temperature": _safe_float(latest_packet.get("temperature")),
        "pressure": _safe_float(latest_packet.get("pressure")),
        "humidity": _safe_float(latest_packet.get("humidity")),
        "windSpeed": _safe_float(latest_packet.get("windSpeed")),
        "windDirection": _safe_float(latest_packet.get("windDirection")),
        "verticalVelocity": vertical_velocity,
    }


def _group_telemetry_by_serial(telemetry_packets):
    grouped = {}
    for packet in telemetry_packets or []:
        serial = (packet.get("serial") or "").strip()
        if not serial:
            continue
        grouped.setdefault(serial, []).append(packet)

    for serial in grouped:
        grouped[serial].sort(
            key=lambda item: _parse_iso_datetime(item.get("datetime"))
            or _parse_iso_datetime(item.get("timeReceived"))
            or datetime.min.replace(tzinfo=timezone.utc)
        )
    return grouped


def _find_nearest_station(db, latitude, longitude):
    if latitude is None or longitude is None:
        return None

    best_station = None
    best_distance = float("inf")

    for station in db["weather_stations"].find({}):
        station_lat = _safe_float(station.get("latitude"))
        station_lon = _safe_float(station.get("longitude"))
        if station_lat is None or station_lon is None:
            continue

        distance = math.sqrt((station_lat - latitude) ** 2 + (station_lon - longitude) ** 2)
        if distance < best_distance:
            best_distance = distance
            best_station = station

    return best_station


def _resolve_station_for_balloon(db, balloon_id, station_id=None, latitude=None, longitude=None):
    if station_id:
        station, error = find_station(db, station_id)
        if error:
            return None, error
        if station:
            return station, None

    persisted = db["radiosonde_history"].find_one(
        {"recordType": "balloon", "metadata.serial": balloon_id},
        sort=[("updatedAt", -1), ("createdAt", -1)],
    )
    if persisted and persisted.get("stationId"):
        station, _ = find_station(db, persisted["stationId"])
        if station:
            return station, None

    sounding = db["radiosonde_history"].find_one(
        {"metadata.serial": balloon_id, "recordType": {"$ne": "mission"}},
        sort=[("createdAt", -1)],
    )
    if sounding and sounding.get("stationId"):
        station, _ = find_station(db, sounding["stationId"])
        if station:
            return station, None

    nearest = _find_nearest_station(db, latitude, longitude)
    if nearest:
        return nearest, None

    return None, None


def _build_balloon_summary(
    balloon_id,
    telemetry_packets,
    *,
    station=None,
    source="sondehub",
    stale=False,
):
    now = utc_now()
    latest_packet = telemetry_packets[-1] if telemetry_packets else None
    latest_dt = None
    if latest_packet:
        latest_dt = _parse_iso_datetime(latest_packet.get("datetime")) or _parse_iso_datetime(
            latest_packet.get("timeReceived")
        )

    altitude = _safe_float(latest_packet.get("altitude")) if latest_packet else None
    vertical_velocity = (
        _safe_float(latest_packet.get("verticalVelocity")) if latest_packet else None
    )
    status = _derive_status(latest_dt, vertical_velocity, altitude, now)
    max_altitude = _compute_max_altitude(telemetry_packets)

    station_payload = None
    if station:
        station_payload = {
            "stationId": station.get("stationId"),
            "stationName": station.get("stationName"),
            "latitude": station.get("latitude"),
            "longitude": station.get("longitude"),
        }

    return {
        "balloonId": balloon_id,
        "serial": balloon_id,
        "status": status,
        "currentPosition": _build_current_position(latest_packet, now),
        "maxAltitude": max_altitude,
        "lastSeenAt": _isoformat(latest_dt),
        "packetCount": len(telemetry_packets or []),
        "manufacturer": latest_packet.get("manufacturer") if latest_packet else None,
        "type": latest_packet.get("type") if latest_packet else None,
        "station": station_payload,
        "source": source,
        "stale": stale,
    }


def _telemetry_to_profile(telemetry_packets):
    observations = []
    trajectory = []

    for packet in telemetry_packets or []:
        raw_packet = packet.get("raw")
        if not isinstance(raw_packet, dict):
            continue
        observations.append(normalize_observation(raw_packet))
        trajectory.append(normalize_trajectory_point(raw_packet))

    return observations, trajectory


def _persist_balloon_tracking(
    db,
    balloon_id,
    station_id,
    telemetry_packets,
    status,
    max_altitude,
):
    now = utc_now()
    observations, trajectory = _telemetry_to_profile(telemetry_packets)
    latest_packet = telemetry_packets[-1] if telemetry_packets else None
    latest_dt = None
    if latest_packet:
        latest_dt = _parse_iso_datetime(latest_packet.get("datetime")) or _parse_iso_datetime(
            latest_packet.get("timeReceived")
        )

    update_doc = {
        "stationId": station_id,
        "recordType": "balloon",
        "source": "sondehub",
        "observations": observations,
        "trajectory": trajectory,
        "events": [],
        "metadata": {
            "serial": balloon_id,
            "status": status,
            "maxAltitude": max_altitude,
            "lastSeenAt": _isoformat(latest_dt),
            "packetCount": len(telemetry_packets or []),
            "manufacturer": latest_packet.get("manufacturer") if latest_packet else None,
            "type": latest_packet.get("type") if latest_packet else None,
            "subtype": latest_packet.get("subtype") if latest_packet else None,
        },
        "updatedAt": now,
    }

    db["radiosonde_history"].update_one(
        {"recordType": "balloon", "metadata.serial": balloon_id},
        {"$set": update_doc, "$setOnInsert": {"createdAt": now}},
        upsert=True,
    )


def _load_persisted_balloon(db, balloon_id):
    doc = db["radiosonde_history"].find_one(
        {"recordType": "balloon", "metadata.serial": balloon_id},
        sort=[("updatedAt", -1), ("createdAt", -1)],
    )
    if not doc:
        return None

    metadata = doc.get("metadata") or {}
    pseudo_telemetry = []
    trajectory = doc.get("trajectory") or []
    observations = doc.get("observations") or []

    for index, point in enumerate(trajectory):
        obs = observations[index] if index < len(observations) else {}
        pseudo_telemetry.append(
            {
                "serial": metadata.get("serial"),
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

    station = None
    if doc.get("stationId"):
        station, _ = find_station(db, doc["stationId"])

    summary = _build_balloon_summary(
        balloon_id,
        pseudo_telemetry,
        station=station,
        source="radiosonde_history",
        stale=True,
    )
    summary["status"] = metadata.get("status") or summary.get("status")
    summary["maxAltitude"] = metadata.get("maxAltitude") or summary.get("maxAltitude")
    summary["recordId"] = str(doc["_id"])

    return {
        "summary": summary,
        "telemetry": pseudo_telemetry,
        "trajectory": trajectory,
        "observations": observations,
        "metadata": metadata,
        "station": station,
        "recordId": str(doc["_id"]),
        "updatedAt": _isoformat(doc.get("updatedAt") or doc.get("createdAt")),
    }


def _discover_from_station(db, station, last_seconds, force_refresh=False):
    resolved_station_id = station.get("stationId")
    site_id = resolve_sondehub_site_id(station)
    if not site_id:
        return [], "Station is not linked to a SondeHub site id."

    cache_key = f"station:{site_id}:{last_seconds}"
    if not force_refresh:
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached, None

    service = get_sondehub_service()
    live_data = service.fetch_live_station_data(site_id, last_seconds=last_seconds)
    grouped = _group_telemetry_by_serial(live_data.get("telemetry") or [])

    balloons = []
    for serial, packets in grouped.items():
        summary = _build_balloon_summary(
            serial,
            packets,
            station=station,
            source="sondehub",
            stale=False,
        )
        _persist_balloon_tracking(
            db,
            serial,
            resolved_station_id,
            packets,
            summary["status"],
            summary["maxAltitude"],
        )
        balloons.append(summary)

    _cache_set(cache_key, balloons)
    return balloons, None


def _discover_near(db, latitude, longitude, distance_meters, last_seconds, force_refresh=False):
    cache_key = f"near:{latitude}:{longitude}:{distance_meters}:{last_seconds}"
    if not force_refresh:
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached, None

    service = get_sondehub_service()
    live_data = service.fetch_live_sondes_near(
        latitude,
        longitude,
        distance_meters=distance_meters,
        last_seconds=last_seconds,
    )
    grouped = _group_telemetry_by_serial(live_data.get("telemetry") or [])

    balloons = []
    for serial, packets in grouped.items():
        latest = packets[-1] if packets else None
        nearest_station = _find_nearest_station(
            db,
            _safe_float(latest.get("latitude")) if latest else None,
            _safe_float(latest.get("longitude")) if latest else None,
        )
        station_id = nearest_station.get("stationId") if nearest_station else "unknown"

        summary = _build_balloon_summary(
            serial,
            packets,
            station=nearest_station,
            source="sondehub",
            stale=False,
        )
        _persist_balloon_tracking(
            db,
            serial,
            station_id,
            packets,
            summary["status"],
            summary["maxAltitude"],
        )
        balloons.append(summary)

    _cache_set(cache_key, balloons)
    return balloons, None


def _discover_persisted(db, station_id=None, status_filter=None, limit=50):
    query = {"recordType": "balloon"}
    if station_id:
        query["stationId"] = station_id
    if status_filter:
        query["metadata.status"] = status_filter

    cursor = (
        db["radiosonde_history"]
        .find(query)
        .sort([("updatedAt", -1), ("createdAt", -1)])
        .limit(limit)
    )

    balloons = []
    for doc in cursor:
        metadata = doc.get("metadata") or {}
        serial = metadata.get("serial")
        if not serial:
            continue

        station = None
        if doc.get("stationId"):
            station, _ = find_station(db, doc["stationId"])

        pseudo_telemetry = []
        trajectory = doc.get("trajectory") or []
        observations = doc.get("observations") or []
        for index, point in enumerate(trajectory):
            obs = observations[index] if index < len(observations) else {}
            pseudo_telemetry.append(
                {
                    "serial": serial,
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

        summary = _build_balloon_summary(
            serial,
            pseudo_telemetry,
            station=station,
            source="radiosonde_history",
            stale=True,
        )
        summary["status"] = metadata.get("status") or summary.get("status")
        summary["maxAltitude"] = metadata.get("maxAltitude") or summary.get("maxAltitude")
        summary["recordId"] = str(doc["_id"])
        balloons.append(summary)

    return balloons


@balloons_bp.route("", methods=["GET"])
@require_auth
def list_balloons():
    """
    GET /api/balloons

    Discovery modes:
      - stationId=<id>                     Live balloons for one launch site
      - latitude=<lat>&longitude=<lon>     Live balloons near coordinates
      - neither                            Persisted balloon records from MongoDB

    Optional query params:
      - lastSeconds
      - distance        Meters for near discovery (default 250000)
      - status          active | inactive | descending | landed | unknown
      - limit           Max results (default 50, max 200)
      - refresh=true    Bypass in-memory cache
    """
    station_id = (request.args.get("stationId") or "").strip() or None
    latitude = _parse_float_param("latitude", request.args.get("latitude"))
    longitude = _parse_float_param("longitude", request.args.get("longitude"))
    distance = _parse_float_param("distance", request.args.get("distance"))
    status_filter = (request.args.get("status") or "").strip().lower() or None
    force_refresh = (request.args.get("refresh") or "").strip().lower() in {
        "1",
        "true",
        "yes",
    }

    allowed_statuses = {"active", "inactive", "descending", "landed", "unknown"}
    if status_filter and status_filter not in allowed_statuses:
        return jsonify({"success": False, "error": "status is not supported."}), 400

    try:
        last_seconds = _parse_last_seconds(request.args.get("lastSeconds"))
        limit = _parse_positive_int(request.args.get("limit"), default=50, maximum=200)
    except SondeHubValidationError as exc:
        return jsonify({"success": False, "error": str(exc)}), 400

    warning = None
    balloons = []
    discovery_mode = "persisted"

    try:
        if station_id:
            discovery_mode = "station"
            station, validation_error = find_station(g.db, station_id)
            if validation_error:
                return jsonify({"success": False, "error": validation_error}), 400
            if not station:
                return jsonify({"success": False, "error": "Station not found."}), 404

            balloons, warning = _discover_from_station(
                g.db,
                station,
                last_seconds,
                force_refresh=force_refresh,
            )

        elif latitude is not None or longitude is not None:
            if latitude is None or longitude is None:
                return jsonify(
                    {"success": False, "error": "latitude and longitude are both required."}
                ), 400

            discovery_mode = "near"
            distance_meters = distance if distance is not None else DEFAULT_DISCOVERY_DISTANCE_METERS
            balloons, warning = _discover_near(
                g.db,
                latitude,
                longitude,
                distance_meters,
                last_seconds,
                force_refresh=force_refresh,
            )

        else:
            balloons = _discover_persisted(
                g.db,
                station_id=station_id,
                status_filter=status_filter,
                limit=limit,
            )

    except SondeHubTimeoutError:
        warning = "SondeHub request timed out."
        balloons = _discover_persisted(
            g.db,
            station_id=station_id,
            status_filter=status_filter,
            limit=limit,
        )
    except SondeHubHTTPError as exc:
        warning = f"SondeHub returned HTTP {exc.status_code}."
        balloons = _discover_persisted(
            g.db,
            station_id=station_id,
            status_filter=status_filter,
            limit=limit,
        )
    except SondeHubError as exc:
        warning = f"SondeHub request failed: {exc}"
        balloons = _discover_persisted(
            g.db,
            station_id=station_id,
            status_filter=status_filter,
            limit=limit,
        )

    if status_filter:
        balloons = [item for item in balloons if item.get("status") == status_filter]

    balloons = balloons[:limit]

    log_activity(
        action="list_balloons",
        resource_type="balloon",
        resource_id=station_id or "all",
        metadata={
            "discoveryMode": discovery_mode,
            "count": len(balloons),
            "status": status_filter,
            "warning": warning,
        },
    )

    return jsonify(
        {
            "success": True,
            "balloons": balloons,
            "count": len(balloons),
            "discoveryMode": discovery_mode,
            "warning": warning,
            "metadata": {
                "lastSeconds": last_seconds,
                "limit": limit,
                "status": status_filter,
            },
        }
    )


@balloons_bp.route("/<balloon_id>", methods=["GET"])
@require_auth
def get_balloon(balloon_id):
    """
    GET /api/balloons/<balloonId>

    Returns live or persisted balloon tracking data including:
      - current position
      - max altitude
      - status
      - historical telemetry
      - associated station

    Optional query params:
      - stationId       Preferred station association
      - persist=true    Persist latest telemetry (default true)
      - includeRaw=false
    """
    cleaned_id, validation_error = validate_balloon_id(balloon_id)
    if validation_error:
        return jsonify({"success": False, "error": validation_error}), 400

    station_id = (request.args.get("stationId") or "").strip() or None
    should_persist = (request.args.get("persist") or "true").strip().lower() not in {
        "0",
        "false",
        "no",
    }
    include_raw = (request.args.get("includeRaw") or "").strip().lower() in {
        "1",
        "true",
        "yes",
    }

    warning = None
    telemetry_packets = []
    source = "sondehub"
    stale = False

    try:
        service = get_sondehub_service()
        telemetry_packets = service.fetch_radiosonde_telemetry(cleaned_id)
    except SondeHubTimeoutError:
        warning = "SondeHub request timed out."
    except SondeHubHTTPError as exc:
        warning = f"SondeHub returned HTTP {exc.status_code}."
    except SondeHubError as exc:
        warning = f"SondeHub request failed: {exc}"

    persisted = None
    if not telemetry_packets:
        persisted = _load_persisted_balloon(g.db, cleaned_id)
        if not persisted:
            return jsonify({"success": False, "error": "Balloon not found."}), 404

        source = "radiosonde_history"
        stale = True
        telemetry_packets = persisted["telemetry"]
        if warning is None:
            warning = "Serving persisted balloon data because live SondeHub telemetry is unavailable."

    latest_packet = telemetry_packets[-1] if telemetry_packets else None
    latitude = _safe_float(latest_packet.get("latitude")) if latest_packet else None
    longitude = _safe_float(latest_packet.get("longitude")) if latest_packet else None

    station, station_error = _resolve_station_for_balloon(
        g.db,
        cleaned_id,
        station_id=station_id,
        latitude=latitude,
        longitude=longitude,
    )
    if station_error:
        return jsonify({"success": False, "error": station_error}), 400

    resolved_station_id = station.get("stationId") if station else (
        persisted.get("summary", {}).get("station", {}).get("stationId")
        if persisted
        else "unknown"
    )

    summary = _build_balloon_summary(
        cleaned_id,
        telemetry_packets,
        station=station,
        source=source,
        stale=stale,
    )

    observations, trajectory = _telemetry_to_profile(telemetry_packets)
    if persisted and not observations:
        observations = persisted.get("observations") or []
        trajectory = persisted.get("trajectory") or []

    parameters = calculate_atmospheric_parameters(observations) if observations else {}

    if should_persist and telemetry_packets and not stale:
        _persist_balloon_tracking(
            g.db,
            cleaned_id,
            resolved_station_id,
            telemetry_packets,
            summary["status"],
            summary["maxAltitude"],
        )

    telemetry_response = telemetry_packets if include_raw else _strip_raw(telemetry_packets)

    log_activity(
        action="view_balloon",
        resource_type="balloon",
        resource_id=cleaned_id,
        metadata={
            "stationId": resolved_station_id,
            "status": summary.get("status"),
            "packetCount": summary.get("packetCount", 0),
            "stale": stale,
        },
    )

    return jsonify(
        {
            "success": True,
            "warning": warning,
            "balloon": summary,
            "balloonId": cleaned_id,
            "serial": cleaned_id,
            "status": summary.get("status"),
            "currentPosition": summary.get("currentPosition"),
            "maxAltitude": summary.get("maxAltitude"),
            "lastSeenAt": summary.get("lastSeenAt"),
            "station": serialize_station(station) if station else None,
            "trajectory": trajectory,
            "telemetry": telemetry_response,
            "historicalTelemetry": telemetry_response,
            "observations": observations,
            "parameters": parameters,
            "metadata": {
                "source": source,
                "stale": stale,
                "packetCount": summary.get("packetCount", 0),
                "recordId": persisted.get("recordId") if persisted else None,
            },
        }
    )