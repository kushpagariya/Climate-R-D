import { apiRequest } from "./client";

export interface LaunchDetails {
  station: string;
  launchDate: string;
  launchTime: string;
  balloonId: string;
  radiosondeId: string;
  operator?: string;
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

export function uploadLaunchCsvApi(token: string, launchId: string, rows: CsvLaunchRow[]) {
  return apiRequest<{
    success: boolean;
    rowCount: number;
    surfaceData: SurfaceData;
    status: LaunchRecord["status"];
  }>(`/launches/${launchId}/upload-csv`, {
    method: "POST",
    token,
    body: JSON.stringify({ rows }),
  });
}

export function startLaunchApi(token: string, launchId: string) {
  return apiRequest<{ success: boolean; launch: LaunchRecord }>(
    `/launches/${launchId}/start`,
    { method: "POST", token },
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
