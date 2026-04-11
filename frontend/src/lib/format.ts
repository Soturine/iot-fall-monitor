const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "Sem registro";
  }

  return dateTimeFormatter.format(new Date(value));
}

export function formatRelativeTime(value?: string | null) {
  if (!value) {
    return "Sem contato";
  }

  const date = new Date(value);
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 1) {
    return "agora";
  }

  if (Math.abs(diffMinutes) < 60) {
    return diffMinutes > 0
      ? `em ${diffMinutes} min`
      : `há ${Math.abs(diffMinutes)} min`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return diffHours > 0
      ? `em ${diffHours} h`
      : `há ${Math.abs(diffHours)} h`;
  }

  const diffDays = Math.round(diffHours / 24);
  return diffDays > 0 ? `em ${diffDays} dias` : `há ${Math.abs(diffDays)} dias`;
}

export function severityTone(severity?: string | null) {
  switch (severity) {
    case "critical":
      return "danger";
    case "high":
      return "warning";
    case "medium":
      return "info";
    default:
      return "neutral";
  }
}

export function statusTone(status?: string | null) {
  switch (status) {
    case "open":
      return "danger";
    case "acknowledged":
      return "warning";
    case "resolved":
      return "success";
    case "canceled":
      return "neutral";
    default:
      return "neutral";
  }
}

export function humanizeAlertStatus(status?: string | null) {
  switch (status) {
    case "open":
      return "Aberto";
    case "acknowledged":
      return "Em atendimento";
    case "resolved":
      return "Resolvido";
    case "canceled":
      return "Cancelado";
    default:
      return "Indefinido";
  }
}

export function humanizeSeverity(severity?: string | null) {
  switch (severity) {
    case "critical":
      return "Crítico";
    case "high":
      return "Alto";
    case "medium":
      return "Médio";
    case "low":
      return "Baixo";
    default:
      return "N/A";
  }
}
