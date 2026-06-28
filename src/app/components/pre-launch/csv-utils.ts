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

export const OPTIONAL_SOUNDING_COLUMNS = ["seconds_from_launch"] as const;

export type RequiredCsvColumn = (typeof REQUIRED_CSV_COLUMNS)[number];
export type OptionalSoundingColumn = (typeof OPTIONAL_SOUNDING_COLUMNS)[number];
export type SoundingColumn = RequiredCsvColumn | OptionalSoundingColumn;
export type ParsedCsvRow = Record<RequiredCsvColumn, string> & Partial<Record<OptionalSoundingColumn, string>>;

export interface SoundingMetadata {
  launchDate?: string;
  launchTime?: string;
  sondeNumber?: string;
  station?: string;
  sourceFormat?: "csv" | "txt" | "dat";
}

export interface CsvParseResult {
  headers: string[];
  rows: ParsedCsvRow[];
  previewRows: ParsedCsvRow[];
  surfaceData: SurfaceData;
  metadata: SoundingMetadata;
}

const COLUMN_ALIASES: Record<SoundingColumn, string[]> = {
  pressure_hPa: ["pressure_hpa", "pressure(hpa)", "pressure", "pressure hpa", "p"],
  geopotential_height_m: ["geopotential_height_m", "height(m)", "height", "geopotential height", "geopot", "geopot."],
  temperature_C: ["temperature_c", "temp(c)", "temp", "temperature", "air temperature", "t"],
  dew_point_temperature_C: ["dew_point_temperature_c", "dewpt(c)", "dew point", "dewpoint", "dewp.", "dewp"],
  "relative_humidity_%": ["relative_humidity_%", "rh(%)", "rh", "humidity", "relative humidity", "hu"],
  wind_speed_m_s: ["wind_speed_m_s", "wind(m/s)", "wind speed", "windspeed", "wind", "ws"],
  wind_direction_degree: ["wind_direction_degree", "dir(deg)", "dir", "direction", "wind direction", "winddirection", "wd"],
  latitude: ["latitude", "lat", "lat."],
  longitude: ["longitude", "lon", "lng", "long", "long."],
  altitude_m: ["altitude_m", "altitude(m)", "altitude", "alt"],
  seconds_from_launch: ["seconds_from_launch", "second", "seconds", "sec", "time"],
};

const ORG_TXT_HEADER_MAP: Record<string, SoundingColumn> = {
  time: "seconds_from_launch",
  p: "pressure_hPa",
  t: "temperature_C",
  hu: "relative_humidity_%",
  ws: "wind_speed_m_s",
  wd: "wind_direction_degree",
  long: "longitude",
  lat: "latitude",
  alt: "altitude_m",
  geopot: "geopotential_height_m",
  dewp: "dew_point_temperature_C",
};

function normalizeColumnName(col: string): string {
  return col
    .toLowerCase()
    .replace(/\u00b0/g, "deg")
    .replace(/[^a-z0-9]/g, "");
}

function mapHeader(header: string, preferOrganizationMap = false): string {
  const normHeader = normalizeColumnName(header);

  if (preferOrganizationMap && ORG_TXT_HEADER_MAP[normHeader]) {
    return ORG_TXT_HEADER_MAP[normHeader];
  }

  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
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

function parseDelimitedLine(line: string): string[] {
  if (line.includes(",")) return parseCsvLine(line);
  return line.split(/\s+/).filter(Boolean);
}

function toNumber(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value: string): string | undefined {
  const cleaned = value.trim();
  const iso = cleaned.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dayFirst = cleaned.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/);
  if (dayFirst) {
    const [, d, m, y] = dayFirst;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return undefined;
}

function normalizeTime(value: string): string | undefined {
  const match = value.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
  if (!match) return undefined;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function extractMetadata(lines: string[], sourceFormat: SoundingMetadata["sourceFormat"]): SoundingMetadata {
  const metadata: SoundingMetadata = { sourceFormat };
  const metadataLines = lines.slice(0, 80);

  for (const line of metadataLines) {
    const lower = line.toLowerCase();
    const value = line.split(/[:=]/).slice(1).join(":").trim();

    if (!metadata.launchDate && (lower.includes("date") || lower.includes("launch"))) {
      metadata.launchDate = normalizeDate(line);
    }
    if (!metadata.launchTime && (lower.includes("time") || lower.includes("launch"))) {
      metadata.launchTime = normalizeTime(line);
    }
    if (!metadata.sondeNumber && /(sonde|serial|radiosonde)/i.test(line)) {
      const serial = value || line.replace(/.*?(sonde|serial|radiosonde)\s*(number|no|id)?\s*[:=]?\s*/i, "").trim();
      if (serial && serial.length <= 80) metadata.sondeNumber = serial;
    }
    if (!metadata.station && /(station|site)/i.test(line)) {
      const station = value || line.replace(/.*?(station|site)\s*[:=]?\s*/i, "").trim();
      if (station && station.length <= 120) metadata.station = station;
    }
  }

  return metadata;
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

function buildRows(lines: string[], rawHeaders: string[], dataStartIndex: number, preferOrganizationMap = false): ParsedCsvRow[] {
  const headers = rawHeaders.map((header) => mapHeader(header, preferOrganizationMap));
  const missing = REQUIRED_CSV_COLUMNS.filter((column) => !headers.includes(column));

  if (missing.length > 0) {
    throw new Error(`Missing required column: ${missing[0]}`);
  }

  const rows = lines.slice(dataStartIndex).flatMap((line) => {
    const cells = parseDelimitedLine(line);
    if (cells.length < REQUIRED_CSV_COLUMNS.length) return [];

    const row = {} as ParsedCsvRow;
    headers.forEach((header, index) => {
      if (
        REQUIRED_CSV_COLUMNS.includes(header as RequiredCsvColumn) ||
        OPTIONAL_SOUNDING_COLUMNS.includes(header as OptionalSoundingColumn)
      ) {
        row[header as SoundingColumn] = cells[index] ?? "";
      }
    });

    const hasRequiredValues = REQUIRED_CSV_COLUMNS.every((column) => row[column] !== undefined && row[column] !== "");
    return hasRequiredValues ? [row] : [];
  });

  if (rows.length === 0) {
    throw new Error("No valid sounding data rows were found.");
  }

  return rows;
}

function buildResult(
  lines: string[],
  rawHeaders: string[],
  dataStartIndex: number,
  sourceFormat: SoundingMetadata["sourceFormat"],
  preferOrganizationMap = false,
): CsvParseResult {
  const headers = rawHeaders.map((header) => mapHeader(header, preferOrganizationMap));
  const rows = buildRows(lines, rawHeaders, dataStartIndex, preferOrganizationMap);
  return {
    headers,
    rows,
    previewRows: rows.slice(0, 10),
    surfaceData: surfaceDataFromCsvRow(rows[0]),
    metadata: extractMetadata(lines, sourceFormat),
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

  const headerRowIndex = lines.findIndex((line) => {
    const mapped = parseDelimitedLine(line).map((header) => mapHeader(header));
    return REQUIRED_CSV_COLUMNS.filter((column) => mapped.includes(column)).length >= 5;
  });

  if (headerRowIndex < 0) {
    throw new Error("Could not find a CSV header row with sounding columns.");
  }

  return buildResult(lines, parseDelimitedLine(lines[headerRowIndex]), headerRowIndex + 1, "csv");
}

export function parseSoundingTxt(text: string, sourceFormat: "txt" | "dat" = "txt"): CsvParseResult {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const profileIndex = lines.findIndex((line) => /^profile\s+data\s*:?\s*$/i.test(line));
  if (profileIndex < 0) {
    throw new Error('TXT/DAT file must include a "Profile Data" section.');
  }

  const headerRowIndex = lines.findIndex((line, index) => {
    if (index <= profileIndex) return false;
    const mapped = parseDelimitedLine(line).map((header) => mapHeader(header, true));
    return REQUIRED_CSV_COLUMNS.filter((column) => mapped.includes(column)).length >= 5;
  });

  if (headerRowIndex < 0) {
    throw new Error("Could not find profile data headers after the Profile Data section.");
  }

  let dataStartIndex = headerRowIndex + 1;
  while (dataStartIndex < lines.length) {
    const cells = parseDelimitedLine(lines[dataStartIndex]);
    const numericCount = cells.filter((cell) => Number.isFinite(Number(cell))).length;
    if (numericCount >= 5) break;
    dataStartIndex += 1;
  }

  return buildResult(
    lines,
    parseDelimitedLine(lines[headerRowIndex]),
    dataStartIndex,
    sourceFormat,
    true,
  );
}

export function parseSoundingFile(text: string, fileName: string): CsvParseResult {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "txt" || extension === "dat") {
    return parseSoundingTxt(text, extension);
  }
  if (extension === "csv") {
    return parseSoundingCsv(text);
  }

  throw new Error("Upload a CSV, TXT, or DAT sounding file.");
}
