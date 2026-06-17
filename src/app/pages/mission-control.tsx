import { useState, useEffect } from "react";
import { GlassCard } from "../components/glass-card";
import { Badge } from "../components/ui/badge";
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
  Info
} from "lucide-react";
import { 
  generateLiveMissionData,
  detectAtmosphericEvents,
  STATIONS,
  type BalloonPosition
} from "../data/radiosonde-data";
import { BalloonMap } from "../components/balloon-map";

export function MissionControl() {
  const [elapsedMinutes, setElapsedMinutes] = useState(45);
  const [isLive, setIsLive] = useState(true);
  const station = STATIONS[0];

  const missionData = generateLiveMissionData(station, elapsedMinutes);
  const { position, trajectory, observations } = missionData;
  const events = detectAtmosphericEvents(observations);
  
  // Current observation based on altitude
  const currentObs = observations.find(obs => 
    Math.abs(obs.height - position.altitude) < 500
  ) || observations[0];

  // Calculate metrics
  const missionDuration = `${Math.floor(elapsedMinutes / 60)}h ${elapsedMinutes % 60}m`;
  const distanceTravelled = Math.sqrt(
    Math.pow((position.lat - station.latitude) * 111, 2) +
    Math.pow((position.lon - station.longitude) * 111, 2)
  ).toFixed(1);
  
  const verticalRate = position.phase === 'ascending' ? 5.0 : -10.0;
  const horizontalSpeed = 15.5;
  const currentHeading = 45;
  const maxAltitude = observations[observations.length - 1].height;
  // Simulate live updates
  useEffect(() => {
    if (!isLive) return;
    
    const interval = setInterval(() => {
      setElapsedMinutes(prev => {
        if (prev >= 120) {
          setIsLive(false);
          return 120;
        }
        return prev + 1;
      });
    }, 2000); // Update every 2 seconds

    return () => clearInterval(interval);
  }, [isLive]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-400 bg-red-400/10 border-red-400/20';
      case 'medium': return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
      default: return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
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
                <span className="text-cyan-400">LIVE</span> Radiosonde Mission Control
              </h2>
              <p className="text-sm text-muted-foreground">
                {station.name} • Launch: {new Date(Date.now() - elapsedMinutes * 60000).toLocaleTimeString()}
              </p>
            </div>
          </div>
          
          <Badge className="px-4 py-2 text-base" variant={position.phase === 'ascending' ? 'default' : 'secondary'}>
            {position.phase === 'ascending' ? '↑ ASCENDING' : 
             position.phase === 'descending' ? '↓ DESCENDING' : 
             '✓ COMPLETE'}
          </Badge>
        </div>
      </GlassCard>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column: Map and Telemetry */}
        <div className="lg:col-span-2 space-y-6">
          {/* Flight Map */}
          <GlassCard>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg">Live Flight Tracking</h3>
                  <p className="text-sm text-muted-foreground">
                    Real-time balloon position and trajectory
                  </p>
                </div>
                <Maximize2 className="w-5 h-5 text-muted-foreground cursor-pointer hover:text-foreground" />
              </div>
              <BalloonMap 
                station={station} 
                position={position} 
                trajectory={trajectory} 
              />
            </div>
          </GlassCard>

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
                <div className="text-2xl text-blue-400">{(position.altitude / 1000).toFixed(2)}</div>
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
                <span className="text-foreground">{currentHeading}° (NE)</span>
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
                      {(observations.find(o => o.temperature <= 0)?.height || 0 / 1000).toFixed(1)} km
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
                    <span className="text-cyan-400">{position.lat.toFixed(4)}°N</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Longitude:</span>
                    <span className="text-blue-400">{position.lon.toFixed(4)}°E</span>
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
