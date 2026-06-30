import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";
import { Activity, CloudRain, Waves } from "lucide-react";
import { AuthBrand } from "./auth-brand";

interface AuthShellProps {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  footer?: ReactNode;
}

export function AuthShell({ children, eyebrow, title, description, footer }: AuthShellProps) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0e27] text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_10%,rgba(6,182,212,0.14),transparent_32%),radial-gradient(circle_at_82%_72%,rgba(14,165,233,0.13),transparent_34%),linear-gradient(180deg,#0a0e27_0%,#070b1d_100%)]" />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(6,182,212,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.35) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="absolute left-0 right-0 top-24 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
        <div className="absolute bottom-28 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1500px] flex-col px-5 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between">
          <Link to="/" className="text-xs text-muted-foreground transition-all duration-300 hover:text-cyan-300 hover:drop-shadow-[0_0_10px_rgba(34,211,238,0.65)]">
            Back to dashboard
          </Link>
          <div className="hidden items-center gap-2 rounded-full border border-cyan-500/20 bg-card/40 px-3 py-1.5 text-[11px] uppercase tracking-widest text-muted-foreground shadow-lg shadow-cyan-500/5 backdrop-blur-md sm:flex">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            Live platform
          </div>
        </header>

        <main className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[1fr_520px] lg:py-12">
          <section className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <AuthBrand />

            <div className="mt-10 hidden max-w-xl grid-cols-3 gap-3 lg:grid">
              {[
                ["700 hPa", "Profile Layer"],
                ["00 UTC", "Standard Sounding"],
                ["WMO", "Station Ready"],
              ].map(([value, label]) => (
                <div
                  key={label}
                className="rounded-xl border border-border/50 bg-card/50 p-4 shadow-lg shadow-black/10 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/40 hover:bg-card/70 hover:shadow-cyan-500/10"
                >
                  <div className="text-xl text-cyan-400">{value}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="w-[95%] max-w-md mx-auto lg:w-full lg:max-w-none">
            <div className="rounded-2xl border border-cyan-500/20 bg-card/55 p-1 shadow-2xl shadow-black/30 backdrop-blur-xl transition-shadow duration-300 hover:shadow-cyan-500/10 w-full">
              <div className="rounded-xl border border-cyan-500/10 bg-[#08111f]/70 p-5 shadow-inner shadow-cyan-500/5 sm:p-6">
                <div className="mb-6 space-y-2">
                  <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-widest text-cyan-400">
                    <CloudRain className="w-3.5 h-3.5" />
                    {eyebrow}
                  </div>
                  <h2 className="text-xl md:text-2xl font-light text-foreground">{title}</h2>
                  <p className="text-sm leading-6 text-muted-foreground">{description}</p>
                </div>
                {children}
              </div>
            </div>
            {footer && <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>}
          </section>
        </main>

        <footer className="flex items-center justify-center gap-2 py-3 text-[11px] uppercase tracking-widest text-muted-foreground">
          <Waves className="w-3.5 h-3.5 text-cyan-500/70" />
          Radiosonde analytics access layer
        </footer>
      </div>
    </div>
  );
}
