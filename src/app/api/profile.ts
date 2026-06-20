import { apiRequest } from "./client";
import type { UserProfile, UserPurpose, UserRole } from "../auth/auth-types";

export function getProfileApi(token: string) {
  return apiRequest<UserProfile>("/users/me/profile", {
    method: "GET",
    token,
  });
}

export function updateProfileApi(
  token: string,
  payload: {
    role?: UserRole;
    purposes?: UserPurpose[];
    onboardingComplete?: boolean;
  },
) {
  return apiRequest<{ success: boolean }>("/users/me/profile", {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}
