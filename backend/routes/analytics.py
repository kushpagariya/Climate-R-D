from flask import Blueprint, g, jsonify, request

from auth_utils import require_auth

analytics_bp = Blueprint("analytics", __name__, url_prefix="/analytics")

@analytics_bp.route("/summary/<station_id>", methods=["GET"])
@require_auth
def get_summary(station_id):
    records_col = g.db["weather_records"]
    
    pipeline = [
        {"$match": {"stationId": station_id}},
        {"$group": {
            "_id": "$stationId",
            "minTemp": {"$min": "$temperature"},
            "maxTemp": {"$max": "$temperature"},
            "avgTemp": {"$avg": "$temperature"},
            "minPressure": {"$min": "$pressure"},
            "maxPressure": {"$max": "$pressure"},
            "avgPressure": {"$avg": "$pressure"},
            "minHumidity": {"$min": "$humidity"},
            "maxHumidity": {"$max": "$humidity"},
            "avgHumidity": {"$avg": "$humidity"},
            "minWind": {"$min": "$windSpeed"},
            "maxWind": {"$max": "$windSpeed"},
            "avgWind": {"$avg": "$windSpeed"},
            "recordCount": {"$sum": 1}
        }}
    ]
    
    result = list(records_col.aggregate(pipeline))
    if not result:
        return jsonify({"success": False, "error": "No data found for this station"}), 404
        
    return jsonify({"success": True, "summary": result[0]})


@analytics_bp.route("/trend/<station_id>", methods=["GET"])
@require_auth
def get_trend(station_id):
    records_col = g.db["weather_records"]
    
    start_date = request.args.get("startDate")
    end_date = request.args.get("endDate")
    
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
        {"$group": {
            "_id": "$date",
            "avgTemp": {"$avg": "$temperature"},
            "avgPressure": {"$avg": "$pressure"},
            "avgHumidity": {"$avg": "$humidity"},
            "avgWind": {"$avg": "$windSpeed"}
        }},
        {"$sort": {"_id": 1}}
    ]
    
    results = list(records_col.aggregate(pipeline))
    return jsonify({"success": True, "trends": results})


@analytics_bp.route("/graph/<station_id>", methods=["GET"])
@require_auth
def get_graph_data(station_id):
    records_col = g.db["weather_records"]
    
    match = {"stationId": station_id}
    
    pipeline = [
        {"$match": match},
        {"$sort": {"date": 1, "time": 1}},
        {"$project": {
            "_id": 0,
            "date": 1,
            "time": 1,
            "temperature": 1,
            "pressure": 1,
            "humidity": 1,
            "windSpeed": 1
        }}
    ]
    
    limit = int(request.args.get("limit", 10000))
    pipeline.append({"$limit": limit})
    
    results = list(records_col.aggregate(pipeline))
    return jsonify({"success": True, "data": results})
