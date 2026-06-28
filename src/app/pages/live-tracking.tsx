import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Activity, Gauge, RadioTower, Thermometer, Waves, Wind } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../auth/use-auth";
import {
  getLaunchApi,
  getLaunchTelemetryApi,
  type LaunchRecord,
  type LaunchTelemetryRecord,
} from "../api/launches";
import { Badge } from "../components/ui/badge";

const POLLING_INTERVAL_MS = 2000;
const TELEMETRY_PAGE_LIMIT = 100;
const CHART_POINT_LIMIT = 160;

function formatValue(value: number | null | undefined, unit = "") {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const formatted = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
  return unit ? `${formatted} ${unit}` : formatted;
}

function telemetryLabel(row: LaunchTelemetryRecord) {
  if (typeof row.second === "number") return `${row.second}s`;
  if (row.timestamp) {
    return new Date(row.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  return "-";
}

function metricCards(latest?: LaunchTelemetryRecord) {
  return [
    { label: "Pressure", value: formatValue(latest?.pressure, "hPa"), icon: Gauge },
    { label: "Temperature", value: formatValue(latest?.temperature, "C"), icon: Thermometer },
    { label: "Humidity", value: formatValue(latest?.humidity, "%"), icon: Waves },
    { label: "Altitude", value: formatValue(latest?.altitude, "m"), icon: RadioTower },
    { label: "Wind Speed", value: formatValue(latest?.windSpeed, "m/s"), icon: Wind },
  ];
}

function SimpleTelemetryChart({
  title,
  data,
  lines,
}: {
  title: string;
  data: Array<Record<string, number | string | null | undefined>>;
  lines: Array<{ key: string; name: string; color: string }>;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/35 p-4">
      <div className="mb-3 text-sm font-medium">{title}</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
            <XAxis
              dataKey="label"
              minTickGap={24}
              tick={{ fill: "rgb(148, 163, 184)", fontSize: 11 }}
              tickLine={false}
            />
            <YAxis tick={{ fill: "rgb(148, 163, 184)", fontSize: 11 }} tickLine={false} width={42} />
            <Tooltip
              contentStyle={{
                background: "rgb(15, 23, 42)",
                border: "1px solid rgba(148, 163, 184, 0.35)",
                borderRadius: 8,
              }}
              labelStyle={{ color: "rgb(226, 232, 240)" }}
            />
            {lines.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.name}
                stroke={line.color}
                dot={false}
                strokeWidth={2}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function LiveTrackingPage() {
  const [searchParams] = useSearchParams();
  const launchId = searchParams.get("launchId");
  const { session } = useAuth();
  const token = session?.token;

  const [launch, setLaunch] = useState<LaunchRecord | null>(null);
  const [telemetry, setTelemetry] = useState<LaunchTelemetryRecord[]>([]);
  const [telemetryCount, setTelemetryCount] = useState(0);
  const [sourceCollection, setSourceCollection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const afterSecondRef = useRef<number | undefined>(undefined);
  const afterTimestampRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!token || !launchId) return;

    let cancelled = false;
    async function loadLaunch() {
      try {
        const response = await getLaunchApi(token, launchId);
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
  }, [launchId, token]);

  useEffect(() => {
    if (!token || !launchId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    afterSecondRef.current = undefined;
    afterTimestampRef.current = undefined;
    setTelemetry([]);
    setError(null);

    async function pollTelemetry() {
      if (cancelled) return;
      setIsPolling(true);
      try {
        const response = await getLaunchTelemetryApi(token, launchId, {
          afterSecond: afterSecondRef.current,
          afterTimestamp: afterSecondRef.current === undefined ? afterTimestampRef.current : undefined,
          limit: TELEMETRY_PAGE_LIMIT,
        });

        if (!cancelled) {
          setSourceCollection(response.sourceCollection);
          if (response.telemetry.length > 0) {
            const latestRow = response.telemetry[response.telemetry.length - 1];
            if (typeof latestRow.second === "number") {
              afterSecondRef.current = latestRow.second;
              afterTimestampRef.current = undefined;
            } else if (latestRow.timestamp) {
              afterTimestampRef.current = latestRow.timestamp;
            }
            setTelemetry((prev) => [...prev, ...response.telemetry]);
          }
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load telemetry.");
        }
      } finally {
        if (!cancelled) {
          setIsPolling(false);
          timer = setTimeout(pollTelemetry, POLLING_INTERVAL_MS);
        }
      }
    }

    timer = setTimeout(pollTelemetry, 0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [launchId, token]);

  const latest = telemetry[telemetry.length - 1];
  const cards = metricCards(latest);
  const chartData = useMemo(
    () =>
      telemetry.slice(-CHART_POINT_LIMIT).map((row) => ({
        label: telemetryLabel(row),
        pressure: row.pressure,
        temperature: row.temperature,
        humidity: row.humidity,
        altitude: row.altitude,
        windSpeed: row.windSpeed,
      })),
    [telemetry],
  );

  const recentRows = telemetry.slice(-8).reverse();

  return (
    <section className="w-full p-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="flex flex-col gap-4 border-b border-border/60 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant={launch?.status === "live" ? "default" : "outline"}>
                {launch?.status ?? "standby"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {launchId ? `Launch ${launchId}` : "No launch selected"}
              </span>
              {sourceCollection && (
                <span className="rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground">
                  {sourceCollection}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-semibold">Live Tracking</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {launch
                ? `${launch.station} telemetry updates every ${POLLING_INTERVAL_MS / 1000}s.`
                : "Select or start a launch to begin telemetry polling."}
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-4 py-3">
            <Activity className={`h-5 w-5 ${isPolling ? "text-cyan-200" : "text-muted-foreground"}`} />
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Rows Loaded</div>
              <div className="mt-1 text-2xl font-semibold text-cyan-100">{telemetry.length}</div>
              {telemetryCount > 0 && (
                <div className="text-xs text-muted-foreground">{telemetryCount} staged</div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-lg border border-border/60 bg-card/35 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">{card.label}</div>
                  <Icon className="h-4 w-4 text-cyan-300" />
                </div>
                <div className="mt-3 text-2xl font-semibold text-cyan-100">{card.value}</div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <SimpleTelemetryChart
            title="Atmospheric Conditions"
            data={chartData}
            lines={[
              { key: "pressure", name: "Pressure", color: "#38bdf8" },
              { key: "temperature", name: "Temperature", color: "#f97316" },
              { key: "humidity", name: "Humidity", color: "#22c55e" },
            ]}
          />
          <SimpleTelemetryChart
            title="Flight Profile"
            data={chartData}
            lines={[
              { key: "altitude", name: "Altitude", color: "#a78bfa" },
              { key: "windSpeed", name: "Wind Speed", color: "#facc15" },
            ]}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
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
                <span>{launch ? `${launch.launchDate} ${launch.launchTime}` : "-"}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-card/35 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-medium">Recent Packets</h3>
              <span className="text-xs text-muted-foreground">Append-only stream</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Pressure</th>
                    <th className="py-2 pr-3">Temp</th>
                    <th className="py-2 pr-3">Humidity</th>
                    <th className="py-2 pr-3">Altitude</th>
                    <th className="py-2 pr-3">Wind</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRows.length === 0 ? (
                    <tr>
                      <td className="py-6 text-muted-foreground" colSpan={6}>
                        Waiting for telemetry packets.
                      </td>
                    </tr>
                  ) : (
                    recentRows.map((row) => (
                      <tr key={row.id} className="border-b border-border/40 last:border-0">
                        <td className="py-2 pr-3 text-muted-foreground">{telemetryLabel(row)}</td>
                        <td className="py-2 pr-3">{formatValue(row.pressure, "hPa")}</td>
                        <td className="py-2 pr-3">{formatValue(row.temperature, "C")}</td>
                        <td className="py-2 pr-3">{formatValue(row.humidity, "%")}</td>
                        <td className="py-2 pr-3">{formatValue(row.altitude, "m")}</td>
                        <td className="py-2 pr-3">{formatValue(row.windSpeed, "m/s")}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
