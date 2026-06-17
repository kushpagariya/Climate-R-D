import {
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import type { RadiosondeObservation } from '../../data/radiosonde-data';

interface Props {
  data: RadiosondeObservation[];
  compareData?: RadiosondeObservation[];
}

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function buildDirectionBins(data: RadiosondeObservation[]) {
  return DIRECTIONS.map((dir, i) => {
    const startAngle = i * 45 - 22.5;
    const endAngle = startAngle + 45;

    const matches = data.filter((obs) => {
      const angle = obs.windDirection;

      if (startAngle < 0) {
        return angle >= 360 + startAngle || angle < endAngle;
      }

      if (endAngle > 360) {
        return angle >= startAngle || angle < endAngle - 360;
      }

      return angle >= startAngle && angle < endAngle;
    });

    const avgSpeed =
      matches.length > 0
        ? matches.reduce((s, o) => s + o.windSpeed, 0) /
          matches.length
        : 0;

    return {
      direction: dir,
      frequency: matches.length,
      avgSpeed,
    };
  });
}

export function WindRoseChart({
  data,
  compareData,
}: Props) {
  const bins = buildDirectionBins(data);
  const cmpBins = compareData
    ? buildDirectionBins(compareData)
    : null;

  const merged = bins.map((b, i) => ({
    ...b,
    cmp_frequency: cmpBins
      ? cmpBins[i].frequency
      : undefined,
  }));

  return (
    <ResponsiveContainer width="100%" height={380}>
      <RadarChart data={merged}>
        <PolarGrid stroke="rgba(148,163,184,0.2)" />

        <PolarAngleAxis
          dataKey="direction"
          stroke="#94a3b8"
          tick={{
            fill: '#94a3b8',
            fontSize: 11,
          }}
        />

        <PolarRadiusAxis
          angle={90}
          domain={[0, 'auto']}
          stroke="#94a3b8"
          tick={{
            fill: '#94a3b8',
            fontSize: 10,
          }}
          tickFormatter={(v) => `${v}`}
        />

        <Radar
          name="Wind Frequency"
          dataKey="frequency"
          stroke="#06b6d4"
          fill="#06b6d4"
          fillOpacity={0.45}
          strokeWidth={2}
          isAnimationActive
        />

        {compareData && (
          <Radar
            name="Frequency (Cmp)"
            dataKey="cmp_frequency"
            stroke="#f97316"
            fill="#f97316"
            fillOpacity={0.25}
            strokeWidth={2}
            strokeDasharray="5 3"
            isAnimationActive
          />
        )}

        <Tooltip
          labelFormatter={(label) =>
            `Direction: ${label}`
          }
          formatter={(value: number, name: string) => [
            `${value}`,
            name,
          ]}
          contentStyle={{
            backgroundColor:
              'rgba(15,23,42,0.95)',
            border:
              '1px solid rgba(148,163,184,0.2)',
            borderRadius: '8px',
            color: '#e0e7ff',
            fontSize: 12,
          }}
        />

        <Legend
          wrapperStyle={{
            color: '#94a3b8',
            fontSize: 11,
            paddingTop: 8,
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}