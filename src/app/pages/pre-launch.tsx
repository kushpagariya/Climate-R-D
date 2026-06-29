import { useMemo, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileText,
  Play,
  Radio,
  Save,
  X,
} from "lucide-react";
import { useAuth } from "../auth/use-auth";
import { createLaunchApi, startLaunchApi, uploadLaunchCsvApi, type LaunchRecord, type SurfaceData } from "../api/launches";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { CsvUploadPanel } from "../components/pre-launch/csv-upload-panel";
import type { CsvParseResult } from "../components/pre-launch/csv-utils";

type LaunchForm = {
  station: string;
  launchDate: string;
  launchTime: string;
  balloonId: string;
  radiosondeId: string;
  operator: string;
};

type SurfaceForm = Record<keyof SurfaceData, string>;

const emptySurfaceForm: SurfaceForm = {
  temperature: "",
  pressure: "",
  humidity: "",
  dewPoint: "",
  windSpeed: "",
  windDirection: "",
  latitude: "",
  longitude: "",
  altitude: "",
};

function todayDate() {
  return new Date().toISOString().split("T")[0];
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

function toSurfacePayload(surface: SurfaceForm): SurfaceData {
  const parseField = (value: string) => (value.trim() === "" ? null : Number(value));

  return {
    temperature: parseField(surface.temperature),
    pressure: parseField(surface.pressure),
    humidity: parseField(surface.humidity),
    dewPoint: parseField(surface.dewPoint),
    windSpeed: parseField(surface.windSpeed),
    windDirection: parseField(surface.windDirection),
    latitude: parseField(surface.latitude),
    longitude: parseField(surface.longitude),
    altitude: parseField(surface.altitude),
  };
}

function fromSurfacePayload(surface: SurfaceData): SurfaceForm {
  return {
    temperature: surface.temperature?.toString() ?? "",
    pressure: surface.pressure?.toString() ?? "",
    humidity: surface.humidity?.toString() ?? "",
    dewPoint: surface.dewPoint?.toString() ?? "",
    windSpeed: surface.windSpeed?.toString() ?? "",
    windDirection: surface.windDirection?.toString() ?? "",
    latitude: surface.latitude?.toString() ?? "",
    longitude: surface.longitude?.toString() ?? "",
    altitude: surface.altitude?.toString() ?? "",
  };
}

function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  optional = false,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  optional?: boolean;
}) {
  return (
    <label className="space-y-2">
      <span className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        {label}
        {optional && <span className="normal-case tracking-normal text-muted-foreground/70">optional</span>}
      </span>
      <Input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        className="h-11 border-border/70 bg-slate-950/30"
      />
    </label>
  );
}

function MetadataItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-border/60 bg-slate-950/30 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 min-h-5 text-sm text-foreground">{value || "Not detected"}</div>
    </div>
  );
}

function SurfaceMetric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-slate-950/30 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg text-cyan-100">
        {value || "-"}
        {value && unit ? <span className="ml-1 text-xs text-muted-foreground">{unit}</span> : null}
      </div>
    </div>
  );
}

export function PreLaunchPage() {
  const navigate = useNavigate();
  const { session, setHasSeenPreLaunch } = useAuth();

  const [launchForm, setLaunchForm] = useState<LaunchForm>({
    station: "",
    launchDate: todayDate(),
    launchTime: nowTime(),
    balloonId: "",
    radiosondeId: "",
    operator: "",
  });
  const [surfaceForm, setSurfaceForm] = useState<SurfaceForm>(emptySurfaceForm);
  const [csvResult, setCsvResult] = useState<CsvParseResult | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [savedLaunch, setSavedLaunch] = useState<LaunchRecord | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const isLaunchComplete = useMemo(
    () =>
      Boolean(
        csvResult &&
          launchForm.station.trim() &&
          launchForm.launchDate &&
          launchForm.launchTime &&
          launchForm.radiosondeId.trim(),
      ),
    [csvResult, launchForm],
  );

  const workflowStatus = savedLaunch?.status ?? (csvResult ? "ready" : "draft");

  const handleLaunchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLaunchForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSurfaceChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSurfaceForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const applyParsedResult = (result: CsvParseResult, file: string) => {
    const detectedSonde = result.metadata.sondeNumber?.trim();
    setCsvResult(result);
    setCsvFileName(file);
    setSurfaceForm(fromSurfacePayload(result.surfaceData));
    setLaunchForm((current) => ({
      ...current,
      station: result.metadata.station || current.station,
      launchDate: result.metadata.launchDate || current.launchDate || todayDate(),
      launchTime: result.metadata.launchTime || current.launchTime || nowTime(),
      balloonId: detectedSonde || current.balloonId,
      radiosondeId: detectedSonde || current.radiosondeId,
    }));
    setSavedLaunch(null);
    setError(null);
    setStatusMessage("Sounding file validated. Review metadata and surface observations before creating the launch.");
  };

  const ensureLaunchSaved = async () => {
    if (!session?.token) throw new Error("Sign in again to save this launch.");
    if (!csvResult) throw new Error("Upload and validate a sounding file before creating a launch.");
    if (!isLaunchComplete) {
      throw new Error("Station, launch date, launch time, and sonde number are required.");
    }

    if (savedLaunch) return savedLaunch;

    const response = await createLaunchApi(session.token, {
      ...launchForm,
      balloonId: launchForm.balloonId.trim() || launchForm.radiosondeId.trim(),
      radiosondeId: launchForm.radiosondeId.trim(),
      operator: launchForm.operator.trim() || undefined,
      sondeNumber: launchForm.radiosondeId.trim(),
      sourceFileName: csvFileName || undefined,
      surfaceData: toSurfacePayload(surfaceForm),
      status: "ready",
    });

    setSavedLaunch(response.launch);
    return response.launch;
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setStatusMessage(null);

    try {
      const launch = await ensureLaunchSaved();
      if (csvResult && session?.token) {
        const upload = await uploadLaunchCsvApi(session.token, launch.id, csvResult.rows, {
          metadata: csvResult.metadata,
          fileName: csvFileName || undefined,
        });
        setSurfaceForm(fromSurfacePayload(upload.surfaceData));
        setSavedLaunch((current) =>
          current ? { ...current, status: upload.status, surfaceData: upload.surfaceData } : current,
        );
        setStatusMessage(`Launch created and ${upload.rowCount} telemetry rows were staged for live tracking.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create launch.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStart = async () => {
    setIsStarting(true);
    setError(null);
    setStatusMessage(null);

    try {
      const launch = await ensureLaunchSaved();
      if (csvResult && session?.token) {
        await uploadLaunchCsvApi(session.token, launch.id, csvResult.rows, {
          metadata: csvResult.metadata,
          fileName: csvFileName || undefined,
        });
      }
      if (!session?.token) throw new Error("Sign in again to start tracking.");
      const response = await startLaunchApi(session.token, launch.id);
      setSavedLaunch(response.launch);
      await setHasSeenPreLaunch();
      navigate(`/live-tracking?launchId=${response.launch.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start live tracking.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleSkip = async () => {
    await setHasSeenPreLaunch();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen w-full bg-background p-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant={workflowStatus === "live" ? "default" : "outline"} className="capitalize">
                {workflowStatus}
              </Badge>
              {csvFileName && <span className="text-xs text-muted-foreground">File: {csvFileName}</span>}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Pre-Launch Sounding Intake</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a sounding file, verify detected metadata and surface observations, then create the launch.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/70 transition-colors hover:bg-secondary/60"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {(statusMessage || error) && (
          <div
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
              error
                ? "border-red-400/30 bg-red-400/10 text-red-200"
                : "border-green-400/30 bg-green-400/10 text-green-200"
            }`}
          >
            {error ? <AlertCircle className="mt-0.5 h-4 w-4" /> : <CheckCircle2 className="mt-0.5 h-4 w-4" />}
            {error || statusMessage}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <section className="rounded-lg border border-border/60 bg-card/35 p-5">
              <div className="mb-5 flex items-center gap-3">
                <Database className="h-5 w-5 text-cyan-300" />
                <div>
                  <h2 className="text-lg font-medium">1. Upload Sounding File</h2>
                  <p className="text-sm text-muted-foreground">
                    Supported formats: CSV, TXT, and DAT. Organization Profile Data files are parsed into the platform schema.
                  </p>
                </div>
              </div>
              <CsvUploadPanel onParsed={applyParsedResult} />
            </section>

            <section className="rounded-lg border border-border/60 bg-card/35 p-5">
              <div className="mb-5 flex items-center gap-3">
                <FileText className="h-5 w-5 text-cyan-300" />
                <div>
                  <h2 className="text-lg font-medium">2. Preview Metadata</h2>
                  <p className="text-sm text-muted-foreground">
                    Detected fields are editable before the launch is created.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Station" name="station" value={launchForm.station} onChange={handleLaunchChange} />
                <Field label="Sonde Number" name="radiosondeId" value={launchForm.radiosondeId} onChange={handleLaunchChange} />
                <Field label="Launch Date" name="launchDate" type="date" value={launchForm.launchDate} onChange={handleLaunchChange} />
                <Field label="Launch Time" name="launchTime" type="time" value={launchForm.launchTime} onChange={handleLaunchChange} />
                <Field label="Balloon ID" name="balloonId" value={launchForm.balloonId} onChange={handleLaunchChange} optional />
                <Field label="Operator" name="operator" value={launchForm.operator} onChange={handleLaunchChange} optional />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetadataItem label="Detected Format" value={csvResult?.metadata.sourceFormat?.toUpperCase()} />
                <MetadataItem label="Detected Date" value={csvResult?.metadata.launchDate} />
                <MetadataItem label="Detected Time" value={csvResult?.metadata.launchTime} />
                <MetadataItem label="Detected Sonde" value={csvResult?.metadata.sondeNumber} />
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-lg border border-border/60 bg-card/35 p-5">
              <div className="mb-5 flex items-center gap-3">
                <ClipboardCheck className="h-5 w-5 text-cyan-300" />
                <div>
                  <h2 className="text-lg font-medium">3. Preview Surface Observations</h2>
                  <p className="text-sm text-muted-foreground">Filled from the first valid profile row.</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SurfaceMetric label="Pressure" value={surfaceForm.pressure} unit="hPa" />
                <SurfaceMetric label="Temperature" value={surfaceForm.temperature} unit="C" />
                <SurfaceMetric label="Humidity" value={surfaceForm.humidity} unit="%" />
                <SurfaceMetric label="Dew Point" value={surfaceForm.dewPoint} unit="C" />
                <SurfaceMetric label="Wind Speed" value={surfaceForm.windSpeed} unit="m/s" />
                <SurfaceMetric label="Wind Direction" value={surfaceForm.windDirection} unit="deg" />
                <SurfaceMetric label="Latitude" value={surfaceForm.latitude} />
                <SurfaceMetric label="Longitude" value={surfaceForm.longitude} />
                <SurfaceMetric label="Ground Altitude" value={surfaceForm.altitude} unit="m" />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Field label="Surface Pressure" name="pressure" type="number" value={surfaceForm.pressure} onChange={handleSurfaceChange} optional />
                <Field label="Surface Temperature" name="temperature" type="number" value={surfaceForm.temperature} onChange={handleSurfaceChange} optional />
              </div>
            </section>

            <section className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 p-5">
              <div className="mb-4 flex items-center gap-3">
                <Radio className="h-5 w-5 text-cyan-300" />
                <div>
                  <h2 className="text-lg font-medium">4. Create Launch</h2>
                  <p className="text-sm text-muted-foreground">
                    The current route and collection contracts stay compatible.
                  </p>
                </div>
              </div>
              <div className="grid gap-3">
                <Button type="button" className="gap-2" onClick={handleSave} disabled={isSaving || isStarting || !isLaunchComplete}>
                  <Save className="h-4 w-4" />
                  {isSaving ? "Creating..." : "Create Launch"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={handleStart}
                  disabled={isSaving || isStarting || !isLaunchComplete}
                >
                  <Play className="h-4 w-4" />
                  {isStarting ? "Starting..." : "Create and Start Tracking"}
                </Button>
                <Button type="button" variant="ghost" onClick={handleSkip} disabled={isSaving || isStarting}>
                  Skip to Dashboard
                </Button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
