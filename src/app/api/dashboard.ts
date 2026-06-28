import { apiRequest } from "./client";

export interface DashboardSoundingObservation {
  pressure: number;
  height: number;
  temperature: number;
  dewPoint: number;
  icePoint: number;
  relativeHumidity: number;
  humidityWrtIce: number;
  mixingRatio: number;
  windDirection: number;
  windSpeed: number;
}

export interface DashboardSoundingParameters {
  freezingLevel: number;
  lcl: number;
  tropopause: number;
  surfaceTemperature: number;
  surfacePressure: number;
  surfaceHumidity: number;
  maxWindSpeed: number;
  maxWindHeight: number;
  maxAltitude: number;
  cape: number;
}

export interface DashboardSoundingMetadata {
  id?: string;
  stationId?: string;
  date?: string;
  time?: string;
  source?: string;
  recordType?: string;
  telemetryCount?: number;
  sondeNumber?: string;
  [key: string]: unknown;
}

export interface DashboardAxisLimits {
  temperature?: [number, number];
  pressure?: [number, number];
  altitude?: [number, number];
  humidity?: [number, number];
  windSpeed?: [number, number];
}

export interface DashboardLaunchOption {
  id: string;
  stationId: string;
  stationName: string;
  date: string;
  time: string;
  label: string;
}

export interface DashboardSoundingResponse {
  success: boolean;
  profile: DashboardSoundingObservation[];
  parameters: DashboardSoundingParameters;
  metadata: DashboardSoundingMetadata;
  axisLimits?: DashboardAxisLimits | null;
  launch?: DashboardLaunchOption | null;
  availableLaunches: DashboardLaunchOption[];
  message?: string;
}

export function getDashboardSoundingApi(
  token: string,
  params: { stationId?: string; date?: string; time?: string } = {},
) {
  const query = new URLSearchParams();
  if (params.stationId) query.set("stationId", params.stationId);
  if (params.date) query.set("date", params.date);
  if (params.time) query.set("time", params.time);
  const suffix = query.toString() ? `?${query.toString()}` : "";

  return apiRequest<DashboardSoundingResponse>(`/api/dashboard/sounding${suffix}`, {
    method: "GET",
    token,
  });
}
