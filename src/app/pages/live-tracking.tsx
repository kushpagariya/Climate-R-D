import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Activity, MapPinned, RadioTower, Satellite, Server, Wifi } from "lucide-react";
import { useAuth } from "../auth/use-auth";
import { getLaunchApi, type LaunchRecord } from "../api/launches";
import { Badge } from "../components/ui/badge";

const architectureItems = [
  {
    title: "SondeHub Connector",
    description: "Reserved integration point for resolving radiosonde serials and fetching public telemetry packets.",
    icon: Satellite,
  },
  {
    title: "WebSocket Stream",
    description: "Placeholder channel for pushing live packets to mission clients without polling.",
    icon: Wifi,
  },
  {
    title: "GPS Tracking",
    description: "Prepared for direct GPS packet ingestion from field hardware or relay services.",
    icon: MapPinned,
  },
  {
    title: "Telemetry Ingestion",
    description: "Manual, CSV, SondeHub, and future device packets normalize into live telemetry records.",
    icon: Server,
  },
];

export function LiveTrackingPage() {
  const [searchParams] = useSearchParams();
  const launchId = searchParams.get("launchId");
  const { session } = useAuth();
  const [launch, setLaunch] = useState<LaunchRecord | null>(null);
  const [telemetryCount, setTelemetryCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.token || !launchId) return;

    let cancelled = false;
    async function loadLaunch() {
      try {
        const response = await getLaunchApi(session!.token, launchId!);
        if (!cancelled) {
          setLaunch(response.launch);
          setTelemetryCount(response.telemetryCount);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load launch.");
        }
      }
    }

    void loadLaunch();
    return () => {
      cancelled = true;
    };
  }, [launchId, session]);

  return (
    <section className="w-full p-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="flex flex-col gap-4 border-b border-border/60 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant={launch?.status === "live" ? "default" : "outline"}>
                {launch?.status ?? "standby"}
              </Badge>
              {launchId && <span className="text-xs text-muted-foreground">Launch {launchId}</span>}
            </div>
            <h2 className="text-2xl font-semibold">Live Tracking</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Mission tracking architecture is ready for real-time radiosonde telemetry. Hardware integrations are intentionally staged as placeholders.
            </p>
          </div>
          <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-4 py-3">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Telemetry Records</div>
            <div className="mt-1 text-2xl font-semibold text-cyan-200">{telemetryCount}</div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-lg border border-border/60 bg-card/35 p-5">
            <div className="mb-5 flex items-center gap-3">
              <Activity className="h-5 w-5 text-cyan-300" />
              <div>
                <h3 className="text-lg font-medium">Mission Stream</h3>
                <p className="text-sm text-muted-foreground">Live map and packet visualization will mount here.</p>
              </div>
            </div>
            <div className="grid min-h-[420px] place-items-center rounded-lg border border-dashed border-cyan-500/25 bg-slate-950/40">
              <div className="max-w-md px-6 text-center">
                <RadioTower className="mx-auto h-12 w-12 text-cyan-300" />
                <div className="mt-4 text-base font-medium">Awaiting telemetry source</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Future packets from SondeHub, WebSocket streams, GPS hardware, or manual ingestion will update this surface.
                </p>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-card/35 p-5">
              <h3 className="text-lg font-medium">Launch Summary</h3>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Station</span>
                  <span className="text-right">{launch?.station ?? "Not selected"}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Balloon ID</span>
                  <span>{launch?.balloonId ?? "-"}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Radiosonde ID</span>
                  <span>{launch?.radiosondeId ?? "-"}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Launch Time</span>
                  <span>
                    {launch ? `${launch.launchDate} ${launch.launchTime}` : "-"}
                  </span>
                </div>
              </div>
            </div>

            {architectureItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-lg border border-border/60 bg-card/35 p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 p-2 text-cyan-300">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-medium">{item.title}</div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </aside>
        </div>
      </div>
    </section>
  );
}
