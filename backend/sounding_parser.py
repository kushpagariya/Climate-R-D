import re
from datetime import datetime, timedelta, timezone


REQUIRED_COLUMNS = {
    "pressure_hPa",
    "temperature_C",
    "relative_humidity_%",
    "wind_speed_m_s",
    "wind_direction_degree",
    "longitude",
    "latitude",
    "altitude_m",
    "geopotential_height_m",
    "dew_point_temperature_C",
}

ORG_HEADER_MAP = {
    "time": "seconds_from_launch",
    "p": "pressure_hPa",
    "t": "temperature_C",
    "hu": "relative_humidity_%",
    "ws": "wind_speed_m_s",
    "wd": "wind_direction_degree",
    "long": "longitude",
    "lat": "latitude",
    "alt": "altitude_m",
    "geopot": "geopotential_height_m",
    "dewp": "dew_point_temperature_C",
}


def _normalize_header(value):
    return re.sub(r"[^a-z0-9]", "", str(value).lower())


def _split_line(line):
    return [cell for cell in re.split(r"\s+|,", line.strip()) if cell]


def _to_float(value):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_date(value):
    iso = re.search(r"\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b", value)
    if iso:
        y, m, d = iso.groups()
        return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
    day_first = re.search(r"\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b", value)
    if day_first:
        d, m, y = day_first.groups()
        return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
    return None


def _normalize_time(value):
    match = re.search(r"\b(\d{1,2}):(\d{2})(?::\d{2})?\b", value)
    if not match:
        return None
    hour, minute = match.groups()
    return f"{hour.zfill(2)}:{minute}"


def extract_metadata(lines, source_format="txt"):
    metadata = {"sourceFormat": source_format}
    for line in lines[:80]:
        lower = line.lower()
        value = ":".join(line.split(":")[1:]).strip() if ":" in line else ""

        if "date" in lower or "launch" in lower:
            metadata.setdefault("launchDate", _normalize_date(line))
        if "time" in lower or "launch" in lower:
            metadata.setdefault("launchTime", _normalize_time(line))
        if re.search(r"sonde|serial|radiosonde", line, re.I):
            serial = value or re.sub(r".*?(sonde|serial|radiosonde)\s*(number|no|id)?\s*[:=]?\s*", "", line, flags=re.I).strip()
            if serial:
                metadata.setdefault("sondeNumber", serial[:100])
        if re.search(r"station|site", line, re.I):
            station = value or re.sub(r".*?(station|site)\s*[:=]?\s*", "", line, flags=re.I).strip()
            if station:
                metadata.setdefault("station", station[:120])

    return {key: value for key, value in metadata.items() if value}


def parse_sounding_txt(text, source_format="txt"):
    lines = [line.strip() for line in text.replace("\ufeff", "").splitlines() if line.strip()]
    profile_index = next((index for index, line in enumerate(lines) if re.fullmatch(r"profile\s+data\s*:?", line, re.I)), -1)
    if profile_index < 0:
        raise ValueError('TXT/DAT file must include a "Profile Data" section.')

    header_index = -1
    headers = []
    for index, line in enumerate(lines[profile_index + 1 :], start=profile_index + 1):
        mapped = [ORG_HEADER_MAP.get(_normalize_header(cell), cell) for cell in _split_line(line)]
        if len(REQUIRED_COLUMNS.intersection(mapped)) >= 5:
            header_index = index
            headers = mapped
            break

    if header_index < 0:
        raise ValueError("Could not find profile data headers after the Profile Data section.")

    data_start = header_index + 1
    while data_start < len(lines):
        numeric_count = sum(1 for cell in _split_line(lines[data_start]) if _to_float(cell) is not None)
        if numeric_count >= 5:
            break
        data_start += 1

    missing = sorted(REQUIRED_COLUMNS - set(headers))
    if missing:
        raise ValueError(f"Missing required column: {missing[0]}")

    rows = []
    for line in lines[data_start:]:
        cells = _split_line(line)
        if len(cells) < len(headers):
            continue
        row = {}
        for index, header in enumerate(headers):
            if header in REQUIRED_COLUMNS or header == "seconds_from_launch":
                row[header] = cells[index]
        if all(row.get(column) not in (None, "") for column in REQUIRED_COLUMNS):
            rows.append(row)

    if not rows:
        raise ValueError("No valid sounding data rows were found.")

    return {
        "headers": headers,
        "rows": rows,
        "metadata": extract_metadata(lines, source_format=source_format),
    }


def row_to_telemetry(row, launch_id, base_timestamp, index=0, source="historical_txt"):
    second_value = _to_float(row.get("seconds_from_launch"))
    second = int(round(second_value)) if second_value is not None else index
    timestamp = base_timestamp + timedelta(seconds=second)
    geopotential = _to_float(row.get("geopotential_height_m"))

    return {
        "launchId": launch_id,
        "second": second,
        "timestamp": timestamp,
        "pressure": _to_float(row.get("pressure_hPa")),
        "temperature": _to_float(row.get("temperature_C")),
        "humidity": _to_float(row.get("relative_humidity_%")),
        "windSpeed": _to_float(row.get("wind_speed_m_s")),
        "windDirection": _to_float(row.get("wind_direction_degree")),
        "latitude": _to_float(row.get("latitude")),
        "longitude": _to_float(row.get("longitude")),
        "altitude": _to_float(row.get("altitude_m")),
        "geopotential": geopotential,
        "geopotentialHeight": geopotential,
        "dewPoint": _to_float(row.get("dew_point_temperature_C")),
        "source": source,
    }


def metadata_base_timestamp(metadata):
    date_value = metadata.get("launchDate") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    time_value = metadata.get("launchTime") or "00:00"
    try:
        parsed_date = datetime.strptime(date_value, "%Y-%m-%d").date()
        parsed_time = datetime.strptime(time_value[:5], "%H:%M").time()
    except ValueError:
        return datetime.now(timezone.utc)
    return datetime.combine(parsed_date, parsed_time, tzinfo=timezone.utc)
