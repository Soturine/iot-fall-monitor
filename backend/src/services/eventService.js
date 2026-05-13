const { execute, one } = require("../db/pool");
const { elapsedMsSince } = require("../utils/correlation");
const { parseMaybeJson, toBoolean } = require("../utils/formatters");
const { HttpError } = require("../utils/httpError");
const { logger } = require("../utils/logger");
const { getPagination } = require("../utils/pagination");
const { parseDateBoundary, toDateFromDeviceTimestamp } = require("../utils/time");
const { buildScopeFilter, canAccessScope } = require("./scopeService");

function toNullableNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIso(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function deriveSeverity(eventType, payload) {
  if (payload.severity) {
    return String(payload.severity);
  }

  switch (eventType) {
    case "fall_detected":
      return toBoolean(payload.immobility_confirmed ?? payload.immobility)
        ? "critical"
        : "high";
    case "sos_pressed":
      return "high";
    default:
      return "medium";
  }
}

function deriveMessage(eventType, payload) {
  if (payload.message) {
    return String(payload.message);
  }

  switch (eventType) {
    case "fall_detected":
      return toBoolean(payload.immobility_confirmed ?? payload.immobility)
        ? "Queda com imobilidade confirmada."
        : "Queda detectada.";
    case "sos_pressed":
      return "Botão SOS acionado manualmente.";
    default:
      return "Evento recebido do dispositivo.";
  }
}

function shouldCreateAlert(eventType) {
  return ["fall_detected", "sos_pressed"].includes(eventType);
}

function mapEventRow(row) {
  const patient = row.patientId || row.patient_id
    ? {
        id: Number(row.patientId || row.patient_id),
        fullName: row.patientName || row.patient_name,
      }
    : null;

  return {
    id: Number(row.id),
    organizationId: row.organizationId || row.organization_id
      ? Number(row.organizationId || row.organization_id)
      : null,
    patientId: patient?.id || null,
    assignmentHistoryId: row.assignmentHistoryId || row.device_assignment_history_id
      ? Number(row.assignmentHistoryId || row.device_assignment_history_id)
      : null,
    eventType: row.event_type,
    severity: row.severity,
    intensity: toNullableNumber(row.intensity),
    immobility: toBoolean(row.immobility),
    message: row.message,
    eventTime: toIso(row.event_time),
    rawPayloadJson: parseMaybeJson(row.raw_payload_json),
    createdAt: toIso(row.created_at),
    device: {
      id: Number(row.deviceId || row.device_id),
      deviceUid: row.deviceUid || row.device_uid,
      deviceIdentifier: row.deviceIdentifier || row.device_identifier,
      name: row.deviceName || row.device_name || null,
      patientName: patient?.fullName || "",
    },
    patient,
    alert: row.alertId || row.alert_id
      ? {
          id: Number(row.alertId || row.alert_id),
          status: row.alertStatus || row.alert_status,
        }
      : null,
  };
}

function mapTelemetryRow(row) {
  return {
    id: Number(row.id),
    deviceId: Number(row.device_id),
    organizationId: row.organization_id ? Number(row.organization_id) : null,
    patientId: row.patient_id ? Number(row.patient_id) : null,
    ax: toNullableNumber(row.ax),
    ay: toNullableNumber(row.ay),
    az: toNullableNumber(row.az),
    gx: toNullableNumber(row.gx),
    gy: toNullableNumber(row.gy),
    gz: toNullableNumber(row.gz),
    accelMagnitude: toNullableNumber(row.accel_magnitude),
    gyroMagnitude: toNullableNumber(row.gyro_magnitude),
    pitchDeg: toNullableNumber(row.pitch_deg),
    rollDeg: toNullableNumber(row.roll_deg),
    createdAt: toIso(row.created_at),
  };
}

async function getEventById(eventId, accessContext, executor = null) {
  const row = await one(
    executor,
    `
      SELECT
        e.id,
        e.organization_id AS organizationId,
        e.patient_id AS patientId,
        e.device_assignment_history_id AS assignmentHistoryId,
        e.event_type,
        e.severity,
        e.intensity,
        e.immobility,
        e.message,
        e.event_time,
        e.raw_payload_json,
        e.created_at,
        d.id AS deviceId,
        d.device_uid AS deviceUid,
        d.device_identifier AS deviceIdentifier,
        d.name AS deviceName,
        p.full_name AS patientName,
        a.id AS alertId,
        a.status AS alertStatus
      FROM events e
      INNER JOIN devices d ON d.id = e.device_id
      LEFT JOIN patients p ON p.id = e.patient_id
      LEFT JOIN alerts a ON a.event_id = e.id
      WHERE e.id = ?
    `,
    [eventId],
  );

  if (!row || !canAccessScope(accessContext, row.organizationId, row.patientId)) {
    throw new HttpError(404, "Evento não encontrado.");
  }

  return mapEventRow(row);
}

async function recordEventFromMqtt({ device, payload, correlationId = null }, executor = null) {
  const startedAt = process.hrtime.bigint();
  const eventType = String(payload.event_type || "device_event");
  const severity = deriveSeverity(eventType, payload);
  const message = deriveMessage(eventType, payload);
  const intensity = toNullableNumber(payload.intensity ?? payload.accel_magnitude);
  const immobility = toBoolean(payload.immobility ?? payload.immobility_confirmed);
  const eventTime = payload.timestamp
    ? toDateFromDeviceTimestamp(payload.timestamp)
    : new Date();

  const result = await execute(
    executor,
    `
      INSERT INTO events (
        organization_id,
        patient_id,
        device_id,
        device_assignment_history_id,
        event_type,
        severity,
        intensity,
        immobility,
        message,
        event_time,
        raw_payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      device.organization?.id || null,
      device.currentPatient?.id || null,
      device.id,
      device.currentAssignmentHistoryId || null,
      eventType,
      severity,
      intensity,
      immobility ? 1 : 0,
      message,
      eventTime,
      JSON.stringify(payload),
    ],
  );

  const event = await one(
    executor,
    `
      SELECT
        e.*,
        d.id AS deviceId,
        d.device_uid AS deviceUid,
        d.device_identifier AS deviceIdentifier,
        d.name AS deviceName,
        p.full_name AS patientName
      FROM events e
      INNER JOIN devices d ON d.id = e.device_id
      LEFT JOIN patients p ON p.id = e.patient_id
      WHERE e.id = ?
    `,
    [result.insertId],
  ).then(mapEventRow);

  logger.debug("Evento MQTT persistido.", {
    correlationId,
    eventId: event.id,
    eventType: event.eventType,
    deviceId: device.id,
    deviceIdentifier: device.deviceIdentifier,
    deviceUid: device.deviceUid,
    organizationId: event.organizationId,
    patientId: event.patientId,
    durationMs: elapsedMsSince(startedAt),
  });

  return event;
}

async function recordTelemetryFromMqtt({ device, payload, correlationId = null }, executor = null) {
  const startedAt = process.hrtime.bigint();
  const createdAt = payload.timestamp
    ? toDateFromDeviceTimestamp(payload.timestamp)
    : new Date();

  const result = await execute(
    executor,
    `
      INSERT INTO telemetry_logs (
        organization_id,
        patient_id,
        device_id,
        device_assignment_history_id,
        ax,
        ay,
        az,
        gx,
        gy,
        gz,
        accel_magnitude,
        gyro_magnitude,
        pitch_deg,
        roll_deg,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      device.organization?.id || null,
      device.currentPatient?.id || null,
      device.id,
      device.currentAssignmentHistoryId || null,
      toNullableNumber(payload.ax),
      toNullableNumber(payload.ay),
      toNullableNumber(payload.az),
      toNullableNumber(payload.gx),
      toNullableNumber(payload.gy),
      toNullableNumber(payload.gz),
      toNullableNumber(payload.accel_magnitude),
      toNullableNumber(payload.gyro_magnitude),
      toNullableNumber(payload.pitch_deg),
      toNullableNumber(payload.roll_deg),
      createdAt,
    ],
  );

  const row = await one(
    executor,
    `
      SELECT *
      FROM telemetry_logs
      WHERE id = ?
    `,
    [result.insertId],
  );

  const telemetry = mapTelemetryRow(row);

  logger.debug("Telemetria MQTT persistida.", {
    correlationId,
    telemetryId: telemetry.id,
    deviceId: device.id,
    deviceIdentifier: device.deviceIdentifier,
    deviceUid: device.deviceUid,
    organizationId: telemetry.organizationId,
    patientId: telemetry.patientId,
    durationMs: elapsedMsSince(startedAt),
  });

  return telemetry;
}

function buildEventFilters(filters, accessContext) {
  const { clauses, params } = buildScopeFilter(accessContext, {
    organizationColumn: "e.organization_id",
    patientColumn: "e.patient_id",
  });

  if (filters.deviceId) {
    clauses.push("e.device_id = ?");
    params.push(Number(filters.deviceId));
  }

  if (filters.eventType) {
    clauses.push("e.event_type = ?");
    params.push(filters.eventType);
  }

  if (filters.severity) {
    clauses.push("e.severity = ?");
    params.push(filters.severity);
  }

  const startDate = parseDateBoundary(filters.startDate);
  const endDate = parseDateBoundary(filters.endDate, true);

  if (startDate) {
    clauses.push("e.event_time >= ?");
    params.push(startDate);
  }

  if (endDate) {
    clauses.push("e.event_time <= ?");
    params.push(endDate);
  }

  return {
    whereSql: clauses.length ? clauses.join(" AND ") : "1 = 1",
    params,
  };
}

async function listEvents(filters = {}, accessContext) {
  const pagination = getPagination(filters, 12, 100);
  const { whereSql, params } = buildEventFilters(filters, accessContext);

  const totalRow = await one(
    null,
    `
      SELECT COUNT(*) AS total
      FROM events e
      WHERE ${whereSql}
    `,
    params,
  );

  const rows = await execute(
    null,
    `
      SELECT
        e.id,
        e.organization_id AS organizationId,
        e.patient_id AS patientId,
        e.device_assignment_history_id AS assignmentHistoryId,
        e.event_type,
        e.severity,
        e.intensity,
        e.immobility,
        e.message,
        e.event_time,
        e.raw_payload_json,
        e.created_at,
        d.id AS deviceId,
        d.device_uid AS deviceUid,
        d.device_identifier AS deviceIdentifier,
        d.name AS deviceName,
        p.full_name AS patientName,
        a.id AS alertId,
        a.status AS alertStatus
      FROM events e
      INNER JOIN devices d ON d.id = e.device_id
      LEFT JOIN patients p ON p.id = e.patient_id
      LEFT JOIN alerts a ON a.event_id = e.id
      WHERE ${whereSql}
      ORDER BY e.event_time DESC, e.id DESC
      LIMIT ? OFFSET ?
    `,
    [...params, pagination.limit, pagination.offset],
  );

  return {
    items: rows.map(mapEventRow),
    page: pagination.page,
    limit: pagination.limit,
    total: Number(totalRow.total),
  };
}

async function listDeviceEvents(deviceId, filters = {}, accessContext) {
  return listEvents(
    {
      ...filters,
      deviceId,
    },
    accessContext,
  );
}

module.exports = {
  deriveMessage,
  deriveSeverity,
  getEventById,
  listDeviceEvents,
  listEvents,
  mapTelemetryRow,
  recordEventFromMqtt,
  recordTelemetryFromMqtt,
  shouldCreateAlert,
};
