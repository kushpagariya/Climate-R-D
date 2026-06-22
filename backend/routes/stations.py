from bson import ObjectId
from flask import Blueprint, g, jsonify, request

from auth_utils import log_activity, require_auth, utc_now
from services.sondehub_service import (
    SondeHubError,
    SondeHubHTTPError,
    SondeHubTimeoutError,
    get_sondehub_service,
)

stations_bp = Blueprint("stations", __name__, url_prefix="/api/stations")


def validate_station_id(station_id):
    cleaned = (station_id or "").strip()
    if not cleaned:
        return None, "stationId is required."
    if len(cleaned) > 128:
        return None, "stationId is invalid."
    return cleaned, None


def find_station(db, station_id):
    """
    Resolve a station by MongoDB ObjectId or business stationId.
    Returns (document, error_message).
    """
    cleaned, error = validate_station_id(station_id)
    if error:
        return None, error

    stations = db["weather_stations"]

    try:
        by_object_id = stations.find_one({"_id": ObjectId(cleaned)})
        if by_object_id:
            return by_object_id, None
    except Exception:
        pass

    station = stations.find_one({"stationId": cleaned})
    if station:
        return station, None

    station = stations.find_one({"sondehubSiteKey": cleaned})
    if station:
        return station, None

    return None, None


def serialize_station(doc):
    if not doc:
        return None

    created_at = doc.get("createdAt")
    updated_at = doc.get("updatedAt") or doc.get("lastSyncedAt")

    return {
        "_id": str(doc["_id"]),
        "stationId": doc.get("stationId"),
        "stationName": doc.get("stationName"),
        "latitude": doc.get("latitude"),
        "longitude": doc.get("longitude"),
        "elevation": doc.get("elevation"),
        "country": doc.get("country"),
        "state": doc.get("state"),
        "source": doc.get("source"),
        "sondehubSiteKey": doc.get("sondehubSiteKey"),
        "launchSchedule": doc.get("launchSchedule") or [],
        "radiosondeTypes": doc.get("radiosondeTypes") or [],
        "burstAltitude": doc.get("burstAltitude"),
        "ascentRate": doc.get("ascentRate"),
        "descentRate": doc.get("descentRate"),
        "lastSyncedAt": updated_at.isoformat() if hasattr(updated_at, "isoformat") else updated_at,
        "createdAt": created_at.isoformat() if hasattr(created_at, "isoformat") else created_at,
        "createdBy": doc.get("createdBy"),
    }


def resolve_sondehub_site_id(station):
    if not station:
        return None
    return (
        (station.get("sondehubSiteKey") or station.get("stationId") or "").strip()
        or None
    )


def sync_sondehub_stations(db):
    """
    Fetch SondeHub launch sites and upsert into weather_stations.
    Returns (synced_count, warning_message).
    """
    service = get_sondehub_service()
    stations_col = db["weather_stations"]
    now = utc_now()

    try:
        normalized_sites = service.fetch_launch_sites()
    except SondeHubTimeoutError as exc:
        return 0, f"SondeHub sync timed out: {exc}"
    except SondeHubHTTPError as exc:
        return 0, f"SondeHub sync failed with HTTP {exc.status_code}."
    except SondeHubError as exc:
        return 0, f"SondeHub sync failed: {exc}"

    synced = 0
    for site in normalized_sites:
        station_id = (site.get("stationId") or "").strip()
        if not station_id:
            continue

        existing = stations_col.find_one({"stationId": station_id})
        update_fields = {
            **site,
            "lastSyncedAt": now,
            "updatedAt": now,
        }

        if existing:
            stations_col.update_one(
                {"_id": existing["_id"]},
                {"$set": update_fields},
            )
        else:
            stations_col.update_one(
                {"stationId": station_id},
                {
                    "$set": update_fields,
                    "$setOnInsert": {
                        "createdAt": now,
                        "createdBy": None,
                    },
                },
                upsert=True,
            )
        synced += 1

    return synced, None


@stations_bp.route("", methods=["GET"])
@require_auth
def list_stations():
    """
    GET /api/stations

    Optional query params:
      - sync=sondehub   Fetch SondeHub launch sites and upsert before listing
      - source          Filter by source field (e.g. sondehub, api)
    """
    sync_param = (request.args.get("sync") or "").strip().lower()
    source_filter = (request.args.get("source") or "").strip() or None

    sync_warning = None
    synced_count = 0

    if sync_param in {"sondehub", "true", "1", "yes"}:
        synced_count, sync_warning = sync_sondehub_stations(g.db)

    query = {}
    if source_filter:
        query["source"] = source_filter

    docs = list(g.db["weather_stations"].find(query).sort("stationName", 1))
    results = [serialize_station(doc) for doc in docs]

    payload = {
        "success": True,
        "stations": results,
        "count": len(results),
    }

    if sync_param in {"sondehub", "true", "1", "yes"}:
        payload["sync"] = {
            "source": "sondehub",
            "syncedCount": synced_count,
            "warning": sync_warning,
        }

    return jsonify(payload)


@stations_bp.route("/<station_id>", methods=["GET"])
@require_auth
def get_station(station_id):
    """
    GET /api/stations/<stationId>
    """
    station, validation_error = find_station(g.db, station_id)
    if validation_error:
        return jsonify({"success": False, "error": validation_error}), 400

    if not station:
        return jsonify({"success": False, "error": "Station not found."}), 404

    log_activity(
        action="view_station",
        resource_type="weather_stations",
        resource_id=str(station["_id"]),
        metadata={"stationId": station.get("stationId")},
    )

    return jsonify({"success": True, "station": serialize_station(station)})


@stations_bp.route("", methods=["POST"])
@require_auth
def create_station():
    data = request.get_json(silent=True) or {}

    station_id = (data.get("stationId") or "").strip()
    station_name = (data.get("stationName") or "").strip()

    if not station_id or not station_name:
        return jsonify(
            {"success": False, "error": "stationId and stationName are required."}
        ), 400

    stations = g.db["weather_stations"]

    if stations.find_one({"stationId": station_id}):
        return jsonify(
            {"success": False, "error": "Station with this ID already exists."}
        ), 409

    now = utc_now()

    doc = {
        "stationId": station_id,
        "stationName": station_name,
        "latitude": data.get("latitude"),
        "longitude": data.get("longitude"),
        "elevation": data.get("elevation"),
        "country": data.get("country"),
        "state": data.get("state"),
        "source": data.get("source", "api"),
        "sondehubSiteKey": data.get("sondehubSiteKey"),
        "createdAt": now,
        "updatedAt": now,
        "createdBy": g.user_id,
    }

    result = stations.insert_one(doc)
    doc["_id"] = str(result.inserted_id)

    log_activity(
        action="create_station",
        resource_type="weather_stations",
        resource_id=doc["_id"],
        metadata={"stationId": station_id},
    )

    return jsonify({"success": True, "station": serialize_station({**doc, "_id": result.inserted_id})}), 201