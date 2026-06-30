import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Maximize2, Minimize2, Plus, Minus, Crosshair, Navigation, Wifi, WifiOff, Activity } from "lucide-react";
import type { LaunchTelemetryRecord } from "../api/launches";

interface LiveFlightMapProps {
  stationName: string;
  stationLat?: number | null;
  stationLon?: number | null;
  telemetry: LaunchTelemetryRecord[];
}

// Math Utilities
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

function easeOutQuad(t: number) {
  return t * (2 - t);
}

const PHASE_COLORS = {
  launch: "#06b6d4",
  ascending: "#10b981",
  burst: "#f97316",
  descending: "#eab308",
  landing: "#3b82f6",
};

const RINGS = [5, 10, 20, 40, 80, 160, 320, 640];

export function LiveFlightMap({
  stationName,
  stationLat,
  stationLon,
  telemetry,
}: LiveFlightMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // UI State
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [autoFollow, setAutoFollow] = useState(true);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  
  // Tooltip State
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [isHoveringBalloon, setIsHoveringBalloon] = useState(false);

  // Time tracking
  const [timeSinceLastPacket, setTimeSinceLastPacket] = useState(0);

  // Animation & Caching Refs
  const animationRef = useRef<number>();
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pathCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastRenderedPointsCount = useRef(0);
  
  // Interpolation state
  const prevPosRef = useRef<{ lat: number; lon: number; alt: number } | null>(null);
  const targetPosRef = useRef<{ lat: number; lon: number; alt: number } | null>(null);
  const currentInterpPosRef = useRef<{ lat: number; lon: number; alt: number } | null>(null);
  const interpStartRef = useRef<number>(Date.now());
  const lastPacketTimeRef = useRef<number>(Date.now());

  const validTelemetry = useMemo(
    () => telemetry.filter((t) => t.latitude != null && t.longitude != null && t.altitude != null),
    [telemetry]
  );

  // Derived Data
  const baseLat = stationLat ?? validTelemetry[0]?.latitude ?? 0;
  const baseLon = stationLon ?? validTelemetry[0]?.longitude ?? 0;

  const flightData = useMemo(() => {
    let maxAlt = -Infinity;
    let burstIndex = -1;
    let maxAscentRate = 0;
    let totalDist = 0;
    
    for (let i = 0; i < validTelemetry.length; i++) {
      const pt = validTelemetry[i];
      if (pt.altitude! > maxAlt) {
        maxAlt = pt.altitude!;
        burstIndex = i;
      }
      
      if (i > 0) {
        const prev = validTelemetry[i-1];
        const dt = ((pt.timestamp ? new Date(pt.timestamp).getTime() : 0) - (prev.timestamp ? new Date(prev.timestamp).getTime() : 0)) / 1000;
        if (dt > 0) {
          const vVel = (pt.altitude! - prev.altitude!) / dt;
          if (vVel > maxAscentRate) maxAscentRate = vVel;
        }
        totalDist += getDistance(prev.latitude!, prev.longitude!, pt.latitude!, pt.longitude!);
      }
    }

    const groundAlt = validTelemetry[0]?.altitude ?? 0;
    
    // Assign phases
    const pointsWithPhase = validTelemetry.map((pt, i) => {
      let phase = "ascending";
      if (burstIndex !== -1 && i === burstIndex) phase = "burst";
      else if (burstIndex !== -1 && i > burstIndex) {
        if (pt.altitude! <= groundAlt + 200) phase = "landing";
        else phase = "descending";
      }
      return { ...pt, phase };
    });

    const latest = pointsWithPhase[pointsWithPhase.length - 1];
    
    let vertVel = 0;
    let horizVel = 0;
    if (pointsWithPhase.length > 1) {
      const prev = pointsWithPhase[pointsWithPhase.length - 2];
      const dt = ((latest.timestamp ? new Date(latest.timestamp).getTime() : Date.now()) - (prev.timestamp ? new Date(prev.timestamp).getTime() : Date.now() - 2000)) / 1000;
      if (dt > 0) {
        vertVel = (latest.altitude! - prev.altitude!) / dt;
        horizVel = (getDistance(prev.latitude!, prev.longitude!, latest.latitude!, latest.longitude!) * 1000) / dt;
      }
    }
    
    const flightDuration = latest && validTelemetry[0] 
      ? ((latest.timestamp ? new Date(latest.timestamp).getTime() : Date.now()) - (validTelemetry[0].timestamp ? new Date(validTelemetry[0].timestamp).getTime() : Date.now())) / 1000 
      : 0;
      
    const avgAscentRate = burstIndex > 0 
      ? (maxAlt - groundAlt) / (((validTelemetry[burstIndex].timestamp ? new Date(validTelemetry[burstIndex].timestamp).getTime() : 0) - (validTelemetry[0].timestamp ? new Date(validTelemetry[0].timestamp).getTime() : 0)) / 1000)
      : vertVel;

    return {
      points: pointsWithPhase,
      maxAlt,
      burstPoint: burstIndex !== -1 ? pointsWithPhase[burstIndex] : null,
      latest,
      totalDist,
      vertVel,
      horizVel,
      maxAscentRate,
      avgAscentRate,
      flightDuration,
    };
  }, [validTelemetry]);

  // Handle telemetry updates
  useEffect(() => {
    if (flightData.latest) {
      const { latitude, longitude, altitude } = flightData.latest;
      const newPos = { lat: latitude!, lon: longitude!, alt: altitude! };
      
      if (!targetPosRef.current) {
        targetPosRef.current = newPos;
        prevPosRef.current = newPos;
        currentInterpPosRef.current = newPos;
      } else if (
        targetPosRef.current.lat !== newPos.lat || 
        targetPosRef.current.lon !== newPos.lon
      ) {
        prevPosRef.current = currentInterpPosRef.current || targetPosRef.current;
        targetPosRef.current = newPos;
        interpStartRef.current = Date.now();
        lastPacketTimeRef.current = Date.now();
      }
    }
  }, [flightData.latest]);

  // Connection Indicator Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeSinceLastPacket(Math.floor((Date.now() - lastPacketTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fullscreen Handler
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await containerRef.current.requestFullscreen();
  };

  const handleZoomIn = () => { setZoomLevel(z => Math.min(z * 1.5, 10)); setAutoFollow(false); };
  const handleZoomOut = () => { setZoomLevel(z => Math.max(z / 1.5, 0.5)); setAutoFollow(false); };
  const handleReset = () => { setZoomLevel(1); panOffsetRef.current = { x: 0, y: 0 }; setAutoFollow(true); };
  const handleAutoFollow = () => { setAutoFollow(true); };

  // Setup Offscreen Canvases
  const getCanvases = (w: number, h: number) => {
    if (!bgCanvasRef.current) bgCanvasRef.current = document.createElement("canvas");
    if (!pathCanvasRef.current) pathCanvasRef.current = document.createElement("canvas");
    
    if (bgCanvasRef.current.width !== w || bgCanvasRef.current.height !== h) {
      bgCanvasRef.current.width = w; bgCanvasRef.current.height = h;
      pathCanvasRef.current.width = w; pathCanvasRef.current.height = h;
      lastRenderedPointsCount.current = 0; // Force full redraw on resize
    }
    return { bgCtx: bgCanvasRef.current.getContext("2d")!, pathCtx: pathCanvasRef.current.getContext("2d")! };
  };

  // Main Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let resizeObserver: ResizeObserver;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      const cw = rect.width * pixelRatio;
      const ch = rect.height * pixelRatio;

      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
        lastRenderedPointsCount.current = 0;
      }

      ctx.save();
      ctx.clearRect(0, 0, cw, ch);

      if (flightData.points.length === 0) {
        // Empty State: Radar Sweep
        const time = Date.now() / 1000;
        const cx = cw / 2;
        const cy = ch / 2;
        const r = Math.min(cw, ch) * 0.3;
        
        ctx.strokeStyle = "rgba(6, 182, 212, 0.2)";
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        
        ctx.fillStyle = "rgba(6, 182, 212, 0.1)";
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, time * Math.PI, (time + 0.5) * Math.PI); ctx.fill();

        ctx.fillStyle = "rgba(148, 163, 184, 0.8)";
        ctx.font = `${14 * pixelRatio}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("Waiting for Telemetry...", cx, cy - 20);
        ctx.font = `${11 * pixelRatio}px sans-serif`;
        ctx.fillStyle = "rgba(148, 163, 184, 0.5)";
        ctx.fillText("Simulation Ready. Stream will appear here after launch.", cx, cy + 10);
        
        ctx.restore();
        animationRef.current = requestAnimationFrame(render);
        return;
      }

      // Calculate Map Bounds dynamically
      let maxDistFromBase = 10;
      const allLats = [baseLat];
      const allLons = [baseLon];
      
      flightData.points.forEach((t) => {
        allLats.push(t.latitude!);
        allLons.push(t.longitude!);
        const d = getDistance(baseLat, baseLon, t.latitude!, t.longitude!);
        if (d > maxDistFromBase) maxDistFromBase = d;
      });

      const padding = 0.2 / zoomLevel;
      let minLat = Math.min(...allLats) - padding;
      let maxLat = Math.max(...allLats) + padding;
      let minLon = Math.min(...allLons) - padding;
      let maxLon = Math.max(...allLons) + padding;

      // Coordinate transforms
      const latToY = (lat: number) => ch - ((lat - minLat) / (maxLat - minLat)) * ch;
      const lonToX = (lon: number) => ((lon - minLon) / (maxLon - minLon)) * cw;

      // Interpolate Balloon Position
      let currentLat = baseLat;
      let currentLon = baseLon;
      let currentAlt = 0;
      
      if (prevPosRef.current && targetPosRef.current) {
        const elapsed = Date.now() - interpStartRef.current;
        const p = Math.min(1, elapsed / 2000); // 2s polling assumption
        const easeP = easeOutQuad(p);
        currentLat = prevPosRef.current.lat + (targetPosRef.current.lat - prevPosRef.current.lat) * easeP;
        currentLon = prevPosRef.current.lon + (targetPosRef.current.lon - prevPosRef.current.lon) * easeP;
        currentAlt = prevPosRef.current.alt + (targetPosRef.current.alt - prevPosRef.current.alt) * easeP;
        currentInterpPosRef.current = { lat: currentLat, lon: currentLon, alt: currentAlt };
      }

      const bx = lonToX(currentLon);
      const by = latToY(currentLat);

      // Auto Follow Pan
      if (autoFollow) {
        const cx = cw / 2;
        const cy = ch / 2;
        panOffsetRef.current.x += (cx - bx) * 0.1;
        panOffsetRef.current.y += (cy - by) * 0.1;
      }

      ctx.translate(panOffsetRef.current.x, panOffsetRef.current.y);
      const { bgCtx, pathCtx } = getCanvases(cw, ch);

      // 1. Draw Background (Grid, Rings, Labels) if needed
      if (lastRenderedPointsCount.current === 0) {
        bgCtx.clearRect(0, 0, cw, ch);
        
        // Coordinate Grid
        bgCtx.strokeStyle = "rgba(148, 163, 184, 0.05)";
        bgCtx.lineWidth = 1;
        bgCtx.fillStyle = "rgba(148, 163, 184, 0.4)";
        bgCtx.font = `${10 * pixelRatio}px sans-serif`;
        
        for (let i = 1; i < 5; i++) {
          const x = (cw / 5) * i;
          const y = (ch / 5) * i;
          
          bgCtx.beginPath(); bgCtx.moveTo(x, 0); bgCtx.lineTo(x, ch); bgCtx.stroke();
          bgCtx.beginPath(); bgCtx.moveTo(0, y); bgCtx.lineTo(cw, y); bgCtx.stroke();

          // Labels (simplified)
          const latVal = maxLat - ((maxLat - minLat) * (i / 5));
          const lonVal = minLon + ((maxLon - minLon) * (i / 5));
          bgCtx.fillText(`${Math.abs(latVal).toFixed(2)}°${latVal >= 0 ? 'N' : 'S'}`, 5, y - 5);
          bgCtx.fillText(`${Math.abs(lonVal).toFixed(2)}°${lonVal >= 0 ? 'E' : 'W'}`, x + 5, ch - 5);
        }

        // Dynamic Rings
        const stationX = lonToX(baseLon);
        const stationY = latToY(baseLat);
        
        bgCtx.strokeStyle = "rgba(6, 182, 212, 0.15)";
        bgCtx.setLineDash([4, 4]);
        bgCtx.textAlign = "center";
        
        const activeRings = RINGS.filter(r => r <= maxDistFromBase * 1.5 || r === RINGS[0]);
        activeRings.forEach(dist => {
          const radius = (dist / 111) / (maxLat - minLat) * ch;
          bgCtx.beginPath(); bgCtx.arc(stationX, stationY, radius, 0, Math.PI * 2); bgCtx.stroke();
          bgCtx.fillText(`${dist}km`, stationX, stationY - radius - 4);
        });
        bgCtx.setLineDash([]);
      }

      // 2. Incremental Path Caching
      const drawPoint = flightData.points.length;
      if (lastRenderedPointsCount.current < drawPoint) {
        pathCtx.lineCap = "round";
        pathCtx.lineJoin = "round";
        pathCtx.lineWidth = 2 * pixelRatio;
        
        const startIdx = Math.max(0, lastRenderedPointsCount.current - 1);
        for (let i = startIdx; i < drawPoint - 1; i++) {
          const p1 = flightData.points[i];
          const p2 = flightData.points[i+1];
          const x1 = lonToX(p1.longitude!); const y1 = latToY(p1.latitude!);
          const x2 = lonToX(p2.longitude!); const y2 = latToY(p2.latitude!);
          
          pathCtx.strokeStyle = PHASE_COLORS[p2.phase as keyof typeof PHASE_COLORS] || PHASE_COLORS.ascending;
          // Apply some alpha for older paths
          pathCtx.globalAlpha = Math.max(0.2, i / flightData.points.length);
          pathCtx.beginPath(); pathCtx.moveTo(x1, y1); pathCtx.lineTo(x2, y2); pathCtx.stroke();
        }
        pathCtx.globalAlpha = 1.0;
        lastRenderedPointsCount.current = drawPoint;
      }

      // Draw cached layers
      ctx.drawImage(bgCanvasRef.current!, 0, 0);
      ctx.drawImage(pathCanvasRef.current!, 0, 0);

      // 3. Dynamic Elements (Newest segment thick/bright, Markers, Wind)
      const recentPoints = flightData.points.slice(-50);
      if (recentPoints.length > 1) {
        ctx.strokeStyle = PHASE_COLORS[flightData.latest!.phase as keyof typeof PHASE_COLORS] || PHASE_COLORS.ascending;
        ctx.lineWidth = 4 * pixelRatio;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 10 * pixelRatio;
        ctx.beginPath();
        recentPoints.forEach((p, i) => {
          const x = lonToX(p.longitude!); const y = latToY(p.latitude!);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Launch Site
      const sx = lonToX(baseLon); const sy = latToY(baseLat);
      ctx.fillStyle = PHASE_COLORS.launch;
      ctx.beginPath(); ctx.arc(sx, sy, 4 * pixelRatio, 0, Math.PI * 2); ctx.fill();

      // Burst / Landing Points
      if (flightData.burstPoint && (flightData.latest?.phase === "descending" || flightData.latest?.phase === "landing")) {
        const x = lonToX(flightData.burstPoint.longitude!); const y = latToY(flightData.burstPoint.latitude!);
        ctx.fillStyle = PHASE_COLORS.burst;
        ctx.beginPath(); ctx.arc(x, y, 4 * pixelRatio, 0, Math.PI * 2); ctx.fill();
        ctx.fillText("BURST", x + 10, y + 4);
      }
      
      // Wind Vector
      if (flightData.latest?.windSpeed && flightData.latest?.windDirection) {
        const wdir = flightData.latest.windDirection;
        const wspd = flightData.latest.windSpeed;
        const rad = (wdir - 90) * (Math.PI / 180); // meteorological direction
        const arrowLen = Math.min(wspd * 2, 50) * pixelRatio;
        const ex = bx + Math.cos(rad) * arrowLen;
        const ey = by + Math.sin(rad) * arrowLen;
        
        ctx.strokeStyle = "rgba(167, 139, 250, 0.8)";
        ctx.lineWidth = 2 * pixelRatio;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
        
        // Arrow head
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(rad - 0.5) * 6 * pixelRatio, ey - Math.sin(rad - 0.5) * 6 * pixelRatio);
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(rad + 0.5) * 6 * pixelRatio, ey - Math.sin(rad + 0.5) * 6 * pixelRatio);
        ctx.stroke();
        
        ctx.fillStyle = "rgba(167, 139, 250, 0.9)";
        ctx.font = `${10 * pixelRatio}px sans-serif`;
        ctx.fillText(`${wspd.toFixed(1)}m/s`, ex + 10, ey);
      }

      // Draw Interpolated Balloon
      const balloonColor = PHASE_COLORS[flightData.latest!.phase as keyof typeof PHASE_COLORS] || PHASE_COLORS.ascending;
      
      // Glow
      const glow = ctx.createRadialGradient(bx, by, 0, bx, by, 20 * pixelRatio);
      glow.addColorStop(0, `${balloonColor}80`);
      glow.addColorStop(1, `${balloonColor}00`);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(bx, by, 20 * pixelRatio, 0, Math.PI * 2); ctx.fill();
      
      // Core
      ctx.fillStyle = balloonColor;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5 * pixelRatio;
      ctx.beginPath(); ctx.arc(bx, by, 6 * pixelRatio, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      // Check Hover
      if (mousePos) {
        // adjust mousePos for pan
        const mx = mousePos.x * pixelRatio - panOffsetRef.current.x;
        const my = mousePos.y * pixelRatio - panOffsetRef.current.y;
        const dist = Math.sqrt(Math.pow(mx - bx, 2) + Math.pow(my - by, 2));
        setIsHoveringBalloon(dist < 25 * pixelRatio);
      }

      ctx.restore();
      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);
    
    if (canvas.parentElement) {
      resizeObserver = new ResizeObserver(() => { lastRenderedPointsCount.current = 0; });
      resizeObserver.observe(canvas.parentElement);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [flightData, baseLat, baseLon, zoomLevel, autoFollow, mousePos]);

  // Handle Mouse Events for Panning & Hover
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      if (e.buttons === 1) {
        // Drag panning
        panOffsetRef.current.x += e.movementX * (window.devicePixelRatio || 1);
        panOffsetRef.current.y += e.movementY * (window.devicePixelRatio || 1);
        setAutoFollow(false);
      }
    }
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setIsHoveringBalloon(false);
  };

  const connStatus = timeSinceLastPacket < 5 ? "Live" : timeSinceLastPacket < 15 ? "Delayed" : "Disconnected";
  const connColor = connStatus === "Live" ? "text-green-400 bg-green-400/10" : connStatus === "Delayed" ? "text-yellow-400 bg-yellow-400/10" : "text-red-400 bg-red-400/10";

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col bg-[#0a0f1d] border border-cyan-500/20 overflow-hidden font-sans ${
        isFullscreen ? "h-screen w-screen z-50 rounded-none fixed inset-0" : "h-[600px] w-full rounded-xl"
      }`}
    >
      {/* Top Bar: Title & Connection */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-start justify-between z-10 pointer-events-none bg-gradient-to-b from-[#0a0f1d] to-transparent">
        <div>
          <h3 className="text-lg font-medium text-foreground tracking-wide">Live Mission Flight Tracking</h3>
          
          {/* Mission Phase Timeline */}
          {flightData.points.length > 0 && (
            <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-widest font-semibold">
              {["launch", "ascending", "burst", "descending", "landing"].map((phase, i, arr) => {
                const isActive = flightData.latest?.phase === phase;
                const isPast = arr.indexOf(flightData.latest?.phase || "") >= i;
                const colorClass = isActive ? `text-[${PHASE_COLORS[phase as keyof typeof PHASE_COLORS]}] drop-shadow-[0_0_5px_${PHASE_COLORS[phase as keyof typeof PHASE_COLORS]}80]` : isPast ? "text-slate-300" : "text-slate-600";
                
                return (
                  <div key={phase} className={`flex items-center gap-2 ${colorClass} transition-colors duration-500`}>
                    <span className="relative flex h-2 w-2">
                      {isActive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: PHASE_COLORS[phase as keyof typeof PHASE_COLORS] }}></span>}
                      <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: isPast ? PHASE_COLORS[phase as keyof typeof PHASE_COLORS] : '#334155' }}></span>
                    </span>
                    {phase}
                    {i < arr.length - 1 && <div className={`w-4 h-[1px] ${isPast ? 'bg-slate-400' : 'bg-slate-700'}`} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        <div className="flex flex-col items-end gap-2 pointer-events-auto">
          <button
            onClick={toggleFullscreen}
            className="p-2 bg-slate-900/50 hover:bg-slate-800/80 rounded-md border border-border/50 text-muted-foreground transition-colors backdrop-blur-sm shadow-xl"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          
          {flightData.points.length > 0 && (
            <div className={`px-2 py-1 rounded border flex items-center gap-2 text-xs border-border/20 backdrop-blur-md shadow-lg ${connColor}`}>
              {connStatus === "Live" ? <Wifi className="w-3 h-3" /> : connStatus === "Delayed" ? <Activity className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span className="font-semibold">{connStatus}</span>
              <span className="text-[10px] opacity-80">| Updated {timeSinceLastPacket}s ago</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Canvas */}
      <div className="flex-1 relative w-full h-full cursor-crosshair">
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full block" 
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseDown={(e) => handleMouseMove(e)}
        />
        
        {/* Scientific Telemetry Tooltip */}
        {isHoveringBalloon && flightData.latest && mousePos && (
          <div 
            className="absolute z-20 bg-slate-950/90 border border-cyan-500/30 rounded-lg p-3 shadow-2xl backdrop-blur-md pointer-events-none text-xs w-64 transform -translate-x-1/2 -translate-y-[110%]"
            style={{ left: mousePos.x, top: mousePos.y }}
          >
            <div className="font-semibold text-cyan-400 mb-2 border-b border-cyan-500/20 pb-1 flex justify-between">
              <span>Telemetry Packet #{flightData.points.length}</span>
              <span>{flightData.latest.timestamp ? new Date(flightData.latest.timestamp).toLocaleTimeString([], { hour12: false }) : "-"} UTC</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-muted-foreground">Phase:</span>
              <span className="capitalize text-right" style={{ color: PHASE_COLORS[flightData.latest.phase as keyof typeof PHASE_COLORS] }}>{flightData.latest.phase}</span>
              <span className="text-muted-foreground">Altitude:</span>
              <span className="text-right">{(flightData.latest.altitude! / 1000).toFixed(2)} km</span>
              <span className="text-muted-foreground">Pressure:</span>
              <span className="text-right">{flightData.latest.pressure?.toFixed(1) || "-"} hPa</span>
              <span className="text-muted-foreground">Temperature:</span>
              <span className="text-right">{flightData.latest.temperature?.toFixed(1) || "-"} °C</span>
              <span className="text-muted-foreground">Humidity:</span>
              <span className="text-right">{flightData.latest.humidity?.toFixed(1) || "-"} %</span>
              <span className="text-muted-foreground">Wind Spd:</span>
              <span className="text-right">{flightData.latest.windSpeed?.toFixed(1) || "-"} m/s</span>
              <span className="text-muted-foreground">Wind Dir:</span>
              <span className="text-right">{flightData.latest.windDirection?.toFixed(0) || "-"}°</span>
              <span className="text-muted-foreground">Vert Spd:</span>
              <span className="text-right">{flightData.vertVel > 0 ? "+" : ""}{flightData.vertVel.toFixed(1)} m/s</span>
              <span className="text-muted-foreground">Latitude:</span>
              <span className="text-right">{flightData.latest.latitude?.toFixed(5)}°</span>
              <span className="text-muted-foreground">Longitude:</span>
              <span className="text-right">{flightData.latest.longitude?.toFixed(5)}°</span>
            </div>
          </div>
        )}
      </div>

      {/* Professional Statistics Overlay */}
      {flightData.points.length > 0 && (
        <div className="absolute top-24 left-4 bg-slate-900/60 backdrop-blur-md border border-border/40 rounded-lg p-3 text-xs w-48 shadow-xl pointer-events-none">
          <div className="font-semibold text-slate-300 mb-2 uppercase tracking-wider text-[10px]">Flight Statistics</div>
          <div className="space-y-1.5 font-mono">
            <div className="flex justify-between">
              <span className="text-muted-foreground font-sans">Cur Alt</span>
              <span className="text-cyan-300">{(flightData.latest!.altitude! / 1000).toFixed(2)} km</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-sans">Max Alt</span>
              <span className="text-orange-300">{(flightData.maxAlt / 1000).toFixed(2)} km</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-sans">Distance</span>
              <span>{flightData.totalDist.toFixed(1)} km</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-sans">Duration</span>
              <span>{Math.floor(flightData.flightDuration / 60)}m {Math.floor(flightData.flightDuration % 60)}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-sans">Avg Asc</span>
              <span>{flightData.avgAscentRate.toFixed(1)} m/s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-sans">Max Asc</span>
              <span>{flightData.maxAscentRate.toFixed(1)} m/s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-sans">Vert Vel</span>
              <span className={flightData.vertVel >= 0 ? "text-green-400" : "text-orange-400"}>{flightData.vertVel > 0 ? "+" : ""}{flightData.vertVel.toFixed(1)} m/s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-sans">Horiz Vel</span>
              <span>{flightData.horizVel.toFixed(1)} m/s</span>
            </div>
            <div className="flex justify-between border-t border-border/30 pt-1 mt-1">
              <span className="text-muted-foreground font-sans">Packets</span>
              <span className="text-blue-300">{flightData.points.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Legend & Zoom Controls */}
      <div className="absolute bottom-4 right-4 flex gap-4 pointer-events-none">
        
        {/* Zoom Controls */}
        <div className="flex flex-col gap-1 pointer-events-auto shadow-xl">
          <button onClick={handleZoomIn} className="p-2 bg-slate-900/80 hover:bg-slate-800 rounded-t-md border border-border/40 text-muted-foreground hover:text-foreground backdrop-blur-md">
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleReset} className="p-2 bg-slate-900/80 hover:bg-slate-800 border-x border-border/40 text-muted-foreground hover:text-foreground backdrop-blur-md" title="Reset Zoom">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleAutoFollow} className={`p-2 bg-slate-900/80 hover:bg-slate-800 border-x border-b border-border/40 backdrop-blur-md ${autoFollow ? "text-cyan-400" : "text-muted-foreground hover:text-foreground"}`} title="Auto Follow">
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleZoomOut} className="p-2 bg-slate-900/80 hover:bg-slate-800 rounded-b-md border border-t-0 border-border/40 text-muted-foreground hover:text-foreground backdrop-blur-md">
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Legend */}
        <div className="bg-slate-900/60 backdrop-blur-md border border-border/40 rounded-lg p-3 text-xs w-36 shadow-xl">
          <div className="font-semibold text-slate-300 mb-2 uppercase tracking-wider text-[10px]">Legend</div>
          <div className="space-y-2">
            <div className="flex items-center gap-2"><Navigation className="w-3 h-3 text-[#06b6d4]" /> Launch Site</div>
            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#10b981]"></div> Ascending</div>
            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#f97316]"></div> Burst</div>
            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#eab308]"></div> Descending</div>
            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 bg-[#3b82f6]"></div> Landing</div>
          </div>
        </div>
      </div>
    </div>
  );
}
