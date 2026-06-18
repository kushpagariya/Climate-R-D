import { useEffect, useRef } from "react";
import type { RadiosondeStation, BalloonPosition } from "../data/radiosonde-data";

interface Props {
  station: RadiosondeStation;
  position: BalloonPosition;
  trajectory: BalloonPosition[];
}

export function BalloonMap({ station, position, trajectory }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    const width = rect.width;
    const height = rect.height;

    // Clear canvas
    ctx.fillStyle = 'rgba(10, 14, 39, 0.4)';
    ctx.fillRect(0, 0, width, height);

    // Calculate bounds
    const allLats = [...trajectory.map(t => t.lat), station.latitude];
    const allLons = [...trajectory.map(t => t.lon), station.longitude];
    const minLat = Math.min(...allLats) - 0.2;
    const maxLat = Math.max(...allLats) + 0.2;
    const minLon = Math.min(...allLons) - 0.2;
    const maxLon = Math.max(...allLons) + 0.2;

    // Coordinate transformation
    const latToY = (lat: number) => height - ((lat - minLat) / (maxLat - minLat)) * height;
    const lonToX = (lon: number) => ((lon - minLon) / (maxLon - minLon)) * width;

    // Draw grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const x = (width / 10) * i;
      const y = (height / 10) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw distance rings
    const stationX = lonToX(station.longitude);
    const stationY = latToY(station.latitude);
    const distances = [20, 40, 60]; // km
    
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    
    distances.forEach(dist => {
      const radius = (dist / 111) / (maxLat - minLat) * height;
      ctx.beginPath();
      ctx.arc(stationX, stationY, radius, 0, Math.PI * 2);
      ctx.stroke();
      
      // Label
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.font = '10px sans-serif';
      ctx.fillText(`${dist}km`, stationX + radius - 25, stationY);
    });
    
    ctx.setLineDash([]);

    // Draw trajectory
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    trajectory.forEach((pos, i) => {
      const x = lonToX(pos.lon);
      const y = latToY(pos.lat);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw trajectory points
    trajectory.forEach((pos, i) => {
      if (i % 5 === 0) {
        const x = lonToX(pos.lon);
        const y = latToY(pos.lat);
        
        ctx.fillStyle = 'rgba(6, 182, 212, 0.3)';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Altitude label
        if (i % 10 === 0) {
          ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
          ctx.font = '9px sans-serif';
          ctx.fillText(`${(pos.altitude / 1000).toFixed(1)}km`, x + 5, y - 5);
        }
      }
    });
    const burstPoint = trajectory.find(
      p => p.phase === 'descending'
    );

    if (burstPoint) {
      const burstX = lonToX(burstPoint.lon);
      const burstY = latToY(burstPoint.lat);

      ctx.fillStyle = '#ef4444';

      ctx.beginPath();
      ctx.arc(burstX, burstY, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('BURST', burstX + 10, burstY);
    }
    const landingPoint = trajectory.find(
      p => p.phase === 'complete'
    );

    if (landingPoint) {
      const landingX = lonToX(landingPoint.lon);
      const landingY = latToY(landingPoint.lat);

      ctx.fillStyle = '#22c55e';

      ctx.beginPath();
      ctx.rect(
        landingX - 5,
        landingY - 5,
        10,
        10
      );
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(
        'LANDING',
        landingX + 10,
        landingY
      );
    }
    // Draw station
    ctx.fillStyle = '#06b6d4';
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(stationX, stationY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Station label
    ctx.fillStyle = '#e0e7ff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('Launch Site', stationX + 12, stationY + 4);

    // Draw current balloon position
    const balloonX = lonToX(position.lon);
    const balloonY = latToY(position.lat);

    // Balloon glow effect
    const gradient = ctx.createRadialGradient(balloonX, balloonY, 0, balloonX, balloonY, 20);
    gradient.addColorStop(0, 'rgba(6, 182, 212, 0.6)');
    gradient.addColorStop(1, 'rgba(6, 182, 212, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(balloonX, balloonY, 20, 0, Math.PI * 2);
    ctx.fill();

    // Balloon icon (simplified)
    ctx.fillStyle =
      position.phase === 'ascending'
        ? '#10b981'
        : position.phase === 'descending'
        ? '#f59e0b'
        : '#06b6d4';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    
    // Balloon circle
    ctx.beginPath();
    ctx.arc(balloonX, balloonY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // String
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(balloonX, balloonY + 10);
    ctx.lineTo(balloonX, balloonY + 20);
    ctx.stroke();

    // Live indicator
    if (position.phase === 'ascending') {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(balloonX + 12, balloonY - 12, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Balloon position label
    ctx.fillStyle = '#e0e7ff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(
      `${(position.altitude / 1000).toFixed(2)} km`,
      balloonX + 15,
      balloonY - 10
    );
    
    // Coordinates
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(224, 231, 255, 0.7)';
    ctx.fillText(
      `${position.lat.toFixed(4)}°N, ${position.lon.toFixed(4)}°E`,
      balloonX + 15,
      balloonY + 5
    );


  }, [station, position, trajectory]);

  return (
    <div className="relative w-full h-[500px] bg-gradient-to-br from-slate-900/50 to-slate-800/50 rounded-lg overflow-hidden border border-border/30">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
      />
      
      {/* Map controls overlay */}
      <div className="absolute top-4 right-4 space-y-2">
        <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg p-2 text-xs space-y-1">

          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Ascending</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500"></div>
            <span>Descending</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-cyan-500"></div>
            <span>Launch Site</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Burst</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500"></div>
            <span>Landing</span>
          </div>

        </div>
      </div>
      
      {/* Status overlay */}
      <div className="absolute bottom-4 left-4 bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-2">
        <div className="text-xs text-muted-foreground">Mission Status</div>
        <div className="text-sm">
          <span
            className={
              position.phase === 'ascending'
                ? 'text-green-400'
                : position.phase === 'descending'
                ? 'text-orange-400'
                : 'text-cyan-400'
            }
          >
            {position.phase.toUpperCase()}
          </span>
          {' • '}
          <span className="text-foreground">{position.timestamp.toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}
