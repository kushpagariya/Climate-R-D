from flask import Blueprint, g, jsonify, request

from auth_utils import require_auth, utc_now, log_activity

history_bp = Blueprint("history", __name__)


@history_bp.route("/graph-history", methods=["POST"])
@require_auth
def create_graph_history():
    data = request.get_json(silent=True) or {}
    station_id = data.get("stationId")
    date = data.get("date")
    time = data.get("time")
    chart_type = data.get("chartType")

    if not station_id or not date or not time or not chart_type:
        return jsonify({"success": False, "error": "stationId, date, time, and chartType are required."}), 400

    g.db["graph_history"].insert_one(
        {
            "userId": g.user["_id"],
            "stationId": station_id,
            "date": date,
            "time": time,
            "chartType": chart_type,
            "createdAt": utc_now(),
        }
    )
    log_activity(
        action="view_sounding",
        resource_type="graph_history",
        metadata={"stationId": station_id, "date": date, "time": time, "chartType": chart_type},
    )
    return jsonify({"success": True})


@history_bp.route("/graph-history", methods=["GET"])
@require_auth
def list_graph_history():
    limit = int(request.args.get("limit", 100))
    cursor = (
        g.db["graph_history"]
        .find({"userId": g.user["_id"]})
        .sort("createdAt", -1)
        .limit(max(1, min(limit, 500)))
    )
    items = []
    for doc in cursor:
        items.append(
            {
                "id": str(doc["_id"]),
                "userId": str(doc["userId"]),
                "stationId": doc["stationId"],
                "date": doc["date"],
                "time": doc["time"],
                "chartType": doc["chartType"],
                "createdAt": doc["createdAt"].isoformat(),
            }
        )
    return jsonify({"success": True, "items": items})
