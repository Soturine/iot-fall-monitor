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
    case "sensor_sem_leitura_valida":
    case "telemetria_desatualizada":
    case "sos_manual":
      return "warning";
    case "em_movimento":
    case "movimento_leve":
    case "movimento_intenso":
      return "info";
    case "em_reposo":
    case "repouso_provavel":
      return "success";
    case "deitado":
    case "sentado":
    case "sentado_deitado_provavel":
      return "info";
    case "pre_calibracao":
    case "calibracao_pendente":
    case "em_calibracao":
    case "sem_telemetria_suficiente":
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
    case "sem_telemetria_suficiente":
      return "Sem telemetria suficiente";
    case "sensor_sem_leitura_valida":
      return "Sensor sem leitura valida";
    case "telemetria_desatualizada":
      return "Telemetria desatualizada";
    case "em_reposo":
      return "Em repouso";
    case "repouso_provavel":
      return "Repouso provavel";
    case "deitado":
      return "Deitado";
    case "sentado":
      return "Sentado";
    case "sentado_deitado_provavel":
      return "Sentado/deitado provavel";
    case "em_movimento":
      return "Em movimento";
    case "movimento_leve":
      return "Movimento leve";
    case "movimento_intenso":
      return "Movimento intenso";
    case "queda_suspeita":
      return "Queda suspeita";
    case "queda_confirmada":
      return "Queda confirmada";
    case "sos_manual":
      return "SOS manual";
    case "calibracao_pendente":
      return "Calibracao pendente";
    case "em_calibracao":
      return "Em calibracao";
    case "andando":
      return "Andando";
    case "correndo":
      return "Correndo";
    case "caido":
      return "Caido";
    case "queda_com_imobilidade":
      return "Queda com imobilidade";
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

export function realtimeTone(
  phase?: "idle" | "connecting" | "connected" | "reconnecting" | "error" | null,
) {
  switch (phase) {
    case "connected":
      return "success";
    case "error":
      return "warning";
    case "connecting":
    case "reconnecting":
      return "warning";
    case "idle":
    default:
      return "neutral";
  }
}

export function humanizeRealtimePhase(
  phase?: "idle" | "connecting" | "connected" | "reconnecting" | "error" | null,
) {
  switch (phase) {
    case "connected":
      return "Tempo real ativo";
    case "connecting":
      return "Conectando painel";
    case "reconnecting":
      return "Reconectando painel";
    case "error":
      return "Socket do painel com falha";
    case "idle":
    default:
      return "Socket em espera";
  }
}

export function humanizeSocketDisconnectReason(reason?: string | null) {
  switch (reason) {
    case "io server disconnect":
      return "o backend encerrou a sessao realtime";
    case "io client disconnect":
      return "o navegador encerrou o socket localmente";
    case "ping timeout":
      return "o heartbeat do socket expirou";
    case "transport close":
      return "a conexao de rede/transport foi fechada";
    case "transport error":
      return "houve um erro de transporte na rede";
    default:
      return reason || "motivo tecnico nao informado";
  }
}
