import { useState, useMemo, useEffect } from "react";
import { X, Plus, Trash2, GitCompare } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { generateRadiosondeProfile, type RadiosondeObservation } from "../data/radiosonde-data";

export type CompareMode = "off" | "quick" | "custom";
export type QuickRange = "week" | "month" | "year";

export interface CustomPeriod {
  id: string;
  startDate: string;
  endDate: string;
  time: "00:00" | "12:00";
  label: string;
  color: string;
}

interface Props {
  stationId: string;
  primaryDate: string;
  primaryTime: "00:00" | "12:00";
  onCompareData: (data: RadiosondeObservation[] | undefined) => void;
  onClose: () => void;
}

const COLORS = ["#f97316", "#a855f7", "#22c55e", "#eab308", "#ec4899", "#06b6d4"];

function offsetDate(base: string, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

// Average multiple soundings into one "merged" profile
function averageProfiles(profiles: RadiosondeObservation[][]): RadiosondeObservation[] {
  if (profiles.length === 0) return [];
  const base = profiles[0];
  return base.map((obs, i) => {
    const keys: (keyof RadiosondeObservation)[] = [
      "pressure", "height", "temperature", "dewPoint", "icePoint",
      "relativeHumidity", "humidityWrtIce", "mixingRatio", "windDirection", "windSpeed",
    ];
    const avg: Record<string, number> = {};
    keys.forEach(k => {
      avg[k as string] = profiles.reduce((sum, p) => sum + (p[i]?.[k] as number ?? 0), 0) / profiles.length;
    });
    return avg as unknown as RadiosondeObservation;
  });
}

export function ComparePanel({ stationId, primaryDate, primaryTime, onCompareData, onClose }: Props) {
  const today = new Date().toISOString().split("T")[0];

  const [mode, setMode] = useState<"quick" | "custom">("quick");
  const [quickRange, setQuickRange] = useState<QuickRange>("week");
  const [quickTime, setQuickTime] = useState<"00:00" | "12:00">(primaryTime);

  // Custom: list of date-range periods to compare
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

  // --- Quick compare logic ---
  const quickData = useMemo<RadiosondeObservation[]>(() => {
    const daysMap: Record<QuickRange, number> = { week: 7, month: 30, year: 365 };
    const days = daysMap[quickRange];
    // Collect one sounding per unit (weekly→7 days, monthly→30 days, yearly→12 months)
    const step = quickRange === "year" ? 30 : 1;
    const profiles: RadiosondeObservation[][] = [];
    for (let d = step; d <= days; d += step) {
      const date = offsetDate(primaryDate, d);
      if (date <= today) {
        profiles.push(generateRadiosondeProfile(date, quickTime, stationId));
      }
    }
    return averageProfiles(profiles);
  }, [quickRange, quickTime, primaryDate, stationId, today]);

  // --- Custom compare logic ---
  const customData = useMemo<RadiosondeObservation[]>(() => {
    if (customPeriods.length === 0) return [];
    const allProfiles: RadiosondeObservation[][] = [];
    customPeriods.forEach(period => {
      const start = new Date(period.startDate);
      const end = new Date(period.endDate);
      const periodProfiles: RadiosondeObservation[][] = [];
      const cur = new Date(start);
      while (cur <= end) {
        const dateStr = cur.toISOString().split("T")[0];
        if (dateStr <= today) {
          periodProfiles.push(generateRadiosondeProfile(dateStr, period.time, stationId));
        }
        cur.setDate(cur.getDate() + 1);
      }
      if (periodProfiles.length > 0) {
        allProfiles.push(...periodProfiles);
      }
    });
    return averageProfiles(allProfiles);
  }, [customPeriods, stationId, today]);

  const activeData = mode === "quick" ? quickData : customData;

  // Push data up whenever it changes
  useEffect(() => {
    onCompareData(
      activeData.length > 0
        ? activeData
        : undefined
    );
  }, [activeData, onCompareData]);

  const addPeriod = () => {
    const idx = customPeriods.length;
    setCustomPeriods(prev => [
      ...prev,
      {
        id: `p${Date.now()}`,
        startDate: offsetDate(primaryDate, (idx + 1) * 10),
        endDate: offsetDate(primaryDate, (idx + 1) * 10 - 5),
        time: primaryTime,
        label: `Period ${String.fromCharCode(65 + idx)}`,
        color: COLORS[idx % COLORS.length],
      },
    ]);
  };

  const removePeriod = (id: string) => {
    setCustomPeriods(prev => prev.filter(p => p.id !== id));
  };

  const updatePeriod = (id: string, field: keyof CustomPeriod, value: string) => {
    setCustomPeriods(prev =>
      prev.map(p => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  return (
    <div
      className="rounded-xl border p-4 space-y-4"
      style={{ background: "rgba(10,20,40,0.9)", borderColor: "rgba(249,115,22,0.4)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-orange-400" />
          <span className="text-sm text-orange-400 uppercase tracking-widest">Compare Mode</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded">
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: "rgba(0,0,0,0.4)" }}>
        {(["quick", "custom"] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="flex-1 py-1.5 rounded-md text-xs uppercase tracking-widest transition-colors"
            style={
              mode === m
                ? { background: "rgba(249,115,22,0.25)", color: "#f97316", border: "1px solid rgba(249,115,22,0.4)" }
                : { color: "#64748b" }
            }
          >
            {m === "quick" ? "Quick Range" : "Custom Periods"}
          </button>
        ))}
      </div>

      {/* ── QUICK MODE ── */}
      {mode === "quick" && (
        <div className="space-y-3">
          <div className="text-[10px] text-slate-400 uppercase tracking-widest">
            Average of all soundings over selected range vs current
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-orange-400/70">Range</label>
              <div className="flex gap-1">
                {(["week", "month", "year"] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setQuickRange(r)}
                    className="px-3 py-1.5 rounded text-xs uppercase tracking-widest transition-colors"
                    style={
                      quickRange === r
                        ? { background: "rgba(249,115,22,0.25)", color: "#f97316", border: "1px solid rgba(249,115,22,0.4)" }
                        : { background: "rgba(30,41,59,0.6)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)" }
                    }
                  >
                    {r === "week" ? "1 Week" : r === "month" ? "1 Month" : "1 Year"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-orange-400/70">Time</label>
              <Select value={quickTime} onValueChange={(v) => setQuickTime(v as "00:00" | "12:00")}>
                <SelectTrigger className="w-[130px] h-8 text-xs" style={{ borderColor: "rgba(249,115,22,0.3)", color: "#fed7aa", background: "rgba(30,41,59,0.8)" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="00:00">00:00 UTC</SelectItem>
                  <SelectItem value="12:00">12:00 UTC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="text-[10px] text-slate-500">
            Comparing <span className="text-cyan-400">{primaryDate}</span> against average of{" "}
            <span className="text-orange-400">
              past {quickRange === "week" ? "7 days" : quickRange === "month" ? "30 days" : "365 days"}
            </span>
          </div>
        </div>
      )}

      {/* ── CUSTOM MODE ── */}
      {mode === "custom" && (
        <div className="space-y-3">
          <div className="text-[10px] text-slate-400 uppercase tracking-widest">
            Define custom date ranges — all periods are averaged and overlaid
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
                    {period.label} · From
                  </label>
                  <input
                    type="date"
                    value={period.startDate}
                    max={period.endDate}
                    onChange={(e) => updatePeriod(period.id, "startDate", e.target.value)}
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
                    onChange={(e) => updatePeriod(period.id, "endDate", e.target.value)}
                    className="h-8 px-2 rounded text-xs"
                    style={{ background: "rgba(30,41,59,0.8)", borderColor: "rgba(148,163,184,0.2)", color: "#e2e8f0", border: "1px solid" }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-widest text-slate-400">Time</label>
                  <Select value={period.time} onValueChange={(v) => updatePeriod(period.id, "time", v)}>
                    <SelectTrigger className="w-[110px] h-8 text-xs" style={{ background: "rgba(30,41,59,0.8)", borderColor: "rgba(148,163,184,0.2)", color: "#e2e8f0" }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="00:00">00:00 UTC</SelectItem>
                      <SelectItem value="12:00">12:00 UTC</SelectItem>
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
            {customPeriods.length} period{customPeriods.length !== 1 ? "s" : ""} · averaged and overlaid in orange
          </div>
        </div>
      )}
    </div>
  );
}
