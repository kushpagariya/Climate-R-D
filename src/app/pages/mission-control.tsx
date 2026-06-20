import { useEffect, useMemo, useRef, useState } from "react";
import { GlassCard } from "../components/glass-card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { 
  Activity,
  Gauge,
  Thermometer,
  Droplets,
  Wind,
  Navigation,
  MapPin,
  Clock,
  TrendingUp,
  Maximize2,
  AlertTriangle,
  Info,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { 
  generateLiveMissionData,
  detectAtmosphericEvents,
  STATIONS
} from "../data/radiosonde-data";
import { BalloonMap } from "../components/balloon-map";

type ReplaySpeed = 1 | 2 | 5;

export function MissionControl() {
  const [elapsedMinutes] = useState(45);
  const [isLive, setIsLive] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState<ReplaySpeed>(1);
  const mapCardRef = useRef<HTMLDivElement>(null);
  const station = STATIONS[0];

  const missionData = useMemo(
    () => generateLiveMissionData(station, elapsedMinutes),
    [elapsedMinutes, station]
  );
  const { position, trajectory, observations } = missionData;
  const events = detectAtmosphericEvents(observations);
  const finalReplayIndex = Math.max(trajectory.length - 1, 0);
  const safeReplayIndex = Math.min(replayIndex, finalReplayIndex);
  const displayPosition = isLive
    ? position
    : trajectory[safeReplayIndex] ?? position;
  const telemetryPositionIndex = isLive ? finalReplayIndex : safeReplayIndex;
  const visibleReplayIndex = isLive ? finalReplayIndex : safeReplayIndex;
  const replayProgress = trajectory.length > 0
    ? Math.round(((visibleReplayIndex + 1) / trajectory.length) * 100)
    : 0;

  useEffect(() => {
    if (!isPlaying || trajectory.length === 0) return;

    const intervalId = window.setInterval(() => {
      setReplayIndex((currentIndex) => {
        if (currentIndex >= finalReplayIndex) {
          setIsPlaying(false);
          return finalReplayIndex;
        }

        const nextIndex = currentIndex + 1;
        if (nextIndex >= finalReplayIndex) {
          setIsPlaying(false);
        }
        return nextIndex;
      });
    }, 1000 / replaySpeed);

    return () => window.clearInterval(intervalId);
  }, [finalReplayIndex, isPlaying, replaySpeed, trajectory.length]);

  const handlePlay = () => {
    if (trajectory.length === 0) return;
    setIsLive(false);
    setReplayIndex((currentIndex) =>
      currentIndex >= finalReplayIndex ? 0 : currentIndex
    );
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleReset = () => {
    setReplayIndex(0);
    setIsPlaying(false);
    setIsLive(false);
  };

  const handleLiveMode = () => {
    setIsPlaying(false);
    setIsLive(true);
  };
  
  // Current observation based on altitude
  const currentObs = observations.reduce(
  (closest, obs) =>
    Math.abs(obs.height - displayPosition.altitude) <
    Math.abs(closest.height - displayPosition.altitude)
      ? obs
      : closest,
  observations[0]
);

  // Calculate metrics
  const displayedMinutes = isLive || trajectory.length === 0
    ? elapsedMinutes
    : Math.max(
        0,
        Math.round(
          (displayPosition.timestamp.getTime() - trajectory[0].timestamp.getTime()) /
            60000
        )
      );
  const missionDuration = `${Math.floor(displayedMinutes / 60)}h ${displayedMinutes % 60}m`;

  const distanceTravelled = Math.sqrt(
    Math.pow((displayPosition.lat - station.latitude) * 111, 2) +
    Math.pow((displayPosition.lon - station.longitude) * 111, 2)
  ).toFixed(1);

  // Previous position
  const prevPosition =
    trajectory.length > 0
      ? trajectory[Math.max(telemetryPositionIndex - 1, 0)]
      : displayPosition;

  // Vertical Rate (m/s)
  const verticalRate =
    telemetryPositionIndex > 0
      ? (
          displayPosition.altitude -
          prevPosition.altitude
        ) /
        (
          (displayPosition.timestamp.getTime() -
            prevPosition.timestamp.getTime()) /
          1000
        )
      : 0;

  // Horizontal Speed (m/s)
  const distanceKmBetweenPoints =
    Math.sqrt(
      Math.pow(
        (displayPosition.lat - prevPosition.lat) * 111,
        2
      ) +
      Math.pow(
        (displayPosition.lon - prevPosition.lon) * 111,
        2
      )
    );

  const deltaTimeSec =
    telemetryPositionIndex > 0
      ? (
          displayPosition.timestamp.getTime() -
          prevPosition.timestamp.getTime()
        ) / 1000
      : 1;

  const horizontalSpeed =
    deltaTimeSec > 0
      ? (distanceKmBetweenPoints * 1000) /
        deltaTimeSec
      : 0;

  // Heading (degrees)
  const dLon =
    displayPosition.lon - prevPosition.lon;

  const dLat =
    displayPosition.lat - prevPosition.lat;

  const currentHeading =
    telemetryPositionIndex > 0
      ? (
          Math.atan2(dLon, dLat) *
            180 /
            Math.PI +
          360
        ) %
        360
      : 0;

  // Max altitude reached
  const maxAltitude = Math.max(
    ...observations.map(
      (o) => o.height
    )
  );
  const headingText =
    currentHeading >= 337.5 || currentHeading < 22.5
      ? "N"
      : currentHeading < 67.5
      ? "NE"
      : currentHeading < 112.5
      ? "E"
      : currentHeading < 157.5
      ? "SE"
      : currentHeading < 202.5
      ? "S"
      : currentHeading < 247.5
      ? "SW"
      : currentHeading < 292.5
      ? "W"
      : "NW";

    const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'text-red-400 bg-red-400/10 border-red-400/20';

      case 'medium':
        return 'text-orange-400 bg-orange-400/10 border-orange-400/20';

      default:
        return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    }
  };
  
  return (
    <div className="max-w-[1800px] mx-auto p-6 space-y-6">
      {/* Live Status Banner */}
      <GlassCard className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-cyan-500/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Activity className="w-8 h-8 text-cyan-400" />
              {isLive && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
              )}
            </div>
            <div>
              <h2 className="text-xl">
                <span className="text-cyan-400">
                  {isLive ? "LIVE" : isPlaying ? "REPLAYING" : "REPLAY PAUSED"}
                </span>{" "}
                Radiosonde Mission Control
              </h2>
              <p className="text-sm text-muted-foreground">
                {station.name} • Launch: {new Date(Date.now() - elapsedMinutes * 60000).toLocaleTimeString()}
              </p>
            </div>
          </div>
          
          <Badge className="px-4 py-2 text-base" variant={displayPosition.phase === 'ascending' ? 'default' : 'secondary'}>
            {displayPosition.phase === 'ascending' ? '↑ ASCENDING' :
             displayPosition.phase === 'descending' ? '↓ DESCENDING' :
             '✓ COMPLETE'}
          </Badge>
        </div>
      </GlassCard>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column: Map and Telemetry */}
        <div className="lg:col-span-2 space-y-6">
          {/* Flight Map */}
          <div ref={mapCardRef}>
            <GlassCard>
              <div className="space-y-4">

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg">Mission Flight Tracking</h3>
                    <p className="text-sm text-muted-foreground">
                      Live position and historical motion replay
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      mapCardRef.current?.requestFullscreen();
                    }}
                    className="p-2 rounded-lg hover:bg-white/10 transition"
                  >
                    <Maximize2 className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>

                <BalloonMap
                  station={station}
                  position={displayPosition}
                  trajectory={trajectory}
                  travelledIndex={isLive ? finalReplayIndex : safeReplayIndex}
                />

                <div className="rounded-xl border border-cyan-500/20 bg-slate-950/40 p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="gap-2"
                        onClick={handlePlay}
                        disabled={isPlaying || trajectory.length <= 1}
                      >
                        <Play className="w-4 h-4" />
                        Play
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={handlePause}
                        disabled={!isPlaying}
                      >
                        <Pause className="w-4 h-4" />
                        Pause
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={handleReset}
                        disabled={trajectory.length === 0}
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reset
                      </Button>
                      <Button
                        type="button"
                        variant={isLive ? "default" : "outline"}
                        size="sm"
                        onClick={handleLiveMode}
                      >
                        Live
                      </Button>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      Replay speed
                      <select
                        value={replaySpeed}
                        onChange={(event) => {
                          const speed = Number(event.target.value);
                          if (speed === 1 || speed === 2 || speed === 5) {
                            setReplaySpeed(speed);
                          }
                        }}
                        className="h-9 rounded-md border border-border/60 bg-secondary/60 px-3 text-sm text-foreground outline-none focus:border-cyan-500/60"
                        aria-label="Replay speed"
                      >
                        <option value={1}>1x</option>
                        <option value={2}>2x</option>
                        <option value={5}>5x</option>
                      </select>
                    </label>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Replay Progress</span>
                      <span className="font-mono text-cyan-300">
                        {trajectory.length === 0 ? 0 : visibleReplayIndex + 1} / {trajectory.length}
                        <span className="ml-3 text-foreground">{replayProgress}%</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-[width] duration-200"
                        style={{ width: `${replayProgress}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">
                      Current Telemetry
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="rounded-lg bg-secondary/30 p-3">
                        <div className="text-[10px] text-muted-foreground">Altitude</div>
                        <div className="text-sm text-cyan-300">{(displayPosition.altitude / 1000).toFixed(2)} km</div>
                      </div>
                      <div className="rounded-lg bg-secondary/30 p-3">
                        <div className="text-[10px] text-muted-foreground">Latitude</div>
                        <div className="text-sm text-cyan-300">{displayPosition.lat.toFixed(5)}°</div>
                      </div>
                      <div className="rounded-lg bg-secondary/30 p-3">
                        <div className="text-[10px] text-muted-foreground">Longitude</div>
                        <div className="text-sm text-blue-300">{displayPosition.lon.toFixed(5)}°</div>
                      </div>
                      <div className="rounded-lg bg-secondary/30 p-3">
                        <div className="text-[10px] text-muted-foreground">Mission Phase</div>
                        <div className="text-sm text-foreground capitalize">{displayPosition.phase}</div>
                      </div>
                      <div className="rounded-lg bg-secondary/30 p-3 col-span-2 md:col-span-1">
                        <div className="text-[10px] text-muted-foreground">Timestamp</div>
                        <div className="text-sm text-foreground">{displayPosition.timestamp.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </GlassCard>
          </div>

          {/* Live Telemetry */}
          <GlassCard>
            <h3 className="text-lg mb-4">Live Telemetry Data</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Gauge className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs">Pressure</span>
                </div>
                <div className="text-2xl text-cyan-400">{currentObs.pressure.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground">hPa</div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  <span className="text-xs">Altitude</span>
                </div>
                <div className="text-2xl text-blue-400">{(displayPosition.altitude / 1000).toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">km</div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Thermometer className="w-4 h-4 text-teal-400" />
                  <span className="text-xs">Temperature</span>
                </div>
                <div className="text-2xl text-teal-400">{currentObs.temperature.toFixed(1)}°</div>
                <div className="text-xs text-muted-foreground">Celsius</div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Droplets className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs">Humidity</span>
                </div>
                <div className="text-2xl text-indigo-400">{currentObs.relativeHumidity.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground">%</div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Wind className="w-4 h-4 text-purple-400" />
                  <span className="text-xs">Wind</span>
                </div>
                <div className="text-2xl text-purple-400">{currentObs.windSpeed.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground">m/s @ {currentObs.windDirection.toFixed(0)}°</div>
              </div>
            </div>
          </GlassCard>

          {/* Detected Events */}
          <GlassCard>
            <h3 className="text-lg mb-4">Detected Atmospheric Events</h3>
            <div className="grid md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
              {events.map((event, i) => (
                <div 
                  key={i}
                  className={`p-4 rounded-lg border ${getSeverityColor(event.severity)}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {event.severity === 'high' ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : (
                        <Info className="w-4 h-4" />
                      )}
                      <h4 className="text-sm">{event.type}</h4>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {event.severity.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-xs opacity-80 mb-2">{event.description}</p>
                  <div className="text-xs opacity-60">
                    {(event.heightRange[0] / 1000).toFixed(1)} - {(event.heightRange[1] / 1000).toFixed(1)} km • 
                    {' '}{event.pressureRange[1].toFixed(0)} - {event.pressureRange[0].toFixed(0)} hPa
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        {/* Right Column: Metrics and Summary */}
        <div className="space-y-6">
          {/* Flight Metrics */}
          <GlassCard>
            <h3 className="text-lg mb-4">Flight Metrics</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-border/30">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm">Duration</span>
                </div>
                <span className="text-foreground">{missionDuration}</span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-border/30">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  <span className="text-sm">Distance</span>
                </div>
                <span className="text-foreground">{distanceTravelled} km</span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-border/30">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-sm">Vertical Rate</span>
                </div>
                <span className={verticalRate > 0 ? 'text-green-400' : 'text-orange-400'}>
                  {verticalRate > 0 ? '+' : ''}{verticalRate.toFixed(1)} m/s
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-border/30">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Wind className="w-4 h-4" />
                  <span className="text-sm">Horizontal Speed</span>
                </div>
                <span className="text-foreground">{horizontalSpeed.toFixed(1)} m/s</span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-border/30">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Navigation className="w-4 h-4" />
                  <span className="text-sm">Heading</span>
                </div>
                <span className="text-foreground">
                  {currentHeading.toFixed(0)}° ({headingText})
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-border/30">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Maximize2 className="w-4 h-4" />
                  <span className="text-sm">Max Altitude</span>
                </div>
                <span className="text-foreground">{(maxAltitude / 1000).toFixed(1)} km</span>
              </div>

            </div>
          </GlassCard>

          {/* Sounding Summary */}
          <GlassCard>
            <h3 className="text-lg mb-4">Sounding Summary</h3>
            <div className="space-y-3">
              <div className="p-3 bg-secondary/30 rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Surface Conditions</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Temp: <span className="text-cyan-400">{observations[0].temperature.toFixed(1)}°C</span></div>
                  <div>Press: <span className="text-blue-400">{observations[0].pressure.toFixed(1)} hPa</span></div>
                  <div>RH: <span className="text-teal-400">{observations[0].relativeHumidity.toFixed(1)}%</span></div>
                  <div>Wind: <span className="text-purple-400">{observations[0].windSpeed.toFixed(1)} m/s</span></div>
                </div>
              </div>

              <div className="p-3 bg-secondary/30 rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Atmospheric Levels</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Freezing Level:</span>
                    <span className="text-cyan-400">
                      {(
                        (observations.find(
                          o => o.temperature <= 0
                        )?.height ?? 0) / 1000
                      ).toFixed(1)} km
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tropopause:</span>
                    <span className="text-purple-400">~11.0 km</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-secondary/30 rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Position</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Latitude:</span>
                    <span className="text-cyan-400">{displayPosition.lat.toFixed(4)}°N</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Longitude:</span>
                    <span className="text-blue-400">{displayPosition.lon.toFixed(4)}°E</span>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
