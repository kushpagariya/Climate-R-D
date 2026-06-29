import { apiRequest } from "./client";

export interface LaunchDetails {
  station: string;
  launchDate: string;
  launchTime: string;
  balloonId: string;
  radiosondeId: string;
  operator?: string;
  sondeNumber?: string;
  sourceFileName?: string;
}

export interface SurfaceData {
  temperature: number | null;
  pressure: number | null;
  humidity: number | null;
  dewPoint: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
}

export interface LaunchRecord extends LaunchDetails {
  id: string;
  userId: string;
  status: "draft" | "ready" | "live" | "completed" | "cancelled";
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  surfaceData?: SurfaceData;
}

export type CsvLaunchRow = Record<string, string | number | null>;

export interface LaunchTelemetryRecord {
  id: string;
  launchId: string;
  second?: number | null;
  timestamp?: string | null;
  pressure?: number | null;
  temperature?: number | null;
  humidity?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  altitude?: number | null;
  windSpeed?: number | null;
  windDirection?: number | null;
  geopotential?: number | null;
  geopotentialHeight?: number | null;
  dewPoint?: number | null;
  source?: string | null;
  createdAt?: string | null;
}

export interface LaunchTelemetryQuery {
  afterSecond?: number;
  afterTimestamp?: string;
  limit?: number;
}

export interface UploadLaunchOptions {
  metadata?: {
    launchDate?: string;
    launchTime?: string;
    sondeNumber?: string;
    station?: string;
    sourceFormat?: string;
  };
  fileName?: string;
}

export function createLaunchApi(
  token: string,
  payload: LaunchDetails & { surfaceData: SurfaceData; status?: LaunchRecord["status"] },
) {
  return apiRequest<{ success: boolean; launch: LaunchRecord }>("/launches", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function getLaunchApi(token: string, launchId: string) {
  return apiRequest<{ success: boolean; launch: LaunchRecord; telemetryCount: number }>(
    `/launches/${launchId}`,
    { method: "GET", token },
  );
}

export function uploadLaunchCsvApi(
  token: string,
  launchId: string,
  rows: CsvLaunchRow[],
  options: UploadLaunchOptions = {},
) {
  return apiRequest<{
    success: boolean;
    rowCount: number;
    surfaceData: SurfaceData;
    status: LaunchRecord["status"];
  }>(`/launches/${launchId}/upload-csv`, {
    method: "POST",
    token,
    body: JSON.stringify({ rows, ...options }),
  });
}

export function startLaunchApi(token: string, launchId: string) {
  return apiRequest<{ success: boolean; launch: LaunchRecord }>(
    `/launches/${launchId}/start`,
    { method: "POST", token },
  );
}

export function getLaunchTelemetryApi(
  token: string,
  launchId: string,
  query: LaunchTelemetryQuery = {},
) {
  const params = new URLSearchParams();
  if (query.afterSecond !== undefined) params.set("afterSecond", String(query.afterSecond));
  if (query.afterTimestamp) params.set("afterTimestamp", query.afterTimestamp);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const suffix = params.toString() ? `?${params.toString()}` : "";

  return apiRequest<{
    success: boolean;
    telemetry: LaunchTelemetryRecord[];
    count: number;
    limit: number;
    sourceCollection: "telemetry" | "live_telemetry";
    hasMore: boolean;
  }>(`/launches/${launchId}/telemetry${suffix}`, { method: "GET", token });
}

export function createLaunchTelemetryApi(
  token: string,
  launchId: string,
  payload: Partial<SurfaceData> & {
    second?: number;
    timestamp?: string;
    latitude?: number | null;
    longitude?: number | null;
    windDirection?: number | null;
    geopotential?: number | null;
    geopotentialHeight?: number | null;
    dewPoint?: number | null;
    source?: string;
  },
) {
  return apiRequest<{ success: boolean; telemetry: LaunchTelemetryRecord }>(
    `/launches/${launchId}/telemetry`,
    {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    },
  );
}

export function createTelemetryApi(
  token: string,
  payload: Partial<SurfaceData> & {
    launchId: string;
    timestamp?: string;
    source?: string;
  },
) {
  return apiRequest<{ success: boolean; id: string }>("/telemetry", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}
