import math
from datetime import datetime, timezone
import pandas as pd
from bson import ObjectId
import re

CSV_ALIASES = {
    "pressure": ["pressure_hpa", "pressure(hpa)", "pressure", "pressure hpa"],
    "altitude": ["geopotential_height_m", "height(m)", "height", "geopotential height", "altitude", "altitude(m)"],
    "temperature": ["temperature_c", "temp(°c)", "temperature", "temp", "air temperature"],
    "dewPoint": ["dew_point_temperature_c", "dewpt(°c)", "dew point", "dewpoint"],
    "humidity": ["relative_humidity_%", "rh(%)", "rh", "humidity", "relative humidity"],
    "windspeed": ["wind_speed_m_s", "wind(m/s)", "wind speed", "windspeed", "wind"],
    "winddirection": ["wind_direction_degree", "dir(°)", "direction", "wind direction", "winddirection"],
    "latitude": ["latitude", "lat"],
    "longitude": ["longitude", "lon", "lng"]
}

def _normalize_column_name(col):
    c = str(col).lower()
    c = re.sub(r'[\s_\-\(\)°%]', '', c)
    return c

VALIDATION_RULES = {
    "temperature": {"min": -100, "max": 60},
    "pressure": {"min": 0, "max": 1100},
    "humidity": {"min": 0, "max": 100},
    "windSpeed": {"min": 0, "max": 150},
    "windDirection": {"min": 0, "max": 360},
    "latitude": {"min": -90, "max": 90},
    "longitude": {"min": -180, "max": 180},
    "altitude": {"min": -500, "max": 50000},
}

def process_weather_dataset(file_object, file_ext, station_id, dataset_id, batch_callback=None, chunk_size=10000):
    """
    Parses a CSV/XLSX file in chunks, validates it against meteorological bounds, 
    triggers batch inserts via callback, and returns quality reports.
    """
    missing_records_report = []
    duplicate_records_report = []
    invalid_records_report = []
    
    total_rows = 0
    inserted_rows = 0
    seen_datetime = set()
    
    if file_ext == "csv":
        iterator = pd.read_csv(file_object, chunksize=chunk_size)
    elif file_ext in ["xls", "xlsx"]:
        df = pd.read_excel(file_object)
        iterator = [df[i:i+chunk_size] for i in range(0, df.shape[0], chunk_size)]
    else:
        raise ValueError("Unsupported file format")

    for chunk_df in iterator:
        # Alias mapping layer for chunk columns
        mapped_columns = []
        for col in chunk_df.columns:
            norm_col = _normalize_column_name(col)
            mapped_key = col
            for internal_name, aliases in CSV_ALIASES.items():
                valid_norms = [_normalize_column_name(a) for a in aliases] + [_normalize_column_name(internal_name)]
                if norm_col in valid_norms:
                    mapped_key = internal_name
                    break
            mapped_columns.append(mapped_key)
            
        chunk_df.columns = mapped_columns
        
        # Now lowercased strings
        chunk_df.columns = [str(c).strip().lower() for c in chunk_df.columns]
        
        if "date" not in chunk_df.columns:
            raise ValueError("Dataset must contain a 'date' column")

        batch_records = []
        
        for index, row in chunk_df.iterrows():
            total_rows += 1
            row_num = total_rows + 1
            
            try:
                date_val = str(row["date"]).strip()
                if not date_val or date_val.lower() == "nan":
                    invalid_records_report.append({"row": row_num, "reason": "Missing date"})
                    continue
                
                try:
                    pd.to_datetime(date_val)
                except ValueError:
                    invalid_records_report.append({"row": row_num, "date": date_val, "reason": "Invalid date format"})
                    continue
                    
                missing_fields = []
                invalid_fields = []

                record = {
                    "stationId": str(station_id),
                    "datasetId": str(dataset_id),
                    "date": date_val,
                    "createdAt": datetime.now(timezone.utc),
                }

                time_val = str(row.get("time", "")).strip()
                if time_val and time_val.lower() != "nan":
                    record["time"] = time_val
                    dt_key = f"{date_val}_{time_val}"
                else:
                    dt_key = date_val

                if dt_key in seen_datetime:
                    duplicate_records_report.append({
                        "row": row_num,
                        "date": date_val,
                        "time": time_val,
                    })
                    continue
                    
                seen_datetime.add(dt_key)

                def get_val(field):
                    val = row.get(field)
                    if pd.isna(val):
                        missing_fields.append(field)
                        return None
                    try:
                        return float(val)
                    except (ValueError, TypeError):
                        invalid_fields.append(f"{field} (not numeric)")
                        return None

                def validate_and_set(internal_field, csv_field=None):
                    if csv_field is None:
                        csv_field = internal_field
                    
                    val = get_val(csv_field)
                    if val is not None:
                        rules = VALIDATION_RULES.get(internal_field)
                        if rules:
                            if val < rules["min"] or val > rules["max"]:
                                invalid_fields.append(f"{internal_field} ({val} out of bounds)")
                                return
                        record[internal_field] = val

                validate_and_set("temperature")
                validate_and_set("pressure")
                validate_and_set("humidity")
                
                wind_speed = get_val("windspeed")
                if wind_speed is None:
                    wind_speed = get_val("wind_speed")
                if wind_speed is not None:
                    rules = VALIDATION_RULES["windSpeed"]
                    if wind_speed < rules["min"] or wind_speed > rules["max"]:
                        invalid_fields.append(f"windSpeed ({wind_speed} out of bounds)")
                    else:
                        record["windSpeed"] = wind_speed

                validate_and_set("windDirection", "wind_direction")
                if "winddirection" in chunk_df.columns and "windDirection" not in record:
                    validate_and_set("windDirection", "winddirection")

                validate_and_set("latitude")
                validate_and_set("longitude")
                validate_and_set("altitude")
                
                if invalid_fields:
                    invalid_records_report.append({
                        "row": row_num,
                        "date": date_val,
                        "invalid": invalid_fields
                    })
                    continue

                if missing_fields:
                    missing_records_report.append({
                        "row": row_num,
                        "date": date_val,
                        "missing": missing_fields,
                    })

                batch_records.append(record)
                inserted_rows += 1
                
            except Exception as e:
                invalid_records_report.append({"row": row_num, "reason": f"Processing error: {str(e)}"})
                continue
                
        if batch_records and batch_callback:
            batch_callback(batch_records)
            
    stats = {
        "totalRows": total_rows,
        "insertedRows": inserted_rows,
        "missingCount": len(missing_records_report),
        "duplicateCount": len(duplicate_records_report),
        "invalidCount": len(invalid_records_report),
    }

    return missing_records_report, duplicate_records_report, invalid_records_report, stats
