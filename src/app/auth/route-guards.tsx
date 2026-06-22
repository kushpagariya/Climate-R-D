import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "./use-auth";

export function RequireAuth() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!user?.role) {
    return <Navigate to="/role-selection" replace />;
  }

  if (!user?.purposes.length) {
    return <Navigate to="/purpose-selection" replace />;
  }

  // IMPORTANT
  if (
    !user?.hasSeenPreLaunch &&
    location.pathname !== "/pre-launch"
  ) {
    return <Navigate to="/pre-launch" replace />;
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
