import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "./use-auth";
import type { AuthUser } from "./auth-types";

function getOnboardingPath(user: AuthUser | null): string | null {
  if (!user?.role) return "/role-selection";
  if (!user.purposes.length) return "/purpose-selection";
  return null;
}

export function RequireAuth() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const onboardingPath = getOnboardingPath(user);
  if (onboardingPath) {
    return <Navigate to={onboardingPath} replace />;
  }

  return <Outlet />;
}

export function RequireSession() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export function RequireSelectedRole() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!user?.role) {
    return <Navigate to="/role-selection" replace />;
  }

  return <Outlet />;
}

export function RedirectAuthenticatedUser() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) return null;

  if (!isAuthenticated) return <Outlet />;

  return <Navigate to={getOnboardingPath(user) ?? "/"} replace />;
}
