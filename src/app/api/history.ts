import { apiRequest } from "./client";

export interface GraphHistoryItem {
  id: string;
  userId: string;
  stationId: string;
  date: string;
  time: string;
  chartType: string;
  createdAt: string;
}

export function createGraphHistoryApi(
  token: string,
  payload: {
    stationId: string;
    date: string;
    time: string;
    chartType: string;
  },
) {
  return apiRequest<{ success: boolean }>("/graph-history", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function getGraphHistoryApi(token: string, limit = 100) {
  return apiRequest<{ success: boolean; items: GraphHistoryItem[] }>(
    `/graph-history?limit=${limit}`,
    {
      method: "GET",
      token,
    },
  );
}
