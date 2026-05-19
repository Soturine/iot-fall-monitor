import { useDeferredValue, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Edit3, ShieldCheck, UsersRound } from "lucide-react";
import toast from "react-hot-toast";

import { DeviceFormModal, type DeviceFormValues } from "../components/devices/DeviceFormModal";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingState } from "../components/ui/LoadingState";
import { Modal } from "../components/ui/Modal";
import { useAuth } from "../contexts/AuthContext";
import { useRealtime } from "../contexts/RealtimeContext";
import { cn } from "../lib/cn";
import { applyTelemetryPatchToDeviceList } from "../lib/deviceRealtime";
import {
  deviceBehaviorTone,
  formatDateTime,
  formatRelativeTime,
  humanizeDeviceBehaviorConfidence,
  humanizeDeviceBehaviorState,
  humanizeRealtimePhase,
  humanizeSocketDisconnectReason,
  realtimeTone,
} from "../lib/format";
import { api, getErrorMessage } from "../services/api";
import type {
  Device,
  NetworkInfoResponse,
  PairingClaimRealtimeEvent,
  PairingSession,
  PatientRecord,
  TelemetryRealtimeEvent,
} from "../types/api";

type PairingFormState = {
  patientId: string;
  expiresInMinutes: string;
};

type AssignmentFormState = {
  patientId: string;
  reason: string;
};

type PairingClaimSuccessState = {
  device: Device;
  patientName: string | null;
  autoCloseAtMs: number;
};

const emptyPairingForm: PairingFormState = {
  patientId: "",
  expiresInMinutes: "10",
};

const emptyAssignmentForm: AssignmentFormState = {
  patientId: "",
  reason: "",
};

function formatPairingCountdown(expiresAt?: string | null, nowMs = Date.now()) {
  if (!expiresAt) {
    return {
      expired: false,
      label: "Validade nao informada",
    };
  }

  const expiresAtMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresAtMs)) {
    return {
      expired: false,
      label: "Validade invalida",
    };
  }

  const remainingMs = expiresAtMs - nowMs;
  if (remainingMs <= 0) {
    return {
      expired: true,
      label: "Expirado",
    };
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return {
    expired: false,
    label: minutes > 0 ? `${minutes} min ${seconds}s restantes` : `${seconds}s restantes`,
  };
}

export function DevicesPage() {
  const {
    connectionPhase,
    isConnected,
    lastConnectError,
    lastConnectErrorCode,
    lastDisconnectReason,
    socket,
  } = useRealtime();
  const { activeRole, user } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [claimStatus, setClaimStatus] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [pairingModalOpen, setPairingModalOpen] = useState(false);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [assigningDevice, setAssigningDevice] = useState<Device | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pairingSubmitting, setPairingSubmitting] = useState(false);
  const [assignmentSubmitting, setAssignmentSubmitting] = useState(false);
  const [pairingForm, setPairingForm] = useState<PairingFormState>(emptyPairingForm);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(emptyAssignmentForm);
  const [latestPairingSession, setLatestPairingSession] = useState<PairingSession | null>(null);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfoResponse | null>(null);
  const [networkInfoLoading, setNetworkInfoLoading] = useState(false);
  const [networkInfoError, setNetworkInfoError] = useState("");
  const [selectedBackendApiBaseUrl, setSelectedBackendApiBaseUrl] = useState("");
  const [pairingNowMs, setPairingNowMs] = useState(Date.now());
  const [pairingClaimSuccess, setPairingClaimSuccess] =
    useState<PairingClaimSuccessState | null>(null);
  const deferredSearch = useDeferredValue(search);

  const canManageDevices =
    activeRole === "organization_admin" || user?.globalRole === "platform_admin";
  const primaryBackendApiBaseUrl =
    networkInfo?.primaryBackendApiBaseUrl ||
    networkInfo?.suggestedBackendApiBaseUrl ||
    networkInfo?.candidateBackendApiBaseUrls[0] ||
    "";
  const fallbackBackendApiBaseUrls =
    networkInfo?.fallbackBackendApiBaseUrls ||
    networkInfo?.candidateBackendApiBaseUrls.filter(
      (candidate) => candidate !== primaryBackendApiBaseUrl,
    ) ||
    [];
  const pairingStatus = formatPairingCountdown(latestPairingSession?.expiresAt, pairingNowMs);
  const pairingSuccessCountdownSeconds = pairingClaimSuccess
    ? Math.max(0, Math.ceil((pairingClaimSuccess.autoCloseAtMs - pairingNowMs) / 1000))
    : 0;

  async function copyToClipboard(value: string, successMessage: string) {
    if (!value) {
      toast.error("Nada para copiar.");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
    } catch {
      toast.error("Nao foi possivel copiar automaticamente neste navegador.");
    }
  }

  function openPairingModal() {
    setLatestPairingSession(null);
    setPairingClaimSuccess(null);
    setPairingForm(emptyPairingForm);
    setPairingModalOpen(true);
  }

  function resetGeneratedPairingCode() {
    setLatestPairingSession(null);
    setPairingClaimSuccess(null);
    setPairingNowMs(Date.now());
  }

  function closePairingModal() {
    setPairingModalOpen(false);
    setLatestPairingSession(null);
    setPairingClaimSuccess(null);
    setPairingNowMs(Date.now());
  }

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);

      try {
        const [devicesResponse, patientsResponse] = await Promise.all([
          api.get<{ items: Device[] }>("/devices", {
            params: {
              search: deferredSearch || undefined,
              status: status || undefined,
              claimStatus: claimStatus || undefined,
              limit: 40,
            },
          }),
          api.get<{ items: PatientRecord[] }>("/patients"),
        ]);

        if (!active) {
          return;
        }

        setDevices(devicesResponse.data.items);
        setPatients(patientsResponse.data.items);
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
      setDevices((current) =>
        applyTelemetryPatchToDeviceList(current, telemetryEvent),
      );
    };

    socket.on("device:status", refresh);
    socket.on("telemetry:new", handleTelemetry);
    socket.on("alert:new", refresh);
    socket.on("alert:updated", refresh);

    return () => {
      active = false;
      socket.off("device:status", refresh);
      socket.off("telemetry:new", handleTelemetry);
      socket.off("alert:new", refresh);
      socket.off("alert:updated", refresh);
    };
  }, [claimStatus, deferredSearch, socket, status]);

  useEffect(() => {
    if (!pairingModalOpen || !canManageDevices) {
      return;
    }

    let active = true;

    async function loadNetworkInfo() {
      setNetworkInfoLoading(true);
      setNetworkInfoError("");

      try {
        const response = await api.get<NetworkInfoResponse>("/system/network-info");
        if (!active) {
          return;
        }

        setNetworkInfo(response.data);
        setSelectedBackendApiBaseUrl(
          response.data.primaryBackendApiBaseUrl ||
            response.data.suggestedBackendApiBaseUrl ||
            response.data.candidateBackendApiBaseUrls[0] ||
            "",
        );
      } catch (error) {
        if (!active) {
          return;
        }

        setNetworkInfo(null);
        setSelectedBackendApiBaseUrl("");
        setNetworkInfoError(getErrorMessage(error));
      } finally {
        if (active) {
          setNetworkInfoLoading(false);
        }
      }
    }

    void loadNetworkInfo();

    return () => {
      active = false;
    };
  }, [canManageDevices, pairingModalOpen]);

  useEffect(() => {
    if (!pairingModalOpen || (!latestPairingSession?.expiresAt && !pairingClaimSuccess)) {
      return;
    }

    setPairingNowMs(Date.now());

    const timer = window.setInterval(() => {
      setPairingNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [latestPairingSession?.expiresAt, pairingClaimSuccess, pairingModalOpen]);

  useEffect(() => {
    if (!socket || !pairingModalOpen || !latestPairingSession) {
      return;
    }

    const handleDeviceClaimed = (event: PairingClaimRealtimeEvent) => {
      if (event.pairingSessionId !== latestPairingSession.id) {
        return;
      }

      setPairingNowMs(Date.now());
      setPairingClaimSuccess({
        device: event.device,
        patientName: event.patientProfile?.patientName || event.device.currentPatient?.fullName || null,
        autoCloseAtMs: Date.now() + 5000,
      });
      setDevices((current) =>
        current.some((device) => device.id === event.device.id)
          ? current.map((device) => (device.id === event.device.id ? event.device : device))
          : current,
      );
      toast.success(`Pareamento concluido para ${event.device.name}.`);
    };

    socket.on("device:claimed", handleDeviceClaimed);

    return () => {
      socket.off("device:claimed", handleDeviceClaimed);
    };
  }, [latestPairingSession, pairingModalOpen, socket]);

  useEffect(() => {
    if (!pairingModalOpen || !pairingClaimSuccess) {
      return;
    }

    const timer = window.setTimeout(() => {
      setPairingModalOpen(false);
      setLatestPairingSession(null);
      setPairingClaimSuccess(null);
      setPairingNowMs(Date.now());
    }, Math.max(pairingClaimSuccess.autoCloseAtMs - Date.now(), 0));

    return () => {
      window.clearTimeout(timer);
    };
  }, [pairingClaimSuccess, pairingModalOpen]);

  async function submitDevice(values: DeviceFormValues) {
    if (!editingDevice) {
      return;
    }

    setSubmitting(true);

    try {
      const response = await api.put<{ device: Device }>(
        `/devices/${editingDevice.id}`,
        values,
      );
      setDevices((current) =>
        current.map((device) =>
          device.id === editingDevice.id ? response.data.device : device,
        ),
      );
      setEditModalOpen(false);
      setEditingDevice(null);
      toast.success("Dispositivo atualizado.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPairingCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPairingSubmitting(true);

    try {
      const response = await api.post<{ session: PairingSession }>(
        "/devices/pairing-sessions",
        {
          patientId: pairingForm.patientId ? Number(pairingForm.patientId) : null,
          expiresInMinutes: Number(pairingForm.expiresInMinutes || 10),
        },
      );

      setLatestPairingSession(response.data.session);
      setPairingClaimSuccess(null);
      setPairingNowMs(Date.now());
      toast.success("Código de pareamento gerado.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPairingSubmitting(false);
    }
  }

  async function submitAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assigningDevice) {
      return;
    }

    setAssignmentSubmitting(true);

    try {
      const response = await api.post<{ device: Device }>(
        `/devices/${assigningDevice.id}/assign-patient`,
        {
          patientId: assignmentForm.patientId ? Number(assignmentForm.patientId) : null,
          reason: assignmentForm.reason || undefined,
        },
      );

      setDevices((current) =>
        current.map((device) =>
          device.id === assigningDevice.id ? response.data.device : device,
        ),
      );
      setAssignmentModalOpen(false);
      setAssigningDevice(null);
      setAssignmentForm(emptyAssignmentForm);
      toast.success("Vínculo do dispositivo atualizado.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setAssignmentSubmitting(false);
    }
  }

  if (loading && !devices.length) {
    return <LoadingState label="Buscando dispositivos da organização..." />;
  }

  const offlineDevices = devices.filter((device) => !device.status.online).length;
  const realtimeSummary = isConnected
    ? "Socket do painel conectado. Device offline continua significando ausencia recente de status/telemetria MQTT no backend."
    : lastConnectError
      ? `${lastConnectError}${lastConnectErrorCode ? ` (${lastConnectErrorCode})` : ""}`
      : `Socket do painel desconectado: ${humanizeSocketDisconnectReason(lastDisconnectReason)}. O inventario continua mostrando o ultimo snapshot conhecido.`;

  const claimedCount = devices.filter((d) => d.claimStatus === "claimed").length;
  const activeAlertsCount = devices.reduce((acc, d) => acc + (d.activeAlerts || 0), 0);

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden border-white/60 bg-gradient-to-br from-white via-white to-teal-50/40">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-petrol-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-petrol-700 text-white shadow-soft">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-petrol-700">
                Inventário pareado
              </p>
            </div>
            <h2 className="mt-3 font-display text-3xl text-surface-900 lg:text-4xl">
              Devices vinculados e em onboarding
            </h2>
            <p className="mt-2 text-sm leading-6 text-surface-600">
              Descoberta técnica, claim seguro por código temporário e vínculo
              do device ao paciente certo — tudo em um único fluxo.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone={realtimeTone(connectionPhase) as never} dot>
                {humanizeRealtimePhase(connectionPhase)}
              </Badge>
              <Badge tone={offlineDevices > 0 ? "warning" : "success"} dot>
                {offlineDevices} sem telemetria recente
              </Badge>
              <Badge tone="info">{claimedCount} claimed</Badge>
              {activeAlertsCount > 0 ? (
                <Badge tone="danger">{activeAlertsCount} alertas ativos</Badge>
              ) : null}
            </div>
            <p className="mt-3 max-w-3xl text-xs leading-5 text-surface-500">
              {realtimeSummary}
            </p>
          </div>
          {canManageDevices ? (
            <Button className="shadow-soft" onClick={openPairingModal}>
              <ShieldCheck className="h-4 w-4" />
              Parear dispositivo
            </Button>
          ) : null}
        </div>

        <div className="relative mt-6 grid gap-3 md:grid-cols-[1fr_200px_200px]">
          <div>
            <label className="label">Buscar dispositivo</label>
            <input
              className="field"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome, UID ou identificador..."
              value={search}
            />
          </div>
          <div>
            <label className="label">Status online</label>
            <select className="field" onChange={(event) => setStatus(event.target.value)} value={status}>
              <option value="">Todos</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
            </select>
          </div>
          <div>
            <label className="label">Claim</label>
            <select
              className="field"
              onChange={(event) => setClaimStatus(event.target.value)}
              value={claimStatus}
            >
              <option value="">Todos</option>
              <option value="claimed">Claimed</option>
              <option value="unclaimed">Unclaimed</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>
      </Card>

      {devices.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {devices.map((device) => {
            const battery = device.status.batteryPercent;
            const batteryTone =
              typeof battery !== "number"
                ? "text-surface-500"
                : battery <= 15
                  ? "text-danger-600"
                  : battery <= 35
                    ? "text-amber-600"
                    : "text-teal-700";
            const rssi = device.status.wifiRssi;
            const rssiTone =
              typeof rssi !== "number"
                ? "text-surface-500"
                : rssi >= -60
                  ? "text-teal-700"
                  : rssi >= -75
                    ? "text-amber-600"
                    : "text-danger-600";

            return (
              <Card
                key={device.id}
                className="group relative overflow-hidden transition hover:-translate-y-0.5 hover:shadow-panel"
              >
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 w-1",
                    device.status.online
                      ? "bg-gradient-to-b from-teal-400 to-teal-600"
                      : "bg-gradient-to-b from-surface-300 to-surface-400",
                  )}
                />
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={device.status.online ? "success" : "muted"} dot>
                        {device.status.online ? "Online" : "Offline"}
                      </Badge>
                      <Badge
                        tone={
                          device.claimStatus === "claimed"
                            ? "info"
                            : device.claimStatus === "disabled"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {device.claimStatus}
                      </Badge>
                      <Badge tone={deviceBehaviorTone(device.behavior.state) as never}>
                        {humanizeDeviceBehaviorState(device.behavior.state)}
                      </Badge>
                      {device.activeAlerts > 0 ? (
                        <Badge tone="critical">{device.activeAlerts} alertas</Badge>
                      ) : null}
                    </div>
                    <h3 className="mt-3 font-display text-2xl text-surface-900 truncate">
                      {device.name}
                    </h3>
                    <p className="mt-1 text-sm text-surface-600">
                      <span className="font-medium text-surface-800">
                        {device.currentPatient?.fullName || "Sem paciente ativo"}
                      </span>
                      <span className="mx-1.5 text-surface-300">•</span>
                      {device.location || "Local não informado"}
                    </p>
                    <p className="mt-2 text-xs text-surface-500">
                      Heurística: {humanizeDeviceBehaviorState(device.behavior.state)} ·
                      confiança {humanizeDeviceBehaviorConfidence(device.behavior.confidence)}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-surface-500">
                      <span className="rounded-md bg-surface-100 px-2 py-0.5 font-mono">
                        {device.deviceIdentifier}
                      </span>
                      <span className="rounded-md bg-surface-50 px-2 py-0.5 font-mono text-surface-400">
                        {device.deviceUid}
                      </span>
                    </div>
                  </div>
                  {canManageDevices ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => {
                          setEditingDevice(device);
                          setEditModalOpen(true);
                        }}
                        variant="secondary"
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      {device.claimStatus === "claimed" ? (
                        <Button
                          onClick={() => {
                            setAssigningDevice(device);
                            setAssignmentForm({
                              patientId: device.currentPatient?.id
                                ? String(device.currentPatient.id)
                                : "",
                              reason: "",
                            });
                            setAssignmentModalOpen(true);
                          }}
                          variant="secondary"
                        >
                          <UsersRound className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-surface-100 bg-gradient-to-br from-white to-surface-50 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-surface-500">
                      Bateria
                    </p>
                    <p className={cn("mt-2 font-display text-2xl font-semibold", batteryTone)}>
                      {battery ?? "--"}
                      <span className="ml-0.5 text-sm font-medium text-surface-500">%</span>
                    </p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-100">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          typeof battery === "number" && battery <= 15
                            ? "bg-danger-500"
                            : typeof battery === "number" && battery <= 35
                              ? "bg-amber-500"
                              : "bg-teal-500",
                        )}
                        style={{ width: `${Math.max(0, Math.min(100, battery ?? 0))}%` }}
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-surface-100 bg-gradient-to-br from-white to-surface-50 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-surface-500">
                      RSSI
                    </p>
                    <p className={cn("mt-2 font-display text-2xl font-semibold", rssiTone)}>
                      {rssi ?? "--"}
                      <span className="ml-0.5 text-sm font-medium text-surface-500">dBm</span>
                    </p>
                    <p className="mt-2 text-[11px] text-surface-500">
                      {typeof rssi === "number"
                        ? rssi >= -60
                          ? "Sinal excelente"
                          : rssi >= -75
                            ? "Sinal aceitável"
                            : "Sinal fraco"
                        : "Sem leitura"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-surface-100 bg-gradient-to-br from-white to-surface-50 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-surface-500">
                      Último contato
                    </p>
                    <p className="mt-2 text-sm font-semibold text-surface-900">
                      {formatRelativeTime(device.status.lastSeenAt)}
                    </p>
                    <p className="mt-2 text-[11px] text-surface-500 truncate">
                      {device.status.lastSeenAt
                        ? formatDateTime(device.status.lastSeenAt)
                        : "Sem registros"}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-surface-100 pt-4">
                  <span className="text-xs text-surface-600">
                    Claim{" "}
                    <span className="font-semibold text-surface-800">
                      {device.claimedAt ? formatDateTime(device.claimedAt) : "aguardando"}
                    </span>
                  </span>
                  <Link
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-petrol-700 to-petrol-900 px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:from-petrol-800 hover:to-petrol-950"
                    to={`/devices/${device.id}`}
                  >
                    Ver detalhe
                    <span aria-hidden>→</span>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          action={
            canManageDevices ? (
              <Button onClick={openPairingModal}>
                <ShieldCheck className="h-4 w-4" />
                Gerar código de pairing
              </Button>
            ) : undefined
          }
          description="Devices descobertos só entram de fato no tenant depois do claim com código temporário e uso único."
          title="Nenhum dispositivo visível neste escopo"
        />
      )}

      <DeviceFormModal
        key={editingDevice ? `device-${editingDevice.id}` : "device-empty"}
        identifierLabel={
          editingDevice
            ? `${editingDevice.deviceIdentifier} • ${editingDevice.deviceUid}`
            : undefined
        }
        initialValues={
          editingDevice
            ? {
                name: editingDevice.name,
                location: editingDevice.location,
                isActive: editingDevice.isActive,
              }
            : undefined
        }
        onClose={() => {
          setEditModalOpen(false);
          setEditingDevice(null);
        }}
        onSubmit={submitDevice}
        open={editModalOpen}
        submitting={submitting}
      />

      <Modal
        footer={
          latestPairingSession ? (
            <div className="flex items-center justify-end gap-3">
              <Button
                onClick={resetGeneratedPairingCode}
                type="button"
                variant="secondary"
              >
                Gerar novo codigo
              </Button>
              <Button
                onClick={closePairingModal}
                type="button"
                variant={pairingClaimSuccess ? "primary" : "secondary"}
              >
                {pairingClaimSuccess ? "Fechar agora" : "Fechar"}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-3">
              <Button onClick={closePairingModal} type="button" variant="secondary">
                Fechar
              </Button>
              <Button
                disabled={pairingSubmitting}
                form="pairing-form"
                type="submit"
              >
                {pairingSubmitting ? "Gerando..." : "Gerar código"}
              </Button>
            </div>
          )
        }
        onClose={closePairingModal}
        open={pairingModalOpen}
        subtitle="O código é temporário, de uso único e deve ser inserido no portal local do ESP32."
        title="Parear dispositivo"
      >
        {latestPairingSession ? (
          <div className="space-y-4">
            {pairingClaimSuccess ? (
              <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-emerald-700">
                      Pareamento concluido
                    </p>
                    <h3 className="mt-2 font-display text-3xl text-emerald-900">
                      Device claimed com sucesso
                    </h3>
                    <p className="mt-3 text-sm text-emerald-900">
                      O codigo {latestPairingSession.pairingCode} ja foi utilizado e nao esta mais
                      ativo.
                    </p>
                    <p className="mt-2 text-sm text-emerald-900">
                      Device: <span className="font-semibold">{pairingClaimSuccess.device.name}</span>
                    </p>
                    <p className="mt-1 text-sm text-emerald-900">
                      Identificador: {pairingClaimSuccess.device.deviceIdentifier}
                    </p>
                    <p className="mt-1 text-sm text-emerald-900">
                      Paciente: {pairingClaimSuccess.patientName || "Sem paciente inicial"}
                    </p>
                  </div>
                  <Badge tone="success">Claimed</Badge>
                </div>
                <div className="mt-5 rounded-[20px] bg-white/70 p-4 text-sm text-emerald-900">
                  <p className="font-semibold">Feedback do dashboard</p>
                  <ul className="mt-2 space-y-2">
                    <li>A lista de devices recebeu o claim concluido.</li>
                    <li>O codigo saiu do estado ativo e foi marcado como utilizado.</li>
                    <li>
                      Esta janela fecha automaticamente em {pairingSuccessCountdownSeconds}s, ou
                      voce pode fechar agora.
                    </li>
                  </ul>
                </div>
              </div>
            ) : (
              <>
            <div
              className={`rounded-[28px] border p-6 text-center ${
                pairingStatus.expired
                  ? "border-amber-200 bg-amber-50"
                  : "border-emerald-200 bg-emerald-50"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 text-left">
                <div>
                  <p
                    className={`text-xs font-bold uppercase tracking-[0.3em] ${
                      pairingStatus.expired ? "text-amber-700" : "text-emerald-700"
                    }`}
                  >
                    Codigo temporario
                  </p>
                  <p
                    className={`mt-2 text-sm font-semibold ${
                      pairingStatus.expired ? "text-amber-900" : "text-emerald-900"
                    }`}
                  >
                    {pairingStatus.expired ? "Expirado" : "Valido agora"}
                  </p>
                </div>
                <Button
                  onClick={() =>
                    copyToClipboard(
                      latestPairingSession.pairingCode,
                      "Codigo de pairing copiado.",
                    )
                  }
                  type="button"
                  variant="secondary"
                >
                  <Copy className="h-4 w-4" />
                  Copiar codigo
                </Button>
              </div>
              <p
                className={`text-xs font-bold uppercase tracking-[0.3em] ${
                  pairingStatus.expired ? "text-amber-700" : "text-emerald-700"
                }`}
              >
                Código de pareamento
              </p>
              <p
                className={`mt-4 font-display text-5xl ${
                  pairingStatus.expired ? "text-amber-900" : "text-emerald-900"
                }`}
              >
                {latestPairingSession.pairingCode}
              </p>
              <p
                className={`mt-4 text-sm ${
                  pairingStatus.expired ? "text-amber-900" : "text-emerald-900"
                }`}
              >
                Expira em {formatDateTime(latestPairingSession.expiresAt)}.
              </p>
              <p
                className={`mt-2 text-sm font-semibold ${
                  pairingStatus.expired ? "text-amber-900" : "text-emerald-900"
                }`}
              >
                {pairingStatus.label}
              </p>
              {latestPairingSession.patientName ? (
                <p
                  className={`mt-2 text-sm ${
                    pairingStatus.expired ? "text-amber-900" : "text-emerald-900"
                  }`}
                >
                  Paciente inicial: {latestPairingSession.patientName}
                </p>
              ) : null}
              {pairingStatus.expired ? (
                <p className="mt-3 text-sm text-amber-900">
                  Gere um novo codigo no dashboard antes de tentar novamente.
                </p>
              ) : null}
            </div>
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <div className="rounded-[24px] border border-surface-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
                        URL principal recomendada
                      </p>
                      <p className="mt-2 break-all text-sm font-semibold text-surface-900">
                        {primaryBackendApiBaseUrl || "Nao foi possivel detectar a melhor URL automaticamente."}
                      </p>
                      <p className="mt-2 text-sm text-surface-600">
                        Use esta URL primeiro. As outras opcoes ficam abaixo apenas como fallback.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={!selectedBackendApiBaseUrl}
                        onClick={() =>
                          copyToClipboard(
                            selectedBackendApiBaseUrl,
                            "URL do backend copiada.",
                          )
                        }
                        type="button"
                        variant="secondary"
                      >
                        <Copy className="h-4 w-4" />
                        Copiar URL
                      </Button>
                      <Button
                        onClick={() =>
                          copyToClipboard(
                            latestPairingSession.pairingCode,
                            "Codigo de pairing copiado.",
                          )
                        }
                        type="button"
                        variant="secondary"
                      >
                        <Copy className="h-4 w-4" />
                        Copiar codigo
                      </Button>
                    </div>
                  </div>

                  <label className="label mt-4">URL usada no pairing</label>
                  <input
                    className="field"
                    onChange={(event) => setSelectedBackendApiBaseUrl(event.target.value)}
                    placeholder="http://IP-DO-NOTEBOOK:4000"
                    value={selectedBackendApiBaseUrl}
                  />

                  {networkInfoLoading ? (
                    <p className="mt-3 text-sm text-surface-500">
                      Detectando a melhor URL do backend para esta rede...
                    </p>
                  ) : null}

                  {networkInfoError ? (
                    <p className="mt-3 text-sm text-amber-700">
                      Nao foi possivel sugerir a URL automaticamente: {networkInfoError}
                    </p>
                  ) : null}

                  {fallbackBackendApiBaseUrls.length ? (
                    <details className="mt-4 rounded-[20px] border border-surface-200 bg-surface-50 px-4 py-3">
                      <summary className="cursor-pointer list-none text-sm font-semibold text-surface-900">
                        Outras opcoes de rede
                      </summary>
                      <p className="mt-2 text-sm text-surface-600">
                        Use estas URLs apenas se a principal nao responder no celular ou no portal
                        do ESP32.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {fallbackBackendApiBaseUrls.map((candidate) => (
                          <button
                            key={candidate}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                              candidate === selectedBackendApiBaseUrl
                                ? "border-surface-900 bg-surface-900 text-white"
                                : "border-surface-200 bg-white text-surface-700 hover:border-surface-300"
                            }`}
                            onClick={() => setSelectedBackendApiBaseUrl(candidate)}
                            type="button"
                          >
                            {candidate}
                          </button>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>

              </div>

              <div className="rounded-[28px] border border-surface-200 bg-white p-5">
                <p className="text-sm font-semibold text-surface-900">
                  Como concluir no portal do ESP32
                </p>
                <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-surface-700">
                  <li>Abra o portal local do ESP32.</li>
                  <li>Preencha o campo Backend API base URL com a URL principal recomendada.</li>
                  <li>Digite o codigo temporario mostrado acima.</li>
                  <li>Clique em Parear agora.</li>
                </ol>
                <div className="mt-4 rounded-[20px] bg-surface-50 p-4 text-sm text-surface-700">
                  <p className="font-semibold text-surface-900">Avisos importantes</p>
                  <ul className="mt-3 space-y-2">
                    <li>O codigo expira rapido e pode ser usado uma unica vez.</li>
                    <li>Se o portal nao alcancar o backend, troque para uma URL de fallback.</li>
                    <li>Nao use localhost ou IP de adaptador virtual no ESP32.</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="rounded-[24px] bg-surface-50 p-4 text-sm text-surface-700">
              <p className="font-semibold text-surface-900">Como usar</p>
              <ol className="mt-3 list-decimal space-y-2 pl-5">
                <li>Abra o portal local do ESP32.</li>
                <li>Use primeiro a URL principal recomendada para a rede atual.</li>
                <li>Digite este codigo temporario antes da expiracao.</li>
                <li>Se necessario, abra Outras opcoes de rede e tente uma URL de fallback.</li>
                <li>O backend valida expiracao, uso unico e faz o claim do device na organizacao.</li>
              </ol>
            </div>
              </>
            )}
          </div>
        ) : (
          <form className="grid gap-4" id="pairing-form" onSubmit={submitPairingCode}>
            <div>
              <label className="label">Paciente inicial opcional</label>
              <select
                className="field"
                onChange={(event) =>
                  setPairingForm((current) => ({
                    ...current,
                    patientId: event.target.value,
                  }))
                }
                value={pairingForm.patientId}
              >
                <option value="">Parear sem paciente inicial</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Validade do código</label>
              <select
                className="field"
                onChange={(event) =>
                  setPairingForm((current) => ({
                    ...current,
                    expiresInMinutes: event.target.value,
                  }))
                }
                value={pairingForm.expiresInMinutes}
              >
                <option value="5">5 minutos</option>
                <option value="10">10 minutos</option>
                <option value="15">15 minutos</option>
              </select>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              onClick={() => {
                setAssignmentModalOpen(false);
                setAssigningDevice(null);
              }}
              type="button"
              variant="secondary"
            >
              Fechar
            </Button>
            <Button
              disabled={assignmentSubmitting}
              form="assignment-form"
              type="submit"
            >
              {assignmentSubmitting ? "Salvando..." : "Atualizar vínculo"}
            </Button>
          </div>
        }
        onClose={() => {
          setAssignmentModalOpen(false);
          setAssigningDevice(null);
        }}
        open={assignmentModalOpen}
        subtitle="Cada evento e amostra futura passam a gravar o escopo vigente desse vínculo."
        title={
          assigningDevice
            ? `Vincular ${assigningDevice.name}`
            : "Vincular dispositivo"
        }
      >
        <form className="grid gap-4" id="assignment-form" onSubmit={submitAssignment}>
          <div>
            <label className="label">Paciente</label>
            <select
              className="field"
              onChange={(event) =>
                setAssignmentForm((current) => ({
                  ...current,
                  patientId: event.target.value,
                }))
              }
              value={assignmentForm.patientId}
            >
              <option value="">Desvincular paciente atual</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.fullName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Motivo / observação</label>
            <input
              className="field"
              onChange={(event) =>
                setAssignmentForm((current) => ({
                  ...current,
                  reason: event.target.value,
                }))
              }
              placeholder="Ex.: troca de pulseira, novo quarto, manutenção"
              value={assignmentForm.reason}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
