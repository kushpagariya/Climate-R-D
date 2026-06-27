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

  const headers = parseCsvLine(lines[0]);
  const missing = REQUIRED_CSV_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    throw new Error(`Missing required column: ${missing[0]}`);
  }

  const rows = lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line);
    const row = {} as ParsedCsvRow;

    headers.forEach((header, index) => {
      if (REQUIRED_CSV_COLUMNS.includes(header as RequiredCsvColumn)) {
        row[header as RequiredCsvColumn] = cells[index] ?? "";
      }
    });

    for (const column of REQUIRED_CSV_COLUMNS) {
      const value = row[column];
      if (value === undefined) {
        throw new Error(`Row ${rowIndex + 1} is missing ${column}.`);
      }
      if (toNumber(value) === null) {
        throw new Error(`Row ${rowIndex + 1} has an invalid value for ${column}.`);
      }
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
