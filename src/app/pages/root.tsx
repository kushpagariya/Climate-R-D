import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { Cloud, LogOut, Radar } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "../auth/use-auth";

export function Root() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, logout } = useAuth();

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

            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/"
                className={`px-4 py-2 rounded-lg transition-all ${
                  location.pathname === "/"
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4" />
                  <span className="text-sm">Analytics Dashboard</span>
                </div>
              </Link>
              <Link
                to="/mission-control"
                className={`px-4 py-2 rounded-lg transition-all ${
                  location.pathname === "/mission-control"
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Radar className="w-4 h-4" />
                  <span className="text-sm">Mission Control</span>
                </div>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="px-4 py-2 rounded-lg border border-cyan-500/25 bg-blue-950/40 text-cyan-300 transition-all hover:border-cyan-400/50 hover:bg-cyan-500/15 hover:text-cyan-100 hover:shadow-[0_0_18px_rgba(6,182,212,0.16)]"
              >
                <div className="flex items-center gap-2">
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm">Logout</span>
                </div>
              </button>
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
