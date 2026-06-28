import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Label,
} from 'recharts';
import type { RadiosondeObservation } from '../../data/radiosonde-data';
import type { AxisLimits } from '../../api/radiosonde';

interface Props {
  data: RadiosondeObservation[];
  compareData?: RadiosondeObservation[];
  params: {
    freezingLevel: number;
    lcl: number;
    tropopause: number;
  };
  axisLimits?: AxisLimits;
}

export function AtmosphericProfileChart({
  data,
  compareData,
  params,
  axisLimits,
}: Props) {
  const merged = data.map((obs, i) => ({
    ...obs,

    // Height is already in km
    height: obs.height / 1000,

    cmp_temperature: compareData?.[i]?.temperature,
    cmp_dewPoint: compareData?.[i]?.dewPoint,
    cmp_icePoint: compareData?.[i]?.icePoint,
  }));

  const maxHeight = Math.ceil(
    Math.max(...merged.map((d) => d.height))
  );

  return (
    <ResponsiveContainer width="100%" height={460}>
      <LineChart
        layout="vertical"
        data={merged}
        margin={{
          top: 10,
          right: 50,
          left: 70,
          bottom: 50,
        }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(148,163,184,0.1)"
        />

        {/* Temperature Axis */}
        <XAxis
          type="number"
          domain={axisLimits?.temperature || [-90, 40]}
          stroke="#94a3b8"
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          label={{
            value: 'Temperature (°C)',
            position: 'insideBottom',
            offset: -30,
            fill: '#94a3b8',
            fontSize: 11,
          }}
        />

        {/* Height Axis */}
        <YAxis
          dataKey="height"
          type="number"
          domain={axisLimits?.altitude ? [0, axisLimits.altitude[1] / 1000] : [0, maxHeight]}
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
        />

        <Legend
          wrapperStyle={{
            color: '#94a3b8',
            fontSize: 11,
            paddingTop: 8,
          }}
        />

        {/* LCL */}
        {params.lcl > 0 && (
          <ReferenceLine
            y={params.lcl}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            strokeWidth={1.5}
          >
            <Label
              value="LCL"
              position="insideTopRight"
              fill="#f59e0b"
              fontSize={9}
            />
          </ReferenceLine>
        )}

        {/* Freezing */}
        {params.freezingLevel > 0 && (
          <ReferenceLine
            y={params.freezingLevel}
            stroke="#06b6d4"
            strokeDasharray="4 4"
            strokeWidth={1.5}
          >
            <Label
              value="Freezing"
              position="insideTopRight"
              fill="#06b6d4"
              fontSize={9}
            />
          </ReferenceLine>
        )}

        {/* Tropopause */}
        {params.tropopause > 0 && (
          <ReferenceLine
            y={params.tropopause}
            stroke="#8b5cf6"
            strokeDasharray="4 4"
            strokeWidth={1.5}
          >
            <Label
              value="Tropopause"
              position="insideTopRight"
              fill="#8b5cf6"
              fontSize={9}
            />
          </ReferenceLine>
        )}

        {/* Main Profiles */}

        <Line
          dataKey="temperature"
          name="Temperature"
          stroke="#06b6d4"
          strokeWidth={3}
          dot={false}
        />

        <Line
          dataKey="dewPoint"
          name="Dew Point"
          stroke="#14b8a6"
          strokeWidth={3}
          dot={false}
        />

        <Line
          dataKey="icePoint"
          name="Ice Point"
          stroke="#8b5cf6"
          strokeWidth={3}
          dot={false}
        />

        {/* Comparison Profiles */}

        {compareData && (
          <>
            <Line
              dataKey="cmp_temperature"
              name="Temp (Cmp)"
              stroke="#f97316"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
            />

            <Line
              dataKey="cmp_dewPoint"
              name="Dew Pt (Cmp)"
              stroke="#fb923c"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
            />

            <Line
              dataKey="cmp_icePoint"
              name="Ice Pt (Cmp)"
              stroke="#c084fc"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
            />
          </>
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}