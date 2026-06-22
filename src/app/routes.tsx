import { PreLaunchPage } from "./pages/pre-launch";
import { RequirePreLaunch } from "./auth/pre-launch-guard";
import { createBrowserRouter } from "react-router";
import { Root } from "./pages/root";
import { AtmosphericDashboard } from "./pages/atmospheric-dashboard";
import { MissionControl } from "./pages/mission-control";
import { MissionHistoryPage } from "./pages/mission-history";
import { ProfilePage } from "./pages/profile";
import { SettingsPage } from "./pages/settings";
import { LoginPage } from "./pages/login";
import { SignupPage } from "./pages/signup";
import { RoleSelectionPage } from "./pages/role-selection";
import { PurposeSelectionPage } from "./pages/purpose-selection";
import {
  RequireAuth,
  RequireSelectedRole,
  RequireSession,
} from "./auth/route-guards";

export const router = createBrowserRouter([
  { path: "/login", Component: LoginPage },
  { path: "/signup", Component: SignupPage },
  {
    Component: RequireSession,
    children: [
      { path: "/role-selection", Component: RoleSelectionPage },
    ],
  },
  {
    Component: RequireSelectedRole,
    children: [
      { path: "/purpose-selection", Component: PurposeSelectionPage },
    ],
  },
  {
    Component: RequireAuth,
    children: [
      {
        Component: RequirePreLaunch,
        children: [
          {
            path: "/",
            Component: Root,
            children: [
              { index: true, Component: AtmosphericDashboard },
              { path: "mission-control", Component: MissionControl },
              { path: "mission-history", Component: MissionHistoryPage },
              { path: "profile", Component: ProfilePage },
              { path: "settings", Component: SettingsPage },
            ],
          },
        ],
      },

      {
        path: "pre-launch",
        Component: PreLaunchPage,
      },
    ],
  },
]);
