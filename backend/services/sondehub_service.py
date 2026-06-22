"""
SondeHub v2 API client and normalization layer for Climate-R-D.

Official API docs:
  https://github.com/projecthorus/sondehub-infra/blob/main/swagger.yaml

This module is intentionally route-agnostic. Routes can import it later to
persist normalized payloads into MongoDB collections.
"""

from __future__ import annotations

import json
import math
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple, Union
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DEFAULT_BASE_URL = os.getenv("SONDEHUB_BASE_URL", "https://api.v2.sondehub.org").rstrip("/")
DEFAULT_TIMEOUT_SECONDS = float(os.getenv("SONDEHUB_TIMEOUT_SECONDS", "15"))
DEFAULT_USER_AGENT = os.getenv(
    "SONDEHUB_USER_AGENT",
    "Climate-R-D/1.0 (+https://github.com/projecthorus/sondehub-infra)",
)
DEFAULT_LAST_SECONDS = int(os.getenv("SONDEHUB_DEFAULT_LAST_SECONDS", "86400"))
MAX_LAST_SECONDS = 7 * 24 * 60 * 60


class SondeHubError(Exception):
    """Base SondeHub service error."""


class SondeHubTimeoutError(SondeHubError):
    """Raised when SondeHub does not respond within the configured timeout."""


class SondeHubHTTPError(SondeHubError):
    """Raised when SondeHub returns a non-success HTTP status."""

    def __init__(self, message: str, status_code: int, body: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class SondeHubParseError(SondeHubError):
    """Raised when SondeHub returns malformed or unexpected JSON."""


class SondeHubValidationError(SondeHubError):
    """Raised when required request parameters are missing or invalid."""


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_float(value: Any, digits: Optional[int] = None) -> Optional[float]:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    if digits is None:
        return number
    return round(number, digits)


def _safe_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_iso_datetime(value: Any) -> Optional[datetime]:
    if not value or not isinstance(value, str):
        return None
    cleaned = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(cleaned)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _split_date_time(dt: datetime) -> Tuple[str, str]:
    return dt.date().isoformat(), dt.strftime("%H:%M")


def _estimate_dew_point_c(temperature_c: Optional[float], relative_humidity: Optional[float]) -> Optional[float]:
    if temperature_c is None or relative_humidity is None:
        return None
    try:
        temp = float(temperature_c)
        rh = max(0.0, min(100.0, float(relative_humidity)))
    except (TypeError, ValueError):
        return None

    # Magnus approximation over liquid water
    gamma = (17.67 * temp) / (temp + 243.5)
    ln_term = math.log(max(rh / 100.0, 1e-6) * math.exp(gamma))
    dew_point = (243.5 * ln_term) / (17.67 - ln_term)
    return _safe_float(dew_point, 1)


def _estimate_mixing_ratio_gkg(
    temperature_c: Optional[float],
    pressure_hpa: Optional[float],
    relative_humidity: Optional[float],
) -> Optional[float]:
    if temperature_c is None or pressure_hpa is None or relative_humidity is None:
        return None
    try:
        temp = float(temperature_c)
        pressure = float(pressure_hpa)
        rh = max(0.0, min(100.0, float(relative_humidity)))
    except (TypeError, ValueError):
        return None

    es = 6.112 * math.exp((17.67 * temp) / (temp + 243.5))
    e = (rh / 100.0) * es
    if pressure <= e:
        return None
    mixing_ratio = 622.0 * e / (pressure - e)
    return _safe_float(mixing_ratio, 2)


def normalize_site(site_key: str, site_doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize a SondeHub /sites entry into Climate-R-D weather_stations shape.
    """
    if not isinstance(site_doc, dict):
        raise SondeHubParseError("Site payload must be a JSON object.")

    position = site_doc.get("position") or []
    latitude = _safe_float(position[0]) if len(position) > 0 else None
    longitude = _safe_float(position[1]) if len(position) > 1 else None

    station_id = str(site_doc.get("station") or site_key).strip()
    station_name = str(site_doc.get("station_name") or station_id).strip()

    return {
        "stationId": station_id,
        "stationName": station_name,
        "latitude": latitude,
        "longitude": longitude,
        "elevation": _safe_float(site_doc.get("alt")),
        "source": "sondehub",
        "sondehubSiteKey": str(site_key),
        "launchSchedule": site_doc.get("times") or [],
        "radiosondeTypes": site_doc.get("rs_types") or [],
        "burstAltitude": _safe_float(site_doc.get("burst_altitude")),
        "ascentRate": _safe_float(site_doc.get("ascent_rate")),
        "descentRate": _safe_float(site_doc.get("descent_rate")),
    }


def normalize_telemetry_packet(packet: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize one SondeHub telemetry packet into a compact internal telemetry dict.
    """
    if not isinstance(packet, dict):
        raise SondeHubParseError("Telemetry packet must be a JSON object.")

    observed_at = _parse_iso_datetime(packet.get("datetime")) or _parse_iso_datetime(
        packet.get("time_received")
    )
    date_val, time_val = (None, None)
    if observed_at:
        date_val, time_val = _split_date_time(observed_at)

    temperature = _safe_float(packet.get("temp"), 1)
    humidity = _safe_float(packet.get("humidity"), 1)
    pressure = _safe_float(packet.get("pressure"), 1)
    height = _safe_float(packet.get("alt"), 0)
    wind_speed = _safe_float(packet.get("vel_h"), 1)
    wind_direction = _safe_float(packet.get("heading"), 0)
    dew_point = _estimate_dew_point_c(temperature, humidity)
    mixing_ratio = _estimate_mixing_ratio_gkg(temperature, pressure, humidity)

    if temperature is not None and temperature < 0:
        humidity_wrt_ice = _safe_float((humidity or 0) * 1.1, 1) if humidity is not None else None
        ice_point = _safe_float((temperature or 0) - 2, 1) if temperature is not None else None
    else:
        humidity_wrt_ice = humidity
        ice_point = dew_point

    return {
        "serial": packet.get("serial"),
        "manufacturer": packet.get("manufacturer"),
        "type": packet.get("type"),
        "subtype": packet.get("subtype"),
        "frame": _safe_int(packet.get("frame")),
        "datetime": observed_at.isoformat() if observed_at else packet.get("datetime"),
        "timeReceived": packet.get("time_received"),
        "date": date_val,
        "time": time_val,
        "latitude": _safe_float(packet.get("lat"), 6),
        "longitude": _safe_float(packet.get("lon"), 6),
        "altitude": height,
        "temperature": temperature,
        "humidity": humidity,
        "pressure": pressure,
        "windSpeed": wind_speed,
        "windDirection": wind_direction,
        "verticalVelocity": _safe_float(packet.get("vel_v"), 1),
        "batteryVoltage": _safe_float(packet.get("batt"), 2),
        "satellites": _safe_int(packet.get("sats")),
        "frequencyMhz": _safe_float(packet.get("frequency"), 3),
        "softwareName": packet.get("software_name"),
        "softwareVersion": packet.get("software_version"),
        "uploaderCallsign": packet.get("uploader_callsign"),
        "raw": packet,
    }


def normalize_observation(
    packet: Dict[str, Any],
    *,
    include_raw: bool = False,
) -> Dict[str, Any]:
    """
    Normalize one SondeHub telemetry packet into Climate-R-D radiosonde observation shape.
    """
    telemetry = normalize_telemetry_packet(packet)

    observation = {
        "pressure": telemetry.get("pressure"),
        "height": telemetry.get("altitude"),
        "temperature": telemetry.get("temperature"),
        "dewPoint": _estimate_dew_point_c(telemetry.get("temperature"), telemetry.get("humidity")),
        "icePoint": None,
        "relativeHumidity": telemetry.get("humidity"),
        "humidityWrtIce": telemetry.get("humidity"),
        "mixingRatio": _estimate_mixing_ratio_gkg(
            telemetry.get("temperature"),
            telemetry.get("pressure"),
            telemetry.get("humidity"),
        ),
        "windDirection": telemetry.get("windDirection"),
        "windSpeed": telemetry.get("windSpeed"),
    }

    temp = observation.get("temperature")
    rh = observation.get("relativeHumidity")
    dew_point = observation.get("dewPoint")

    if temp is not None and temp < 0:
        observation["icePoint"] = _safe_float(temp - 2, 1)
        if rh is not None:
            observation["humidityWrtIce"] = _safe_float(min(100.0, rh * 1.1), 1)
    else:
        observation["icePoint"] = dew_point
        observation["humidityWrtIce"] = rh

    if include_raw:
        observation["sourceTelemetry"] = telemetry

    return observation


def normalize_trajectory_point(packet: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize one telemetry packet into mission trajectory shape used by radiosonde routes.
    """
    telemetry = normalize_telemetry_packet(packet)
    observed_at = _parse_iso_datetime(telemetry.get("datetime")) or _parse_iso_datetime(
        telemetry.get("timeReceived")
    )

    return {
        "lat": telemetry.get("latitude"),
        "lon": telemetry.get("longitude"),
        "altitude": telemetry.get("altitude"),
        "timestamp": observed_at.isoformat() if observed_at else telemetry.get("datetime"),
        "phase": "ascending",
    }


def normalize_weather_record(
    packet: Dict[str, Any],
    *,
    station_id: str,
) -> Dict[str, Any]:
    """
    Normalize one telemetry packet into Climate-R-D weather_records shape.
    """
    telemetry = normalize_telemetry_packet(packet)
    observed_at = _parse_iso_datetime(telemetry.get("datetime")) or _parse_iso_datetime(
        telemetry.get("timeReceived")
    )

    record = {
        "stationId": str(station_id),
        "date": telemetry.get("date"),
        "time": telemetry.get("time"),
        "temperature": telemetry.get("temperature"),
        "pressure": telemetry.get("pressure"),
        "humidity": telemetry.get("humidity"),
        "windSpeed": telemetry.get("windSpeed"),
        "windDirection": telemetry.get("windDirection"),
        "source": "sondehub",
        "serial": telemetry.get("serial"),
        "createdAt": observed_at or datetime.now(timezone.utc),
    }
    return record


def normalize_sounding_payload(
    *,
    station_id: str,
    serial: str,
    telemetry_packets: List[Dict[str, Any]],
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Normalize a full SondeHub telemetry history into radiosonde_history document shape.
    """
    sorted_packets = sort_telemetry_packets(telemetry_packets)
    observations = [normalize_observation(packet) for packet in sorted_packets]
    trajectory = [normalize_trajectory_point(packet) for packet in sorted_packets]

    first_dt = None
    last_dt = None
    for packet in sorted_packets:
        parsed = _parse_iso_datetime(packet.get("datetime")) or _parse_iso_datetime(
            packet.get("time_received")
        )
        if parsed is None:
            continue
        if first_dt is None or parsed < first_dt:
            first_dt = parsed
        if last_dt is None or parsed > last_dt:
            last_dt = parsed

    date_val, time_val = (None, None)
    if first_dt:
        date_val, time_val = _split_date_time(first_dt)

    return {
        "stationId": str(station_id),
        "date": date_val,
        "time": time_val,
        "observations": observations,
        "trajectory": trajectory,
        "events": [],
        "source": "sondehub",
        "recordType": "sounding",
        "metadata": {
            **(metadata or {}),
            "serial": serial,
            "packetCount": len(sorted_packets),
            "firstObservedAt": first_dt.isoformat() if first_dt else None,
            "lastObservedAt": last_dt.isoformat() if last_dt else None,
            "fetchedAt": _utc_now_iso(),
        },
    }


def sort_telemetry_packets(packets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Sort SondeHub telemetry packets chronologically by datetime/time_received.
    """

    def sort_key(packet: Dict[str, Any]) -> datetime:
        parsed = _parse_iso_datetime(packet.get("datetime")) or _parse_iso_datetime(
            packet.get("time_received")
        )
        return parsed or datetime.min.replace(tzinfo=timezone.utc)

    return sorted(packets, key=sort_key)


def flatten_site_sonde_results(payload: Any) -> List[Dict[str, Any]]:
    """
    Flatten SondeHub /sondes and /sondes/site/{site} nested results into telemetry packets.

    Expected shape:
      { "SERIAL": { "2024-01-01T00:00:00Z": { ...telemetry... }, ... }, ... }
    """
    if not isinstance(payload, dict):
        raise SondeHubParseError("Sonde query response must be a JSON object.")

    packets: List[Dict[str, Any]] = []
    for serial, time_map in payload.items():
        if not isinstance(time_map, dict):
            continue
        for _, packet in time_map.items():
            if isinstance(packet, dict):
                packet = dict(packet)
                packet.setdefault("serial", serial)
                packets.append(packet)
    return sort_telemetry_packets(packets)


def flatten_serial_telemetry(payload: Any) -> List[Dict[str, Any]]:
    """
    Flatten SondeHub /sonde/{serial} array response into telemetry packets.
    """
    if payload is None:
        return []
    if not isinstance(payload, list):
        raise SondeHubParseError("Serial telemetry response must be a JSON array.")
    packets = [packet for packet in payload if isinstance(packet, dict)]
    return sort_telemetry_packets(packets)


class SondeHubService:
    """
    Reusable SondeHub API client with normalization helpers.
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
        user_agent: Optional[str] = None,
    ):
        self.base_url = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self.timeout_seconds = float(timeout_seconds or DEFAULT_TIMEOUT_SECONDS)
        self.user_agent = user_agent or DEFAULT_USER_AGENT

    def _build_url(self, path: str, params: Optional[Dict[str, Any]] = None) -> str:
        if not path.startswith("/"):
            path = f"/{path}"
        url = f"{self.base_url}{path}"
        if params:
            clean_params = {
                key: value
                for key, value in params.items()
                if value is not None and value != ""
            }
            if clean_params:
                url = f"{url}?{urlencode(clean_params)}"
        return url

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        method = method.upper().strip()
        if method not in {"GET"}:
            raise SondeHubValidationError(f"Unsupported HTTP method: {method}")

        url = self._build_url(path, params)
        request = Request(
            url=url,
            method=method,
            headers={
                "Accept": "application/json",
                "User-Agent": self.user_agent,
            },
        )

        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                raw_body = response.read().decode("utf-8", errors="replace")
        except TimeoutError as exc:
            raise SondeHubTimeoutError(
                f"SondeHub request timed out after {self.timeout_seconds}s: {url}"
            ) from exc
        except HTTPError as exc:
            body = ""
            try:
                body = exc.read().decode("utf-8", errors="replace")
            except Exception:
                body = ""
            raise SondeHubHTTPError(
                f"SondeHub HTTP {exc.code} for {url}",
                status_code=exc.code,
                body=body,
            ) from exc
        except URLError as exc:
            if "timed out" in str(exc.reason).lower():
                raise SondeHubTimeoutError(
                    f"SondeHub request timed out after {self.timeout_seconds}s: {url}"
                ) from exc
            raise SondeHubError(f"SondeHub request failed for {url}: {exc.reason}") from exc
        except socket.timeout as exc:
            raise SondeHubTimeoutError(
                f"SondeHub request timed out after {self.timeout_seconds}s: {url}"
            ) from exc

        if not raw_body:
            return None

        try:
            return json.loads(raw_body)
        except json.JSONDecodeError as exc:
            raise SondeHubParseError(
                f"SondeHub returned malformed JSON for {url}: {exc.msg}"
            ) from exc

    def fetch_launch_sites(self) -> List[Dict[str, Any]]:
        """
        Fetch all SondeHub launch sites from GET /sites.
        Returns normalized station dictionaries.
        """
        payload = self._request("GET", "/sites")
        if payload is None:
            return []
        if not isinstance(payload, dict):
            raise SondeHubParseError("SondeHub /sites response must be a JSON object.")

        sites: List[Dict[str, Any]] = []
        for site_key, site_doc in payload.items():
            try:
                sites.append(normalize_site(str(site_key), site_doc))
            except SondeHubParseError:
                continue
        return sites

    def fetch_live_station_data(
        self,
        site_id: str,
        *,
        last_seconds: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Fetch live radiosonde telemetry for a SondeHub site from GET /sondes/site/{site}.
        """
        site_id = str(site_id or "").strip()
        if not site_id:
            raise SondeHubValidationError("site_id is required.")

        last = self._validate_last_seconds(last_seconds)
        payload = self._request(
            "GET",
            f"/sondes/site/{site_id}",
            params={"last": last},
        )
        packets = flatten_site_sonde_results(payload or {})
        normalized_packets = [normalize_telemetry_packet(packet) for packet in packets]

        return {
            "siteId": site_id,
            "lastSeconds": last,
            "serials": sorted({packet.get("serial") for packet in normalized_packets if packet.get("serial")}),
            "packetCount": len(normalized_packets),
            "telemetry": normalized_packets,
            "latestObservation": normalized_packets[-1] if normalized_packets else None,
            "fetchedAt": _utc_now_iso(),
        }

    def fetch_live_sondes_near(
        self,
        latitude: float,
        longitude: float,
        *,
        distance_meters: float,
        last_seconds: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Fetch live radiosondes near a coordinate from GET /sondes.
        """
        lat = _safe_float(latitude)
        lon = _safe_float(longitude)
        distance = _safe_float(distance_meters)

        if lat is None or lon is None or distance is None:
            raise SondeHubValidationError("latitude, longitude, and distance_meters are required.")

        last = self._validate_last_seconds(last_seconds)
        payload = self._request(
            "GET",
            "/sondes",
            params={
                "lat": lat,
                "lon": lon,
                "distance": distance,
                "last": last,
            },
        )
        packets = flatten_site_sonde_results(payload or {})
        normalized_packets = [normalize_telemetry_packet(packet) for packet in packets]

        return {
            "latitude": lat,
            "longitude": lon,
            "distanceMeters": distance,
            "lastSeconds": last,
            "serials": sorted({packet.get("serial") for packet in normalized_packets if packet.get("serial")}),
            "packetCount": len(normalized_packets),
            "telemetry": normalized_packets,
            "latestObservation": normalized_packets[-1] if normalized_packets else None,
            "fetchedAt": _utc_now_iso(),
        }

    def fetch_radiosonde_telemetry(self, serial: str) -> List[Dict[str, Any]]:
        """
        Fetch all telemetry packets for one radiosonde from GET /sonde/{serial}.
        Returns normalized telemetry dictionaries.
        """
        serial = str(serial or "").strip()
        if not serial:
            raise SondeHubValidationError("serial is required.")

        payload = self._request("GET", f"/sonde/{serial}")
        packets = flatten_serial_telemetry(payload)
        return [normalize_telemetry_packet(packet) for packet in packets]

    def fetch_latest_observation(
        self,
        serial: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch the latest normalized observation for a radiosonde serial.
        """
        telemetry = self.fetch_radiosonde_telemetry(serial)
        if not telemetry:
            return None
        latest_packet = telemetry[-1].get("raw") or {}
        if not latest_packet:
            return None
        return normalize_observation(latest_packet)

    def fetch_historical_sounding(
        self,
        *,
        station_id: str,
        serial: str,
    ) -> Dict[str, Any]:
        """
        Fetch and normalize full historical sounding data for one radiosonde serial.
        Returns a radiosonde_history-compatible payload.
        """
        station_id = str(station_id or "").strip()
        serial = str(serial or "").strip()
        if not station_id:
            raise SondeHubValidationError("station_id is required.")
        if not serial:
            raise SondeHubValidationError("serial is required.")

        payload = self._request("GET", f"/sonde/{serial}")
        packets = flatten_serial_telemetry(payload)
        return normalize_sounding_payload(
            station_id=station_id,
            serial=serial,
            telemetry_packets=packets,
            metadata={"sourceEndpoint": f"/sonde/{serial}"},
        )

    def fetch_latest_site_sounding(
        self,
        *,
        station_id: str,
        site_id: str,
        last_seconds: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Convenience helper:
        fetch live site telemetry, pick the newest serial, then load its full sounding.
        """
        live_data = self.fetch_live_station_data(site_id, last_seconds=last_seconds)
        telemetry = live_data.get("telemetry") or []
        if not telemetry:
            return None

        latest = telemetry[-1]
        serial = latest.get("serial")
        if not serial:
            return None

        return self.fetch_historical_sounding(station_id=station_id, serial=str(serial))

    def _validate_last_seconds(self, last_seconds: Optional[int]) -> int:
        if last_seconds is None:
            return DEFAULT_LAST_SECONDS
        try:
            parsed = int(last_seconds)
        except (TypeError, ValueError):
            raise SondeHubValidationError("last_seconds must be an integer.")
        if parsed <= 0:
            raise SondeHubValidationError("last_seconds must be greater than zero.")
        return min(parsed, MAX_LAST_SECONDS)


_service_instance: Optional[SondeHubService] = None


def get_sondehub_service(
    *,
    base_url: Optional[str] = None,
    timeout_seconds: Optional[float] = None,
    user_agent: Optional[str] = None,
    force_new: bool = False,
) -> SondeHubService:
    """
    Return a reusable SondeHubService instance.
    """
    global _service_instance

    if force_new or _service_instance is None or base_url or timeout_seconds or user_agent:
        if force_new or base_url or timeout_seconds or user_agent:
            return SondeHubService(
                base_url=base_url,
                timeout_seconds=timeout_seconds,
                user_agent=user_agent,
            )

        _service_instance = SondeHubService()

    return _service_instance