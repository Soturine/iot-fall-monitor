const MQTT_TOPIC_BASE = "queda/devices";

export const TELEMETRY_STALE_AFTER_MS = 30000;

export type DiagnosticMqttChannel = "status" | "telemetry" | "events";

export function humanizeEvidenceStatus(status?: string) {
  switch (status) {
    case "linked":
      return "vinculada";
    case "partial":
      return "parcial";
    default:
      return "insuficiente";
  }
}

export function evidenceTone(status?: string) {
  if (status === "linked") {
    return "success";
  }

  if (status === "partial") {
    return "warning";
  }

  return "danger";
}

export function formatEvidenceNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(2)
    : "--";
}

export function formatBooleanDiagnostic(value: boolean | null | undefined) {
  if (value === true) {
    return "sim";
  }

  if (value === false) {
    return "nao";
  }

  return "--";
}

export function formatNumberDiagnostic(value: number | null | undefined, suffix = "") {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value}${suffix}`
    : "--";
}

export function formatTopicValue(value: string | null | undefined) {
  return value || "--";
}

export function expectedTopic(deviceIdentifier: string, channel: DiagnosticMqttChannel) {
  return `${MQTT_TOPIC_BASE}/${deviceIdentifier}/${channel}`;
}
