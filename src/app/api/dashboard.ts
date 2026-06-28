import { apiRequest } from "./client";
import type {
  AxisLimits,
  RadiosondeMetadata,
  RadiosondeParameters,
} from "./radiosonde";
import type { RadiosondeObservation } from "../data/radiosonde-data";

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
  profile: RadiosondeObservation[];
  parameters: RadiosondeParameters;
  metadata: RadiosondeMetadata;
  axisLimits?: AxisLimits | null;
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
