import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatDateTime } from "../../lib/format";
import type { TelemetryLog } from "../../types/api";

type ChartSample = TelemetryLog & {
  createdAtMs: number;
  displayAtMs: number;
};

function toFiniteNumber(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildChartSamples(data: TelemetryLog[]) {
  const duplicateOffsets = new Map<number, number>();

  return data
    .map((sample) => {
      const timestamp = sample.createdAt
        ? new Date(sample.createdAt).getTime()
        : Number.NaN;
      const accelMagnitude = toFiniteNumber(sample.accelMagnitude);
      const gyroMagnitude = toFiniteNumber(sample.gyroMagnitude);

      if (!Number.isFinite(timestamp) || (accelMagnitude == null && gyroMagnitude == null)) {
        return null;
      }

      const offset = duplicateOffsets.get(timestamp) || 0;
      duplicateOffsets.set(timestamp, offset + 1);

      return {
        ...sample,
        accelMagnitude,
        gyroMagnitude,
        createdAtMs: timestamp + offset,
        displayAtMs: timestamp + offset,
      };
    })
    .filter((sample): sample is ChartSample => Boolean(sample))
    .sort((left, right) => left.createdAtMs - right.createdAtMs || left.id - right.id);
}

function buildDisplaySamples(samples: ChartSample[]) {
  if (samples.length <= 1) {
    return samples;
  }

  const first = samples[0].createdAtMs;
  const last = samples.at(-1)?.createdAtMs || first;
  const span = last - first;

  if (span >= 5000) {
    return samples.map((sample) => ({
      ...sample,
      displayAtMs: sample.createdAtMs,
    }));
  }

  const readableSpan = 20000;
  const step = readableSpan / Math.max(samples.length - 1, 1);

  return samples.map((sample, index) => ({
    ...sample,
    displayAtMs: first + index * step,
  }));
}

function buildTimeDomain(samples: ChartSample[]) {
  const min = samples[0]?.displayAtMs || Date.now();
  const max = samples.at(-1)?.displayAtMs || min;
  const span = Math.max(0, max - min);
  const padding = span === 0 ? 5000 : Math.min(Math.max(span * 0.08, 1000), 30000);

  return [min - padding, max + padding] as [number, number];
}

export function TelemetryChart({ data }: { data: TelemetryLog[] }) {
  const chartData = buildDisplaySamples(buildChartSamples(data));

  if (!chartData.length) {
    return (
      <div className="panel-soft flex min-h-72 items-center justify-center text-sm text-surface-500">
        Sem telemetria valida para montar o grafico.
      </div>
    );
  }

  const firstSample = chartData[0];
  const latestSample = chartData.at(-1) || firstSample;
  const timeSpanMs = latestSample.createdAtMs - firstSample.createdAtMs;
  const showSeconds = timeSpanMs > 0 && timeSpanMs < 120000;
  const tickFormatterOptions: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
  };

  if (showSeconds) {
    tickFormatterOptions.second = "2-digit";
  }

  const domain = buildTimeDomain(chartData);
  const tickFormatter = new Intl.DateTimeFormat("pt-BR", tickFormatterOptions);
  const sampleByDisplayTime = new Map(
    chartData.map((sample) => [sample.displayAtMs, sample]),
  );

  return (
    <div className="panel-soft p-4">
      <div className="h-72">
        <ResponsiveContainer height="100%" width="100%">
          <LineChart data={chartData} margin={{ bottom: 0, left: 0, right: 12, top: 8 }}>
            <CartesianGrid stroke="rgba(79,115,103,0.12)" strokeDasharray="4 4" />
            <XAxis
              allowDataOverflow={false}
              dataKey="displayAtMs"
              domain={domain}
              minTickGap={40}
              scale="time"
              stroke="#4f7367"
              tickFormatter={(value) => {
                const sample = sampleByDisplayTime.get(Number(value));
                const timestamp = sample?.createdAtMs ?? Number(value);
                return tickFormatter.format(new Date(timestamp));
              }}
              ticks={chartData.length <= 6 ? chartData.map((sample) => sample.displayAtMs) : undefined}
              type="number"
            />
            <YAxis domain={["dataMin - 0.1", "dataMax + 0.1"]} stroke="#4f7367" />
            <Tooltip
              contentStyle={{
                border: "1px solid rgba(79, 115, 103, 0.18)",
                background: "rgba(255,255,255,0.96)",
                borderRadius: 18,
              }}
              formatter={(value) =>
                typeof value === "number" ? value.toFixed(2) : String(value ?? "--")
              }
              labelFormatter={(value) =>
                formatDateTime(
                  new Date(
                    sampleByDisplayTime.get(Number(value))?.createdAtMs ?? Number(value),
                  ).toISOString(),
                )
              }
            />
            <Line
              activeDot={{ r: 5 }}
              connectNulls
              dataKey="accelMagnitude"
              dot={{ r: 2 }}
              isAnimationActive={false}
              name="Aceleracao"
              stroke="#b4382d"
              strokeWidth={3}
              type="monotone"
            />
            <Line
              activeDot={{ r: 5 }}
              connectNulls
              dataKey="gyroMagnitude"
              dot={{ r: 2 }}
              isAnimationActive={false}
              name="Giroscopio"
              stroke="#36584d"
              strokeWidth={3}
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-surface-500">
        <span>{chartData.length} amostras validas</span>
        <span>
          Janela: {formatDateTime(firstSample.createdAt)} -{" "}
          {formatDateTime(latestSample.createdAt)}
        </span>
      </div>
    </div>
  );
}
