import argparse
import sys
from pathlib import Path

import certifi
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import InsertOne, MongoClient

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from auth_utils import utc_now  # noqa: E402
from sounding_parser import metadata_base_timestamp, parse_sounding_txt, row_to_telemetry  # noqa: E402


def chunked(items, size):
    for index in range(0, len(items), size):
        yield items[index : index + size]


def surface_from_row(row):
    def as_float(value):
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    return {
        "temperature": as_float(row.get("temperature_C")),
        "pressure": as_float(row.get("pressure_hPa")),
        "humidity": as_float(row.get("relative_humidity_%")),
        "dewPoint": as_float(row.get("dew_point_temperature_C")),
        "windSpeed": as_float(row.get("wind_speed_m_s")),
        "windDirection": as_float(row.get("wind_direction_degree")),
        "latitude": as_float(row.get("latitude")),
        "longitude": as_float(row.get("longitude")),
        "altitude": as_float(row.get("altitude_m")),
    }


def build_launch_doc(metadata, station, filename, user_id=None):
    now = utc_now()
    sonde_number = metadata.get("sondeNumber") or Path(filename).stem
    doc = {
        "station": metadata.get("station") or station,
        "launchDate": metadata.get("launchDate") or now.strftime("%Y-%m-%d"),
        "launchTime": metadata.get("launchTime") or "00:00",
        "balloonId": sonde_number,
        "radiosondeId": sonde_number,
        "sondeNumber": sonde_number,
        "sourceFileName": filename,
        "status": "ready",
        "telemetrySource": metadata.get("sourceFormat") or "txt",
        "createdAt": now,
        "updatedAt": now,
    }
    if user_id:
        doc["userId"] = ObjectId(user_id)
    return doc


def parse_args():
    parser = argparse.ArgumentParser(description="Import historical sounding TXT/DAT files into MongoDB.")
    parser.add_argument("folder", help="Folder containing historical .txt or .dat sounding files.")
    parser.add_argument("--station", required=True, help="Fallback station name/id when a file has no station metadata.")
    parser.add_argument("--mongo-uri", help="MongoDB connection URI. Defaults to MONGO_URI from .env.")
    parser.add_argument("--database", default="indravani_weather_db", help="MongoDB database name.")
    parser.add_argument("--user-id", help="Optional existing user ObjectId to attach to launch documents.")
    parser.add_argument("--dry-run", action="store_true", help="Parse files and print counts without inserting.")
    parser.add_argument("--batch-size", type=int, default=1000, help="Telemetry bulk insert batch size.")
    return parser.parse_args()


def main():
    args = parse_args()
    folder = Path(args.folder)
    if not folder.exists() or not folder.is_dir():
        raise SystemExit(f"Folder not found: {folder}")

    files = sorted([*folder.glob("*.txt"), *folder.glob("*.dat")])
    if not files:
        raise SystemExit("No .txt or .dat files found.")

    load_dotenv(ROOT / ".env")
    mongo_uri = args.mongo_uri
    if not mongo_uri:
        import os

        mongo_uri = os.getenv("MONGO_URI")

    if not args.dry_run and not mongo_uri:
        raise SystemExit("MONGO_URI is required unless --dry-run is used.")

    db = None
    if not args.dry_run:
        client = MongoClient(mongo_uri, tlsCAFile=certifi.where())
        db = client[args.database]

    imported_files = 0
    total_rows = 0
    failed = []

    for path in files:
        try:
            parsed = parse_sounding_txt(path.read_text(encoding="utf-8", errors="replace"), source_format=path.suffix.lower().lstrip("."))
            rows = parsed["rows"]
            metadata = parsed["metadata"]
            launch_doc = build_launch_doc(metadata, args.station, path.name, args.user_id)
            base_timestamp = metadata_base_timestamp(metadata)
            telemetry_docs = [
                {
                    **row_to_telemetry(row, launch_doc.get("_id"), base_timestamp, index=index, source="historical_import"),
                    "createdAt": utc_now(),
                }
                for index, row in enumerate(rows)
            ]

            if args.dry_run:
                print(f"DRY RUN {path.name}: launch={launch_doc['launchDate']} {launch_doc['launchTime']} rows={len(rows)}")
            else:
                launch_id = db["launches"].insert_one(launch_doc).inserted_id
                surface_doc = {
                    **surface_from_row(rows[0]),
                    "launchId": launch_id,
                    "createdAt": utc_now(),
                    "updatedAt": utc_now(),
                }
                db["initial_surface_data"].insert_one(surface_doc)

                for doc in telemetry_docs:
                    doc["launchId"] = launch_id

                for batch in chunked(telemetry_docs, max(1, args.batch_size)):
                    operations = [InsertOne(doc) for doc in batch]
                    db["telemetry"].bulk_write(operations, ordered=False)
                    db["live_telemetry"].bulk_write([InsertOne(dict(doc)) for doc in batch], ordered=False)

                print(f"Imported {path.name}: launchId={launch_id} rows={len(rows)}")

            imported_files += 1
            total_rows += len(rows)
        except Exception as exc:
            failed.append((path.name, str(exc)))
            print(f"Failed {path.name}: {exc}")

    print(f"Completed. files={imported_files}/{len(files)} telemetryRows={total_rows} failed={len(failed)}")
    if failed:
        print("Failures:")
        for filename, reason in failed:
            print(f"- {filename}: {reason}")


if __name__ == "__main__":
    main()
