import { Navigate, Outlet } from "react-router";
import { useAuth } from "./use-auth";

export function RequirePreLaunch() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  if (!user.hasSeenPreLaunch) {
    return <Navigate to="/pre-launch" replace />;
  }

  return <Outlet />;
}