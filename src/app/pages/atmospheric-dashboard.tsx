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
import {
  generateRadiosondeProfile,
  generateBalloonHistory,
  calculateAtmosphericParameters,
  STATIONS,
  type RadiosondeObservation,
  type BalloonRecord,
} from "../data/radiosonde-data";
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
  fetchRadiosondeHistoryRecords,
  fetchRadiosondeProfile,
  fetchHistoryOverlayProfile,
  saveRadiosondeApi,
} from "../api/radiosonde";
import { useSearchParams } from "react-router";

type TimeSlot = "00:00" | "12:00";

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
          <span className="text-3xl font-light" style={{ color }}>
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
  const today = new Date().toISOString().split("T")[0];
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const queryStation = searchParams.get("station");
  const queryDate = searchParams.get("date");
  const queryTime = searchParams.get("time");
  const queryCompare = searchParams.get("compare");
  const initialStation = STATIONS.some((station) => station.id === queryStation)
    ? queryStation!
    : STATIONS[0].id;
  const initialTime = queryTime === "12:00" ? "12:00" : "00:00";

  const [selectedStation, setSelectedStation] = useState(initialStation);
  const [selectedDate, setSelectedDate] = useState(queryDate || today);
  const [selectedTime, setSelectedTime] = useState<TimeSlot>(initialTime);

  const [compareOpen, setCompareOpen] = useState(queryCompare === "true");
  const [comparePanelData, setComparePanelData] = useState<RadiosondeObservation[] | undefined>(undefined);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const lastStationRef = useRef(selectedStation);
  const lastDateRef = useRef(selectedDate);

  const [data, setData] = useState<RadiosondeObservation[]>(() =>
    generateRadiosondeProfile(selectedDate, selectedTime, selectedStation),
  );
  const [balloonHistory, setBalloonHistory] = useState<BalloonRecord[]>(() =>
    generateBalloonHistory(selectedStation, 14),
  );
  const [historyData, setHistoryData] = useState<RadiosondeObservation[] | undefined>(undefined);

  useEffect(() => {
    if (queryStation && STATIONS.some((station) => station.id === queryStation)) {
      setSelectedStation(queryStation);
    }
    if (queryDate) {
      setSelectedDate(queryDate);
    }
    if (queryTime === "00:00" || queryTime === "12:00") {
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
      const result = await fetchRadiosondeProfile(
        session?.token,
        selectedStation,
        selectedDate,
        selectedTime,
      );
      if (cancelled) return;

      setData(result.profile);

      if (result.source === "mock" && session?.token) {
        void saveRadiosondeApi(session.token, {
          stationId: selectedStation,
          date: selectedDate,
          time: selectedTime,
          observations: result.profile,
          source: "mock",
          recordType: "sounding",
        });
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, selectedStation, selectedTime, refreshKey, session?.token]);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      const records = await fetchRadiosondeHistoryRecords(session?.token, selectedStation);
      if (!cancelled) {
        setBalloonHistory(records);
      }
    }

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [selectedStation, session?.token]);

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
      const profile = await fetchHistoryOverlayProfile(session?.token, record!);
      if (!cancelled) {
        setHistoryData(profile);
      }
    }

    void loadOverlay();
    return () => {
      cancelled = true;
    };
  }, [activeHistoryId, balloonHistory, session?.token]);

  const effectiveCompareData = historyData ?? comparePanelData;

  const params = useMemo(() => calculateAtmosphericParameters(data), [data]);
  const prevParams = useMemo(
    () =>
      effectiveCompareData
        ? calculateAtmosphericParameters(effectiveCompareData)
        : null,
    [effectiveCompareData]
  );

  const station = STATIONS.find((s) => s.id === selectedStation) || STATIONS[0];

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
      void saveRadiosondeApi(session.token, {
        stationId: selectedStation,
        date: selectedDate,
        time: selectedTime,
        observations: data,
        source: "mock",
        recordType: "sounding",
        metadata: {
          label: `${selectedDate} ${selectedTime}`,
        },
      });
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
  const aiConfidence = 80 + Math.round(params.surfaceHumidity / 10);

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
        <div className="max-w-[1800px] mx-auto p-5 space-y-5">
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
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATIONS.map((s) => (
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
                <input
                  type="date"
                  value={selectedDate}
                  max={today}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="h-9 px-3 rounded-md border text-sm"
                  style={{
                    background: "rgba(30,41,59,0.8)",
                    borderColor: "rgba(148,163,184,0.2)",
                    color: "#e2e8f0",
                  }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-slate-400">
                  Sounding Time
                </label>
                <Select
                  value={selectedTime}
                  onValueChange={(v) => setSelectedTime(v as TimeSlot)}
                >
                  <SelectTrigger className="w-[150px] bg-secondary/40 text-sm h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="00:00">00:00 UTC — Midnight</SelectItem>
                    <SelectItem value="12:00">12:00 UTC — Noon</SelectItem>
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
                  <DropdownMenuItem onSelect={handleExport}>
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
          </GlassCard>

          {/* Compare Panel */}
          {compareOpen && (
            <ComparePanel
              stationId={selectedStation}
              primaryDate={selectedDate}
              primaryTime={selectedTime === "00:00" ? ("00:00" as "00:00") : ("12:00" as "12:00")}
              onCompareData={setComparePanelData}
              onClose={() => { setCompareOpen(false); setComparePanelData(undefined); }}
            />
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
              value="0"
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
          <div className="grid lg:grid-cols-2 gap-5">
            <GlassCard>
              <ChartZoomWrapper
                data={data}
                compareData={effectiveCompareData}
                label="Wind Rose"
                badge="POLAR"
              >
                {(sliced, slicedCmp) => (
                  <WindRoseChart data={sliced} compareData={slicedCmp} />
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
                  <WindProfileChart data={sliced} compareData={slicedCmp} />
                )}
              </ChartZoomWrapper>
            </GlassCard>
          </div>

          {/* §03 MOISTURE ANALYTICS */}
          <SectionLabel code="§03" title="MOISTURE ANALYTICS" />
          <div className="grid lg:grid-cols-2 gap-5">
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
                  <MixingRatioChart data={sliced} compareData={slicedCmp} />
                )}
              </ChartZoomWrapper>
            </GlassCard>
          </div>

          {/* §04 ATMOSPHERIC CONDITIONS */}
          <SectionLabel code="§04" title="ATMOSPHERIC CONDITIONS" />
          <div className="grid lg:grid-cols-2 gap-5">
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
                  />
                )}
              </ChartZoomWrapper>
            </GlassCard>
          </div>

          {/* §05 CORRELATION INTELLIGENCE */}
          <SectionLabel code="§05" title="CORRELATION INTELLIGENCE" />
          <GlassCard>
            <CorrelationHeatmap
              data={data}
              compareData={effectiveCompareData}
            />
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
