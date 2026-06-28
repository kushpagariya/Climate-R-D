import { apiRequest } from "./client";
import type {
  AtmosphericEvent,
  BalloonPosition,
  BalloonRecord,
  RadiosondeObservation,
} from "../data/radiosonde-data";
import {
  calculateAtmosphericParameters,
  generateBalloonHistory,
  generateRadiosondeProfile,
} from "../data/radiosonde-data";

export interface RadiosondeParameters {
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

export interface RadiosondeMetadata {
  id?: string;
  stationId?: string;
  date?: string;
  time?: string;
  source?: string;
  recordType?: string;
  createdAt?: string;
  launchTime?: string;
  elapsedMinutes?: number;
  [key: string]: unknown;
}

export interface AxisLimits {
  temperature?: [number, number];
  pressure?: [number, number];
  altitude?: [number, number];
  humidity?: [number, number];
  windSpeed?: [number, number];
}

export interface RadiosondeQueryResponse {
  success: boolean;
  profile: RadiosondeObservation[];
  parameters: RadiosondeParameters;
  metadata: RadiosondeMetadata;
  axisLimits?: AxisLimits;
}

export interface RadiosondeHistoryItem {
  id: string;
  stationId: string;
  date?: string;
  time?: string;
  source: string;
  recordType: string;
  label: string;
  hasTrajectory: boolean;
  createdAt?: string;
}

export interface RadiosondeDetailResponse {
  success: boolean;
  id: string;
  stationId: string;
  date?: string;
  time?: string;
  profile: RadiosondeObservation[];
  observations: RadiosondeObservation[];
  parameters: RadiosondeParameters;
  trajectory: SerializedBalloonPosition[];
  events: AtmosphericEvent[];
  source: string;
  recordType: string;
  metadata: RadiosondeMetadata;
  axisLimits?: AxisLimits;
  createdAt?: string;
}

export interface SerializedBalloonPosition {
  lat: number;
  lon: number;
  altitude: number;
  timestamp: string;
  phase: "ascending" | "descending" | "complete";
}

export interface MissionReplayData {
  position: BalloonPosition;
  trajectory: BalloonPosition[];
  observations: RadiosondeObservation[];
  events: AtmosphericEvent[];
  metadata: RadiosondeMetadata;
  source: "mongodb" | "mock";
}

function isObjectId(value: string): boolean {
  return /^[a-f\d]{24}$/i.test(value);
}

export function parseBalloonPosition(point: SerializedBalloonPosition): BalloonPosition {
  return {
    lat: point.lat,
    lon: point.lon,
    altitude: point.altitude,
    timestamp: new Date(point.timestamp),
    phase: point.phase,
  };
}

export function serializeBalloonPosition(point: BalloonPosition): SerializedBalloonPosition {
  return {
    lat: point.lat,
    lon: point.lon,
    altitude: point.altitude,
    timestamp: point.timestamp.toISOString(),
    phase: point.phase,
  };
}

export function getRadiosondeApi(
  token: string,
  params: { stationId: string; date: string; time: string },
) {
  const query = new URLSearchParams({
    stationId: params.stationId,
    date: params.date,
    time: params.time,
  });
  return apiRequest<RadiosondeQueryResponse>(`/radiosonde?${query.toString()}`, {
    method: "GET",
    token,
  });
}

export function getRadiosondeHistoryApi(
  token: string,
  stationId: string,
  options?: { recordType?: string; limit?: number },
) {
  const query = new URLSearchParams({ stationId });
  if (options?.recordType) query.set("recordType", options.recordType);
  if (options?.limit) query.set("limit", String(options.limit));
  return apiRequest<{ success: boolean; items: RadiosondeHistoryItem[] }>(
    `/radiosonde/history?${query.toString()}`,
    { method: "GET", token },
  );
}

export function getRadiosondeByIdApi(token: string, recordId: string) {
  return apiRequest<RadiosondeDetailResponse>(`/radiosonde/${recordId}`, {
    method: "GET",
    token,
  });
}

export function saveRadiosondeApi(
  token: string,
  payload: {
    stationId: string;
    date?: string;
    time?: string;
    observations: RadiosondeObservation[];
    trajectory?: SerializedBalloonPosition[];
    events?: AtmosphericEvent[];
    source?: string;
    recordType?: string;
    metadata?: RadiosondeMetadata;
  },
) {
  return apiRequest<{ success: boolean; id: string }>("/radiosonde/save", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export async function fetchRadiosondeProfile(
  token: string | undefined,
  stationId: string,
  date: string,
  time: "00:00" | "12:00",
): Promise<{
  profile: RadiosondeObservation[];
  parameters: ReturnType<typeof calculateAtmosphericParameters>;
  axisLimits?: AxisLimits;
  source: "mongodb" | "mock";
}> {
  if (token) {
    try {
      const response = await getRadiosondeApi(token, { stationId, date, time });
      if (response.profile?.length) {
        return {
          profile: response.profile,
          parameters: response.parameters ?? calculateAtmosphericParameters(response.profile),
          axisLimits: response.axisLimits,
          source: "mongodb",
        };
      }
    } catch {
      // Fall through to mock generator.
    }
  }

  const profile = generateRadiosondeProfile(date, time, stationId);
  return {
    profile,
    parameters: calculateAtmosphericParameters(profile),
    source: "mock",
  };
}

export async function fetchRadiosondeHistoryRecords(
  token: string | undefined,
  stationId: string,
): Promise<BalloonRecord[]> {
  if (token) {
    try {
      const response = await getRadiosondeHistoryApi(token, stationId, { limit: 50 });
      if (response.items.length > 0) {
        return response.items
          .filter((item) => item.recordType !== "mission" && item.date && item.time)
          .map((item) => ({
            id: item.id,
            date: item.date!,
            time: item.time as "00:00" | "12:00",
            stationId: item.stationId,
            label: item.label,
          }));
      }
    } catch {
      // Fall through to mock generator.
    }
  }

  return generateBalloonHistory(stationId, 14);
}

export async function fetchHistoryOverlayProfile(
  token: string | undefined,
  record: BalloonRecord,
): Promise<RadiosondeObservation[]> {
  if (token && isObjectId(record.id)) {
    try {
      const response = await getRadiosondeByIdApi(token, record.id);
      if (response.profile?.length) {
        return response.profile;
      }
    } catch {
      // Fall through to mock generator.
    }
  }

  return generateRadiosondeProfile(record.date, record.time, record.stationId);
}

export async function fetchMissionReplay(
  token: string | undefined,
  stationId: string,
  fallback: () => {
    position: BalloonPosition;
    trajectory: BalloonPosition[];
    observations: RadiosondeObservation[];
  },
  detectEvents: (observations: RadiosondeObservation[]) => AtmosphericEvent[],
): Promise<MissionReplayData> {
  if (token) {
    try {
      const history = await getRadiosondeHistoryApi(token, stationId, {
        recordType: "mission",
        limit: 1,
      });
      if (history.items.length > 0) {
        const detail = await getRadiosondeByIdApi(token, history.items[0].id);
        if (detail.trajectory?.length) {
          const trajectory = detail.trajectory.map(parseBalloonPosition);
          return {
            position: trajectory[trajectory.length - 1],
            trajectory,
            observations: detail.profile?.length ? detail.profile : detail.observations,
            events: detail.events ?? detectEvents(detail.observations),
            metadata: detail.metadata ?? {},
            source: "mongodb",
          };
        }
      }
    } catch {
      // Fall through to mock generator.
    }
  }

  const mock = fallback();
  return {
    ...mock,
    events: detectEvents(mock.observations),
    metadata: {},
    source: "mock",
  };
}
