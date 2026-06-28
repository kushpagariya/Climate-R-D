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
import type { AxisLimits } from '../../api/radiosonde';

interface Props {
  data: RadiosondeObservation[];
  compareData?: RadiosondeObservation[];
  axisLimits?: AxisLimits;
}

export function MixingRatioChart({
  data,
  compareData,
  axisLimits,
}: Props) {

  const merged = data.map((obs, i) => ({
    mixingRatio: obs.mixingRatio,

    height: obs.height / 1000,

    cmp_mixingRatio: compareData?.[i]?.mixingRatio,
  }));

  const maxHeight = Math.ceil(
    Math.max(...merged.map((d) => d.height))
  );

  const maxMixing = Math.ceil(
    Math.max(...merged.map((d) => d.mixingRatio))
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
          domain={[0, maxMixing]}
          stroke="#94a3b8"
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          tickCount={6}
          label={{
            value: 'Mixing Ratio (g/kg)',
            position: 'insideBottom',
            offset: -30,
            fill: '#94a3b8',
            fontSize: 11,
          }}
        />

        <YAxis
          dataKey="height"
          type="number"
          domain={axisLimits?.altitude || [0, maxHeight]}
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
            `${v?.toFixed(2)} g/kg`,
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
          dataKey="mixingRatio"
          type="monotone"
          stroke="#0ea5e9"
          strokeWidth={3}
          dot={false}
          name="Mixing Ratio"
        />

        {compareData && (
          <Line
            dataKey="cmp_mixingRatio"
            type="monotone"
            stroke="#f97316"
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 3"
            name="Mix. Ratio (Cmp)"
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}