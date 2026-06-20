export type UserRole =
  | "student"
  | "teacher"
  | "researcher"
  | "climate-scientist"
  | "weather-analyst"
  | "organization-employee";

export type UserPurpose =
  | "learning-climate-science"
  | "academic-research"
  | "weather-forecasting"
  | "environmental-monitoring"
  | "classroom-teaching"
  | "professional-climate-analysis"
  | "personal-interest";

export interface UserProfile {
  role?: UserRole | null;
  purposes: UserPurpose[];
  onboardingComplete: boolean;
}

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  organization?: string;
  role?: UserRole;
  purposes: UserPurpose[];
}

export interface AuthSession {
  user: AuthUser;
  token: string;
  rememberMe: boolean;
  createdAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface SignupCredentials {
  fullName: string;
  email: string;
  password: string;
  organization?: string;
}
