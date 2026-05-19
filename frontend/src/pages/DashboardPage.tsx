import { Link } from "react-router-dom";
import { Activity, BellRing, Cpu, Signal, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingState } from "../components/ui/LoadingState";
import { useAuth } from "../contexts/AuthContext";
import { useRealtime } from "../contexts/RealtimeContext";
import { applyTelemetryPatchToDeviceList } from "../lib/deviceRealtime";
import {
  deviceBehaviorTone,
  formatDateTime,
  formatRelativeTime,
  humanizeAlertStatus,
  humanizeDeviceBehaviorConfidence,
  humanizeDeviceBehaviorState,
  humanizeRealtimePhase,
  humanizeSeverity,
  humanizeSocketDisconnectReason,
  realtimeTone,
  severityTone,
  statusTone,
} from "../lib/format";
import { api } from "../services/api";
import type {
  AlertRecord,
  DashboardSummary,
  Device,
  TelemetryRealtimeEvent,
} from "../types/api";

type SummaryMetric = {
  label: string;
  value: number;
  icon: typeof Activity;
  tone: string;
};

export function DashboardPage() {
  const {
    connectionPhase,
    isConnected,
    lastConnectError,
    lastConnectErrorCode,
    lastDisconnectReason,
    socket,
  } = useRealtime();
  const { activeOrganization } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<AlertRecord[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);

      try {
        const [summaryResponse, alertsResponse, devicesResponse] = await Promise.all([
          api.get<DashboardSummary>("/dashboard/summary"),
          api.get<{ items: AlertRecord[] }>("/dashboard/recent-alerts"),
          api.get<{ items: Device[] }>("/dashboard/device-status"),
        ]);

        if (!active) {
          return;
        }

        setSummary(summaryResponse.data);
        setRecentAlerts(alertsResponse.data.items);
        setDeviceStatus(devicesResponse.data.items);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadData();

    if (!socket) {
      return () => {
        active = false;
      };
    }

    const refresh = () => {
      void loadData();
    };

    const handleTelemetry = (telemetryEvent: TelemetryRealtimeEvent) => {
      setDeviceStatus((current) =>
        applyTelemetryPatchToDeviceList(current, telemetryEvent),
      );
      setSummary((current) =>
        current
          ? {
              ...current,
              systemStatus: {
                ...current.systemStatus,
                lastSeenAt:
                  telemetryEvent.createdAt || current.systemStatus.lastSeenAt,
              },
            }
          : current,
      );
    };

    socket.on("alert:new", refresh);
    socket.on("alert:updated", refresh);
    socket.on("device:status", refresh);
    socket.on("telemetry:new", handleTelemetry);

    return () => {
      active = false;
      socket.off("alert:new", refresh);
      socket.off("alert:updated", refresh);
      socket.off("device:status", refresh);
      socket.off("telemetry:new", handleTelemetry);
    };
  }, [activeOrganization?.id, socket]);

  if (loading && !summary) {
    return <LoadingState label="Carregando visão geral da organização..." />;
  }

  if (!summary) {
    return (
      <EmptyState
        description="Não foi possível obter os agregados do backend para a organização ativa."
        title="Dashboard indisponível"
      />
    );
  }

  const metrics: SummaryMetric[] = [
    {
      label: "Pacientes",
      value: summary.metrics.totalPatients,
      icon: UserRound,
      tone: "from-surface-700 to-surface-900 text-white",
    },
    {
      label: "Dispositivos",
      value: summary.metrics.totalDevices,
      icon: Cpu,
      tone: "from-surface-700 to-surface-900 text-white",
    },
    {
      label: "Online",
      value: summary.metrics.onlineDevices,
      icon: Signal,
      tone: "from-teal-500 to-teal-700 text-white",
    },
    {
      label: "Alertas ativos",
      value: summary.metrics.activeAlerts,
      icon: BellRing,
      tone: "from-amber-500 to-amber-700 text-white",
    },
  ];
  const offlineDeviceCount = deviceStatus.filter((device) => !device.status.online).length;
  const onlineDeviceCount = deviceStatus.filter((device) => device.status.online).length;
  const realtimeSummary = isConnected
    ? "Socket do painel conectado. Devices offline continuam significando ausência recente de status/telemetria MQTT no backend."
    : lastConnectError
      ? `${lastConnectError}${lastConnectErrorCode ? ` (${lastConnectErrorCode})` : ""}`
      : `Socket do painel desconectado: ${humanizeSocketDisconnectReason(lastDisconnectReason)}. O snapshot atual continua visível, mas pode ficar desatualizado até a reconexão.`;

  const systemStateTone =
    summary.systemStatus.state === "critical"
      ? "danger"
      : summary.systemStatus.state === "attention"
        ? "warning"
        : "success";

  return (
    <div className="space-y-6">
      {/* HERO — centro de comando */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-surface-900 via-surface-800 to-teal-900 text-white shadow-panel">
        <img
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 hidden h-full w-1/2 object-cover opacity-25 [mask-image:linear-gradient(to_left,black,transparent)] md:block"
          src="/images/idoso-enfermeira-campus.png"
        />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-72 bg-gradient-to-l from-teal-400/25 via-transparent to-transparent blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="relative grid gap-8 px-6 py-8 md:px-10 md:py-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.32em] text-teal-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-300" />
              Centro de comando
            </div>
            <h2 className="mt-3 max-w-2xl font-display text-3xl leading-tight text-white md:text-4xl">
              {summary.organization?.name || "Visão filtrada"} em tempo real
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/75">
              O dashboard soma apenas o tenant ativo e, quando existirem caregiver
              assignments, respeita o subconjunto de pacientes permitido ao usuário logado.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Badge tone={systemStateTone} dot>
                Estado {summary.systemStatus.state}
              </Badge>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
                Último contato · {formatRelativeTime(summary.systemStatus.lastSeenAt)}
              </span>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {metrics.map(({ label, value, icon: Icon, tone }) => (
              <div
                key={label}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur transition hover:border-teal-300/30 hover:bg-white/[0.10]"
              >
                <div
                  className={`inline-flex rounded-xl bg-gradient-to-br p-2.5 shadow-soft ${tone}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/55">
                  {label}
                </p>
                <p className="mt-1.5 font-display text-3xl tabular-nums text-white">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Diagnóstico operacional */}
      <Card
        icon={<Activity className="h-5 w-5" />}
        title="Diagnóstico operacional"
        subtitle="Painel, device e MQTT em camadas separadas — queda do socket do navegador ≠ ESP32 offline."
        actions={
          <div className="hidden flex-wrap gap-2 md:flex">
            <Badge tone={realtimeTone(connectionPhase) as never} dot>
              {humanizeRealtimePhase(connectionPhase)}
            </Badge>
            <Badge tone={offlineDeviceCount > 0 ? "warning" : "success"} dot>
              {offlineDeviceCount} sem MQTT recente
            </Badge>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-3">
          <DiagnosticTile
            label="Realtime do painel"
            value={humanizeRealtimePhase(connectionPhase)}
            description={realtimeSummary}
            tone={isConnected ? "ok" : "warn"}
          />
          <DiagnosticTile
            label="Devices online"
            value={`${onlineDeviceCount} com telemetria recente`}
            description="Este número vem do backend e independe do socket do navegador estar ativo."
            tone={onlineDeviceCount > 0 ? "ok" : "warn"}
          />
          <DiagnosticTile
            label="Último snapshot"
            value={formatRelativeTime(summary.systemStatus.lastSeenAt)}
            description="O mapa de devices continua usando este snapshot mesmo durante reconexão."
            tone="neutral"
          />
        </div>
      </Card>

      {/* Alertas + Mapa de devices */}
      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card
          icon={<BellRing className="h-5 w-5" />}
          title="Alertas recentes"
          subtitle="Priorize os casos mais críticos do escopo ativo."
          actions={
            <Link
              className="inline-flex items-center justify-center rounded-xl border border-surface-200 bg-white px-3.5 py-2 text-sm font-semibold text-surface-800 transition hover:border-teal-400 hover:text-teal-700"
              to="/alerts"
            >
              Abrir fila
            </Link>
          }
        >
          {recentAlerts.length ? (
            <div className="space-y-2.5">
              {recentAlerts.slice(0, 5).map((alert) => {
                const tone = severityTone(alert.event.severity);
                const accent =
                  tone === "danger"
                    ? "border-l-danger-500"
                    : tone === "warning"
                      ? "border-l-amber-500"
                      : "border-l-teal-500";
                return (
                  <div
                    key={alert.id}
                    className={`flex items-start justify-between gap-4 rounded-2xl border border-surface-100 border-l-4 bg-white px-4 py-3.5 shadow-soft transition hover:border-teal-200 ${accent}`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={severityTone(alert.event.severity) as never} dot>
                          {humanizeSeverity(alert.event.severity)}
                        </Badge>
                        <Badge tone={statusTone(alert.status) as never}>
                          {humanizeAlertStatus(alert.status)}
                        </Badge>
                        <span className="text-xs text-surface-500">
                          {formatDateTime(alert.event.eventTime)}
                        </span>
                      </div>
                      <p className="mt-2 truncate font-semibold text-surface-900">
                        {alert.device.name || alert.device.deviceIdentifier}
                      </p>
                      <p className="truncate text-sm text-surface-600">
                        {alert.patient?.fullName || "Sem paciente"} · {alert.event.message}
                      </p>
                    </div>
                    <Link
                      className="shrink-0 text-sm font-semibold text-teal-700 underline-offset-4 hover:underline"
                      to="/alerts"
                    >
                      Detalhes →
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<BellRing className="h-6 w-6" />}
              tone="success"
              description="Assim que o backend receber eventos do escopo ativo, os alertas surgirão aqui."
              title="Nenhum alerta recente"
            />
          )}
        </Card>

        <Card
          icon={<Cpu className="h-5 w-5" />}
          title="Mapa de dispositivos"
          subtitle="Status por unidade no escopo ativo."
        >
          {deviceStatus.length ? (
            <div className="space-y-2">
              {deviceStatus.slice(0, 6).map((device) => (
                <div
                  key={device.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-surface-100 bg-white px-4 py-3 transition hover:border-teal-200 hover:bg-surface-50/40"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          device.status.online
                            ? "bg-teal-500 shadow-[0_0_0_3px_rgba(14,165,151,0.18)]"
                            : "bg-surface-300"
                        }`}
                      />
                      <p className="truncate font-semibold text-surface-900">
                        {device.name}
                      </p>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-surface-600">
                      {device.currentPatient?.fullName || device.deviceIdentifier}
                    </p>
                    <p className="mt-1 text-xs text-surface-500">
                      Heurística: {humanizeDeviceBehaviorState(device.behavior.state)} ·
                      confiança {humanizeDeviceBehaviorConfidence(device.behavior.confidence)}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge tone={deviceBehaviorTone(device.behavior.state) as never}>
                      {humanizeDeviceBehaviorState(device.behavior.state)}
                    </Badge>
                    <p className="mt-1.5 text-xs text-surface-500">
                      {formatRelativeTime(device.status.lastSeenAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Cpu className="h-6 w-6" />}
              description="Nenhum device claimed apareceu no tenant ativo ainda."
              title="Sem dispositivos"
            />
          )}
        </Card>
      </section>

      {/* Histórico operacional */}
      <Card
        icon={<Activity className="h-5 w-5" />}
        title="Histórico operacional"
        subtitle="Últimos eventos recebidos pelo backend no escopo ativo."
        actions={<Badge tone="info" dot>{summary.metrics.eventsLast24h} nas últimas 24h</Badge>}
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="table-pro">
            <thead>
              <tr>
                <th>Momento</th>
                <th>Paciente</th>
                <th>Dispositivo</th>
                <th>Severidade</th>
                <th>Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {summary.recentEvents.length ? (
                summary.recentEvents.map((event) => (
                  <tr key={event.id}>
                    <td className="whitespace-nowrap text-surface-600">
                      {formatDateTime(event.eventTime)}
                    </td>
                    <td className="text-surface-800">
                      {event.patient?.fullName || (
                        <span className="text-surface-400">Sem paciente</span>
                      )}
                    </td>
                    <td className="font-semibold text-surface-900">
                      {event.device.name || event.device.deviceIdentifier}
                    </td>
                    <td>
                      <Badge tone={severityTone(event.severity) as never} dot>
                        {humanizeSeverity(event.severity)}
                      </Badge>
                    </td>
                    <td className="text-surface-600">{event.message}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-surface-500">
                    Nenhum evento registrado ainda neste escopo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function DiagnosticTile({
  label,
  value,
  description,
  tone,
}: {
  label: string;
  value: string;
  description: string;
  tone: "ok" | "warn" | "neutral";
}) {
  const ring =
    tone === "ok"
      ? "ring-teal-200 bg-teal-50/50"
      : tone === "warn"
        ? "ring-amber-200 bg-amber-50/50"
        : "ring-surface-200 bg-surface-50/60";
  const dot =
    tone === "ok" ? "bg-teal-500" : tone === "warn" ? "bg-amber-500" : "bg-surface-400";
  return (
    <div className={`rounded-2xl p-4 ring-1 ring-inset ${ring}`}>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-surface-600">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {label}
      </div>
      <p className="mt-2 font-display text-base font-semibold text-surface-900">{value}</p>
      <p className="mt-1.5 text-xs leading-5 text-surface-600">{description}</p>
    </div>
  );
}
