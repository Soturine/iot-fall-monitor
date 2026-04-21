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

export function deviceBehaviorTone(state?: string | null) {
  switch (state) {
    case "queda_confirmada":
      return "danger";
    case "queda_suspeita":
      return "warning";
    case "em_movimento":
      return "info";
    case "em_reposo":
      return "success";
    case "deitado":
    case "sentado":
      return "info";
    case "pre_calibracao":
    case "desconhecido":
      return "neutral";
    default:
      return "neutral";
  }
}

export function humanizeDeviceBehaviorState(state?: string | null) {
  switch (state) {
    case "pre_calibracao":
      return "Pre-calibracao";
    case "desconhecido":
      return "Desconhecido";
    case "em_reposo":
      return "Em repouso";
    case "deitado":
      return "Deitado";
    case "sentado":
      return "Sentado";
    case "em_movimento":
      return "Em movimento";
    case "queda_suspeita":
      return "Queda suspeita";
    case "queda_confirmada":
      return "Queda confirmada";
    case "andando":
      return "Andando";
    case "correndo":
      return "Correndo";
    case "caido":
      return "Caido";
    default:
      return "Indefinido";
  }
}

export function humanizeDeviceBehaviorConfidence(confidence?: string | null) {
  switch (confidence) {
    case "alto":
      return "alta";
    case "medio":
      return "media";
    case "baixo":
      return "baixa";
    default:
      return "indefinida";
  }
}
