from bson import ObjectId
from flask import Blueprint, g, jsonify, request

from auth_utils import require_auth, utc_now, log_activity

favorites_bp = Blueprint("favorites", __name__)


@favorites_bp.route("/favorites", methods=["POST"])
@require_auth
def create_favorite():
    data = request.get_json(silent=True) or {}
    favorite_type = data.get("type")
    ref_id = data.get("refId")
    label = data.get("label", "")

    if not favorite_type or not ref_id:
        return jsonify({"success": False, "error": "type and refId are required."}), 400

    doc = {
        "userId": g.user["_id"],
        "type": favorite_type,
        "refId": ref_id,
        "label": label,
        "createdAt": utc_now(),
    }
    result = g.db["favorites"].insert_one(doc)
    log_activity(
        action="favorite_item",
        resource_type=favorite_type,
        resource_id=ref_id,
        metadata={"label": label},
    )
    return jsonify({"success": True, "id": str(result.inserted_id)})


@favorites_bp.route("/favorites", methods=["GET"])
@require_auth
def list_favorites():
    limit = int(request.args.get("limit", 100))
    cursor = (
        g.db["favorites"]
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
                "type": doc["type"],
                "refId": doc["refId"],
                "label": doc.get("label", ""),
                "createdAt": doc["createdAt"].isoformat(),
            }
        )
    return jsonify({"success": True, "items": items})


@favorites_bp.route("/favorites/<favorite_id>", methods=["DELETE"])
@require_auth
def delete_favorite(favorite_id):
    try:
        oid = ObjectId(favorite_id)
    except Exception:
        return jsonify({"success": False, "error": "Invalid favorite id."}), 400

    result = g.db["favorites"].delete_one({"_id": oid, "userId": g.user["_id"]})
    if result.deleted_count == 0:
        return jsonify({"success": False, "error": "Favorite not found."}), 404
    return jsonify({"success": True})
