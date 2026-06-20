import { createBrowserRouter } from "react-router";
import { Root } from "./pages/root";
import { AtmosphericDashboard } from "./pages/atmospheric-dashboard";
import { MissionControl } from "./pages/mission-control";
import { LoginPage } from "./pages/login";
import { SignupPage } from "./pages/signup";
import { RoleSelectionPage } from "./pages/role-selection";
import { PurposeSelectionPage } from "./pages/purpose-selection";
import {
  RedirectAuthenticatedUser,
  RequireAuth,
  RequireSelectedRole,
  RequireSession,
} from "./auth/route-guards";

export const router = createBrowserRouter([
  {
    Component: RedirectAuthenticatedUser,
    children: [
      { path: "/login", Component: LoginPage },
      { path: "/signup", Component: SignupPage },
    ],
  },
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
        path: "/",
        Component: Root,
        children: [
          { index: true, Component: AtmosphericDashboard },
          { path: "mission-control", Component: MissionControl },
        ],
      },
    ],
  },
]);
