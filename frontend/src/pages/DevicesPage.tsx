import { useDeferredValue, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Edit3, QrCode, ShieldCheck, UsersRound } from "lucide-react";
import toast from "react-hot-toast";
import { QRCodeSVG } from "qrcode.react";

import { DeviceFormModal, type DeviceFormValues } from "../components/devices/DeviceFormModal";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingState } from "../components/ui/LoadingState";
import { Modal } from "../components/ui/Modal";
import { useAuth } from "../contexts/AuthContext";
import { useRealtime } from "../contexts/RealtimeContext";
import { formatDateTime, formatRelativeTime } from "../lib/format";
import { api, getErrorMessage } from "../services/api";
import type {
  Device,
  NetworkInfoResponse,
  PairingSession,
  PatientRecord,
} from "../types/api";

type PairingFormState = {
  patientId: string;
  expiresInMinutes: string;
};

type AssignmentFormState = {
  patientId: string;
  reason: string;
};

const emptyPairingForm: PairingFormState = {
  patientId: "",
  expiresInMinutes: "10",
};

const emptyAssignmentForm: AssignmentFormState = {
  patientId: "",
  reason: "",
};

export function DevicesPage() {
  const { socket } = useRealtime();
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
  const deferredSearch = useDeferredValue(search);

  const canManageDevices =
    activeRole === "organization_admin" || user?.globalRole === "platform_admin";
  const pairingQrPayload =
    latestPairingSession && selectedBackendApiBaseUrl
      ? JSON.stringify(
          {
            backendApiBaseUrl: selectedBackendApiBaseUrl,
            pairingCode: latestPairingSession.pairingCode,
          },
          null,
          2,
        )
      : "";

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
    setPairingForm(emptyPairingForm);
    setPairingModalOpen(true);
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

    socket.on("device:status", refresh);
    socket.on("alert:new", refresh);
    socket.on("alert:updated", refresh);

    return () => {
      active = false;
      socket.off("device:status", refresh);
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

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
              Inventário pareado
            </p>
            <h2 className="mt-2 font-display text-3xl text-surface-900">
              Devices vinculados e em onboarding
            </h2>
            <p className="mt-2 text-sm text-surface-600">
              O backend agora distingue descoberta técnica, claim seguro por código
              temporário e vínculo do device com o paciente certo.
            </p>
          </div>
          {canManageDevices ? (
            <Button onClick={openPairingModal}>
              <ShieldCheck className="h-4 w-4" />
              Parear dispositivo
            </Button>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_220px_220px]">
          <div>
            <label className="label">Buscar por nome, UID ou identificador</label>
            <input
              className="field"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar dispositivo..."
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
          {devices.map((device) => (
            <Card key={device.id} className="overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={device.status.online ? "success" : "neutral"}>
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
                    {device.activeAlerts > 0 ? (
                      <Badge tone="danger">{device.activeAlerts} alertas</Badge>
                    ) : null}
                  </div>
                  <h3 className="mt-3 font-display text-2xl text-surface-900">
                    {device.name}
                  </h3>
                  <p className="mt-1 text-sm text-surface-600">
                    {device.currentPatient?.fullName || "Sem paciente ativo"} •{" "}
                    {device.location || "Local não informado"}
                  </p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.22em] text-surface-500">
                    {device.deviceIdentifier}
                  </p>
                  <p className="mt-1 text-xs text-surface-500">{device.deviceUid}</p>
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
                <div className="rounded-[24px] bg-surface-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-surface-500">
                    Bateria
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-surface-900">
                    {device.status.batteryPercent ?? "--"}%
                  </p>
                </div>
                <div className="rounded-[24px] bg-surface-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-surface-500">
                    RSSI
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-surface-900">
                    {device.status.wifiRssi ?? "--"}
                  </p>
                </div>
                <div className="rounded-[24px] bg-surface-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-surface-500">
                    Último contato
                  </p>
                  <p className="mt-2 text-sm font-semibold text-surface-900">
                    {formatRelativeTime(device.status.lastSeenAt)}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-surface-600">
                  Claim em {device.claimedAt ? formatDateTime(device.claimedAt) : "aguardando"}
                </span>
                <Link
                  className="rounded-full bg-surface-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-surface-700"
                  to={`/devices/${device.id}`}
                >
                  Ver detalhe
                </Link>
              </div>
            </Card>
          ))}
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
                onClick={() => {
                  setPairingModalOpen(false);
                  setLatestPairingSession(null);
                }}
                type="button"
                variant="secondary"
              >
                Fechar
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-3">
              <Button onClick={() => setPairingModalOpen(false)} type="button" variant="secondary">
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
        onClose={() => {
          setPairingModalOpen(false);
          setLatestPairingSession(null);
        }}
        open={pairingModalOpen}
        subtitle="O código é temporário, de uso único e deve ser inserido no portal local do ESP32."
        title="Parear dispositivo"
      >
        {latestPairingSession ? (
          <div className="space-y-4">
            <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-6 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-emerald-700">
                Código de pareamento
              </p>
              <p className="mt-4 font-display text-5xl text-emerald-900">
                {latestPairingSession.pairingCode}
              </p>
              <p className="mt-4 text-sm text-emerald-900">
                Expira em {formatDateTime(latestPairingSession.expiresAt)}.
              </p>
              {latestPairingSession.patientName ? (
                <p className="mt-2 text-sm text-emerald-900">
                  Paciente inicial: {latestPairingSession.patientName}
                </p>
              ) : null}
            </div>
            <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
              <div className="space-y-4">
                <div className="rounded-[24px] border border-surface-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
                        Backend sugerido para o ESP32
                      </p>
                      <p className="mt-2 break-all text-sm font-semibold text-surface-900">
                        {selectedBackendApiBaseUrl || "Nao foi possivel sugerir um IP automaticamente."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
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
                      Descobrindo IPs locais candidatos do backend...
                    </p>
                  ) : null}

                  {networkInfoError ? (
                    <p className="mt-3 text-sm text-amber-700">
                      Nao foi possivel sugerir a URL automaticamente: {networkInfoError}
                    </p>
                  ) : null}

                  {networkInfo?.candidateBackendApiBaseUrls.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {networkInfo.candidateBackendApiBaseUrls.map((candidate) => (
                        <button
                          key={candidate}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            candidate === selectedBackendApiBaseUrl
                              ? "border-surface-900 bg-surface-900 text-white"
                              : "border-surface-200 bg-surface-50 text-surface-700 hover:border-surface-300"
                          }`}
                          onClick={() => setSelectedBackendApiBaseUrl(candidate)}
                          type="button"
                        >
                          {candidate}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

              </div>

              <div className="rounded-[28px] border border-surface-200 bg-white p-5">
                <div className="flex items-center gap-2 text-surface-700">
                  <QrCode className="h-5 w-5" />
                  <p className="text-sm font-semibold">QR do pairing</p>
                </div>
                {pairingQrPayload ? (
                  <div className="mt-4 flex flex-col items-center gap-4">
                    <div className="rounded-[24px] border border-surface-100 bg-white p-4">
                      <QRCodeSVG
                        bgColor="#ffffff"
                        fgColor="#15312a"
                        includeMargin
                        size={190}
                        value={pairingQrPayload}
                      />
                    </div>
                    <p className="max-w-xs text-center text-sm text-surface-600">
                      Escaneie o QR ou preencha a URL e o codigo no portal do ESP32.
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-surface-500">
                    Informe ou escolha uma URL valida do backend para gerar o QR.
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-[24px] bg-surface-50 p-4 text-sm text-surface-700">
              <p className="font-semibold text-surface-900">Como usar</p>
              <ol className="mt-3 list-decimal space-y-2 pl-5">
                <li>Abra o portal local do ESP32.</li>
                <li>Preencha a URL real do backend acessível na rede.</li>
                <li>Digite este código temporário.</li>
                <li>O backend fará o claim transacional do device para a organização.</li>
              </ol>
            </div>
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
