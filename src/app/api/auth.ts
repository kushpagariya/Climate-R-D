import { apiRequest } from "./client";
import type { SignupCredentials, UserProfile } from "../auth/auth-types";

export interface ApiUser {
  id: string;
  fullName: string;
  email: string;
  organization?: string;
}

export interface SignupResponse {
  success: boolean;
  user: ApiUser;
  token: string;
}

export interface LoginResponse {
  success: boolean;
  user: ApiUser;
  profile: UserProfile;
  token: string;
}

export function signupApi(credentials: SignupCredentials) {
  return apiRequest<SignupResponse>("/signup", {
    method: "POST",
    body: JSON.stringify({
      fullName: credentials.fullName.trim(),
      email: credentials.email.trim().toLowerCase(),
      password: credentials.password,
      organization: credentials.organization?.trim() || undefined,
    }),
  });
}

export function loginApi(email: string, password: string) {
  return apiRequest<LoginResponse>("/login", {
    method: "POST",
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
    }),
  });
}
