from bson import ObjectId
from flask import Blueprint, g, jsonify

from auth_utils import require_auth

data_quality_bp = Blueprint("data_quality", __name__, url_prefix="/quality")


def _get_owned_dataset(dataset_id):
    try:
        oid = ObjectId(dataset_id)
    except Exception:
        return None, (jsonify({"success": False, "error": "Invalid dataset ID"}), 400)

    dataset = g.db["datasets"].find_one({"_id": oid, "uploadedBy": g.user_id})
    if not dataset:
        return None, (jsonify({"success": False, "error": "Dataset not found"}), 404)

    return dataset, None


@data_quality_bp.route("/stats/<dataset_id>", methods=["GET"])
@require_auth
def get_stats(dataset_id):
    dataset, error_response = _get_owned_dataset(dataset_id)
    if error_response:
        return error_response

    return jsonify({"success": True, "stats": dataset.get("stats", {})})


@data_quality_bp.route("/missing/<dataset_id>", methods=["GET"])
@require_auth
def get_missing(dataset_id):
    dataset, error_response = _get_owned_dataset(dataset_id)
    if error_response:
        return error_response

    return jsonify({"success": True, "missingReport": dataset.get("missingReport", [])})


@data_quality_bp.route("/duplicates/<dataset_id>", methods=["GET"])
@require_auth
def get_duplicates(dataset_id):
    dataset, error_response = _get_owned_dataset(dataset_id)
    if error_response:
        return error_response

    return jsonify({"success": True, "duplicateReport": dataset.get("duplicateReport", [])})