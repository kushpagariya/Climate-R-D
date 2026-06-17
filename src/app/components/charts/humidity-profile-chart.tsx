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

export function HumidityProfileChart({
  data,
  compareData,
}: Props) {

  const merged = data.map((obs, i) => ({
    relativeHumidity: obs.relativeHumidity,
    humidityWrtIce: obs.humidityWrtIce,

    // meters → km
    height: obs.height / 1000,

    cmp_relativeHumidity: compareData?.[i]?.relativeHumidity,
    cmp_humidityWrtIce: compareData?.[i]?.humidityWrtIce,
  }));

  const maxHeight = Math.ceil(
    Math.max(...merged.map((d) => d.height))
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
          domain={[0, 100]}
          stroke="#94a3b8"
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          tickCount={6}
          label={{
            value: 'Humidity (%)',
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
            `${v?.toFixed(1)} %`,
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
          dataKey="relativeHumidity"
          type="monotone"
          stroke="#06b6d4"
          strokeWidth={3}
          dot={false}
          name="Rel. Humidity"
        />

        <Line
          dataKey="humidityWrtIce"
          type="monotone"
          stroke="#14b8a6"
          strokeWidth={3}
          dot={false}
          name="Humidity (Ice)"
        />

        {compareData && (
          <>
            <Line
              dataKey="cmp_relativeHumidity"
              type="monotone"
              stroke="#f97316"
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 3"
              name="RH (Cmp)"
            />

            <Line
              dataKey="cmp_humidityWrtIce"
              type="monotone"
              stroke="#fb923c"
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 3"
              name="RH Ice (Cmp)"
            />
          </>
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}