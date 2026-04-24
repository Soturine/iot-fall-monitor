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
      tone: "bg-surface-800 text-white",
    },
    {
      label: "Dispositivos",
      value: summary.metrics.totalDevices,
      icon: Cpu,
      tone: "bg-surface-800 text-white",
    },
    {
      label: "Online",
      value: summary.metrics.onlineDevices,
      icon: Signal,
      tone: "bg-emerald-500 text-white",
    },
    {
      label: "Alertas ativos",
      value: summary.metrics.activeAlerts,
      icon: BellRing,
      tone: "bg-amber-500 text-white",
    },
  ];
  const offlineDeviceCount = deviceStatus.filter((device) => !device.status.online).length;
  const onlineDeviceCount = deviceStatus.filter((device) => device.status.online).length;
  const realtimeSummary = isConnected
    ? "Socket do painel conectado. Devices offline continuam significando ausencia recente de status/telemetria MQTT no backend."
    : lastConnectError
      ? `${lastConnectError}${lastConnectErrorCode ? ` (${lastConnectErrorCode})` : ""}`
      : `Socket do painel desconectado: ${humanizeSocketDisconnectReason(lastDisconnectReason)}. O snapshot atual continua visivel, mas pode ficar desatualizado ate a reconexao.`;

  return (
    <div className="space-y-6">
      <section className="panel relative overflow-hidden px-6 py-6 md:px-8">
        <div className="absolute inset-0 bg-gradient-to-br from-surface-900 via-surface-800 to-surface-700" />
        <div className="absolute inset-y-0 right-0 w-72 bg-gradient-to-l from-amber-300/20 to-transparent blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.36em] text-white/60">
              Centro de comando
            </p>
            <h2 className="mt-3 font-display text-4xl text-white">
              {summary.organization?.name || "Visão filtrada"} em tempo real.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/75">
              O dashboard deixou de ser global. Agora ele soma apenas o tenant ativo e,
              quando existirem caregiver assignments, respeita também o subconjunto de
              pacientes permitido ao usuário logado.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Badge
                tone={
                  summary.systemStatus.state === "critical"
                    ? "danger"
                    : summary.systemStatus.state === "attention"
                      ? "warning"
                      : "success"
                }
              >
                Estado {summary.systemStatus.state}
              </Badge>
              <span className="text-sm text-white/75">
                Último contato: {formatRelativeTime(summary.systemStatus.lastSeenAt)}
              </span>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {metrics.map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="rounded-[28px] bg-white/10 p-5 text-white backdrop-blur">
                <div className={`inline-flex rounded-2xl p-3 ${tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-6 text-sm uppercase tracking-[0.28em] text-white/60">
                  {label}
                </p>
                <p className="mt-2 font-display text-4xl">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
              Diagnostico operacional
            </p>
            <h3 className="mt-2 font-display text-2xl text-surface-900">
              Painel, device e MQTT em camadas separadas
            </h3>
            <p className="mt-2 text-sm text-surface-600">
              Queda do socket do navegador nao significa que o ESP32 caiu. Aqui a leitura fica
              separada para evitar esse falso positivo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={realtimeTone(connectionPhase) as never}>
              {humanizeRealtimePhase(connectionPhase)}
            </Badge>
            <Badge tone={offlineDeviceCount > 0 ? "warning" : "success"}>
              {offlineDeviceCount} sem telemetria MQTT recente
            </Badge>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-[24px] bg-surface-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-surface-500">
              Realtime do painel
            </p>
            <p className="mt-2 text-sm font-semibold text-surface-900">
              {humanizeRealtimePhase(connectionPhase)}
            </p>
            <p className="mt-2 text-xs text-surface-600">{realtimeSummary}</p>
          </div>
          <div className="rounded-[24px] bg-surface-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-surface-500">
              Devices online
            </p>
            <p className="mt-2 text-sm font-semibold text-surface-900">
              {onlineDeviceCount} com telemetria/status MQTT recente
            </p>
            <p className="mt-2 text-xs text-surface-600">
              Este numero vem do backend e nao depende do socket do navegador estar ativo.
            </p>
          </div>
          <div className="rounded-[24px] bg-surface-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-surface-500">
              Ultimo snapshot
            </p>
            <p className="mt-2 text-sm font-semibold text-surface-900">
              {formatRelativeTime(summary.systemStatus.lastSeenAt)}
            </p>
            <p className="mt-2 text-xs text-surface-600">
              O mapa de devices continua usando esse snapshot mesmo durante reconexao do painel.
            </p>
          </div>
        </div>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
                Alertas recentes
              </p>
              <h3 className="mt-2 font-display text-2xl text-surface-900">
                Priorize os casos mais críticos
              </h3>
            </div>
            <Link
              className="inline-flex items-center justify-center rounded-2xl border border-surface-200 bg-white px-4 py-2.5 text-sm font-semibold text-surface-800 transition hover:border-surface-300"
              to="/alerts"
            >
              Abrir fila completa
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {recentAlerts.length ? (
              recentAlerts.slice(0, 5).map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-[24px] border border-surface-100 bg-surface-50/70 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={severityTone(alert.event.severity) as never}>
                      {humanizeSeverity(alert.event.severity)}
                    </Badge>
                    <Badge tone={statusTone(alert.status) as never}>
                      {humanizeAlertStatus(alert.status)}
                    </Badge>
                    <span className="text-sm text-surface-500">
                      {formatDateTime(alert.event.eventTime)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-surface-900">
                        {alert.device.name || alert.device.deviceIdentifier}
                      </p>
                      <p className="text-sm text-surface-600">
                        {alert.patient?.fullName || "Sem paciente"} • {alert.event.message}
                      </p>
                    </div>
                    <Link
                      className="text-sm font-semibold text-surface-700 underline-offset-4 hover:underline"
                      to="/alerts"
                    >
                      Ver detalhes
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                description="Assim que o backend receber eventos do escopo ativo, os alertas surgirão aqui."
                title="Nenhum alerta recente"
              />
            )}
          </div>
        </Card>

        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
            Mapa de dispositivos
          </p>
          <h3 className="mt-2 font-display text-2xl text-surface-900">
            Status por unidade
          </h3>
          <div className="mt-5 space-y-3">
            {deviceStatus.length ? (
              deviceStatus.slice(0, 6).map((device) => (
                <div
                  key={device.id}
                  className="flex items-center justify-between gap-3 rounded-[24px] border border-surface-100 bg-white px-4 py-4"
                >
                  <div>
                    <p className="font-semibold text-surface-900">{device.name}</p>
                    <p className="text-sm text-surface-600">
                      {device.currentPatient?.fullName || device.deviceIdentifier}
                    </p>
                    <p className="mt-1 text-xs text-surface-500">
                      Heuristica experimental: {humanizeDeviceBehaviorState(device.behavior.state)} •
                      confianca {humanizeDeviceBehaviorConfidence(device.behavior.confidence)}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge tone={device.status.online ? "success" : "neutral"}>
                      {device.status.online ? "Online" : "Offline"}
                    </Badge>
                    <div className="mt-2">
                      <Badge tone={deviceBehaviorTone(device.behavior.state) as never}>
                        {humanizeDeviceBehaviorState(device.behavior.state)}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-surface-500">
                      {formatRelativeTime(device.status.lastSeenAt)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                description="Nenhum device claimed apareceu no tenant ativo ainda."
                title="Nenhum dispositivo encontrado"
              />
            )}
          </div>
        </Card>
      </section>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
              Histórico operacional
            </p>
            <h3 className="mt-2 font-display text-2xl text-surface-900">
              Últimos eventos recebidos
            </h3>
          </div>
          <Badge tone="info">{summary.metrics.eventsLast24h} nas últimas 24h</Badge>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-surface-500">
              <tr>
                <th className="pb-3 font-semibold">Momento</th>
                <th className="pb-3 font-semibold">Paciente</th>
                <th className="pb-3 font-semibold">Dispositivo</th>
                <th className="pb-3 font-semibold">Severidade</th>
                <th className="pb-3 font-semibold">Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {summary.recentEvents.map((event) => (
                <tr key={event.id} className="border-t border-surface-100">
                  <td className="py-4 text-surface-600">
                    {formatDateTime(event.eventTime)}
                  </td>
                  <td className="py-4 text-surface-700">
                    {event.patient?.fullName || "Sem paciente"}
                  </td>
                  <td className="py-4 font-semibold text-surface-900">
                    {event.device.name || event.device.deviceIdentifier}
                  </td>
                  <td className="py-4">
                    <Badge tone={severityTone(event.severity) as never}>
                      {humanizeSeverity(event.severity)}
                    </Badge>
                  </td>
                  <td className="py-4 text-surface-600">{event.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
