import { useState, useMemo, useEffect, useRef } from "react";
import { GlassCard } from "../components/glass-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  RefreshCw,
  Download,
  Thermometer,
  Gauge,
  Droplets,
  Wind,
  Layers,
  TrendingUp,
  TrendingDown,
  History,
  GitCompare,
  X,
  ChevronRight,
  Radio,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { AtmosphericProfileChart } from "../components/charts/atmospheric-profile-chart";
import { WindRoseChart } from "../components/charts/wind-rose-chart";
import { WindProfileChart } from "../components/charts/wind-profile-chart";
import { HumidityProfileChart } from "../components/charts/humidity-profile-chart";
import { MixingRatioChart } from "../components/charts/mixing-ratio-chart";
import { PressureProfileChart } from "../components/charts/pressure-profile-chart";
import { TempHumidityScatterChart } from "../components/charts/temp-humidity-scatter";
import { CorrelationHeatmap } from "../components/charts/correlation-heatmap";
import { ChartZoomWrapper } from "../components/chart-zoom-wrapper";
import { ComparePanel } from "../components/compare-panel";
import { useAuth } from "../auth/use-auth";
import { createGraphHistoryApi, getGraphHistoryApi } from "../api/history";
import { createSavedAnalysisApi, getSavedAnalysesApi } from "../api/analysis";
import { createFavoriteApi, getFavoritesApi } from "../api/favorites";
import { logActivityApi } from "../api/activity";
import {
  getDashboardSoundingApi,
  type DashboardAxisLimits,
  type DashboardLaunchOption,
  type DashboardSoundingObservation,
  type DashboardSoundingParameters,
} from "../api/dashboard";
import { useSearchParams } from "react-router";

type TimeSlot = string;
type RadiosondeObservation = DashboardSoundingObservation;
type RadiosondeParameters = DashboardSoundingParameters;
type AxisLimits = DashboardAxisLimits;

interface BalloonRecord {
  id: string;
  date: string;
  time: string;
  stationId: string;
  label: string;
}

const EMPTY_PARAMS: RadiosondeParameters = {
  freezingLevel: 0,
  lcl: 0,
  tropopause: 0,
  surfaceTemperature: 0,
  surfacePressure: 0,
  surfaceHumidity: 0,
  maxWindSpeed: 0,
  maxWindHeight: 0,
  maxAltitude: 0,
  cape: 0,
};

function calculateAtmosphericParameters(data: RadiosondeObservation[]): RadiosondeParameters {
  if (data.length === 0) return EMPTY_PARAMS;

  const freezingLevel = data.find((obs) => obs.temperature <= 0)?.height || 0;
  let lcl = 0;
  for (const obs of data) {
    if (obs.height >= 3000) continue;
    if (obs.temperature - obs.dewPoint < 2) {
      lcl = obs.height;
      break;
    }
  }

  let tropopause = data[data.length - 1]?.height || 0;
  for (let i = 1; i < data.length - 1; i += 1) {
    const heightDelta = (data[i + 1].height - data[i - 1].height) / 1000;
    if (heightDelta === 0) continue;
    const lapseRate = (data[i - 1].temperature - data[i + 1].temperature) / heightDelta;
    if (lapseRate < 2 && data[i].height > 8000) {
      tropopause = data[i].height;
      break;
    }
  }

  const surface = data[0];
  const maxWindSpeed = Math.max(...data.map((obs) => obs.windSpeed));
  const maxWindObs = data.find((obs) => obs.windSpeed === maxWindSpeed) || surface;
  const cape = surface.temperature - surface.dewPoint < 5 ? 1200 : 400;

  return {
    freezingLevel,
    lcl,
    tropopause,
    surfaceTemperature: surface.temperature,
    surfacePressure: surface.pressure,
    surfaceHumidity: surface.relativeHumidity,
    maxWindSpeed,
    maxWindHeight: maxWindObs.height,
    maxAltitude: data[data.length - 1].height,
    cape,
  };
}

function KpiCard({
  icon,
  label,
  value,
  unit,
  sub,
  color,
  delta,
  deltaLabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  sub?: string;
  color: string;
  delta?: number;
  deltaLabel?: string;
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-2 relative overflow-hidden"
      style={{
        background: "rgba(10,20,40,0.85)",
        borderColor: "rgba(148,163,184,0.12)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="flex items-center justify-between">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: `${color}22`, border: `1.5px solid ${color}55` }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
        {delta !== undefined && (
          <div
            className="flex items-center gap-1 text-[11px]"
            style={{ color: positive ? "#4ade80" : "#f87171" }}
          >
            {positive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {positive ? "+" : ""}
            {delta?.toFixed(1)}
            {deltaLabel}
          </div>
        )}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">
          {label}
        </div>
        <div className="flex items-end gap-1">
          <span className="text-2xl md:text-3xl font-light" style={{ color }}>
            {value}
          </span>
          <span className="text-sm text-slate-400 mb-0.5">{unit}</span>
        </div>
        {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
      </div>
      <div
        className="h-0.5 w-full rounded-full mt-1 opacity-60"
        style={{ background: `linear-gradient(to right, ${color}, transparent)` }}
      />
    </div>
  );
}

function SectionLabel({ code, title }: { code: string; title: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-[11px] font-mono text-cyan-500/60">{code}</span>
      <div className="flex-1 h-px bg-slate-700/50" />
      <span className="text-[11px] uppercase tracking-widest text-slate-500">
        {title}
      </span>
    </div>
  );
}

function BalloonHistoryItem({
  record,
  active,
  onClick,
}: {
  record: BalloonRecord;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors"
      style={{
        background: active ? "rgba(6,182,212,0.12)" : "transparent",
        border: active
          ? "1px solid rgba(6,182,212,0.3)"
          : "1px solid transparent",
      }}
    >
      <Radio
        className="w-3.5 h-3.5 flex-shrink-0"
        style={{ color: active ? "#06b6d4" : "#475569" }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-slate-300 truncate">{record.label}</div>
        <div className="text-[10px] text-slate-500">{record.date}</div>
      </div>
      {active && <ChevronRight className="w-3 h-3 text-cyan-400" />}
    </button>
  );
}

export function AtmosphericDashboard() {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const queryStation = searchParams.get("station");
  const queryDate = searchParams.get("date");
  const queryTime = searchParams.get("time");
  const queryCompare = searchParams.get("compare");
  const initialTime = queryTime || "";

  const [selectedStation, setSelectedStation] = useState(queryStation || "");
  const [selectedDate, setSelectedDate] = useState(queryDate || "");
  const [selectedTime, setSelectedTime] = useState<TimeSlot>(initialTime);
  const [availableLaunches, setAvailableLaunches] = useState<DashboardLaunchOption[]>([]);
  const [dashboardMessage, setDashboardMessage] = useState<string | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [serverParams, setServerParams] = useState<RadiosondeParameters | null>(null);
  const [isLoadingSounding, setIsLoadingSounding] = useState(false);

  const [compareOpen, setCompareOpen] = useState(queryCompare === "true");
  const [comparePanelData, setComparePanelData] = useState<RadiosondeObservation[] | undefined>(undefined);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const lastStationRef = useRef(selectedStation);
  const lastDateRef = useRef(selectedDate);

  const [data, setData] = useState<RadiosondeObservation[]>([]);
  const [axisLimits, setAxisLimits] = useState<AxisLimits | undefined>(undefined);
  const [balloonHistory, setBalloonHistory] = useState<BalloonRecord[]>([]);
  const [historyData, setHistoryData] = useState<RadiosondeObservation[] | undefined>(undefined);

  useEffect(() => {
    if (queryStation) {
      setSelectedStation(queryStation);
    }
    if (queryDate) {
      setSelectedDate(queryDate);
    }
    if (queryTime) {
      setSelectedTime(queryTime);
    }
    if (queryCompare === "true") {
      setCompareOpen(true);
      setHistoryOpen(false);
      setActiveHistoryId(null);
    }
  }, [queryCompare, queryDate, queryStation, queryTime]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!session?.token) {
        setData([]);
        setAxisLimits(undefined);
        setServerParams(null);
        setAvailableLaunches([]);
        setDashboardMessage("Sign in to load launch telemetry.");
        return;
      }

      try {
        setIsLoadingSounding(true);
        const result = await getDashboardSoundingApi(session.token, {
          stationId: selectedStation || undefined,
          date: selectedDate || undefined,
          time: selectedTime || undefined,
        });
        if (cancelled) return;

        setAvailableLaunches(result.availableLaunches || []);
        setData(result.profile || []);
        setAxisLimits(result.axisLimits || undefined);
        setServerParams(result.parameters || null);
        setDashboardMessage(result.message || null);
        setDashboardError(null);

        if (result.launch) {
          if (!selectedStation || selectedStation !== result.launch.stationId) {
            setSelectedStation(result.launch.stationId);
          }
          if (!selectedDate || selectedDate !== result.launch.date) {
            setSelectedDate(result.launch.date);
          }
          if (!selectedTime || selectedTime !== result.launch.time) {
            setSelectedTime(result.launch.time);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setData([]);
          setAxisLimits(undefined);
          setServerParams(null);
          setDashboardError(err instanceof Error ? err.message : "Unable to load dashboard telemetry.");
          setDashboardMessage(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSounding(false);
        }
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, selectedStation, selectedTime, refreshKey, session?.token]);

  useEffect(() => {
    const records = availableLaunches
      .filter((launch) => !selectedStation || launch.stationId === selectedStation)
      .map((launch) => ({
        id: launch.id,
        date: launch.date,
        time: launch.time,
        stationId: launch.stationId,
        label: `${launch.date} ${launch.time}`,
      }));
    setBalloonHistory(records);
  }, [availableLaunches, selectedStation]);

  useEffect(() => {
    if (!activeHistoryId) {
      setHistoryData(undefined);
      return;
    }

    let cancelled = false;
    const record = balloonHistory.find((item) => item.id === activeHistoryId);
    if (!record) {
      setHistoryData(undefined);
      return;
    }

    async function loadOverlay() {
      if (!session?.token) return;
      try {
        const response = await getDashboardSoundingApi(session.token, {
          stationId: record!.stationId,
          date: record!.date,
          time: record!.time,
        });
        if (!cancelled) {
          setHistoryData(response.profile?.length ? response.profile : undefined);
        }
      } catch {
        if (!cancelled) {
          setHistoryData(undefined);
        }
      }
    }

    void loadOverlay();
    return () => {
      cancelled = true;
    };
  }, [activeHistoryId, balloonHistory, session?.token]);

  const effectiveCompareData = historyData ?? comparePanelData;

  const clientParams = useMemo(() => calculateAtmosphericParameters(data), [data]);
  const params = serverParams ?? clientParams;
  const prevParams = useMemo(
    () =>
      effectiveCompareData
        ? calculateAtmosphericParameters(effectiveCompareData)
        : null,
    [effectiveCompareData]
  );

  const stationOptions = useMemo(() => {
    const byStation = new Map<string, { id: string; name: string }>();
    availableLaunches.forEach((launch) => {
      if (!launch.stationId) return;
      byStation.set(launch.stationId, {
        id: launch.stationId,
        name: launch.stationName || launch.stationId,
      });
    });
    return Array.from(byStation.values());
  }, [availableLaunches]);

  const dateOptions = useMemo(() => {
    const values = new Set<string>();
    availableLaunches
      .filter((launch) => !selectedStation || launch.stationId === selectedStation)
      .forEach((launch) => {
        if (launch.date) values.add(launch.date);
      });
    return Array.from(values).sort((a, b) => b.localeCompare(a));
  }, [availableLaunches, selectedStation]);

  const timeOptions = useMemo(() => {
    const values = new Set<string>();
    availableLaunches
      .filter((launch) => (!selectedStation || launch.stationId === selectedStation) && (!selectedDate || launch.date === selectedDate))
      .forEach((launch) => {
        if (launch.time) values.add(launch.time);
      });
    return Array.from(values).sort();
  }, [availableLaunches, selectedDate, selectedStation]);

  const station = stationOptions.find((s) => s.id === selectedStation) || {
    id: selectedStation,
    name: selectedStation || "No launch selected",
  };

  useEffect(() => {
    if (!availableLaunches.length) return;
    if (selectedStation && stationOptions.some((s) => s.id === selectedStation)) return;
    setSelectedStation(stationOptions[0]?.id || "");
  }, [availableLaunches.length, selectedStation, stationOptions]);

  useEffect(() => {
    if (!selectedStation || !dateOptions.length) return;
    if (selectedDate && dateOptions.includes(selectedDate)) return;
    setSelectedDate(dateOptions[0]);
  }, [dateOptions, selectedDate, selectedStation]);

  useEffect(() => {
    if (!selectedDate || !timeOptions.length) return;
    if (selectedTime && timeOptions.includes(selectedTime)) return;
    setSelectedTime(timeOptions[0]);
  }, [selectedDate, selectedTime, timeOptions]);

  useEffect(() => {
    if (!session?.token) return;
    void getGraphHistoryApi(session.token, 50);
    void getSavedAnalysesApi(session.token, 50);
    void getFavoritesApi(session.token, 50);
  }, [session?.token]);

  useEffect(() => {
    if (!session?.token) return;
    void createGraphHistoryApi(session.token, {
      stationId: selectedStation,
      date: selectedDate,
      time: selectedTime,
      chartType: "sounding-view",
    });
    void logActivityApi(session.token, {
      action: "view_sounding",
      resourceType: "sounding",
      resourceId: `${selectedStation}:${selectedDate}:${selectedTime}`,
      metadata: {
        stationId: selectedStation,
        date: selectedDate,
        time: selectedTime,
      },
    });
  }, [selectedDate, selectedStation, selectedTime, session?.token]);

  useEffect(() => {
    if (!session?.token) return;
    if (lastStationRef.current !== selectedStation) {
      void logActivityApi(session.token, {
        action: "change_station",
        resourceType: "station",
        resourceId: selectedStation,
      });
      lastStationRef.current = selectedStation;
    }
  }, [selectedStation, session?.token]);

  useEffect(() => {
    if (!session?.token) return;
    if (lastDateRef.current !== selectedDate) {
      void logActivityApi(session.token, {
        action: "change_date",
        resourceType: "sounding_date",
        resourceId: selectedDate,
      });
      lastDateRef.current = selectedDate;
    }
  }, [selectedDate, session?.token]);

  useEffect(() => {
    if (!session?.token || !compareOpen) return;
    void createGraphHistoryApi(session.token, {
      stationId: selectedStation,
      date: selectedDate,
      time: selectedTime,
      chartType: "compare-view",
    });
    void logActivityApi(session.token, {
      action: "open_compare",
      resourceType: "compare",
      metadata: { stationId: selectedStation, date: selectedDate, time: selectedTime },
    });
  }, [compareOpen, selectedDate, selectedStation, selectedTime, session?.token]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!session?.token) return;
      if (!event.ctrlKey || !event.shiftKey) return;

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void createSavedAnalysisApi(session.token, {
          stationId: selectedStation,
          date: selectedDate,
          time: selectedTime,
          comparisonSettings: {
            compareOpen,
            activeHistoryId,
          },
          notes: "Saved via keyboard shortcut Ctrl+Shift+S",
        });
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        const isSounding = Boolean(activeHistoryId);
        void createFavoriteApi(session.token, {
          type: isSounding ? "sounding" : "station",
          refId: isSounding ? activeHistoryId! : selectedStation,
          label: isSounding
            ? `Sounding ${selectedDate} ${selectedTime}`
            : station.name,
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeHistoryId,
    compareOpen,
    selectedDate,
    selectedStation,
    selectedTime,
    session?.token,
    station.name,
  ]);

  const handleExport = () => {
    if (data.length === 0) return;

    const rows = [
      [
        "Pressure(hPa)",
        "Height(m)",
        "Temp(°C)",
        "DewPt(°C)",
        "RH(%)",
        "Wind(m/s)",
        "Dir(°)",
      ].join(","),
      ...data.map((o) =>
        [
          o.pressure,
          o.height,
          o.temperature,
          o.dewPoint,
          o.relativeHumidity,
          o.windSpeed,
          o.windDirection,
        ].join(",")
      ),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `radiosonde_${selectedStation}_${selectedDate}_${selectedTime}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    if (session?.token) {
      void createSavedAnalysisApi(session.token, {
        stationId: selectedStation,
        date: selectedDate,
        time: selectedTime,
        comparisonSettings: {
          compareOpen,
          activeHistoryId,
        },
        notes: "Auto-saved on CSV export",
      });
    }
  };

  const tempDelta = prevParams
    ? params.surfaceTemperature - prevParams.surfaceTemperature
    : undefined;
  const pressDelta = prevParams
    ? params.surfacePressure - prevParams.surfacePressure
    : undefined;
  const rhDelta = prevParams
    ? params.surfaceHumidity - prevParams.surfaceHumidity
    : undefined;
  const windDelta = prevParams
    ? params.maxWindSpeed - prevParams.maxWindSpeed
    : undefined;
  const hasProfile = data.length > 0;
  const statusMessage = dashboardError || dashboardMessage;
  const geoHeight = hasProfile ? data[0]?.height ?? 0 : 0;
  const aiConfidence = hasProfile ? Math.min(99, 80 + Math.round(params.surfaceHumidity / 10)) : 0;

  return (
    <div className="flex" style={{ minHeight: "100%", background: "transparent" }}>
      {/* History Sidebar */}
      {historyOpen && (
        <div
          className="w-64 flex-shrink-0 border-r flex flex-col"
          style={{
            background: "rgba(8,15,30,0.97)",
            borderColor: "rgba(148,163,184,0.1)",
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: "rgba(148,163,184,0.1)" }}
          >
            <div>
              <div className="text-sm text-foreground">Previous Balloons</div>
              <div className="text-[10px] text-slate-500">{station.name}</div>
            </div>
            <button
              onClick={() => setHistoryOpen(false)}
              className="p-1 hover:bg-slate-700 rounded"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {balloonHistory.map((rec) => (
              <BalloonHistoryItem
                key={rec.id}
                record={rec}
                active={activeHistoryId === rec.id}
                onClick={() => {
                  setActiveHistoryId((prev) =>
                    prev === rec.id ? null : rec.id
                  );
                  if (compareOpen) { setCompareOpen(false); setComparePanelData(undefined); }
                }}
              />
            ))}
          </div>
          {activeHistoryId && (
            <div
              className="p-3 border-t text-[10px] text-slate-400"
              style={{ borderColor: "rgba(148,163,184,0.1)" }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-6 border-t-2"
                  style={{ borderColor: "#f97316", borderStyle: "dashed" }}
                />
                <span>Orange dashed = selected balloon overlay</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1800px] mx-auto p-4 space-y-4 md:p-5 md:space-y-5">
          {/* §00 */}
          <SectionLabel code="§00" title="KEY PERFORMANCE INDICATORS" />

          {/* Controls */}
          <GlassCard>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-slate-400">
                  Station
                </label>
                <Select
                  value={selectedStation}
                  onValueChange={setSelectedStation}
                >
                  <SelectTrigger className="w-[240px] bg-secondary/40 text-sm h-9">
                    <SelectValue placeholder="Select launch station" />
                  </SelectTrigger>
                  <SelectContent>
                    {stationOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-slate-400">
                  Date
                </label>
                <Select
                  value={selectedDate}
                  onValueChange={setSelectedDate}
                  disabled={dateOptions.length === 0}
                >
                  <SelectTrigger className="w-[160px] bg-secondary/40 text-sm h-9">
                    <SelectValue placeholder="Select date" />
                  </SelectTrigger>
                  <SelectContent>
                    {dateOptions.map((dateOption) => (
                      <SelectItem key={dateOption} value={dateOption}>
                        {dateOption}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-slate-400">
                  Sounding Time
                </label>
                <Select
                  value={selectedTime}
                  onValueChange={(v) => setSelectedTime(v as TimeSlot)}
                  disabled={timeOptions.length === 0}
                >
                  <SelectTrigger className="w-[150px] bg-secondary/40 text-sm h-9">
                    <SelectValue placeholder="Select time" />
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

              <div className="flex-1" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-9 rounded-md border border-border/70 bg-secondary/30 px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                  >
                    <div className="flex items-center gap-2">
                      <MoreHorizontal className="h-4 w-4" />
                      Tools
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    className={historyOpen ? "text-cyan-400" : ""}
                    onSelect={() => {
                      setHistoryOpen((v) => !v);
                      setActiveHistoryId(null);
                    }}
                  >
                    <History className="w-4 h-4" />
                    {historyOpen ? "Hide History" : "History"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={compareOpen ? "text-orange-400" : ""}
                    onSelect={() => {
                      setCompareOpen((v) => !v);
                      if (compareOpen) setComparePanelData(undefined);
                      if (activeHistoryId) setActiveHistoryId(null);
                    }}
                  >
                    <GitCompare className="w-4 h-4" />
                    {compareOpen ? "Hide Compare" : "Compare"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setRefreshKey((k) => k + 1)}>
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      if (!hasProfile) {
                        event.preventDefault();
                        return;
                      }
                      handleExport();
                    }}
                  >
                    <Download className="w-4 h-4" />
                    Export
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>


            {activeHistoryId && (
              <div
                className="flex items-center gap-3 mt-3 pt-3 border-t"
                style={{ borderColor: "rgba(249,115,22,0.3)" }}
              >
                <Radio className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-[11px] text-orange-400">
                  Balloon overlay:{" "}
                  {
                    balloonHistory.find((r) => r.id === activeHistoryId)?.label
                  }
                </span>
                <button
                  onClick={() => setActiveHistoryId(null)}
                  className="ml-auto p-0.5 hover:bg-slate-700 rounded"
                >
                  <X className="w-3 h-3 text-slate-400" />
                </button>
              </div>
            )}

            {(isLoadingSounding || statusMessage) && (
              <div
                className="mt-3 rounded-lg border px-3 py-2 text-xs"
                style={{
                  borderColor: dashboardError ? "rgba(248,113,113,0.35)" : "rgba(148,163,184,0.16)",
                  background: dashboardError ? "rgba(127,29,29,0.18)" : "rgba(15,23,42,0.45)",
                  color: dashboardError ? "#fca5a5" : "#94a3b8",
                }}
              >
                {isLoadingSounding ? "Loading launch telemetry..." : statusMessage}
              </div>
            )}
          </GlassCard>

          {/* Compare Panel */}
          {compareOpen && (
            <ComparePanel
              stationId={selectedStation}
              primaryDate={selectedDate}
              primaryTime={selectedTime}
              availableLaunches={availableLaunches}
              onCompareData={setComparePanelData}
              onClose={() => { setCompareOpen(false); setComparePanelData(undefined); }}
            />
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <KpiCard
              icon={<Thermometer className="w-4 h-4" />}
              label="Temperature"
              value={params.surfaceTemperature.toFixed(1)}
              unit="°C"
              sub="Surface Level"
              color="#ef4444"
              delta={tempDelta}
              deltaLabel="°C"
            />
            <KpiCard
              icon={<Gauge className="w-4 h-4" />}
              label="Pressure"
              value={params.surfacePressure.toFixed(1)}
              unit="hPa"
              sub="Surface Level"
              color="#22c55e"
              delta={pressDelta}
              deltaLabel=" hPa"
            />
            <KpiCard
              icon={<Droplets className="w-4 h-4" />}
              label="Rel. Humidity"
              value={params.surfaceHumidity.toFixed(1)}
              unit="%"
              sub="Surface Level"
              color="#3b82f6"
              delta={rhDelta}
              deltaLabel="%"
            />
            <KpiCard
              icon={<Wind className="w-4 h-4" />}
              label="Wind Speed"
              value={params.maxWindSpeed.toFixed(1)}
              unit="m/s"
              sub="Max altitude"
              color="#eab308"
              delta={windDelta}
              deltaLabel=" m/s"
            />
            <KpiCard
              icon={<Layers className="w-4 h-4" />}
              label="Geo. Height"
              value={geoHeight.toFixed(0)}
              unit="m ASL"
              sub="Surface"
              color="#a855f7"
            />
            <KpiCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="AI Confidence"
              value={`${aiConfidence}`}
              unit="%"
              sub="QC Score"
              color="#06b6d4"
            />
          </div>

          {/* §01 ATMOSPHERIC PROFILE */}
          <SectionLabel code="§01" title="ATMOSPHERIC PROFILE" />
          <GlassCard>
            <ChartZoomWrapper
              data={data}
              compareData={effectiveCompareData}
              label="Atmospheric Profile"
              badge="SKEW-T"
            >
              {(sliced, slicedCmp) => (
                <>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Temperature · Dew Point · Ice Point vs Geopotential Height
                  </p>
                  <AtmosphericProfileChart
                    data={sliced}
                    compareData={slicedCmp}
                    params={params}
                    axisLimits={axisLimits}
                  />
                  <div className="flex flex-wrap gap-5 mt-3 text-[11px] text-slate-400">
                    <span>
                      <span className="text-yellow-400 mr-1">●</span>
                      Tropopause:{" "}
                      <strong className="text-slate-200">
                        ~{(params.tropopause / 1000).toFixed(1)} km
                      </strong>
                    </span>
                    <span>
                      <span className="text-cyan-400 mr-1">●</span>
                      Freezing Level:{" "}
                      <strong className="text-slate-200">
                        ~{(params.freezingLevel / 1000).toFixed(1)} km
                      </strong>
                    </span>
                    <span>
                      <span className="text-green-400 mr-1">●</span>
                      LCL:{" "}
                      <strong className="text-slate-200">
                        ~{(params.lcl / 1000).toFixed(1)} km
                      </strong>
                    </span>
                    <span>
                      <span className="text-red-400 mr-1">●</span>
                      CAPE:{" "}
                      <strong className="text-slate-200">
                        {params.cape} J/kg
                      </strong>
                    </span>
                  </div>
                </>
              )}
            </ChartZoomWrapper>
          </GlassCard>

          {/* §02 WIND ANALYTICS */}
          <SectionLabel code="§02" title="WIND ANALYTICS" />
          <div className="grid lg:grid-cols-2 gap-4 md:gap-5">
            <GlassCard>
              <ChartZoomWrapper
                data={data}
                compareData={effectiveCompareData}
                label="Wind Rose"
                badge="POLAR"
              >
                {(sliced, slicedCmp) => (
                  <WindRoseChart data={sliced} compareData={slicedCmp} axisLimits={axisLimits} />
                )}
              </ChartZoomWrapper>
            </GlassCard>
            <GlassCard>
              <ChartZoomWrapper
                data={data}
                compareData={effectiveCompareData}
                label="Wind Profile"
                badge="BARBS"
              >
                {(sliced, slicedCmp) => (
                  <WindProfileChart data={sliced} compareData={slicedCmp} axisLimits={axisLimits} />
                )}
              </ChartZoomWrapper>
            </GlassCard>
          </div>

          {/* §03 MOISTURE ANALYTICS */}
          <SectionLabel code="§03" title="MOISTURE ANALYTICS" />
          <div className="grid lg:grid-cols-2 gap-4 md:gap-5">
            <GlassCard>
              <ChartZoomWrapper
                data={data}
                compareData={effectiveCompareData}
                label="Humidity Profile"
                badge="RH/RHI"
              >
                {(sliced, slicedCmp) => (
                  <HumidityProfileChart
                    data={sliced}
                    compareData={slicedCmp}
                    axisLimits={axisLimits}
                  />
                )}
              </ChartZoomWrapper>
            </GlassCard>
            <GlassCard>
              <ChartZoomWrapper
                data={data}
                compareData={effectiveCompareData}
                label="Mixing Ratio"
                badge="g/kg"
              >
                {(sliced, slicedCmp) => (
                  <MixingRatioChart data={sliced} compareData={slicedCmp} axisLimits={axisLimits} />
                )}
              </ChartZoomWrapper>
            </GlassCard>
          </div>

          {/* §04 ATMOSPHERIC CONDITIONS */}
          <SectionLabel code="§04" title="ATMOSPHERIC CONDITIONS" />
          <div className="grid lg:grid-cols-2 gap-4 md:gap-5">
            <GlassCard>
              <ChartZoomWrapper
                data={data}
                compareData={effectiveCompareData}
                label="Pressure Profile"
                badge="hPa"
              >
                {(sliced, slicedCmp) => (
                  <PressureProfileChart
                    data={sliced}
                    compareData={slicedCmp}
                    axisLimits={axisLimits}
                  />
                )}
              </ChartZoomWrapper>
            </GlassCard>
            <GlassCard>
              <ChartZoomWrapper
                data={data}
                compareData={effectiveCompareData}
                label="Temp–Humidity Scatter"
                badge="T-φ"
              >
                {(sliced, slicedCmp) => (
                  <TempHumidityScatterChart
                    data={sliced}
                    compareData={slicedCmp}
                    axisLimits={axisLimits}
                  />
                )}
              </ChartZoomWrapper>
            </GlassCard>
          </div>

          {/* §05 CORRELATION INTELLIGENCE */}
          <SectionLabel code="§05" title="CORRELATION INTELLIGENCE" />
          <GlassCard>
            {hasProfile ? (
              <CorrelationHeatmap
                data={data}
                compareData={effectiveCompareData}
              />
            ) : (
              <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center">
                <div className="text-sm text-slate-300">No telemetry data</div>
                <div className="max-w-sm text-xs text-slate-500">
                  Select a launch with stored telemetry to render the correlation matrix.
                </div>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
