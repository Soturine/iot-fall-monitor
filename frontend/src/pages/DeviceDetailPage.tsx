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
  EventRecord,
  TelemetryRealtimeEvent,
} from "../types/api";

const MQTT_TOPIC_BASE = "queda/devices";
const TELEMETRY_STALE_AFTER_MS = 30000;

type EvidenceCarrier = Pick<
  EventRecord,
  | "evidenceStatus"
  | "evidenceSampleCount"
  | "evidenceWindowSeconds"
  | "evidenceSummary"
>;

function humanizeEvidenceStatus(status?: string) {
  switch (status) {
    case "linked":
      return "vinculada";
    case "partial":
      return "parcial";
    default:
      return "insuficiente";
  }
}

function evidenceTone(status?: string) {
  if (status === "linked") {
    return "success";
  }

  if (status === "partial") {
    return "warning";
  }

  return "danger";
}

function formatEvidenceNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(2)
    : "--";
}

function EvidenceSummary({ event }: { event: EvidenceCarrier }) {
  return (
    <div className="mt-3 border-t border-surface-100 pt-3 text-xs text-surface-600">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-surface-700">Evidencia do sensor</span>
        <Badge tone={evidenceTone(event.evidenceStatus) as never}>
          {humanizeEvidenceStatus(event.evidenceStatus)}
        </Badge>
      </div>
      {event.evidenceStatus === "none" ? (
        <p className="mt-2">
          O evento foi recebido, mas nao havia telemetria recente suficiente para
          comprovar a queda.
        </p>
      ) : (
        <p className="mt-2">
          Amostras {event.evidenceSampleCount} - janela{" "}
          {formatEvidenceNumber(event.evidenceWindowSeconds)}s - pico aceleracao{" "}
          {formatEvidenceNumber(event.evidenceSummary?.maxAccelMagnitude)} - pico giro{" "}
          {formatEvidenceNumber(event.evidenceSummary?.maxGyroMagnitude)}
        </p>
      )}
    </div>
  );
}

function formatBooleanDiagnostic(value: boolean | null | undefined) {
  if (value === true) {
    return "sim";
  }

  if (value === false) {
    return "nao";
  }

  return "--";
}

function formatNumberDiagnostic(value: number | null | undefined, suffix = "") {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value}${suffix}`
    : "--";
}

function formatTopicValue(value: string | null | undefined) {
  return value || "--";
}

function ageMs(value?: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Date.now() - timestamp;
}

function expectedTopic(deviceIdentifier: string, channel: "status" | "telemetry" | "events") {
  return `${MQTT_TOPIC_BASE}/${deviceIdentifier}/${channel}`;
}

function classifyCurrentState(
  detail: DeviceDetailResponse,
  latestTelemetry: DeviceDetailResponse["recentTelemetry"][number] | undefined,
) {
  const status = detail.device.status;
  const telemetryAt = status.lastTelemetryAt || latestTelemetry?.createdAt || null;
  const telemetryAgeMs = ageMs(telemetryAt);
  const telemetryStale =
    telemetryAgeMs == null || telemetryAgeMs > TELEMETRY_STALE_AFTER_MS;

  if (status.online && status.sensorReady === false) {
    return {
      label: "Sensor sem leitura valida",
      tone: "danger",
      reason: "O device esta online, mas o firmware marcou sensor_ready=0.",
    };
  }

  if (status.online && status.sensorValid === false) {
    return {
      label: "Sensor sem leitura valida",
      tone: "warning",
      reason: "O status MQTT chegou, mas a ultima amostra do MPU6050 nao esta valida.",
    };
  }

  if (status.online && !latestTelemetry) {
    return {
      label: "Dispositivo online sem telemetry",
      tone: "warning",
      reason: "Ha status recente, mas ainda nao ha amostra valida em telemetry_logs.",
    };
  }

  if (latestTelemetry && telemetryStale) {
    return {
      label: "Telemetria desatualizada",
      tone: "warning",
      reason: "A ultima amostra existe, mas esta fora da janela esperada para bancada.",
    };
  }

  if (!latestTelemetry || detail.recentTelemetry.length < 4) {
    return {
      label: "Sem telemetria suficiente",
      tone: "neutral",
      reason: "A classificacao precisa de mais amostras recentes para ganhar estabilidade.",
    };
  }

  if (detail.device.behavior.state === "queda_confirmada") {
    return {
      label: "Queda confirmada",
      tone: "danger",
      reason: detail.device.behavior.reason,
    };
  }

  if (detail.device.behavior.state === "queda_suspeita") {
    return {
      label: "Possivel queda",
      tone: "warning",
      reason: detail.device.behavior.reason,
    };
  }

  if (detail.device.behavior.state === "em_movimento") {
    const accelDelta =
      typeof latestTelemetry.accelMagnitude === "number"
        ? Math.abs(latestTelemetry.accelMagnitude - 1)
        : 0;
    const gyroMagnitude = latestTelemetry.gyroMagnitude || 0;
    const intense = accelDelta >= 0.45 || gyroMagnitude >= 80;

    return {
      label: intense ? "Movimento intenso" : "Movimento leve",
      tone: "info",
      reason: detail.device.behavior.reason,
    };
  }

  if (["em_reposo", "deitado", "sentado"].includes(detail.device.behavior.state)) {
    return {
      label: "Repouso provavel",
      tone: "success",
      reason: detail.device.behavior.reason,
    };
  }

  return {
    label: "Sem telemetria suficiente",
    tone: "neutral",
    reason: detail.device.behavior.reason,
  };
}

function DiagnosticMetric({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-surface-100 bg-white p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-surface-500">
        {label}
      </p>
      <p
        className={`mt-1 break-words text-sm font-semibold text-surface-900 ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

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
  const latestEvent = detail.recentEvents[0];
  const currentState = classifyCurrentState(detail, latestTelemetry);
  const statusTopic = expectedTopic(detail.device.deviceIdentifier, "status");
  const telemetryTopic = expectedTopic(detail.device.deviceIdentifier, "telemetry");
  const eventsTopic = expectedTopic(detail.device.deviceIdentifier, "events");
  const lastTelemetryAt = detail.device.status.lastTelemetryAt || latestTelemetry?.createdAt || null;
  const lastEventAt = detail.device.status.lastEventAt || latestEvent?.eventTime || null;
  const telemetryAge = ageMs(lastTelemetryAt);
  const telemetryIsStale =
    telemetryAge == null || telemetryAge > TELEMETRY_STALE_AFTER_MS;
  const onlineWithoutTelemetry = detail.device.status.online && !latestTelemetry;
  const onlineWithStaleTelemetry = detail.device.status.online && telemetryIsStale;
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
      <Card className="relative overflow-hidden border-petrol-900/40 bg-gradient-to-br from-petrol-950 via-petrol-900 to-petrol-800 text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-petrol-500/30 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 bg-cover bg-center opacity-[0.08] md:block"
          style={{ backgroundImage: "url(/images/campus-bloco-6-gramado.jpeg)" }}
        />
        <div className="relative">
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/20"
            to="/devices"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Dispositivos
          </Link>

          <div className="mt-6 flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={detail.device.status.online ? "success" : "warning"} dot>
                  {detail.device.status.online ? "Online" : "Offline"}
                </Badge>
                <Badge tone="info">{detail.device.claimStatus}</Badge>
                <Badge tone={deviceBehaviorTone(detail.device.behavior.state) as never}>
                  {humanizeDeviceBehaviorState(detail.device.behavior.state)}
                </Badge>
                <Badge tone={activeAlerts.length ? "critical" : "muted"}>
                  {activeAlerts.length} alertas ativos
                </Badge>
              </div>
              <h2 className="mt-4 font-display text-4xl tracking-tight">
                {detail.device.name}
              </h2>
              <p className="mt-2 text-sm text-white/80">
                <span className="font-medium text-white">
                  {detail.device.currentPatient?.fullName || "Sem paciente ativo"}
                </span>
                <span className="mx-2 text-white/40">•</span>
                {detail.device.location || "Local não informado"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/65">
                <span className="rounded-md bg-white/10 px-2 py-1 font-mono">
                  {detail.device.deviceIdentifier}
                </span>
                <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-white/45">
                  {detail.device.deviceUid}
                </span>
              </div>
            </div>
            <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-white/65">
                  <BatteryCharging className="h-4 w-4 text-amber-300" />
                  Bateria
                </div>
                <p className="mt-3 font-display text-3xl font-semibold">
                  {detail.device.status.batteryPercent ?? "--"}
                  <span className="ml-0.5 text-base font-medium text-white/65">%</span>
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-white/65">
                  <Signal className="h-4 w-4 text-teal-300" />
                  RSSI
                </div>
                <p className="mt-3 font-display text-3xl font-semibold">
                  {detail.device.status.wifiRssi ?? "--"}
                  <span className="ml-0.5 text-base font-medium text-white/65">dBm</span>
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-[10px] uppercase tracking-[0.24em] text-white/65">Claim</p>
                <p className="mt-3 text-sm font-semibold leading-snug">
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
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-petrol-700">
              Realtime desta tela
            </p>
            <h3 className="mt-2 font-display text-xl text-surface-900">
              Painel e device acompanhados em camadas separadas
            </h3>
          </div>
          <Badge tone={realtimeTone(connectionPhase) as never} dot>
            {humanizeRealtimePhase(connectionPhase)}
          </Badge>
        </div>
        <p className="mt-3 text-sm text-surface-600">{realtimeSummary}</p>
        <p className="mt-2 text-xs text-surface-500">
          Device offline significa ausência recente de status/telemetria MQTT no backend.
          Último contato: {formatRelativeTime(detail.device.status.lastSeenAt)}.
        </p>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
              Diagnostico de telemetria
            </p>
            <h3 className="mt-2 font-display text-2xl text-surface-900">
              Status MQTT separado de amostra valida do sensor
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-surface-600">
              O estado online vem de status/contato MQTT. O grafico so anda quando o backend
              recebe telemetry com eixos reais do MPU6050.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={detail.device.status.online ? "success" : "warning"} dot>
              {detail.device.status.online ? "Device online" : "Device offline"}
            </Badge>
            <Badge tone={isConnected ? "success" : "warning"} dot>
              {isConnected ? "Socket conectado" : "Socket desconectado"}
            </Badge>
            <Badge tone={currentState.tone as never}>{currentState.label}</Badge>
          </div>
        </div>

        {(onlineWithoutTelemetry || onlineWithStaleTelemetry || detail.device.status.sensorValid === false) ? (
          <div className="mt-5 grid gap-3">
            {onlineWithoutTelemetry || onlineWithStaleTelemetry ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                Dispositivo online, mas sem telemetria recente. Verifique se o ESP32 esta
                publicando no topico telemetry, se o MPU6050 esta gerando leitura valida e
                se o broker/IP esta correto.
              </div>
            ) : null}
            {detail.device.status.sensorValid === false ? (
              <div className="rounded-2xl border border-danger-100 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700">
                O ultimo status informou sensor_valid=0. O problema mais provavel esta no
                MPU6050, barramento I2C ou idade da ultima amostra.
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DiagnosticMetric
            label="Ultimo status"
            value={formatRelativeTime(detail.device.status.lastSeenAt)}
          />
          <DiagnosticMetric
            label="Ultima telemetria"
            value={lastTelemetryAt ? formatRelativeTime(lastTelemetryAt) : "Sem amostra real"}
          />
          <DiagnosticMetric
            label="Ultimo evento"
            value={lastEventAt ? formatRelativeTime(lastEventAt) : "Sem evento recente"}
          />
          <DiagnosticMetric
            label="Socket painel"
            value={humanizeRealtimePhase(connectionPhase)}
          />
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <DiagnosticMetric label="Topico status esperado" value={statusTopic} mono />
          <DiagnosticMetric label="Topico telemetry esperado" value={telemetryTopic} mono />
          <DiagnosticMetric label="Topico events esperado" value={eventsTopic} mono />
          <DiagnosticMetric
            label="Status observado"
            value={formatTopicValue(detail.device.status.lastStatusTopic)}
            mono
          />
          <DiagnosticMetric
            label="Telemetry observado"
            value={formatTopicValue(detail.device.status.lastTelemetryTopic)}
            mono
          />
          <DiagnosticMetric
            label="Events observado"
            value={formatTopicValue(detail.device.status.lastEventTopic)}
            mono
          />
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DiagnosticMetric label="device_uid" value={detail.device.deviceUid} mono />
          <DiagnosticMetric label="device_identifier" value={detail.device.deviceIdentifier} mono />
          <DiagnosticMetric
            label="sensor_ready"
            value={formatBooleanDiagnostic(detail.device.status.sensorReady)}
          />
          <DiagnosticMetric
            label="sensor_valid"
            value={formatBooleanDiagnostic(detail.device.status.sensorValid)}
          />
          <DiagnosticMetric
            label="sensor_read_ok"
            value={formatBooleanDiagnostic(detail.device.status.sensorReadOk)}
          />
          <DiagnosticMetric
            label="sample_age_ms"
            value={formatNumberDiagnostic(detail.device.status.sensorSampleAgeMs)}
          />
          <DiagnosticMetric
            label="i2c_last_error"
            value={detail.device.status.i2cLastError || "--"}
          />
          <DiagnosticMetric
            label="i2c counters"
            value={`${formatNumberDiagnostic(detail.device.status.i2cErrorCount)} erros / ${formatNumberDiagnostic(detail.device.status.i2cRecoveryCount)} recoveries`}
          />
        </div>
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
                {currentState.label}
              </p>
              <p className="mt-1 text-xs text-surface-600">
                Confianca {humanizeDeviceBehaviorConfidence(detail.device.behavior.confidence)} -
                heuristica experimental
              </p>
              <p className="mt-2 text-xs text-surface-500">{currentState.reason}</p>
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
                  {alert.event.eventType === "fall_detected" ? (
                    <EvidenceSummary event={alert.event} />
                  ) : null}
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
                {event.eventType === "fall_detected" ? (
                  <EvidenceSummary event={event} />
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
