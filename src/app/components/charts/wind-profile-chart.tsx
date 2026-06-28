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

export function WindProfileChart({
  data,
  compareData,
  axisLimits,
}: Props) {
  const sampledData = data.filter((_, i) => i % 3 === 0);
  const sampledCmp = compareData?.filter((_, i) => i % 3 === 0);

  const merged = sampledData
    .map((obs, i) => ({
      ...obs,
      cmp_windSpeed: sampledCmp?.[i]?.windSpeed,
    }))
    .sort((a, b) => a.height - b.height);

  return (
    <ResponsiveContainer width="100%" height={380}>
      <ComposedChart
        data={merged}
        layout="vertical"
        margin={{
          top: 10,
          right: 70,
          left: 65,
          bottom: 50,
        }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(148,163,184,0.1)"
        />

        <YAxis
          dataKey="height"
          type="number"
          domain={axisLimits?.altitude || [0, 'dataMax']}
          reversed={true}
          ticks={[
            0,
            4000,
            8000,
            12000,
            16000,
            20000,
            24000,
            28000,
          ]}
          stroke="#94a3b8"
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          tickFormatter={(v) => `${v / 1000}km`}
          width={60}
          label={{
            value: 'Height (km)',
            angle: -90,
            position: 'insideLeft',
            offset: -50,
            fill: '#94a3b8',
            fontSize: 11,
          }}
        />

        <XAxis
          type="number"
          domain={axisLimits?.windSpeed || [0, 'auto']}
          stroke="#94a3b8"
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          tickCount={8}
          label={{
            value: 'Wind Speed (m/s)',
            position: 'insideBottom',
            offset: -35,
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
          labelFormatter={(label) =>
            `Height: ${(Number(label) / 1000).toFixed(1)} km`
          }
          formatter={(value: number, name: string) => [
            `${value?.toFixed(1)} m/s`,
            name,
          ]}
        />

        <Legend
          wrapperStyle={{
            color: '#94a3b8',
            fontSize: 11,
            paddingTop: 8,
          }}
        />

        <Line
          dataKey="windSpeed"
          type="natural"
          stroke="#06b6d4"
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 4 }}
          name="Wind Speed (m/s)"
        />

        {compareData && (
          <Line
            dataKey="cmp_windSpeed"
            type="natural"
            stroke="#f97316"
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 4"
            name="Speed (Cmp)"
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}