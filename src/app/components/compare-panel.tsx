import { useEffect, useMemo, useState } from "react";
import { X, Plus, Trash2, GitCompare } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { useAuth } from "../auth/use-auth";
import {
  getDashboardSoundingApi,
  type DashboardLaunchOption,
  type DashboardSoundingObservation,
} from "../api/dashboard";

export type CompareMode = "off" | "quick" | "custom";
export type QuickRange = "week" | "month" | "year";

export interface CustomPeriod {
  id: string;
  startDate: string;
  endDate: string;
  time: string;
  label: string;
  color: string;
}

interface Props {
  stationId: string;
  primaryDate: string;
  primaryTime: string;
  availableLaunches: DashboardLaunchOption[];
  onCompareData: (data: DashboardSoundingObservation[] | undefined) => void;
  onClose: () => void;
}

const COLORS = ["#f97316", "#a855f7", "#22c55e", "#eab308", "#ec4899", "#06b6d4"];

function offsetDate(base: string, days: number): string {
  if (!base) return "";
  const d = new Date(base);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function averageProfiles(
  profiles: DashboardSoundingObservation[][],
): DashboardSoundingObservation[] {
  if (profiles.length === 0) return [];

  const minLength = Math.min(...profiles.map((profile) => profile.length));
  const base = profiles[0].slice(0, minLength);
  return base.map((_, i) => {
    const keys: (keyof DashboardSoundingObservation)[] = [
      "pressure",
      "height",
      "temperature",
      "dewPoint",
      "icePoint",
      "relativeHumidity",
      "humidityWrtIce",
      "mixingRatio",
      "windDirection",
      "windSpeed",
    ];
    const avg: Record<string, number> = {};
    keys.forEach((key) => {
      avg[key] = profiles.reduce((sum, profile) => sum + profile[i][key], 0) / profiles.length;
    });
    return avg as unknown as DashboardSoundingObservation;
  });
}

export function ComparePanel({
  stationId,
  primaryDate,
  primaryTime,
  availableLaunches,
  onCompareData,
  onClose,
}: Props) {
  const { session } = useAuth();
  const today = new Date().toISOString().split("T")[0];

  const [mode, setMode] = useState<"quick" | "custom">("quick");
  const [quickRange, setQuickRange] = useState<QuickRange>("week");
  const [quickTime, setQuickTime] = useState<string>(primaryTime);
  const [activeData, setActiveData] = useState<DashboardSoundingObservation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);

  const [customPeriods, setCustomPeriods] = useState<CustomPeriod[]>([
    {
      id: "p1",
      startDate: offsetDate(primaryDate, 7),
      endDate: offsetDate(primaryDate, 1),
      time: primaryTime,
      label: "Period A",
      color: COLORS[0],
    },
  ]);

  const timeOptions = useMemo(() => {
    const values = new Set<string>();
    availableLaunches
      .filter((launch) => !stationId || launch.stationId === stationId)
      .forEach((launch) => {
        if (launch.time) values.add(launch.time);
      });
    return Array.from(values).sort();
  }, [availableLaunches, stationId]);

  useEffect(() => {
    if (primaryTime) setQuickTime(primaryTime);
  }, [primaryTime]);

  useEffect(() => {
    if (quickTime && timeOptions.includes(quickTime)) return;
    if (timeOptions[0]) setQuickTime(timeOptions[0]);
  }, [quickTime, timeOptions]);

  useEffect(() => {
    setCustomPeriods((periods) =>
      periods.map((period, index) => ({
        ...period,
        startDate: period.startDate || offsetDate(primaryDate, (index + 1) * 7),
        endDate: period.endDate || offsetDate(primaryDate, 1),
        time: period.time || primaryTime,
      })),
    );
  }, [primaryDate, primaryTime]);

  useEffect(() => {
    let cancelled = false;

    async function loadComparison() {
      if (!session?.token || !stationId || !primaryDate) {
        setActiveData([]);
        setEmptyMessage("Select a launch before comparing soundings.");
        return;
      }

      const daysMap: Record<QuickRange, number> = { week: 7, month: 30, year: 365 };
      const primary = new Date(primaryDate);
      if (Number.isNaN(primary.getTime())) {
        setActiveData([]);
        setEmptyMessage("Select a valid launch date before comparing soundings.");
        return;
      }

      const candidates = availableLaunches.filter((launch) => {
        if (launch.stationId !== stationId || !launch.date || !launch.time) return false;
        if (launch.date >= primaryDate || launch.date > today) return false;

        if (mode === "quick") {
          const earliest = offsetDate(primaryDate, daysMap[quickRange]);
          return launch.time === quickTime && launch.date >= earliest;
        }

        return customPeriods.some(
          (period) =>
            launch.time === period.time &&
            launch.date >= period.startDate &&
            launch.date <= period.endDate,
        );
      });

      if (candidates.length === 0) {
        setActiveData([]);
        setEmptyMessage("No real comparison launches exist for the selected range.");
        return;
      }

      setIsLoading(true);
      setEmptyMessage(null);
      try {
        const profiles: DashboardSoundingObservation[][] = [];
        for (const launch of candidates.slice(0, 20)) {
          const response = await getDashboardSoundingApi(session.token, {
            stationId: launch.stationId,
            date: launch.date,
            time: launch.time,
          });
          if (cancelled) return;
          if (response.profile?.length) {
            profiles.push(response.profile);
          }
        }

        if (cancelled) return;
        const averaged = averageProfiles(profiles);
        setActiveData(averaged);
        setEmptyMessage(
          averaged.length > 0
            ? null
            : "Comparison launches were found, but none have stored telemetry.",
        );
      } catch (err) {
        if (!cancelled) {
          setActiveData([]);
          setEmptyMessage(err instanceof Error ? err.message : "Unable to load comparison telemetry.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadComparison();
    return () => {
      cancelled = true;
    };
  }, [
    availableLaunches,
    customPeriods,
    mode,
    primaryDate,
    quickRange,
    quickTime,
    session?.token,
    stationId,
    today,
  ]);

  useEffect(() => {
    onCompareData(activeData.length > 0 ? activeData : undefined);
  }, [activeData, onCompareData]);

  const addPeriod = () => {
    const idx = customPeriods.length;
    setCustomPeriods((prev) => [
      ...prev,
      {
        id: `p${Date.now()}`,
        startDate: offsetDate(primaryDate, (idx + 1) * 10),
        endDate: offsetDate(primaryDate, (idx + 1) * 10 - 5),
        time: primaryTime || timeOptions[0] || "",
        label: `Period ${String.fromCharCode(65 + idx)}`,
        color: COLORS[idx % COLORS.length],
      },
    ]);
  };

  const removePeriod = (id: string) => {
    setCustomPeriods((prev) => prev.filter((period) => period.id !== id));
  };

  const updatePeriod = (id: string, field: keyof CustomPeriod, value: string) => {
    setCustomPeriods((prev) =>
      prev.map((period) => (period.id === id ? { ...period, [field]: value } : period)),
    );
  };

  return (
    <div
      className="rounded-xl border p-4 space-y-4"
      style={{ background: "rgba(10,20,40,0.9)", borderColor: "rgba(249,115,22,0.4)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-orange-400" />
          <span className="text-sm text-orange-400 uppercase tracking-widest">Compare Mode</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded">
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      <div className="flex gap-1 p-1 rounded-lg" style={{ background: "rgba(0,0,0,0.4)" }}>
        {(["quick", "custom"] as const).map((modeOption) => (
          <button
            key={modeOption}
            onClick={() => setMode(modeOption)}
            className="flex-1 py-1.5 rounded-md text-xs uppercase tracking-widest transition-colors"
            style={
              mode === modeOption
                ? { background: "rgba(249,115,22,0.25)", color: "#f97316", border: "1px solid rgba(249,115,22,0.4)" }
                : { color: "#64748b" }
            }
          >
            {modeOption === "quick" ? "Quick Range" : "Custom Periods"}
          </button>
        ))}
      </div>

      {mode === "quick" && (
        <div className="space-y-3">
          <div className="text-[10px] text-slate-400 uppercase tracking-widest">
            Average of real stored soundings over selected range vs current
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-orange-400/70">Range</label>
              <div className="flex gap-1">
                {(["week", "month", "year"] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setQuickRange(range)}
                    className="px-3 py-1.5 rounded text-xs uppercase tracking-widest transition-colors"
                    style={
                      quickRange === range
                        ? { background: "rgba(249,115,22,0.25)", color: "#f97316", border: "1px solid rgba(249,115,22,0.4)" }
                        : { background: "rgba(30,41,59,0.6)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)" }
                    }
                  >
                    {range === "week" ? "1 Week" : range === "month" ? "1 Month" : "1 Year"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-orange-400/70">Time</label>
              <Select value={quickTime} onValueChange={setQuickTime} disabled={timeOptions.length === 0}>
                <SelectTrigger className="w-[130px] h-8 text-xs" style={{ borderColor: "rgba(249,115,22,0.3)", color: "#fed7aa", background: "rgba(30,41,59,0.8)" }}>
                  <SelectValue placeholder="Time" />
                </SelectTrigger>
                <SelectContent>
                  {timeOptions.map((timeOption) => (
                    <SelectItem key={timeOption} value={timeOption}>
                      {timeOption} UTC
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="text-[10px] text-slate-500">
            Comparing <span className="text-cyan-400">{primaryDate || "selected launch"}</span> against stored launches from the past{" "}
            <span className="text-orange-400">
              {quickRange === "week" ? "7 days" : quickRange === "month" ? "30 days" : "365 days"}
            </span>
          </div>
        </div>
      )}

      {mode === "custom" && (
        <div className="space-y-3">
          <div className="text-[10px] text-slate-400 uppercase tracking-widest">
            Define custom date ranges from real stored launches
          </div>
          <div className="space-y-2">
            {customPeriods.map((period) => (
              <div
                key={period.id}
                className="flex flex-wrap items-end gap-2 p-3 rounded-lg"
                style={{ background: "rgba(0,0,0,0.3)", borderLeft: `3px solid ${period.color}` }}
              >
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-widest" style={{ color: period.color }}>
                    {period.label} From
                  </label>
                  <input
                    type="date"
                    value={period.startDate}
                    max={period.endDate || today}
                    onChange={(event) => updatePeriod(period.id, "startDate", event.target.value)}
                    className="h-8 px-2 rounded text-xs"
                    style={{ background: "rgba(30,41,59,0.8)", borderColor: "rgba(148,163,184,0.2)", color: "#e2e8f0", border: "1px solid" }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-widest text-slate-400">To</label>
                  <input
                    type="date"
                    value={period.endDate}
                    min={period.startDate}
                    max={today}
                    onChange={(event) => updatePeriod(period.id, "endDate", event.target.value)}
                    className="h-8 px-2 rounded text-xs"
                    style={{ background: "rgba(30,41,59,0.8)", borderColor: "rgba(148,163,184,0.2)", color: "#e2e8f0", border: "1px solid" }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-widest text-slate-400">Time</label>
                  <Select value={period.time} onValueChange={(value) => updatePeriod(period.id, "time", value)} disabled={timeOptions.length === 0}>
                    <SelectTrigger className="w-[110px] h-8 text-xs" style={{ background: "rgba(30,41,59,0.8)", borderColor: "rgba(148,163,184,0.2)", color: "#e2e8f0" }}>
                      <SelectValue placeholder="Time" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.map((timeOption) => (
                        <SelectItem key={timeOption} value={timeOption}>
                          {timeOption} UTC
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {customPeriods.length > 1 && (
                  <button
                    onClick={() => removePeriod(period.id)}
                    className="p-1.5 mb-0.5 hover:bg-red-900/30 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {customPeriods.length < 4 && (
            <button
              onClick={addPeriod}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors w-full justify-center"
              style={{ border: "1px dashed rgba(249,115,22,0.4)", color: "#f97316" }}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Period
            </button>
          )}
          <div className="text-[10px] text-slate-500">
            {customPeriods.length} period{customPeriods.length !== 1 ? "s" : ""} averaged and overlaid in orange
          </div>
        </div>
      )}

      {(isLoading || emptyMessage) && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{
            background: "rgba(15,23,42,0.55)",
            borderColor: "rgba(249,115,22,0.22)",
            color: "#94a3b8",
          }}
        >
          {isLoading ? "Loading comparison telemetry..." : emptyMessage}
        </div>
      )}
    </div>
  );
}
