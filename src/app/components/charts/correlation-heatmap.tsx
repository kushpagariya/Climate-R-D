import type { RadiosondeObservation } from '../../data/radiosonde-data';

interface Props {
  data: RadiosondeObservation[];
  compareData?: RadiosondeObservation[];
}

const VARIABLES = [
  { key: 'pressure',         col: 'Pressu', row: 'Pressure' },
  { key: 'height',           col: 'Height', row: 'Height' },
  { key: 'temperature',      col: 'Temper', row: 'Temperat' },
  { key: 'dewPoint',         col: 'Dew Po', row: 'Dew Poin' },
  { key: 'icePoint',         col: 'Ice Po', row: 'Ice Poin' },
  { key: 'relativeHumidity', col: 'Rel. H', row: 'Rel. Hum' },
  { key: 'humidityWrtIce',   col: 'RH Ice', row: 'RH Ice' },
  { key: 'mixingRatio',      col: 'Mix. R', row: 'Mix. Rat' },
  { key: 'windDirection',    col: 'Wind D', row: 'Wind Dir' },
  { key: 'windSpeed',        col: 'Wind S', row: 'Wind Spe' },
];

function calcCorr(x: number[], y: number[]): number {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

function cellColor(v: number): { bg: string; text: string } {
  const abs = Math.abs(v);
  if (v > 0) {
    if (abs >= 0.7) return { bg: '#c0392b', text: 'white' };
    if (abs >= 0.3) return { bg: '#2471a3', text: 'white' };
    return { bg: '#7d6608', text: 'white' };
  } else {
    if (abs >= 0.7) return { bg: '#2471a3', text: 'white' };
    if (abs >= 0.3) return { bg: '#c0392b', text: 'white' };
    return { bg: '#1a2a35', text: '#94a3b8' };
  }
}

function buildMatrix(data: RadiosondeObservation[]) {
  return VARIABLES.map(vx =>
    VARIABLES.map(vy => {
      const xs = data.map(o => o[vx.key as keyof RadiosondeObservation] as number);
      const ys = data.map(o => o[vy.key as keyof RadiosondeObservation] as number);
      return calcCorr(xs, ys);
    })
  );
}

export function CorrelationHeatmap({ data, compareData }: Props) {
  const matrix = buildMatrix(data);
  const cmpMatrix = compareData ? buildMatrix(compareData) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 bg-cyan-400 rounded-full" />
            <h3 className="text-lg text-foreground">Correlation Intelligence</h3>
          </div>
          <p className="text-xs text-muted-foreground ml-4 mt-0.5">
            Pearson correlation matrix — all 10 atmospheric variables
            {cmpMatrix && <span className="ml-2 text-orange-400">· Comparison overlay active</span>}
          </p>
        </div>
        <span className="text-[10px] px-2 py-1 border border-cyan-500/40 text-cyan-400 tracking-widest rounded-sm">
          HEATMAP
        </span>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 780 }}>
          {/* Column headers */}
          <div className="flex">
            <div style={{ width: 80, flexShrink: 0 }} />
            {VARIABLES.map(v => (
              <div
                key={v.key}
                className="flex-1 text-center pb-2"
                style={{ minWidth: 64, fontSize: 11, color: '#94a3b8' }}
              >
                {v.col}
              </div>
            ))}
          </div>

          {/* Rows */}
          {VARIABLES.map((vx, i) => (
            <div key={vx.key} className="flex items-center mb-1">
              <div
                style={{ width: 80, flexShrink: 0, fontSize: 11, color: '#94a3b8' }}
                className="text-right pr-3"
              >
                {vx.row}
              </div>
              {matrix[i].map((corr, j) => {
                const { bg, text } = cellColor(corr);
                const cmpCorr = cmpMatrix ? cmpMatrix[i][j] : null;
                const diff = cmpCorr !== null ? corr - cmpCorr : null;
                return (
                  <div
                    key={j}
                    className="flex-1 relative group px-0.5"
                    style={{ minWidth: 64, height: 44 }}
                  >
                    <div
                      className="w-full h-full flex flex-col items-center justify-center rounded-sm cursor-pointer transition-opacity hover:opacity-85"
                      style={{ backgroundColor: bg }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: text }}>
                        {corr.toFixed(2)}
                      </span>
                      {diff !== null && (
                        <span style={{ fontSize: 9, color: diff > 0 ? '#4ade80' : '#f87171' }}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="absolute hidden group-hover:flex flex-col gap-0.5 bg-slate-900 border border-slate-700 text-white rounded py-1.5 px-2 z-20 shadow-xl whitespace-nowrap"
                      style={{ top: -48, left: '50%', transform: 'translateX(-50%)', fontSize: 10 }}
                    >
                      <span className="font-semibold">{vx.row} × {VARIABLES[j].row}</span>
                      <span>r = {corr.toFixed(4)}</span>
                      {cmpCorr !== null && <span style={{ color: '#fb923c' }}>Cmp: {cmpCorr.toFixed(4)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center justify-center gap-3 mt-5">
            <span style={{ fontSize: 11, color: '#94a3b8' }}>-1.0</span>
            <div
              className="h-3 rounded-sm"
              style={{ width: 200, background: 'linear-gradient(to right, #2471a3, #1a2a35 40%, #7d6608 60%, #c0392b)' }}
            />
            <span style={{ fontSize: 11, color: '#94a3b8' }}>+1.0</span>
            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>Pearson r</span>
          </div>
        </div>
      </div>
    </div>
  );
}
