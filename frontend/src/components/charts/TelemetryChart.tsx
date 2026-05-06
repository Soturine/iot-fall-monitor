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

export function TelemetryChart({ data }: { data: TelemetryLog[] }) {
  if (!data.length) {
    return (
      <div className="panel-soft flex min-h-72 items-center justify-center text-sm text-surface-500">
        Sem telemetria disponível para montar o gráfico.
      </div>
    );
  }

  const timestamps = data
    .map((sample) => (sample.createdAt ? new Date(sample.createdAt).getTime() : Number.NaN))
    .filter((timestamp) => Number.isFinite(timestamp));
  const timeSpanMs = timestamps.length
    ? Math.max(...timestamps) - Math.min(...timestamps)
    : 0;
  const showSeconds = timeSpanMs > 0 && timeSpanMs < 120000;
  const tickFormatterOptions: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
  };

  if (showSeconds) {
    tickFormatterOptions.second = "2-digit";
  }

  const tickFormatter = new Intl.DateTimeFormat("pt-BR", tickFormatterOptions);

  return (
    <div className="panel-soft h-80 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="rgba(79,115,103,0.12)" strokeDasharray="4 4" />
          <XAxis
            dataKey="createdAt"
            minTickGap={40}
            stroke="#4f7367"
            tickFormatter={(value) => tickFormatter.format(new Date(value))}
          />
          <YAxis stroke="#4f7367" />
          <Tooltip
            contentStyle={{
              borderRadius: 18,
              border: "1px solid rgba(79, 115, 103, 0.18)",
              background: "rgba(255,255,255,0.96)",
            }}
            formatter={(value) =>
              typeof value === "number" ? value.toFixed(2) : String(value ?? "--")
            }
            labelFormatter={(value) => formatDateTime(String(value))}
          />
          <Line
            dataKey="accelMagnitude"
            activeDot={{ r: 5 }}
            connectNulls
            dot={{ r: 2 }}
            isAnimationActive={false}
            name="Aceleração"
            stroke="#b4382d"
            strokeWidth={3}
            type="monotone"
          />
          <Line
            dataKey="gyroMagnitude"
            activeDot={{ r: 5 }}
            connectNulls
            dot={{ r: 2 }}
            isAnimationActive={false}
            name="Giroscópio"
            stroke="#36584d"
            strokeWidth={3}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
