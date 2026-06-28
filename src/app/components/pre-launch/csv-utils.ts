import type { SurfaceData } from "../../api/launches";

export const REQUIRED_CSV_COLUMNS = [
  "pressure_hPa",
  "geopotential_height_m",
  "temperature_C",
  "dew_point_temperature_C",
  "relative_humidity_%",
  "wind_speed_m_s",
  "wind_direction_degree",
  "latitude",
  "longitude",
  "altitude_m",
] as const;

export type RequiredCsvColumn = (typeof REQUIRED_CSV_COLUMNS)[number];
export type ParsedCsvRow = Record<RequiredCsvColumn, string>;

export interface CsvParseResult {
  headers: string[];
  rows: ParsedCsvRow[];
  previewRows: ParsedCsvRow[];
  surfaceData: SurfaceData;
}

const CSV_ALIASES: Record<string, string[]> = {
  "pressure_hPa": ["pressure_hpa", "pressure(hpa)", "pressure", "pressure hpa", "p"],
  "geopotential_height_m": ["geopotential_height_m", "height(m)", "height", "geopotential height", "altitude", "altitude(m)", "geopot", "alt"],
  "temperature_C": ["temperature_c", "temp(°c)", "temperature", "temp", "air temperature", "t"],
  "dew_point_temperature_C": ["dew_point_temperature_c", "dewpt(°c)", "dew point", "dewpoint", "dewp.", "dewp"],
  "relative_humidity_%": ["relative_humidity_%", "rh(%)", "rh", "humidity", "relative humidity", "hu"],
  "wind_speed_m_s": ["wind_speed_m_s", "wind(m/s)", "wind speed", "windspeed", "wind", "ws"],
  "wind_direction_degree": ["wind_direction_degree", "dir(°)", "direction", "wind direction", "winddirection", "wd"],
  "latitude": ["latitude", "lat", "lat."],
  "longitude": ["longitude", "lon", "lng", "long", "long."],
  "altitude_m": ["altitude_m", "altitude(m)", "altitude", "alt"]
};

function normalizeColumnName(col: string): string {
  return col.toLowerCase().replace(/[\s_\-\(\)°%\.]/g, "");
}

function mapHeader(header: string): string {
  const normHeader = normalizeColumnName(header);
  for (const [canonical, aliases] of Object.entries(CSV_ALIASES)) {
    const validNorms = [...aliases, canonical].map(normalizeColumnName);
    if (validNorms.includes(normHeader)) {
      return canonical;
    }
  }
  return header;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseLine(line: string, isTxtFormat: boolean): string[] {
  if (isTxtFormat) {
    return line.split(/\s+/).filter(Boolean);
  }
  return parseCsvLine(line);
}

function toNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function surfaceDataFromCsvRow(row: ParsedCsvRow): SurfaceData {
  return {
    temperature: toNumber(row.temperature_C),
    pressure: toNumber(row.pressure_hPa),
    humidity: toNumber(row["relative_humidity_%"]),
    dewPoint: toNumber(row.dew_point_temperature_C),
    windSpeed: toNumber(row.wind_speed_m_s),
    windDirection: toNumber(row.wind_direction_degree),
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    altitude: toNumber(row.altitude_m),
  };
}

export function parseSoundingCsv(text: string): CsvParseResult {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one data row.");
  }

  // Find header row dynamically (skip metadata)
  let headerRowIdx = 0;
  let isTxtFormat = false;

  for (let i = 0; i < lines.length; i++) {
    const lowerLine = lines[i].toLowerCase().trim();
    if (lowerLine.startsWith("profile data:")) {
      headerRowIdx = i + 1;
      isTxtFormat = true;
      break;
    }
    if (
      (lowerLine.includes("temp") || lowerLine.includes("press")) &&
      (lowerLine.includes("time") || lowerLine.includes("date") || lowerLine.includes("height") || lowerLine.includes("alt"))
    ) {
      headerRowIdx = i;
      break;
    }
  }

  const rawHeaders = parseLine(lines[headerRowIdx], isTxtFormat);
  const headers = rawHeaders.map(mapHeader);
  const missing = REQUIRED_CSV_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    throw new Error(`Missing required column: ${missing[0]}`);
  }

  let dataRowStartIdx = headerRowIdx + 1;
  if (isTxtFormat) {
    dataRowStartIdx = headerRowIdx + 2;
  }

  const rows = lines.slice(dataRowStartIdx).map((line, rowIndex) => {
    const cells = parseLine(line, isTxtFormat);
    const row = {} as ParsedCsvRow;

    headers.forEach((header, index) => {
      if (REQUIRED_CSV_COLUMNS.includes(header as RequiredCsvColumn)) {
        row[header as RequiredCsvColumn] = cells[index] ?? "";
      }
    });

    for (const column of REQUIRED_CSV_COLUMNS) {
      const value = row[column];
      if (value === undefined) {
        // We will no longer throw error for missing optional columns here, 
        // because alias mapping might map them and they could be undefined if omitted.
        // The check below handles nulls if they are missing.
      }
      // Only check invalid values for columns that are present, but if missing, make it empty
    }

    return row;
  });

  return {
    headers,
    rows,
    previewRows: rows.slice(0, 10),
    surfaceData: surfaceDataFromCsvRow(rows[0]),
  };
}
