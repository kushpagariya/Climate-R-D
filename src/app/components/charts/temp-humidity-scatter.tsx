import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ZAxis,
} from 'recharts';
import type { RadiosondeObservation } from '../../data/radiosonde-data';

interface Props {
  data: RadiosondeObservation[];
  compareData?: RadiosondeObservation[];
}

export function TempHumidityScatterChart({
  data,
  compareData,
}: Props) {
  const sampledData = data
    .filter((_, i) => i % 2 === 0)
    .map((obs) => ({
      temperature: obs.temperature,
      relativeHumidity: obs.relativeHumidity,
      height:
        obs.height > 100
          ? obs.height / 1000
          : obs.height,
    }));

  const sampledCmp = compareData
    ?.filter((_, i) => i % 2 === 0)
    .map((obs) => ({
      temperature: obs.temperature,
      relativeHumidity: obs.relativeHumidity,
      height:
        obs.height > 100
          ? obs.height / 1000
          : obs.height,
    }));

  return (
    <ResponsiveContainer width="100%" height={380}>
      <ScatterChart
        margin={{
          top: 10,
          right: 30,
          left: 55,
          bottom: 50,
        }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(148,163,184,0.1)"
        />

        <XAxis
          type="number"
          dataKey="temperature"
          name="Temperature"
          domain={[-60, 30]}
          stroke="#94a3b8"
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          tickCount={7}
          label={{
            value: 'Temperature (°C)',
            position: 'insideBottom',
            offset: -30,
            fill: '#94a3b8',
            fontSize: 11,
          }}
        />

        <YAxis
          type="number"
          dataKey="relativeHumidity"
          name="Humidity"
          domain={[0, 100]}
          stroke="#94a3b8"
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          tickCount={6}
          width={55}
          label={{
            value: 'Rel. Humidity (%)',
            angle: -90,
            position: 'insideLeft',
            offset: -40,
            fill: '#94a3b8',
            fontSize: 11,
          }}
        />

        <ZAxis
          type="number"
          dataKey="height"
          range={[30, 100]}
        />

        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          contentStyle={{
            backgroundColor: 'rgba(15,23,42,0.95)',
            border: '1px solid rgba(148,163,184,0.2)',
            borderRadius: 8,
            color: '#e0e7ff',
            fontSize: 11,
          }}
          formatter={(v: number, name: string) => {
            if (name === 'height') {
              return [
                `${Number(v).toFixed(1)} km`,
                'Height',
              ];
            }

            if (name === 'temperature') {
              return [
                `${Number(v).toFixed(1)} °C`,
                'Temperature',
              ];
            }

            return [
              `${Number(v).toFixed(1)} %`,
              'Humidity',
            ];
          }}
        />

        <Legend
          wrapperStyle={{
            color: '#94a3b8',
            fontSize: 11,
            paddingTop: 8,
          }}
        />

        <Scatter
          name="Current"
          data={sampledData}
          fill="#06b6d4"
          stroke="#06b6d4"
          fillOpacity={0.8}
        />

        {sampledCmp && (
          <Scatter
            name="Compare"
            data={sampledCmp}
            fill="#f97316"
            stroke="#f97316"
            fillOpacity={0.7}
          />
        )}
      </ScatterChart>
    </ResponsiveContainer>
  );
}