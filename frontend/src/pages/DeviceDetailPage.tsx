import { useEffect, useState } from "react";
import { ArrowLeft, BatteryCharging, Link2, Signal, TriangleAlert } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { TelemetryChart } from "../components/charts/TelemetryChart";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingState } from "../components/ui/LoadingState";
import { useRealtime } from "../contexts/RealtimeContext";
import { applyTelemetryPatchToDetail } from "../lib/deviceRealtime";
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
  DeviceDetailResponse,
  TelemetryRealtimeEvent,
} from "../types/api";

export function DeviceDetailPage() {
  const { id } = useParams();
  const numericId = Number(id);
  const {
    connectionPhase,
    isConnected,
    lastConnectError,
    lastConnectErrorCode,
    lastDisconnectReason,
    socket,
  } = useRealtime();
  const [detail, setDetail] = useState<DeviceDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!numericId) {
      return;
    }

    let active = true;

    const loadDetail = async (showLoading = true) => {
      if (showLoading) {
        setLoading(true);
      }

      try {
        const response = await api.get<DeviceDetailResponse>(`/devices/${numericId}`);

        if (active) {
          setDetail(response.data);
        }
      } catch {
        if (active && showLoading) {
          setDetail(null);
        }
      } finally {
        if (active && showLoading) {
          setLoading(false);
        }
      }
    };

    void loadDetail();
    const pollTimer = window.setInterval(() => {
      void loadDetail(false);
    }, 10000);

    if (!socket) {
      return () => {
        active = false;
        window.clearInterval(pollTimer);
      };
    }

    const refreshIfMatches = (payload: { device?: { id?: number }; deviceId?: number; id?: number }) => {
      const targetId = payload.device?.id || payload.deviceId || payload.id;
      if (targetId === numericId) {
        void loadDetail(false);
      }
    };
    const handleTelemetry = (telemetryEvent: TelemetryRealtimeEvent) => {
      if (telemetryEvent.deviceId !== numericId) {
        return;
      }

      setDetail((current) =>
        current ? applyTelemetryPatchToDetail(current, telemetryEvent) : current,
      );
    };

    socket.on("device:status", refreshIfMatches);
    socket.on("telemetry:new", handleTelemetry);
    socket.on("alert:new", refreshIfMatches);
    socket.on("alert:updated", refreshIfMatches);

    return () => {
      active = false;
      window.clearInterval(pollTimer);
      socket.off("device:status", refreshIfMatches);
      socket.off("telemetry:new", handleTelemetry);
      socket.off("alert:new", refreshIfMatches);
      socket.off("alert:updated", refreshIfMatches);
    };
  }, [numericId, socket]);

  if (loading && !detail) {
    return <LoadingState label="Carregando detalhes do dispositivo..." />;
  }

  if (!detail) {
    return (
      <EmptyState
        description="Confira se o ID está correto e se o device já foi pareado com a organização atual."
        title="Dispositivo não encontrado"
      />
    );
  }

  const latestTelemetry = detail.recentTelemetry.at(-1);
  const activeAlerts = detail.recentAlerts.filter((alert) =>
    ["open", "acknowledged"].includes(alert.status),
  );
  const realtimeSummary = isConnected
    ? "Socket do painel conectado. Este detalhe agora recebe telemetria incremental sem depender de reload completo a cada amostra."
    : lastConnectError
      ? `${lastConnectError}${lastConnectErrorCode ? ` (${lastConnectErrorCode})` : ""}`
      : `Socket do painel desconectado: ${humanizeSocketDisconnectReason(lastDisconnectReason)}. O snapshot atual continua visivel, mas pode atrasar ate a reconexao.`;

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden bg-gradient-to-br from-surface-900 via-surface-800 to-surface-700 text-white">
        <div className="absolute inset-y-0 right-0 w-72 bg-gradient-to-l from-danger-500/20 to-transparent blur-3xl" />
        <div className="relative">
          <Link
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
            to="/devices"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para dispositivos
          </Link>

          <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={detail.device.status.online ? "success" : "warning"}>
                  {detail.device.status.online ? "Online" : "Offline"}
                </Badge>
                <Badge tone="info">{detail.device.claimStatus}</Badge>
                <Badge tone={deviceBehaviorTone(detail.device.behavior.state) as never}>
                  {humanizeDeviceBehaviorState(detail.device.behavior.state)}
                </Badge>
                <Badge tone={activeAlerts.length ? "danger" : "info"}>
                  {activeAlerts.length} alertas ativos
                </Badge>
              </div>
              <h2 className="mt-4 font-display text-4xl">{detail.device.name}</h2>
              <p className="mt-2 text-sm text-white/75">
                {detail.device.currentPatient?.fullName || "Sem paciente ativo"} •{" "}
                {detail.device.location || "Local não informado"}
              </p>
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.24em] text-white/55">
                {detail.device.deviceIdentifier}
              </p>
              <p className="mt-1 text-xs text-white/55">{detail.device.deviceUid}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[24px] bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.24em] text-white/65">Bateria</p>
                <p className="mt-3 flex items-center gap-2 text-3xl font-semibold">
                  <BatteryCharging className="h-5 w-5 text-amber-300" />
                  {detail.device.status.batteryPercent ?? "--"}%
                </p>
              </div>
              <div className="rounded-[24px] bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.24em] text-white/65">RSSI</p>
                <p className="mt-3 flex items-center gap-2 text-3xl font-semibold">
                  <Signal className="h-5 w-5 text-emerald-300" />
                  {detail.device.status.wifiRssi ?? "--"}
                </p>
              </div>
              <div className="rounded-[24px] bg-white/10 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.24em] text-white/65">Claim</p>
                <p className="mt-3 text-sm font-semibold">
                  {detail.device.claimedAt
                    ? formatDateTime(detail.device.claimedAt)
                    : "Ainda não pareado"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
              Realtime desta tela
            </p>
            <h3 className="mt-2 font-display text-2xl text-surface-900">
              Painel e device acompanhados em camadas separadas
            </h3>
          </div>
          <Badge tone={realtimeTone(connectionPhase) as never}>
            {humanizeRealtimePhase(connectionPhase)}
          </Badge>
        </div>
        <p className="mt-3 text-sm text-surface-600">{realtimeSummary}</p>
        <p className="mt-2 text-xs text-surface-500">
          Device offline significa ausencia recente de status/telemetria MQTT no backend.
          Ultimo contato: {formatRelativeTime(detail.device.status.lastSeenAt)}.
        </p>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
                Telemetria
              </p>
              <h3 className="mt-2 font-display text-2xl text-surface-900">
                Sinais recentes do sensor
              </h3>
            </div>
            <Badge tone="info">{detail.recentTelemetry.length} amostras</Badge>
          </div>
          <div className="mt-5">
            <TelemetryChart data={detail.recentTelemetry} />
          </div>
        </Card>

        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
            Snapshot atual
          </p>
          <h3 className="mt-2 font-display text-2xl text-surface-900">
            Contexto técnico e clínico
          </h3>
          <div className="mt-5 grid gap-3">
            <div className="rounded-[24px] bg-surface-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-surface-500">
                Estado atual
              </p>
              <p className="mt-2 text-sm font-semibold text-surface-900">
                {humanizeDeviceBehaviorState(detail.device.behavior.state)}
              </p>
              <p className="mt-1 text-xs text-surface-600">
                Confianca {humanizeDeviceBehaviorConfidence(detail.device.behavior.confidence)} -
                heuristica experimental
              </p>
              <p className="mt-2 text-xs text-surface-500">{detail.device.behavior.reason}</p>
            </div>
            <div className="rounded-[24px] bg-surface-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-surface-500">
                Organização
              </p>
              <p className="mt-2 text-sm font-semibold text-surface-900">
                {detail.device.organization?.name || "Sem tenant"}
              </p>
            </div>
            <div className="rounded-[24px] bg-surface-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-surface-500">
                Paciente atual
              </p>
              <p className="mt-2 text-sm font-semibold text-surface-900">
                {detail.device.currentPatient?.fullName || "Sem vínculo atual"}
              </p>
            </div>
            <div className="rounded-[24px] bg-surface-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-surface-500">
                Última leitura
              </p>
              <p className="mt-2 text-sm font-semibold text-surface-900">
                AX {typeof latestTelemetry?.ax === "number" ? latestTelemetry.ax.toFixed(2) : "--"} •
                AY {typeof latestTelemetry?.ay === "number" ? latestTelemetry.ay.toFixed(2) : "--"} •
                AZ {typeof latestTelemetry?.az === "number" ? latestTelemetry.az.toFixed(2) : "--"}
              </p>
              <p className="mt-2 text-xs text-surface-500">
                RSSI {detail.device.status.wifiRssi ?? "--"} • bateria{" "}
                {detail.device.status.batteryPercent ?? "--"}% •{" "}
                {detail.device.status.online
                  ? "telemetria MQTT recente"
                  : "sem telemetria MQTT recente"}
              </p>
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
                Alertas do dispositivo
              </p>
              <h3 className="mt-2 font-display text-2xl text-surface-900">
                Ocorrências recentes
              </h3>
            </div>
            <Badge tone={activeAlerts.length ? "danger" : "success"}>
              {activeAlerts.length ? "Exigem atenção" : "Sem pendências"}
            </Badge>
          </div>
          <div className="mt-5 space-y-3">
            {detail.recentAlerts.length ? (
              detail.recentAlerts.map((alert: AlertRecord) => (
                <div
                  key={alert.id}
                  className="rounded-[24px] border border-surface-100 bg-surface-50/70 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone(alert.status) as never}>
                      {humanizeAlertStatus(alert.status)}
                    </Badge>
                    <Badge tone={severityTone(alert.event.severity) as never}>
                      {humanizeSeverity(alert.event.severity)}
                    </Badge>
                  </div>
                  <p className="mt-3 font-semibold text-surface-900">{alert.event.message}</p>
                  <p className="mt-1 text-sm text-surface-600">
                    {formatDateTime(alert.event.eventTime)}
                  </p>
                </div>
              ))
            ) : (
              <EmptyState
                description="Nenhum alerta recente foi associado a este dispositivo."
                title="Sem alertas"
              />
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
                Histórico de vínculo
              </p>
              <h3 className="mt-2 font-display text-2xl text-surface-900">
                Assignment do device
              </h3>
            </div>
            <Link2 className="h-5 w-5 text-surface-600" />
          </div>
          <div className="mt-5 space-y-3">
            {detail.assignmentHistory.length ? (
              detail.assignmentHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-[24px] border border-surface-100 bg-white p-4"
                >
                  <p className="font-semibold text-surface-900">
                    {entry.patient?.fullName || "Sem paciente"}
                  </p>
                  <p className="mt-1 text-sm text-surface-600">
                    Início: {formatDateTime(entry.assignmentStartedAt)}
                  </p>
                  <p className="text-sm text-surface-600">
                    Fim: {entry.assignmentEndedAt ? formatDateTime(entry.assignmentEndedAt) : "ativo"}
                  </p>
                  {entry.reason ? (
                    <p className="mt-2 text-sm text-surface-600">
                      Motivo: {entry.reason}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyState
                description="O histórico de vínculo aparece aqui após o primeiro assignment."
                title="Sem histórico"
              />
            )}
          </div>
        </Card>
      </section>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
              Eventos
            </p>
            <h3 className="mt-2 font-display text-2xl text-surface-900">
              Fluxo recente do dispositivo
            </h3>
          </div>
          <Badge tone="info">{detail.recentEvents.length} registros</Badge>
        </div>
        <div className="mt-5 space-y-3">
          {detail.recentEvents.length ? (
            detail.recentEvents.map((event) => (
              <div
                key={event.id}
                className="rounded-[24px] border border-surface-100 bg-white p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={severityTone(event.severity) as never}>
                    {humanizeSeverity(event.severity)}
                  </Badge>
                  <span className="text-sm text-surface-500">
                    {formatDateTime(event.eventTime)}
                  </span>
                </div>
                <p className="mt-3 font-semibold text-surface-900">{event.message}</p>
                <p className="mt-1 text-sm text-surface-600">
                  Paciente: {event.patient?.fullName || "sem escopo de paciente"}
                </p>
                {event.immobility ? (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-danger-50 px-3 py-1 text-xs font-semibold text-danger-700">
                    <TriangleAlert className="h-3.5 w-3.5" />
                    Imobilidade confirmada
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <EmptyState
              description="O histórico aparece assim que o backend registrar novos eventos MQTT neste escopo."
              title="Sem eventos recentes"
            />
          )}
        </div>
      </Card>
    </div>
  );
}
