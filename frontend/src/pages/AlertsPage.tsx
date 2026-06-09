import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Download, Eye, Printer, ShieldCheck, ShieldOff, Siren, Undo2 } from "lucide-react";
import toast from "react-hot-toast";

import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingState } from "../components/ui/LoadingState";
import { Modal } from "../components/ui/Modal";
import { useAuth } from "../contexts/AuthContext";
import { useRealtime } from "../contexts/RealtimeContext";
import { downloadAlertReportJson, printAlertReport } from "../lib/alertReport";
import {
  formatDateTime,
  humanizeAlertStatus,
  humanizeSeverity,
  severityTone,
  statusTone,
} from "../lib/format";
import { api, getErrorMessage } from "../services/api";
import type { AlertRecord, AlertReport, Device, EventRecord } from "../types/api";

export function AlertsPage() {
  const { socket } = useRealtime();
  const { activeRole, user } = useAuth();
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<AlertRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"json" | "pdf" | null>(null);
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

  async function loadAlertReport() {
    const response = await api.get<AlertReport>("/alerts/export", {
      params: filters,
    });
    return response.data;
  }

  async function exportJson() {
    setExporting("json");

    try {
      const report = await loadAlertReport();
      downloadAlertReportJson(report);
      toast.success(`${report.total} alertas exportados em JSON.`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      toast.error("Permita pop-ups para abrir a visualização imprimível.");
      return;
    }

    setExporting("pdf");

    try {
      const report = await loadAlertReport();
      printAlertReport(printWindow, report);
    } catch (error) {
      printWindow.close();
      toast.error(getErrorMessage(error));
    } finally {
      setExporting(null);
    }
  }

  if (loading && !alerts.length && !events.length) {
    return <LoadingState label="Carregando fila de alertas..." />;
  }

  const openCount = alerts.filter((alert) => alert.status === "open").length;
  const ackCount = alerts.filter((alert) => alert.status === "acknowledged").length;
  const criticalCount = alerts.filter((a) => a.event.severity === "critical").length;

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden border-white/60 bg-gradient-to-br from-white via-white to-danger-50/40">
        <div className="pointer-events-none absolute -right-24 -top-20 h-72 w-72 rounded-full bg-danger-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-petrol-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-danger-500 to-danger-700 text-white shadow-soft">
                <Siren className="h-4 w-4" />
              </span>
              <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-danger-700">
                Resposta operacional
              </p>
            </div>
            <h2 className="mt-3 font-display text-3xl text-surface-900 lg:text-4xl">
              Alertas e histórico do escopo ativo
            </h2>
            <p className="mt-2 text-sm leading-6 text-surface-600">
              A fila chega filtrada pelo backend conforme a organização ativa e,
              quando aplicável, os assignments de caregiver permitem reduzir o escopo.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="flex flex-wrap gap-2">
              {criticalCount > 0 ? (
                <Badge tone="critical">{criticalCount} críticos</Badge>
              ) : null}
              <Badge tone="danger" dot>{openCount} abertos</Badge>
              <Badge tone="warning" dot>{ackCount} em atendimento</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={Boolean(exporting)}
                onClick={exportJson}
                title="Baixar alertas filtrados em JSON"
                variant="secondary"
              >
                <Download className="h-4 w-4" />
                {exporting === "json" ? "Exportando..." : "Exportar JSON"}
              </Button>
              <Button
                disabled={Boolean(exporting)}
                onClick={exportPdf}
                title="Abrir relatório para imprimir ou salvar em PDF"
                variant="secondary"
              >
                <Printer className="h-4 w-4" />
                {exporting === "pdf" ? "Preparando..." : "Exportar PDF"}
              </Button>
            </div>
          </div>
        </div>

        <div className="relative mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-petrol-700">
                Fila ativa
              </p>
              <h3 className="mt-2 font-display text-xl text-surface-900">
                Alertas registrados
              </h3>
            </div>
            <Badge tone="muted">{alerts.length} itens</Badge>
          </div>

          <div className="mt-5 space-y-3">
            {alerts.length ? (
              alerts.map((alert) => {
                const sev = alert.event.severity;
                const accent =
                  sev === "critical"
                    ? "from-danger-500 to-danger-700"
                    : sev === "high"
                      ? "from-amber-500 to-danger-500"
                      : sev === "medium"
                        ? "from-amber-400 to-amber-600"
                        : "from-teal-400 to-teal-600";
                return (
                  <div
                    key={alert.id}
                    className="group relative overflow-hidden rounded-2xl border border-surface-100 bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-panel"
                  >
                    <span className={`absolute inset-y-0 left-0 w-1 bg-gradient-to-b ${accent}`} />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusTone(alert.status) as never} dot>
                        {humanizeAlertStatus(alert.status)}
                      </Badge>
                      <Badge tone={sev === "critical" ? "critical" : (severityTone(sev) as never)}>
                        {humanizeSeverity(sev)}
                      </Badge>
                      <span className="ml-auto text-xs font-medium text-surface-500">
                        {formatDateTime(alert.event.eventTime)}
                      </span>
                    </div>
                    <div className="mt-3">
                      <p className="font-display text-lg font-semibold text-surface-900">
                        {alert.device.name || alert.device.deviceIdentifier}
                      </p>
                      <p className="mt-1 text-sm text-surface-600">
                        <span className="font-medium text-surface-800">
                          {alert.patient?.fullName || "Sem paciente"}
                        </span>
                        <span className="mx-1.5 text-surface-300">•</span>
                        {alert.event.message}
                      </p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-surface-100 pt-3">
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
                );
              })
            ) : (
              <EmptyState
                description="Nenhum alerta compatível com os filtros atuais. Ajuste o intervalo ou limpe a severidade."
                title="Fila vazia"
              />
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-petrol-700">
                Histórico
              </p>
              <h3 className="mt-2 font-display text-xl text-surface-900">
                Eventos recentes
              </h3>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-danger-50 text-danger-600">
              <Siren className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {events.length ? (
              events.map((event) => (
                <div
                  key={event.id}
                  className="rounded-2xl border border-surface-100 bg-gradient-to-br from-white to-surface-50/60 p-4 transition hover:border-surface-200"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={severityTone(event.severity) as never}>
                      {humanizeSeverity(event.severity)}
                    </Badge>
                    <span className="ml-auto text-xs font-medium text-surface-500">
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
