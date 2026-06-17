import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { RadiosondeObservation } from '../../data/radiosonde-data';

interface Props {
  data: RadiosondeObservation[];
  compareData?: RadiosondeObservation[];
}

export function PressureProfileChart({
  data,
  compareData,
}: Props) {

  const merged = data.map((obs, i) => ({
    pressure: obs.pressure,

    // convert m -> km
    height: obs.height / 1000,

    cmp_pressure: compareData?.[i]?.pressure,
  }));

  const maxHeight = Math.ceil(
    Math.max(...merged.map((d) => d.height))
  );

  const maxPressure = Math.ceil(
    Math.max(...merged.map((d) => d.pressure))
  );

  return (
    <ResponsiveContainer width="100%" height={380}>
      <ComposedChart
        data={merged}
        layout="vertical"
        margin={{
          top: 10,
          right: 30,
          left: 60,
          bottom: 50,
        }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(148,163,184,0.1)"
        />

        <XAxis
          type="number"
          domain={[0, maxPressure]}
          stroke="#94a3b8"
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          tickCount={7}
          label={{
            value: 'Pressure (hPa)',
            position: 'insideBottom',
            offset: -30,
            fill: '#94a3b8',
            fontSize: 11,
          }}
        />

        <YAxis
          dataKey="height"
          type="number"
          domain={[0, maxHeight]}
          reversed={true}
          stroke="#94a3b8"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          tickFormatter={(v) => `${v} km`}
          width={70}
          label={{
            value: 'Height (km)',
            angle: -90,
            position: 'insideLeft',
            offset: -45,
            fill: '#94a3b8',
            fontSize: 11,
          }}
        />

        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(15,23,42,0.95)',
            border: '1px solid rgba(148,163,184,0.2)',
            borderRadius: 8,
            color: '#e0e7ff',
            fontSize: 11,
          }}
          formatter={(v: number, name: string) => [
            `${v?.toFixed(1)} hPa`,
            name,
          ]}
          labelFormatter={(label) =>
            `Height: ${Number(label).toFixed(1)} km`
          }
        />

        <Legend
          wrapperStyle={{
            color: '#94a3b8',
            fontSize: 11,
            paddingTop: 8,
          }}
        />

        <Line
          dataKey="pressure"
          type="monotone"
          stroke="#8b5cf6"
          strokeWidth={3}
          dot={false}
          name="Pressure"
        />

        {compareData && (
          <Line
            dataKey="cmp_pressure"
            type="monotone"
            stroke="#f97316"
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 3"
            name="Pressure (Cmp)"
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}