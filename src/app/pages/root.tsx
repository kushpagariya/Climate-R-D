import { Outlet, Link, useLocation } from "react-router";
import { Cloud, Radar } from "lucide-react";
import { useEffect } from "react";

export function Root() {
  const location = useLocation();

  // Set dark mode by default
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border/50 backdrop-blur-xl bg-card/30 sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
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

            <div className="flex items-center gap-2">
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
