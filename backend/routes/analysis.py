from bson import ObjectId
from flask import Blueprint, g, jsonify, request

from auth_utils import require_auth, utc_now, log_activity

analysis_bp = Blueprint("analysis", __name__)


@analysis_bp.route("/saved-analyses", methods=["POST"])
@require_auth
def create_saved_analysis():
    data = request.get_json(silent=True) or {}
    station_id = data.get("stationId")
    date = data.get("date")
    time = data.get("time")

    if not station_id or not date or not time:
        return jsonify({"success": False, "error": "stationId, date, and time are required."}), 400

    doc = {
        "userId": g.user["_id"],
        "stationId": station_id,
        "date": date,
        "time": time,
        "comparisonSettings": data.get("comparisonSettings") or {},
        "notes": data.get("notes", ""),
        "createdAt": utc_now(),
    }
    result = g.db["saved_analyses"].insert_one(doc)
    log_activity(
        action="save_analysis",
        resource_type="saved_analyses",
        resource_id=str(result.inserted_id),
        metadata={"stationId": station_id, "date": date, "time": time},
    )
    return jsonify({"success": True, "id": str(result.inserted_id)})


@analysis_bp.route("/saved-analyses", methods=["GET"])
@require_auth
def list_saved_analyses():
    limit = int(request.args.get("limit", 100))
    cursor = (
        g.db["saved_analyses"]
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
                "comparisonSettings": doc.get("comparisonSettings", {}),
                "notes": doc.get("notes", ""),
                "createdAt": doc["createdAt"].isoformat(),
            }
        )
    return jsonify({"success": True, "items": items})


@analysis_bp.route("/saved-analyses/<analysis_id>", methods=["DELETE"])
@require_auth
def delete_saved_analysis(analysis_id):
    try:
        oid = ObjectId(analysis_id)
    except Exception:
        return jsonify({"success": False, "error": "Invalid analysis id."}), 400

    result = g.db["saved_analyses"].delete_one({"_id": oid, "userId": g.user["_id"]})
    if result.deleted_count == 0:
        return jsonify({"success": False, "error": "Analysis not found."}), 404
    return jsonify({"success": True})
