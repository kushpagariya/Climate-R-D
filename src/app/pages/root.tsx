import { Outlet, Link, useLocation, useNavigate } from "react-router";
import {
  Cloud,
  Database,
  History,
  LogOut,
  MapPinned,
  Menu,
  Radar,
  Settings,
  UserCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../components/ui/sheet";

const navItems = [
  { to: "/", label: "Dashboard", icon: Cloud },
  { to: "/mission-control", label: "Mission Control", icon: Radar },
  { to: "/mission-history", label: "Historical Analysis", icon: History },
  { to: "/pre-launch", label: "Pre-Launch Setup", icon: Database },
  { to: "/live-tracking", label: "Live Tracking", icon: MapPinned },
];

function formatRole(role?: string) {
  if (!role) return "Role not selected";
  return role
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function Root() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, logout, user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Set dark mode by default
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border/50 backdrop-blur-xl bg-card/30 sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-2 rounded-lg">
                <Cloud className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="tracking-tight">
                  <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                    INDRAVANI
                  </span>
                  {" "}
                  <span className="text-foreground/80">WEATHER INTELLIGENCE</span>
                </h1>
                <p className="text-xs text-muted-foreground">
                  Atmospheric Sounding & Radiosonde Analytics Platform
                </p>
              </div>
            </div>

            <div className="flex md:hidden items-center gap-2">
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <button className="p-2 rounded-lg border border-cyan-500/25 bg-blue-950/40 text-cyan-300 transition-all hover:bg-cyan-500/15">
                    <Menu className="w-5 h-5" />
                  </button>
                </SheetTrigger>
                <SheetContent side="left" className="bg-[#08111f] border-r border-border/50">
                  <SheetHeader>
                    <SheetTitle className="text-left text-cyan-400 text-lg">Menu</SheetTitle>
                  </SheetHeader>
                  <div className="flex flex-col gap-2 mt-6">
                    {navItems.map((item) => {
                      const Icon = item.icon;
                      const active = item.to.includes("?")
                        ? `${location.pathname}${location.search}` === item.to
                        : location.pathname === item.to;
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`px-4 py-3 rounded-lg transition-all flex items-center gap-3 ${
                            active
                              ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                              : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                          <span className="text-sm">{item.label}</span>
                        </Link>
                      );
                    })}
                    <div className="h-px bg-border/50 my-2" />
                    <Link
                      to="/profile"
                      onClick={() => setMobileMenuOpen(false)}
                      className="px-4 py-3 rounded-lg transition-all flex items-center gap-3 text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    >
                      <UserCircle className="w-5 h-5" />
                      <span className="text-sm">Profile</span>
                    </Link>
                    <Link
                      to="/settings"
                      onClick={() => setMobileMenuOpen(false)}
                      className="px-4 py-3 rounded-lg transition-all flex items-center gap-3 text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    >
                      <Settings className="w-5 h-5" />
                      <span className="text-sm">Settings</span>
                    </Link>
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        handleLogout();
                      }}
                      className="px-4 py-3 rounded-lg transition-all flex items-center gap-3 text-red-400 hover:bg-red-500/10"
                    >
                      <LogOut className="w-5 h-5" />
                      <span className="text-sm">Logout</span>
                    </button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            <div className="hidden md:flex flex-wrap items-center gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = item.to.includes("?")
                  ? `${location.pathname}${location.search}` === item.to
                  : location.pathname === item.to;

                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`px-3 py-2 rounded-lg transition-all ${
                      active
                        ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      <span className="text-sm">{item.label}</span>
                    </div>
                  </Link>
                );
              })}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border border-cyan-500/25 bg-blue-950/40 text-cyan-300 transition-all hover:border-cyan-400/50 hover:bg-cyan-500/15 hover:text-cyan-100 hover:shadow-[0_0_18px_rgba(6,182,212,0.16)]"
                  >
                    <div className="flex items-center gap-2">
                      <UserCircle className="w-4 h-4" />
                      <span className="text-sm">{user?.fullName || "Profile"}</span>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>
                    <div className="space-y-1">
                      <div className="font-medium">{user?.fullName}</div>
                      <div className="text-xs text-muted-foreground">{user?.email}</div>
                      <div className="text-xs text-muted-foreground">
                        {user?.organization || "Organization not provided"}
                      </div>
                      <div className="text-xs text-cyan-300">
                        {formatRole(user?.role)}
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => navigate("/profile")}>
                    <UserCircle className="w-4 h-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => navigate("/settings")}>
                    <Settings className="w-4 h-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleLogout}>
                    <LogOut className="w-4 h-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex" style={{ minHeight: 'calc(100vh - 73px)' }}>
        <Outlet />
      </main>
    </div>
  );
}
