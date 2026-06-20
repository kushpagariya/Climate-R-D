import { apiRequest } from "./client";

export function logActivityApi(
  token: string,
  payload: {
    action:
      | "login"
      | "logout"
      | "signup"
      | "view_sounding"
      | "change_station"
      | "change_date"
      | "open_compare"
      | "save_analysis"
      | "favorite_item";
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  return apiRequest<{ success: boolean }>("/activity-log", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}
