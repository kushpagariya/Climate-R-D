import { createBrowserRouter } from "react-router";
import { Root } from "./pages/root";
import { AtmosphericDashboard } from "./pages/atmospheric-dashboard";
import { MissionControl } from "./pages/mission-control";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: AtmosphericDashboard },
      { path: "mission-control", Component: MissionControl },
    ],
  },
]);
