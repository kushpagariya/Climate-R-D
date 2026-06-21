from bson import ObjectId
from flask import Blueprint, g, jsonify

from auth_utils import require_auth

data_quality_bp = Blueprint("data_quality", __name__, url_prefix="/quality")

@data_quality_bp.route("/stats/<dataset_id>", methods=["GET"])
@require_auth
def get_stats(dataset_id):
    datasets_col = g.db["datasets"]
    
    try:
        query = {"_id": ObjectId(dataset_id)}
    except Exception:
        return jsonify({"success": False, "error": "Invalid dataset ID"}), 400
        
    dataset = datasets_col.find_one(query)
    if not dataset:
        return jsonify({"success": False, "error": "Dataset not found"}), 404
        
    return jsonify({
        "success": True, 
        "stats": dataset.get("stats", {})
    })

@data_quality_bp.route("/missing/<dataset_id>", methods=["GET"])
@require_auth
def get_missing(dataset_id):
    datasets_col = g.db["datasets"]
    
    try:
        query = {"_id": ObjectId(dataset_id)}
    except Exception:
        return jsonify({"success": False, "error": "Invalid dataset ID"}), 400
        
    dataset = datasets_col.find_one(query)
    if not dataset:
        return jsonify({"success": False, "error": "Dataset not found"}), 404
        
    return jsonify({
        "success": True, 
        "missingReport": dataset.get("missingReport", [])
    })

@data_quality_bp.route("/duplicates/<dataset_id>", methods=["GET"])
@require_auth
def get_duplicates(dataset_id):
    datasets_col = g.db["datasets"]
    
    try:
        query = {"_id": ObjectId(dataset_id)}
    except Exception:
        return jsonify({"success": False, "error": "Invalid dataset ID"}), 400
        
    dataset = datasets_col.find_one(query)
    if not dataset:
        return jsonify({"success": False, "error": "Dataset not found"}), 404
        
    return jsonify({
        "success": True, 
        "duplicateReport": dataset.get("duplicateReport", [])
    })
