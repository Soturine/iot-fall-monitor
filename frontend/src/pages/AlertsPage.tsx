import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Eye, ShieldCheck, ShieldOff, Siren, Undo2 } from "lucide-react";
import toast from "react-hot-toast";

import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingState } from "../components/ui/LoadingState";
import { Modal } from "../components/ui/Modal";
import { useAuth } from "../contexts/AuthContext";
import { useRealtime } from "../contexts/RealtimeContext";
import {
  formatDateTime,
  humanizeAlertStatus,
  humanizeSeverity,
  severityTone,
  statusTone,
} from "../lib/format";
import { api, getErrorMessage } from "../services/api";
import type { AlertRecord, Device, EventRecord } from "../types/api";

export function AlertsPage() {
  const { socket } = useRealtime();
  const { activeRole, user } = useAuth();
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<AlertRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: "",
    severity: "",
    deviceId: "",
    startDate: "",
    endDate: "",
  });
  const { status, severity, deviceId, startDate, endDate } = filters;
  const deferredDeviceId = useDeferredValue(deviceId);
  const alertParams = useMemo(
    () => ({
      status,
      severity,
      deviceId: deferredDeviceId,
      startDate,
      endDate,
      limit: 40,
    }),
    [
      deferredDeviceId,
      endDate,
      severity,
      startDate,
      status,
    ],
  );
  const eventParams = useMemo(
    () => ({
      deviceId: deferredDeviceId || undefined,
      severity: severity || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      limit: 18,
    }),
    [
      deferredDeviceId,
      endDate,
      severity,
      startDate,
    ],
  );

  const canMutateAlerts =
    ["organization_admin", "caregiver", "operator"].includes(activeRole || "") ||
    user?.globalRole === "platform_admin";

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);

      try {
        const [alertsResponse, eventsResponse, devicesResponse] = await Promise.all([
          api.get<{ items: AlertRecord[] }>("/alerts", { params: alertParams }),
          api.get<{ items: EventRecord[] }>("/events", { params: eventParams }),
          api.get<{ items: Device[] }>("/dashboard/device-status"),
        ]);

        if (!active) {
          return;
        }

        setAlerts(alertsResponse.data.items);
        setEvents(eventsResponse.data.items);
        setDevices(devicesResponse.data.items);
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

    socket.on("alert:new", refresh);
    socket.on("alert:updated", refresh);

    return () => {
      active = false;
      socket.off("alert:new", refresh);
      socket.off("alert:updated", refresh);
    };
  }, [
    alertParams,
    eventParams,
    socket,
  ]);

  async function openAlert(alertId: number) {
    try {
      const response = await api.get<{ alert: AlertRecord }>(`/alerts/${alertId}`);
      setSelectedAlert(response.data.alert);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function executeAction(alertId: number, action: "acknowledge" | "cancel" | "resolve") {
    try {
      const response = await api.post<{ alert: AlertRecord }>(`/alerts/${alertId}/${action}`);
      setAlerts((current) =>
        current.map((item) => (item.id === alertId ? response.data.alert : item)),
      );
      setSelectedAlert(response.data.alert);
      toast.success(`Alerta ${action} com sucesso.`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  if (loading && !alerts.length && !events.length) {
    return <LoadingState label="Carregando fila de alertas..." />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
              Resposta operacional
            </p>
            <h2 className="mt-2 font-display text-3xl text-surface-900">
              Alertas e histórico do escopo ativo
            </h2>
            <p className="mt-2 text-sm text-surface-600">
              Esta fila já chega filtrada pelo backend com base na organização ativa
              e, quando houver caregiver assignments, pelo conjunto de pacientes permitido.
            </p>
          </div>
          <Badge tone="danger">{alerts.filter((alert) => alert.status === "open").length} abertos</Badge>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <label className="label">Status</label>
            <select
              className="field"
              onChange={(event) =>
                setFilters((current) => ({ ...current, status: event.target.value }))
              }
              value={filters.status}
            >
              <option value="">Todos</option>
              <option value="open">Aberto</option>
              <option value="acknowledged">Em atendimento</option>
              <option value="resolved">Resolvido</option>
              <option value="canceled">Cancelado</option>
            </select>
          </div>
          <div>
            <label className="label">Severidade</label>
            <select
              className="field"
              onChange={(event) =>
                setFilters((current) => ({ ...current, severity: event.target.value }))
              }
              value={filters.severity}
            >
              <option value="">Todas</option>
              <option value="critical">Crítico</option>
              <option value="high">Alto</option>
              <option value="medium">Médio</option>
              <option value="low">Baixo</option>
            </select>
          </div>
          <div>
            <label className="label">Dispositivo</label>
            <select
              className="field"
              onChange={(event) =>
                setFilters((current) => ({ ...current, deviceId: event.target.value }))
              }
              value={filters.deviceId}
            >
              <option value="">Todos</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Data inicial</label>
            <input
              className="field"
              onChange={(event) =>
                setFilters((current) => ({ ...current, startDate: event.target.value }))
              }
              type="date"
              value={filters.startDate}
            />
          </div>
          <div>
            <label className="label">Data final</label>
            <input
              className="field"
              onChange={(event) =>
                setFilters((current) => ({ ...current, endDate: event.target.value }))
              }
              type="date"
              value={filters.endDate}
            />
          </div>
        </div>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
                Fila ativa
              </p>
              <h3 className="mt-2 font-display text-2xl text-surface-900">
                Alertas registrados
              </h3>
            </div>
            <Badge tone="warning">{alerts.length} itens</Badge>
          </div>

          <div className="mt-5 space-y-3">
            {alerts.length ? (
              alerts.map((alert) => (
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
                    <span className="text-sm text-surface-500">
                      {formatDateTime(alert.event.eventTime)}
                    </span>
                  </div>
                  <div className="mt-3">
                    <p className="font-semibold text-surface-900">
                      {alert.device.name || alert.device.deviceIdentifier}
                    </p>
                    <p className="text-sm text-surface-600">
                      {alert.patient?.fullName || "Sem paciente"} • {alert.event.message}
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => openAlert(alert.id)} variant="secondary">
                      <Eye className="h-4 w-4" />
                      Detalhes
                    </Button>
                    {canMutateAlerts && alert.status === "open" ? (
                      <Button onClick={() => executeAction(alert.id, "acknowledge")}>
                        <ShieldCheck className="h-4 w-4" />
                        Acknowledge
                      </Button>
                    ) : null}
                    {canMutateAlerts && ["open", "acknowledged"].includes(alert.status) ? (
                      <Button onClick={() => executeAction(alert.id, "resolve")} variant="secondary">
                        <Undo2 className="h-4 w-4" />
                        Resolver
                      </Button>
                    ) : null}
                    {canMutateAlerts && ["open", "acknowledged"].includes(alert.status) ? (
                      <Button onClick={() => executeAction(alert.id, "cancel")} variant="danger">
                        <ShieldOff className="h-4 w-4" />
                        Cancelar
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                description="Não há alertas compatíveis com os filtros atuais."
                title="Fila vazia"
              />
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-surface-500">
                Histórico
              </p>
              <h3 className="mt-2 font-display text-2xl text-surface-900">
                Eventos recentes
              </h3>
            </div>
            <Siren className="h-6 w-6 text-danger-600" />
          </div>
          <div className="mt-5 space-y-3">
            {events.length ? (
              events.map((event) => (
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
                  <p className="mt-3 font-semibold text-surface-900">
                    {event.device.name || event.device.deviceIdentifier}
                  </p>
                  <p className="text-sm text-surface-600">
                    {event.patient?.fullName || "Sem paciente"} • {event.message}
                  </p>
                </div>
              ))
            ) : (
              <EmptyState
                description="Eventos aparecerão aqui conforme o backend registrar mensagens MQTT visíveis para o seu escopo."
                title="Sem histórico"
              />
            )}
          </div>
        </Card>
      </section>

      <Modal
        footer={
          selectedAlert && canMutateAlerts ? (
            <div className="flex flex-wrap justify-end gap-3">
              {selectedAlert.status === "open" ? (
                <Button onClick={() => executeAction(selectedAlert.id, "acknowledge")}>
                  Acknowledge
                </Button>
              ) : null}
              {["open", "acknowledged"].includes(selectedAlert.status) ? (
                <Button onClick={() => executeAction(selectedAlert.id, "resolve")} variant="secondary">
                  Resolver
                </Button>
              ) : null}
              {["open", "acknowledged"].includes(selectedAlert.status) ? (
                <Button onClick={() => executeAction(selectedAlert.id, "cancel")} variant="danger">
                  Cancelar
                </Button>
              ) : null}
            </div>
          ) : null
        }
        onClose={() => setSelectedAlert(null)}
        open={Boolean(selectedAlert)}
        subtitle="Payload bruto, linha do tempo do alerta e ações realizadas."
        title={selectedAlert ? `Alerta #${selectedAlert.id}` : "Detalhes do alerta"}
      >
        {selectedAlert ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(selectedAlert.status) as never}>
                {humanizeAlertStatus(selectedAlert.status)}
              </Badge>
              <Badge tone={severityTone(selectedAlert.event.severity) as never}>
                {humanizeSeverity(selectedAlert.event.severity)}
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[24px] bg-surface-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-surface-500">
                  Dispositivo
                </p>
                <p className="mt-2 font-semibold text-surface-900">
                  {selectedAlert.device.name || selectedAlert.device.deviceIdentifier}
                </p>
              </div>
              <div className="rounded-[24px] bg-surface-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-surface-500">
                  Paciente
                </p>
                <p className="mt-2 font-semibold text-surface-900">
                  {selectedAlert.patient?.fullName || "Sem paciente"}
                </p>
              </div>
            </div>

            <div className="rounded-[24px] border border-surface-100 bg-white p-4">
              <p className="text-sm font-semibold text-surface-900">Mensagem processada</p>
              <p className="mt-2 text-sm text-surface-600">{selectedAlert.event.message}</p>
            </div>

            <div className="rounded-[24px] border border-surface-100 bg-surface-900 p-4 text-white">
              <p className="text-sm font-semibold">Payload bruto</p>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-white/80">
                {JSON.stringify(selectedAlert.event.rawPayloadJson, null, 2)}
              </pre>
            </div>

            {selectedAlert.actions?.length ? (
              <div>
                <p className="text-sm font-semibold text-surface-900">Ações registradas</p>
                <div className="mt-3 space-y-3">
                  {selectedAlert.actions.map((action) => (
                    <div
                      key={action.id}
                      className="rounded-[24px] border border-surface-100 bg-surface-50 p-4"
                    >
                      <p className="font-semibold text-surface-900">
                        {action.user.name} • {action.actionType}
                      </p>
                      <p className="mt-1 text-sm text-surface-600">
                        {formatDateTime(action.createdAt)}
                      </p>
                      {action.note ? (
                        <p className="mt-2 text-sm text-surface-600">{action.note}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
