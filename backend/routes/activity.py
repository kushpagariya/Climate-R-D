from flask import Blueprint, jsonify, request

from auth_utils import require_auth, log_activity

activity_bp = Blueprint("activity", __name__)


@activity_bp.route("/activity-log", methods=["POST"])
@require_auth
def create_activity_log():
    data = request.get_json(silent=True) or {}
    action = data.get("action")
    if not action:
        return jsonify({"success": False, "error": "action is required."}), 400

    log_activity(
        action=action,
        resource_type=data.get("resourceType"),
        resource_id=data.get("resourceId"),
        metadata=data.get("metadata") or {},
    )
    return jsonify({"success": True})
