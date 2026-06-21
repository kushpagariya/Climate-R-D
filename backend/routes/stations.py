from bson import ObjectId
from flask import Blueprint, g, jsonify, request

from auth_utils import require_auth, utc_now, log_activity

stations_bp = Blueprint("stations", __name__, url_prefix="/stations")


@stations_bp.route("", methods=["GET"])
@require_auth
def list_stations():
    stations = g.db["weather_stations"]
    docs = list(stations.find())
    
    results = []
    for doc in docs:
        doc["_id"] = str(doc["_id"])
        results.append(doc)

    return jsonify({"success": True, "stations": results})


@stations_bp.route("/<station_id>", methods=["GET"])
@require_auth
def get_station(station_id):
    stations = g.db["weather_stations"]
    
    try:
        query = {"_id": ObjectId(station_id)}
    except Exception:
        query = {"stationId": station_id}
        
    station = stations.find_one(query)
    if not station:
        return jsonify({"success": False, "error": "Station not found"}), 404

    station["_id"] = str(station["_id"])
    return jsonify({"success": True, "station": station})


@stations_bp.route("", methods=["POST"])
@require_auth
def create_station():
    data = request.get_json(silent=True) or {}

    station_id = (data.get("stationId") or "").strip()
    station_name = (data.get("stationName") or "").strip()
    
    if not station_id or not station_name:
        return jsonify({"success": False, "error": "stationId and stationName are required."}), 400

    stations = g.db["weather_stations"]
    
    if stations.find_one({"stationId": station_id}):
        return jsonify({"success": False, "error": "Station with this ID already exists."}), 409

    now = utc_now()
    
    doc = {
        "stationId": station_id,
        "stationName": station_name,
        "latitude": data.get("latitude"),
        "longitude": data.get("longitude"),
        "elevation": data.get("elevation"),
        "country": data.get("country"),
        "state": data.get("state"),
        "createdAt": now,
        "createdBy": g.user_id,
    }

    result = stations.insert_one(doc)
    doc["_id"] = str(result.inserted_id)

    log_activity(action="create_station", resource_type="station", resource_id=doc["_id"])

    return jsonify({"success": True, "station": doc}), 201
