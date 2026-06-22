from datetime import timezone

from flask import Blueprint, g, jsonify, request

from auth_utils import require_auth, utc_now
from routes.radiosonde import calculate_atmospheric_parameters

atmosphere_bp = Blueprint("atmosphere", __name__, url_prefix="/api")


def _isoformat(value):
    """Return ISO 8601 string for datetime objects; pass through None."""
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    return value


def _safe_round(value, digits=2):
    """Round a numeric value; return None if the value is not numeric."""
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return None


def _find_sounding(db, station_id=None, date=None, time=None):
    query = {
        "recordType": {"$nin": ["mission", "balloon"]},
        "observations": {"$exists": True, "$ne": []},
    }
    if station_id:
        query["stationId"] = station_id
    if date:
        query["date"] = date
    if time:
        query["time"] = time

    return db["radiosonde_history"].find_one(
        query,
        sort=[("date", -1), ("time", -1), ("createdAt", -1)],
    )


def _build_altitude_profile(observations):
    return [_safe_round(obs.get("height"), 0) for obs in observations]


def _build_profile(observations, field, alt_field=None):
    profile = []
    for obs in observations:
        value = obs.get(field)
        if value is None and alt_field:
            value = obs.get(alt_field)
        profile.append(_safe_round(value) if value is not None else None)
    return profile


def _detect_atmospheric_layers(observations):
    """
    Derive atmospheric layers from stored radiosonde observations.
    Reuses calculate_atmospheric_parameters() and mirrors the frontend
    detectAtmosphericEvents() inversion / moisture logic.
    """
    if not observations:
        return []

    layers = []
    params = calculate_atmospheric_parameters(observations)

    freezing_level = params.get("freezingLevel")
    if freezing_level:
        layers.append(
            {
                "type": "Freezing Level",
                "height": freezing_level,
                "description": f"0°C isotherm at {freezing_level} m",
            }
        )

    lcl = params.get("lcl")
    if lcl:
        layers.append(
            {
                "type": "Lifting Condensation Level",
                "height": lcl,
                "description": f"LCL near {lcl} m",
            }
        )

    tropopause = params.get("tropopause")
    if tropopause:
        layers.append(
            {
                "type": "Tropopause",
                "height": tropopause,
                "description": f"Tropopause near {tropopause} m",
            }
        )

    for index in range(1, len(observations) - 1):
        current = observations[index]
        previous = observations[index - 1]
        height = current.get("height", 0)

        current_temp = current.get("temperature")
        previous_temp = previous.get("temperature")
        if (
            current_temp is not None
            and previous_temp is not None
            and current_temp > previous_temp
            and height < 5000
        ):
            layers.append(
                {
                    "type": "Temperature Inversion",
                    "severity": "medium",
                    "heightRange": [previous.get("height"), height],
                    "pressureRange": [
                        current.get("pressure"),
                        previous.get("pressure"),
                    ],
                    "description": f"Temperature inversion near {(height / 1000):.1f} km",
                }
            )

        relative_humidity = current.get("relativeHumidity")
        if relative_humidity is not None and relative_humidity > 90 and height > 500:
            layers.append(
                {
                    "type": "High Moisture Layer",
                    "severity": "low",
                    "heightRange": [height, height + 500],
                    "pressureRange": [
                        current.get("pressure"),
                        (current.get("pressure") or 0) - 10,
                    ],
                    "description": f"RH {_safe_round(relative_humidity, 1)}%",
                }
            )

    return layers[:12]


def _empty_atmosphere_payload(station_id=None):
    return {
        "altitudeProfile": [],
        "temperatureProfile": [],
        "pressureProfile": [],
        "humidityProfile": [],
        "layers": [],
        "metadata": {
            "stationId": station_id,
            "date": None,
            "time": None,
            "parameters": {},
            "empty": True,
            "message": "No radiosonde soundings found.",
            "generatedAt": _isoformat(utc_now()),
        },
    }


@atmosphere_bp.route("/atmosphere", methods=["GET"])
@require_auth
def get_atmosphere():
    """
    GET /api/atmosphere

    Optional query params:
      - stationId
      - date
      - time
    """
    station_id = (request.args.get("stationId") or "").strip() or None
    date = (request.args.get("date") or "").strip() or None
    time = (request.args.get("time") or "").strip() or None

    try:
        doc = _find_sounding(g.db, station_id, date, time)
        if not doc:
            return jsonify({"success": True, **_empty_atmosphere_payload(station_id)})

        observations = doc.get("observations") or []
        if not observations:
            return jsonify({"success": True, **_empty_atmosphere_payload(station_id)})

        parameters = calculate_atmospheric_parameters(observations)

        return jsonify(
            {
                "success": True,
                "altitudeProfile": _build_altitude_profile(observations),
                "temperatureProfile": _build_profile(observations, "temperature"),
                "pressureProfile": _build_profile(observations, "pressure"),
                "humidityProfile": _build_profile(
                    observations, "relativeHumidity", "humidity"
                ),
                "layers": _detect_atmospheric_layers(observations),
                "metadata": {
                    "stationId": doc.get("stationId"),
                    "date": doc.get("date"),
                    "time": doc.get("time"),
                    "id": str(doc["_id"]),
                    "source": doc.get("source", "api"),
                    "recordType": doc.get("recordType", "sounding"),
                    "parameters": parameters,
                    "generatedAt": _isoformat(utc_now()),
                },
            }
        )

    except Exception as exc:
        return jsonify(
            {
                "success": False,
                "error": "Failed to load atmospheric profile.",
                "detail": str(exc),
            }
        ), 500