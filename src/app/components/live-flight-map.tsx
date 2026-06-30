import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import type { LaunchTelemetryRecord } from "../api/launches";

interface LiveFlightMapProps {
  stationName: string;
  stationLat?: number | null;
  stationLon?: number | null;
  telemetry: LaunchTelemetryRecord[];
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function LiveFlightMap({
  stationName,
  stationLat,
  stationLon,
  telemetry,
}: LiveFlightMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const animationRef = useRef<number>();
  
  // Interpolation state
  const prevPosRef = useRef<{ lat: number; lon: number; alt: number } | null>(null);
  const currentPosRef = useRef<{ lat: number; lon: number; alt: number } | null>(null);
  const interpolationProgressRef = useRef<number>(1);
  const lastUpdateTimeRef = useRef<number>(Date.now());

  // Determine base station coordinates
  const firstPoint = telemetry.find((t) => t.latitude != null && t.longitude != null);
  const baseLat = stationLat ?? firstPoint?.latitude ?? 0;
  const baseLon = stationLon ?? firstPoint?.longitude ?? 0;

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await containerRef.current.requestFullscreen();
    }
  };

  // Analyze phases and burst point
  let maxAlt = -Infinity;
  let burstPoint: LaunchTelemetryRecord | null = null;
  let landingPoint: LaunchTelemetryRecord | null = null;
  
  const validTelemetry = telemetry.filter((t) => t.latitude != null && t.longitude != null && t.altitude != null);
  
  for (const pt of validTelemetry) {
    if (pt.altitude! > maxAlt) {
      maxAlt = pt.altitude!;
      burstPoint = pt;
    }
  }
  
  let currentPhase = "standby";
  if (validTelemetry.length > 0) {
    const latest = validTelemetry[validTelemetry.length - 1];
    
    // Auto-detect phase
    if (burstPoint && latest.id !== burstPoint.id && latest.altitude! < maxAlt - 100) {
      currentPhase = "descending";
      
      // If altitude is very low and barely changing, we might be landed
      const groundAlt = validTelemetry[0].altitude ?? 0;
      if (latest.altitude! < groundAlt + 200) {
        currentPhase = "landing";
        landingPoint = latest;
      }
    } else {
      currentPhase = "ascending";
    }
  }

  // Handle new telemetry for interpolation
  useEffect(() => {
    if (validTelemetry.length > 0) {
      const latest = validTelemetry[validTelemetry.length - 1];
      const newPos = { lat: latest.latitude!, lon: latest.longitude!, alt: latest.altitude! };
      
      if (!currentPosRef.current) {
        // First point
        currentPosRef.current = newPos;
        prevPosRef.current = newPos;
        interpolationProgressRef.current = 1;
      } else if (
        currentPosRef.current.lat !== newPos.lat || 
        currentPosRef.current.lon !== newPos.lon
      ) {
        // New point arrived
        prevPosRef.current = { ...currentPosRef.current };
        currentPosRef.current = newPos;
        interpolationProgressRef.current = 0;
        lastUpdateTimeRef.current = Date.now();
      }
    }
  }, [telemetry]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let resizeObserver: ResizeObserver;

    const render = () => {
      // Handle canvas resize
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * 2 || canvas.height !== rect.height * 2) {
        canvas.width = rect.width * 2;
        canvas.height = rect.height * 2;
      }

      ctx.save();
      ctx.scale(2, 2);
      ctx.clearRect(0, 0, rect.width, rect.height);

      if (validTelemetry.length === 0) {
        ctx.fillStyle = "rgba(148, 163, 184, 0.5)";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Waiting for telemetry data...", rect.width / 2, rect.height / 2);
        ctx.restore();
        animationRef.current = requestAnimationFrame(render);
        return;
      }

      // Calculate Map Bounds
      let maxDistance = 10; // min 10km
      const allLats = [baseLat];
      const allLons = [baseLon];
      
      validTelemetry.forEach((t) => {
        allLats.push(t.latitude!);
        allLons.push(t.longitude!);
        const d = getDistance(baseLat, baseLon, t.latitude!, t.longitude!);
        if (d > maxDistance) maxDistance = d;
      });

      // Add 20% padding to bounds
      const padding = 0.2;
      const minLat = Math.min(...allLats) - padding;
      const maxLat = Math.max(...allLats) + padding;
      const minLon = Math.min(...allLons) - padding;
      const maxLon = Math.max(...allLons) + padding;

      const latToY = (lat: number) => rect.height - ((lat - minLat) / (maxLat - minLat)) * rect.height;
      const lonToX = (lon: number) => ((lon - minLon) / (maxLon - minLon)) * rect.width;

      // Draw grid
      ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 10; i++) {
        const x = (rect.width / 10) * i;
        const y = (rect.height / 10) * i;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rect.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rect.width, y); ctx.stroke();
      }

      const stationX = lonToX(baseLon);
      const stationY = latToY(baseLat);

      // Dynamic distance rings
      const step = Math.max(10, Math.ceil(maxDistance / 3 / 10) * 10);
      const rings = [step, step * 2, step * 3];
      
      ctx.strokeStyle = "rgba(6, 182, 212, 0.15)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.textAlign = "left";
      rings.forEach((dist) => {
        const radius = (dist / 111) / (maxLat - minLat) * rect.height;
        ctx.beginPath();
        ctx.arc(stationX, stationY, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = "rgba(148, 163, 184, 0.5)";
        ctx.font = "10px sans-serif";
        ctx.fillText(`${dist}km`, stationX + radius - 20, stationY - 5);
      });
      ctx.setLineDash([]);

      // Draw Flight Path
      ctx.strokeStyle = "rgba(167, 139, 250, 0.6)"; // Purple-ish
      ctx.lineWidth = 2;
      ctx.beginPath();
      validTelemetry.forEach((t, i) => {
        const x = lonToX(t.longitude!);
        const y = latToY(t.latitude!);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Draw Burst Point
      if (burstPoint && (currentPhase === "descending" || currentPhase === "landing")) {
        const bx = lonToX(burstPoint.longitude!);
        const by = latToY(burstPoint.latitude!);
        ctx.fillStyle = "#ef4444";
        ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#f87171";
        ctx.font = "bold 10px sans-serif";
        ctx.fillText("BURST", bx + 8, by + 3);
      }

      // Draw Landing Point
      if (landingPoint && currentPhase === "landing") {
        const lx = lonToX(landingPoint.longitude!);
        const ly = latToY(landingPoint.latitude!);
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(lx - 4, ly - 4, 8, 8);
        ctx.fillStyle = "#4ade80";
        ctx.font = "bold 10px sans-serif";
        ctx.fillText("LANDING", lx + 8, ly + 3);
      }

      // Draw Station
      ctx.fillStyle = "#06b6d4";
      ctx.beginPath(); ctx.arc(stationX, stationY, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#67e8f9";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(stationName || "Launch Site", stationX + 10, stationY + 4);

      // Interpolate Current Balloon Position
      if (prevPosRef.current && currentPosRef.current) {
        // Advance interpolation (assuming 2000ms polling interval)
        const now = Date.now();
        const elapsed = now - lastUpdateTimeRef.current;
        interpolationProgressRef.current = Math.min(1, elapsed / 2000);
        
        const p = interpolationProgressRef.current;
        // Ease out quad
        const easeP = p * (2 - p);

        const currentLat = prevPosRef.current.lat + (currentPosRef.current.lat - prevPosRef.current.lat) * easeP;
        const currentLon = prevPosRef.current.lon + (currentPosRef.current.lon - prevPosRef.current.lon) * easeP;
        const currentAlt = prevPosRef.current.alt + (currentPosRef.current.alt - prevPosRef.current.alt) * easeP;

        const bx = lonToX(currentLon);
        const by = latToY(currentLat);

        // Balloon Glow
        const gradient = ctx.createRadialGradient(bx, by, 0, bx, by, 15);
        gradient.addColorStop(0, "rgba(6, 182, 212, 0.4)");
        gradient.addColorStop(1, "rgba(6, 182, 212, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath(); ctx.arc(bx, by, 15, 0, Math.PI * 2); ctx.fill();

        // Balloon Core
        ctx.fillStyle = currentPhase === "ascending" ? "#10b981" : currentPhase === "descending" ? "#f59e0b" : "#38bdf8";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(bx, by, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

        // Balloon Altitude Label
        ctx.fillStyle = "#f1f5f9";
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(`${(currentAlt / 1000).toFixed(2)} km`, bx + 12, by - 8);
      }

      ctx.restore();
      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    // Watch for resize events to force re-render smoothly
    if (canvas.parentElement) {
      resizeObserver = new ResizeObserver(() => {
        // Let the render loop pick up the new size naturally
      });
      resizeObserver.observe(canvas.parentElement);
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [validTelemetry, baseLat, baseLon, currentPhase, burstPoint, landingPoint, stationName]);

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col bg-slate-950/80 border border-cyan-500/20 overflow-hidden ${
        isFullscreen ? "h-screen w-screen z-50 rounded-none fixed inset-0" : "h-[450px] w-full rounded-xl"
      }`}
    >
      <div className="absolute top-0 left-0 right-0 p-4 flex items-start justify-between z-10 pointer-events-none">
        <div>
          <h3 className="text-lg font-medium text-foreground">Live Mission Flight Tracking</h3>
          <p className="text-sm text-cyan-400 capitalize flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {currentPhase === "ascending" && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                currentPhase === "ascending" ? "bg-cyan-500" :
                currentPhase === "descending" ? "bg-orange-500" :
                currentPhase === "landing" ? "bg-green-500" : "bg-slate-500"
              }`}></span>
            </span>
            {currentPhase} Phase
          </p>
        </div>
        <button
          onClick={toggleFullscreen}
          className="pointer-events-auto p-2 bg-slate-900/50 hover:bg-slate-800/80 rounded-md border border-border/50 text-muted-foreground transition-colors backdrop-blur-sm"
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 relative w-full h-full">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
      </div>

      <div className="absolute bottom-4 right-4 bg-slate-900/60 backdrop-blur-md border border-border/40 rounded-lg p-3 text-xs pointer-events-none">
        <div className="font-semibold text-slate-300 mb-2">Legend</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#06b6d4]"></div> Launch Site</div>
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#10b981]"></div> Ascending</div>
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#ef4444]"></div> Burst</div>
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]"></div> Descending</div>
          <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-[#22c55e]"></div> Landing</div>
        </div>
      </div>
    </div>
  );
}
