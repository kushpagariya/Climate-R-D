import { useState, useRef, useCallback, ReactNode, useEffect } from "react";
import { ZoomIn, ZoomOut, Maximize2, Minimize2 } from "lucide-react";
import type { RadiosondeObservation } from "../data/radiosonde-data";

interface Props {
  data: RadiosondeObservation[];
  compareData?: RadiosondeObservation[];
  children: (
    slicedData: RadiosondeObservation[],
    slicedCompare: RadiosondeObservation[] | undefined,
    zoomLevel: number
  ) => ReactNode;
  label?: string;
  badge?: string;
}

const ZOOM_LEVELS = [1, 2, 4, 8];
const ZOOM_LABELS = ['100%', '50%', '25%', '12%'];

export function ChartZoomWrapper({ data, compareData, children, label, badge }: Props) {
  const [zoomIdx, setZoomIdx] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasData = data.length > 0;

  const factor = ZOOM_LEVELS[zoomIdx];
  const sliceCount = Math.ceil(data.length / factor);
  const slicedData = data.slice(0, sliceCount);
  const slicedCompare = compareData ? compareData.slice(0, sliceCount) : undefined;

  const zoomIn = () => setZoomIdx(i => Math.min(i + 1, ZOOM_LEVELS.length - 1));
  const zoomOut = () => setZoomIdx(i => Math.max(i - 1, 0));
  const reset = () => setZoomIdx(0);

  const maxHeight = slicedData[slicedData.length - 1]?.height ?? 0;
  const minHeight = slicedData[0]?.height ?? 0;

  // Fullscreen via native browser API
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  return (
    <div
      ref={containerRef}
      className="space-y-3"
      style={
        isFullscreen
          ? {
              background: 'rgba(8,15,30,0.99)',
              padding: '24px',
              overflow: 'auto',
            }
          : {}
      }
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {label && <span className="text-sm text-foreground/80">{label}</span>}
          {badge && (
            <span className="text-[10px] px-2 py-0.5 border border-cyan-500/40 text-cyan-400 rounded-sm tracking-widest">
              {badge}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground mr-2 tabular-nums">
            {(minHeight / 1000).toFixed(0)}–{(maxHeight / 1000).toFixed(1)} km &nbsp;·&nbsp; {ZOOM_LABELS[zoomIdx]}
          </span>
          <button
            onClick={zoomIn}
            disabled={zoomIdx === ZOOM_LEVELS.length - 1}
            className="p-1.5 rounded border border-border bg-secondary/40 hover:bg-secondary disabled:opacity-30 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5 text-cyan-400" />
          </button>
          <button
            onClick={zoomOut}
            disabled={zoomIdx === 0}
            className="p-1.5 rounded border border-border bg-secondary/40 hover:bg-secondary disabled:opacity-30 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5 text-cyan-400" />
          </button>
          <button
            onClick={reset}
            disabled={zoomIdx === 0}
            className="p-1.5 rounded border border-border bg-secondary/40 hover:bg-secondary disabled:opacity-30 transition-colors"
            title="Original Size"
          >
            <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded border border-border bg-secondary/40 hover:bg-secondary transition-colors ml-1"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen
              ? <Minimize2 className="w-3.5 h-3.5 text-purple-400" />
              : <Maximize2 className="w-3.5 h-3.5 text-purple-400" style={{ filter: 'hue-rotate(60deg)' }} />
            }
          </button>
        </div>
      </div>

      {hasData ? (
        children(slicedData, slicedCompare, ZOOM_LEVELS[zoomIdx])
      ) : (
        <div className="flex h-[320px] flex-col items-center justify-center gap-2 rounded-lg border border-border/50 bg-secondary/20 text-center">
          <div className="text-sm text-slate-300">No telemetry data</div>
          <div className="max-w-sm text-xs text-slate-500">
            Select a launch with stored telemetry to render this graph.
          </div>
        </div>
      )}
    </div>
  );
}
