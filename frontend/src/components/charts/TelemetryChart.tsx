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
  ax: number | null;
  ay: number | null;
  az: number | null;
  accelMagnitude: number | null;
  gyroMagnitude: number | null;
  createdAtMs: number;
  displayAtMs: number;
};

const MAX_ACCEL_G = 20;
const MAX_GYRO_DEG_S = 2000;
const ACCEL_UNIT = "g";
const GYRO_UNIT = "\u00b0/s";

function toFiniteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toVisualRange(value: number | null | undefined, min: number, max: number) {
  const numericValue = toFiniteNumber(value);

  if (numericValue == null || numericValue < min || numericValue > max) {
    return null;
  }

  return numericValue;
}

function toSignedVisualRange(value: number | null | undefined, maxAbs: number) {
  const numericValue = toFiniteNumber(value);

  if (numericValue == null || Math.abs(numericValue) > maxAbs) {
    return null;
  }

  return numericValue;
}

function formatFixed(value: number | null | undefined, unit?: string) {
  const numericValue = toFiniteNumber(value);

  if (numericValue == null) {
    return "--";
  }

  return `${numericValue.toFixed(2)}${unit ? ` ${unit}` : ""}`;
}

function resolveVisualAccelMagnitude(
  sample: TelemetryLog,
  ax: number | null,
  ay: number | null,
  az: number | null,
) {
  const directMagnitude = toVisualRange(sample.accelMagnitude, 0, MAX_ACCEL_G);

  if (directMagnitude != null) {
    return directMagnitude;
  }

  if (ax == null || ay == null || az == null) {
    return null;
  }

  return toVisualRange(Math.hypot(ax, ay, az), 0, MAX_ACCEL_G);
}

function buildChartSamples(data: TelemetryLog[]): ChartSample[] {
  const duplicateOffsets = new Map<number, number>();
  const samples: ChartSample[] = [];

  data.forEach((sample) => {
    const timestamp = sample.createdAt
      ? new Date(sample.createdAt).getTime()
      : Number.NaN;
    const ax = toSignedVisualRange(sample.ax, MAX_ACCEL_G);
    const ay = toSignedVisualRange(sample.ay, MAX_ACCEL_G);
    const az = toSignedVisualRange(sample.az, MAX_ACCEL_G);
    // Filtro apenas de visualizacao: backend/banco continuam preservando a amostra bruta.
    const accelMagnitude = resolveVisualAccelMagnitude(sample, ax, ay, az);
    const gyroMagnitude = toVisualRange(sample.gyroMagnitude, 0, MAX_GYRO_DEG_S);

    if (!Number.isFinite(timestamp) || accelMagnitude == null) {
      return;
    }

    const offset = duplicateOffsets.get(timestamp) || 0;
    duplicateOffsets.set(timestamp, offset + 1);

    samples.push({
      ...sample,
      ax,
      ay,
      az,
      accelMagnitude,
      gyroMagnitude,
      createdAtMs: timestamp + offset,
      displayAtMs: timestamp + offset,
    });
  });

  return samples.sort(
    (left, right) => left.createdAtMs - right.createdAtMs || left.id - right.id,
  );
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

function buildValueDomain(samples: ChartSample[]) {
  const values = samples
    .map((sample) => sample.accelMagnitude)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (!values.length) {
    return [0, 2] as [number, number];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const padding = Math.max(span * 0.16, 0.25);

  return [
    Math.max(0, min - padding),
    Math.min(MAX_ACCEL_G, max + padding),
  ] as [number, number];
}

type TooltipPayload = Array<{
  payload?: ChartSample;
}>;

function TelemetryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const sample = payload[0]?.payload;

  if (!sample) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-surface-200 bg-white/95 p-3 text-xs shadow-soft">
      <p className="font-semibold text-surface-800">
        {formatDateTime(sample.createdAt)}
      </p>
      <div className="mt-2 grid gap-1 text-surface-600">
        <p>
          <span className="font-semibold text-danger-700">Aceleracao:</span>{" "}
          {formatFixed(sample.accelMagnitude, ACCEL_UNIT)}
        </p>
        <p>
          <span className="font-semibold text-surface-700">Giroscopio:</span>{" "}
          {formatFixed(sample.gyroMagnitude, GYRO_UNIT)}
        </p>
        <p>
          AX {formatFixed(sample.ax, ACCEL_UNIT)} - AY{" "}
          {formatFixed(sample.ay, ACCEL_UNIT)} - AZ{" "}
          {formatFixed(sample.az, ACCEL_UNIT)}
        </p>
      </div>
    </div>
  );
}

export function TelemetryChart({ data }: { data: TelemetryLog[] }) {
  const chartData = buildDisplaySamples(buildChartSamples(data));
  const filteredCount = Math.max(0, data.length - chartData.length);

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
  const valueDomain = buildValueDomain(chartData);
  const tickFormatter = new Intl.DateTimeFormat("pt-BR", tickFormatterOptions);
  const sampleByDisplayTime = new Map(
    chartData.map((sample) => [sample.displayAtMs, sample]),
  );

  return (
    <div className="panel-soft p-4">
      <div className="h-72">
        <ResponsiveContainer height="100%" width="100%">
          <LineChart data={chartData} margin={{ bottom: 0, left: 6, right: 12, top: 8 }}>
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
            <YAxis
              allowDataOverflow={false}
              domain={valueDomain}
              stroke="#4f7367"
              tickFormatter={(value) => formatFixed(Number(value))}
              width={50}
            />
            <Tooltip content={<TelemetryTooltip />} />
            <Line
              activeDot={{ r: 5 }}
              connectNulls
              dataKey="accelMagnitude"
              dot={{ r: 2 }}
              isAnimationActive={false}
              name={`Aceleracao resultante (${ACCEL_UNIT})`}
              stroke="#b4382d"
              strokeWidth={3}
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-surface-500">
        <span>{chartData.length} amostras validas - Aceleracao resultante ({ACCEL_UNIT})</span>
        <span>
          Janela: {formatDateTime(firstSample.createdAt)} -{" "}
          {formatDateTime(latestSample.createdAt)}
        </span>
        {filteredCount > 0 ? (
          <span className="basis-full text-warning-700">
            {filteredCount} amostras fora da escala foram filtradas somente no grafico.
          </span>
        ) : null}
      </div>
    </div>
  );
}
