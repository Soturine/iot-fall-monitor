import { humanizeAlertStatus, humanizeSeverity } from "./format";
import type { AlertReport } from "../types/api";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatReportDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("pt-BR");
}

function formatAppliedFilters(report: AlertReport) {
  return [
    report.filters.status
      ? `Status: ${humanizeAlertStatus(report.filters.status)}`
      : "Status: todos",
    report.filters.severity
      ? `Severidade: ${humanizeSeverity(report.filters.severity)}`
      : "Severidade: todas",
    report.filters.deviceId
      ? `Dispositivo ID: ${report.filters.deviceId}`
      : "Dispositivo: todos",
    report.filters.startDate
      ? `Data inicial: ${report.filters.startDate}`
      : "Data inicial: não informada",
    report.filters.endDate
      ? `Data final: ${report.filters.endDate}`
      : "Data final: não informada",
  ].join(" | ");
}

export function downloadAlertReportJson(report: AlertReport) {
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `relatorio-alertas-${report.generatedAt.slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function printAlertReport(printWindow: Window, report: AlertReport) {
  const rows = report.items
    .map(
      (item) => `
        <tr>
          <td>#${escapeHtml(item.alertId)}</td>
          <td>${escapeHtml(formatReportDate(item.eventTime))}</td>
          <td>${escapeHtml(item.patientName || "Sem paciente")}</td>
          <td>${escapeHtml(item.deviceName || item.deviceIdentifier)}</td>
          <td>${escapeHtml(item.eventType)}</td>
          <td>${escapeHtml(humanizeSeverity(item.severity))}</td>
          <td>${escapeHtml(humanizeAlertStatus(item.status))}</td>
          <td>${escapeHtml(item.message)}</td>
          <td>${escapeHtml(item.evidenceStatus)}</td>
        </tr>
      `,
    )
    .join("");

  printWindow.document.open();
  printWindow.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Relatório de Alertas e Histórico Operacional</title>
        <style>
          @page { size: landscape; margin: 12mm; }
          * { box-sizing: border-box; }
          body { color: #172033; font-family: Arial, sans-serif; margin: 0; }
          h1 { font-size: 22px; margin: 0 0 8px; }
          .meta { color: #475569; font-size: 11px; line-height: 1.6; margin-bottom: 18px; }
          .notice { border: 1px solid #f59e0b; color: #854d0e; font-size: 11px; margin-top: 16px; padding: 8px; }
          table { border-collapse: collapse; font-size: 9px; width: 100%; }
          th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; }
          th { background: #e2e8f0; }
          tr { break-inside: avoid; }
        </style>
      </head>
      <body>
        <h1>Relatório de Alertas e Histórico Operacional</h1>
        <div class="meta">
          <div><strong>Gerado em:</strong> ${escapeHtml(formatReportDate(report.generatedAt))}</div>
          <div><strong>Organização ativa:</strong> ${escapeHtml(report.organization?.name || "Escopo global")}</div>
          <div><strong>Filtros aplicados:</strong> ${escapeHtml(formatAppliedFilters(report))}</div>
          <div><strong>Total de registros exportados:</strong> ${escapeHtml(report.total)}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Alerta</th>
              <th>Evento</th>
              <th>Paciente</th>
              <th>Dispositivo</th>
              <th>Tipo</th>
              <th>Severidade</th>
              <th>Status</th>
              <th>Mensagem</th>
              <th>Evidência</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="9">Nenhum alerta compatível com os filtros aplicados.</td></tr>'}</tbody>
        </table>
        <div class="notice">Sistema experimental, não representa diagnóstico clínico.</div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
