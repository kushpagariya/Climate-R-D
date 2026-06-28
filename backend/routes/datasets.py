from werkzeug.utils import secure_filename
from flask import Blueprint, g, jsonify, request

from auth_utils import require_auth, utc_now, log_activity
from services.dataset_service import process_weather_dataset

datasets_bp = Blueprint("datasets", __name__, url_prefix="/datasets")


@datasets_bp.route("", methods=["GET"])
@require_auth
def list_datasets():
    datasets_col = g.db["datasets"]

    station_id = request.args.get("stationId")
    query = {"uploadedBy": g.user_id}
    if station_id:
        query["stationId"] = station_id

    docs = list(datasets_col.find(query).sort("createdAt", -1))

    results = []
    for doc in docs:
        doc["_id"] = str(doc["_id"])
        results.append(doc)

    return jsonify({"success": True, "datasets": results})


@datasets_bp.route("/upload", methods=["POST"])
@require_auth
def upload_dataset():
    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file part"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"success": False, "error": "No selected file"}), 400

    station_id = request.form.get("stationId")
    if not station_id:
        return jsonify({"success": False, "error": "stationId is required"}), 400

    stations_col = g.db["weather_stations"]
    station = stations_col.find_one({"stationId": station_id})
    if not station:
        return jsonify({"success": False, "error": "Station not found"}), 404

    filename = secure_filename(file.filename)
    file_ext = filename.rsplit(".", 1)[1].lower() if "." in filename else ""

    if file_ext not in ["csv", "xls", "xlsx", "txt"]:
        return jsonify({"success": False, "error": "Only CSV, TXT, and XLSX files are allowed"}), 400

    datasets_col = g.db["datasets"]
    dataset_doc = {
        "filename": filename,
        "stationId": station_id,
        "uploadedBy": g.user_id,
        "createdAt": utc_now(),
        "status": "processing",
        "stats": None,
    }

    result = datasets_col.insert_one(dataset_doc)
    dataset_id = result.inserted_id

    try:
        weather_records_col = g.db["weather_records"]
        def insert_batch(batch):
            if batch:
                weather_records_col.insert_many(batch, ordered=False)

        missing_report, dup_report, invalid_report, stats, observations, axisLimits = process_weather_dataset(
            file, file_ext, station_id, str(dataset_id), batch_callback=insert_batch
        )

        datasets_col.update_one(
            {"_id": dataset_id},
            {
                "$set": {
                    "status": "completed",
                    "stats": stats,
                    "missingReport": missing_report,
                    "duplicateReport": dup_report,
                    "invalidReport": invalid_report,
                }
            },
        )

        # Also store as a sounding in radiosonde_history
        if observations:
            now = utc_now()
            date_val = now.strftime("%Y-%m-%d")
            time_val = "12:00" if now.hour >= 12 else "00:00"
            
            # Extract date/time from the first valid record if possible
            if len(observations) > 0:
                first_obs = weather_records_col.find_one({"datasetId": str(dataset_id)})
                if first_obs and "date" in first_obs:
                    date_val = first_obs["date"]
                    time_val = first_obs.get("time", time_val)

            sounding_doc = {
                "userId": g.user["_id"],
                "stationId": station_id,
                "date": date_val,
                "time": time_val,
                "observations": observations,
                "axisLimits": axisLimits,
                "source": "csv_upload",
                "recordType": "sounding",
                "metadata": {
                    "datasetId": str(dataset_id),
                    "filename": filename,
                    "label": f"Uploaded {date_val} {time_val}"
                },
                "createdAt": now,
            }
            g.db["radiosonde_history"].insert_one(sounding_doc)

        log_activity(action="upload_dataset", resource_type="dataset", resource_id=str(dataset_id))

        return jsonify({"success": True, "datasetId": str(dataset_id), "stats": stats})

    except Exception as e:
        datasets_col.update_one(
            {"_id": dataset_id},
            {"$set": {"status": "failed", "error": str(e)}},
        )
        return jsonify({"success": False, "error": f"Failed to process file: {str(e)}"}), 500