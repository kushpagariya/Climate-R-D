import math
from datetime import datetime, timezone

import pandas as pd
from bson import ObjectId


def process_weather_dataset(file_path, file_ext, station_id, dataset_id):
    """
    Parses a CSV/XLSX file, validates it, and returns records to insert, along with quality stats.
    """
    if file_ext == "csv":
        df = pd.read_csv(file_path)
    elif file_ext in ["xls", "xlsx"]:
        df = pd.read_excel(file_path)
    else:
        raise ValueError("Unsupported file format")

    df.columns = [str(c).strip().lower() for c in df.columns]

    if "date" not in df.columns:
        raise ValueError("Dataset must contain a 'date' column")

    records = []
    missing_records_report = []
    duplicate_records_report = []

    total_rows = len(df)
    seen_datetime = set()

    for index, row in df.iterrows():
        try:
            date_val = str(row["date"]).strip()
            
            missing_fields = []

            record = {
                "stationId": str(station_id),
                "datasetId": str(dataset_id),
                "date": date_val,
                "createdAt": datetime.now(timezone.utc),
            }

            time_val = str(row.get("time", "")).strip()
            if time_val and time_val != "nan":
                record["time"] = time_val
                dt_key = f"{date_val}_{time_val}"
            else:
                dt_key = date_val

            if dt_key in seen_datetime:
                duplicate_records_report.append(
                    {
                        "row": index + 2,
                        "date": date_val,
                        "time": time_val,
                    }
                )
                continue
                
            seen_datetime.add(dt_key)

            def get_val(field):
                val = row.get(field)
                if pd.isna(val):
                    missing_fields.append(field)
                    return None
                return float(val)

            temp = get_val("temperature")
            if temp is not None:
                record["temperature"] = temp

            pressure = get_val("pressure")
            if pressure is not None:
                record["pressure"] = pressure

            humidity = get_val("humidity")
            if humidity is not None:
                record["humidity"] = humidity

            wind_speed = get_val("windspeed")
            if wind_speed is None:
                wind_speed = get_val("wind_speed")
            if wind_speed is not None:
                record["windSpeed"] = wind_speed

            if missing_fields:
                missing_records_report.append(
                    {
                        "row": index + 2,
                        "date": date_val,
                        "missing": missing_fields,
                    }
                )

            records.append(record)
        except Exception as e:
            continue

    stats = {
        "totalRows": total_rows,
        "insertedRows": len(records),
        "missingCount": len(missing_records_report),
        "duplicateCount": len(duplicate_records_report),
    }

    return records, missing_records_report, duplicate_records_report, stats
