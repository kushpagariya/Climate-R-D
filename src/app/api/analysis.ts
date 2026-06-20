import { apiRequest } from "./client";

export interface SavedAnalysisItem {
  id: string;
  userId: string;
  stationId: string;
  date: string;
  time: string;
  comparisonSettings: Record<string, unknown>;
  notes: string;
  createdAt: string;
}

export function createSavedAnalysisApi(
  token: string,
  payload: {
    stationId: string;
    date: string;
    time: string;
    comparisonSettings?: Record<string, unknown>;
    notes?: string;
  },
) {
  return apiRequest<{ success: boolean; id: string }>("/saved-analyses", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function getSavedAnalysesApi(token: string, limit = 100) {
  return apiRequest<{ success: boolean; items: SavedAnalysisItem[] }>(
    `/saved-analyses?limit=${limit}`,
    {
      method: "GET",
      token,
    },
  );
}

export function deleteSavedAnalysisApi(token: string, analysisId: string) {
  return apiRequest<{ success: boolean }>(`/saved-analyses/${analysisId}`, {
    method: "DELETE",
    token,
  });
}
