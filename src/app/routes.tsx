import { createBrowserRouter } from "react-router";
import { Root } from "./pages/root";
import { AtmosphericDashboard } from "./pages/atmospheric-dashboard";
import { MissionControl } from "./pages/mission-control";
import { LoginPage } from "./pages/login";
import { SignupPage } from "./pages/signup";
import { RoleSelectionPage } from "./pages/role-selection";
import { PurposeSelectionPage } from "./pages/purpose-selection";

export const router = createBrowserRouter([
  { path: "/login", Component: LoginPage },
  { path: "/signup", Component: SignupPage },
  { path: "/role-selection", Component: RoleSelectionPage },
  { path: "/purpose-selection", Component: PurposeSelectionPage },
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: AtmosphericDashboard },
      { path: "mission-control", Component: MissionControl },
    ],
  },
]);
