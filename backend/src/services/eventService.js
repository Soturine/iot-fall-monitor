const { execute, one } = require("../db/pool");
const { elapsedMsSince } = require("../utils/correlation");
const { parseMaybeJson, toBoolean } = require("../utils/formatters");
const { HttpError } = require("../utils/httpError");
const { logger } = require("../utils/logger");
const { getPagination } = require("../utils/pagination");
const {
  parseDateBoundary,
  resolveRealtimeMqttTimestamp,
  toDateFromDeviceTimestamp,
} = require("../utils/time");
const { buildScopeFilter, canAccessScope } = require("./scopeService");

const FALL_EVIDENCE_WINDOW_BEFORE_MS = 10_000;
const FALL_EVIDENCE_WINDOW_AFTER_MS = 3_000;
const FALL_EVIDENCE_MAX_SAMPLES = 30;
const FALL_EVIDENCE_LINKED_MIN_SAMPLES = 2;
const TELEMETRY_REQUIRED_NUMERIC_FIELDS = ["ax", "ay", "az", "gx", "gy", "gz"];
const ALERT_EVENT_TYPES = new Set(["fall_detected", "sos_pressed", "manual_sos", "sensor_fault"]);

function toNullableNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableBoolean(value) {
  if (value == null || value === "") {
    return null;
  }

  return toBoolean(value);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validateTelemetryPayload(payload = {}) {
  const missingFields = TELEMETRY_REQUIRED_NUMERIC_FIELDS.filter(
    (field) => toNullableNumber(payload[field]) == null,
  );
  const sensorValid =
    payload.sensor_valid === undefined ? true : toBoolean(payload.sensor_valid);

  return {
    valid: sensorValid && missingFields.length === 0,
    missingFields,
    sensorValid,
    reason: !sensorValid
      ? "sensor_invalid"
      : missingFields.length
        ? "missing_sensor_axes"
        : null,
  };
}

function toIso(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function resolveMqttPersistenceTime(payload, receivedAt, override = null) {
  if (override) {
    return override;
  }

  if (receivedAt) {
    return resolveRealtimeMqttTimestamp(payload.timestamp, receivedAt).date;
  }

  return payload.timestamp ? toDateFromDeviceTimestamp(payload.timestamp) : new Date();
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
    case "manual_sos":
    case "sensor_fault":
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
    case "manual_sos":
      return "SOS manual acionado pelo dispositivo.";
    case "sensor_fault":
      return "Falha crítica de sensor reportada pelo dispositivo.";
    default:
      return "Evento recebido do dispositivo.";
  }
}

function shouldCreateAlert(eventType) {
  return ALERT_EVENT_TYPES.has(eventType);
}

function hasTelemetryEvidence(event) {
  return ["linked", "partial"].includes(event?.evidenceStatus);
}

function shouldCreateAlertForEvent(event) {
  if (!event || !shouldCreateAlert(event.eventType)) {
    return false;
  }

  if (event.eventType === "fall_detected") {
    return hasTelemetryEvidence(event);
  }

  return true;
}

function buildEmptyEvidence(immobilityConfirmed = false) {
  return {
    status: "none",
    telemetryId: null,
    sampleCount: 0,
    windowSeconds: 0,
    summary: {
      maxAccelMagnitude: null,
      maxGyroMagnitude: null,
      immobilityConfirmed,
      firstSampleAt: null,
      lastSampleAt: null,
    },
    links: [],
  };
}

function buildTelemetryEvidence(rows, eventTime, immobilityConfirmed = false) {
  const eventAt = eventTime instanceof Date ? eventTime : new Date(eventTime);
  const samples = (rows || [])
    .map((row) => {
      const createdAt = row.createdAt || row.created_at;
      const createdDate = createdAt instanceof Date ? createdAt : new Date(createdAt);

      return {
        id: Number(row.id),
        createdAt: createdDate,
        accelMagnitude: toNullableNumber(row.accelMagnitude ?? row.accel_magnitude),
        gyroMagnitude: toNullableNumber(row.gyroMagnitude ?? row.gyro_magnitude),
      };
    })
    .filter((sample) => sample.id && !Number.isNaN(sample.createdAt.getTime()))
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());

  if (!samples.length || Number.isNaN(eventAt.getTime())) {
    return buildEmptyEvidence(immobilityConfirmed);
  }

  const nearest = samples.reduce((best, sample) => {
    const bestDistance = Math.abs(best.createdAt.getTime() - eventAt.getTime());
    const sampleDistance = Math.abs(sample.createdAt.getTime() - eventAt.getTime());
    return sampleDistance < bestDistance ? sample : best;
  }, samples[0]);

  const peak = samples.reduce((best, sample) => {
    const bestScore = toFiniteNumber(best.accelMagnitude) + toFiniteNumber(best.gyroMagnitude);
    const sampleScore = toFiniteNumber(sample.accelMagnitude) + toFiniteNumber(sample.gyroMagnitude);
    return sampleScore > bestScore ? sample : best;
  }, samples[0]);

  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];
  const maxAccelMagnitude = samples.reduce((maxValue, sample) => {
    if (sample.accelMagnitude == null) {
      return maxValue;
    }

    return maxValue == null ? sample.accelMagnitude : Math.max(maxValue, sample.accelMagnitude);
  }, null);
  const maxGyroMagnitude = samples.reduce((maxValue, sample) => {
    if (sample.gyroMagnitude == null) {
      return maxValue;
    }

    return maxValue == null ? sample.gyroMagnitude : Math.max(maxValue, sample.gyroMagnitude);
  }, null);

  return {
    status: samples.length >= FALL_EVIDENCE_LINKED_MIN_SAMPLES ? "linked" : "partial",
    telemetryId: nearest.id,
    sampleCount: samples.length,
    windowSeconds: Math.max(
      0,
      (lastSample.createdAt.getTime() - firstSample.createdAt.getTime()) / 1000,
    ),
    summary: {
      maxAccelMagnitude,
      maxGyroMagnitude,
      immobilityConfirmed,
      firstSampleAt: firstSample.createdAt.toISOString(),
      lastSampleAt: lastSample.createdAt.toISOString(),
    },
    links: samples.map((sample) => {
      let role = "before_peak";

      if (sample.id === nearest.id) {
        role = "nearest";
      } else if (sample.id === peak.id) {
        role = "peak";
      } else if (sample.createdAt.getTime() > eventAt.getTime()) {
        role = "after_peak";
      }

      return {
        telemetryLogId: sample.id,
        relativeMs: Math.round(sample.createdAt.getTime() - eventAt.getTime()),
        role,
      };
    }),
  };
}

function normalizeEventUuid(payload = {}) {
  if (!isPlainObject(payload)) {
    return null;
  }

  const value = payload.event_uuid ?? payload.eventUuid;
  if (value == null) {
    return null;
  }

  const text = String(value).trim();
  if (!text || text.length > 160) {
    return null;
  }

  return text;
}

function extractSampleSeq(payload = {}) {
  if (!isPlainObject(payload)) {
    return null;
  }

  return toNullableNumber(payload.sample_seq ?? payload.sampleSeq);
}

function buildFirmwareDecisionSummary(payload = {}) {
  const features = isPlainObject(payload.features) ? payload.features : {};
  const featuresTimeDomain = isPlainObject(payload.features_time_domain)
    ? payload.features_time_domain
    : null;
  const featuresFrequencyDomain = isPlainObject(payload.features_frequency_domain)
    ? payload.features_frequency_domain
    : null;
  const linkedTelemetryWindow = isPlainObject(payload.linked_telemetry_window)
    ? payload.linked_telemetry_window
    : null;
  const algorithmVersion = payload.algorithm_version || features.algorithm_version || null;
  const decisionSource = payload.decision_source || features.decision_source || null;
  const reason = payload.reason || payload.fall_reason || features.reason || null;

  if (
    !algorithmVersion &&
    !decisionSource &&
    !reason &&
    !featuresTimeDomain &&
    !featuresFrequencyDomain
  ) {
    return null;
  }

  return {
    eventUuid: normalizeEventUuid(payload),
    sampleSeq: extractSampleSeq(payload),
    eventSequence: toNullableNumber(payload.event_sequence),
    decisionSource,
    algorithmVersion,
    detected: toNullableBoolean(payload.detected),
    candidate: toNullableBoolean(payload.candidate),
    reason,
    activityStateEstimate:
      payload.activity_state_estimate || features.activity_state_estimate || null,
    confidence: toNullableNumber(payload.confidence ?? features.confidence),
    windowStartedAtMs: toNullableNumber(payload.window_started_at_ms),
    windowEndedAtMs: toNullableNumber(payload.window_ended_at_ms),
    analysisWindowMs: toNullableNumber(payload.analysis_window_ms),
    sampleCount: toNullableNumber(payload.sample_count ?? payload.samples_considered),
    peakAccelG: toNullableNumber(payload.peak_accel_g ?? features.peak_accel_magnitude_g),
    peakGyroDps: toNullableNumber(payload.peak_gyro_dps ?? features.peak_gyro_magnitude_dps),
    accelMagnitudeG: toNullableNumber(payload.accel_magnitude_g ?? payload.accel_magnitude),
    gyroMagnitudeDps: toNullableNumber(payload.gyro_magnitude_dps ?? payload.gyro_magnitude),
    pitchDeg: toNullableNumber(payload.pitch_deg),
    rollDeg: toNullableNumber(payload.roll_deg),
    orientationDeltaDeg: toNullableNumber(
      payload.orientation_delta_deg ?? features.orientation_delta_deg,
    ),
    immobilityConfirmed: toNullableBoolean(
      payload.immobility_confirmed ?? features.immobility_confirmed,
    ),
    immobilityDurationMs: toNullableNumber(
      payload.immobility_duration_ms ?? features.immobility_duration_ms,
    ),
    featuresTimeDomain,
    featuresFrequencyDomain,
    linkedTelemetryWindow,
  };
}

function buildEvidenceSummaryForPayload(evidence, payload = {}) {
  const summary = {
    ...(evidence?.summary || buildEmptyEvidence().summary),
  };
  const firmwareDecision = buildFirmwareDecisionSummary(payload);

  summary.linkedTelemetryWindow = {
    status: evidence?.status || "none",
    telemetryId: evidence?.telemetryId || null,
    sampleCount: Number(evidence?.sampleCount || 0),
    windowSeconds: evidence?.windowSeconds ?? 0,
    links: evidence?.links || [],
  };

  if (firmwareDecision) {
    summary.firmwareDecision = firmwareDecision;
    summary.decisionSource = firmwareDecision.decisionSource;
    summary.algorithmVersion = firmwareDecision.algorithmVersion;
    summary.confidence = firmwareDecision.confidence;
    summary.reason = firmwareDecision.reason;
    summary.activityStateEstimate = firmwareDecision.activityStateEstimate;
  }

  return summary;
}

async function resolveFallTelemetryEvidence({ device, eventTime, immobility }, executor = null) {
  const eventAt = eventTime instanceof Date ? eventTime : new Date(eventTime);

  if (Number.isNaN(eventAt.getTime())) {
    return buildEmptyEvidence(immobility);
  }

  const windowStart = new Date(eventAt.getTime() - FALL_EVIDENCE_WINDOW_BEFORE_MS);
  const windowEnd = new Date(eventAt.getTime() + FALL_EVIDENCE_WINDOW_AFTER_MS);
  const rows = await execute(
    executor,
    `
      SELECT
        id,
        accel_magnitude,
        gyro_magnitude,
        created_at
      FROM telemetry_logs
      WHERE device_id = ?
        AND organization_id <=> ?
        AND patient_id <=> ?
        AND device_assignment_history_id <=> ?
        AND created_at BETWEEN ? AND ?
      ORDER BY ABS(TIMESTAMPDIFF(MICROSECOND, created_at, ?)), id
      LIMIT ?
    `,
    [
      device.id,
      device.organization?.id || null,
      device.currentPatient?.id || null,
      device.currentAssignmentHistoryId || null,
      windowStart,
      windowEnd,
      eventAt,
      FALL_EVIDENCE_MAX_SAMPLES,
    ],
  );

  return buildTelemetryEvidence(rows, eventAt, immobility);
}

async function insertEvidenceLinks(eventId, evidence, executor = null) {
  if (!evidence?.links?.length) {
    return;
  }

  for (const link of evidence.links) {
    await execute(
      executor,
      `
        INSERT IGNORE INTO event_telemetry_evidence (
          event_id,
          telemetry_log_id,
          relative_ms,
          role
        )
        VALUES (?, ?, ?, ?)
      `,
      [eventId, link.telemetryLogId, link.relativeMs, link.role],
    );
  }
}

function mapEventRow(row) {
  const rawPayloadJson = parseMaybeJson(row.raw_payload_json);
  const patient = row.patientId || row.patient_id
    ? {
        id: Number(row.patientId || row.patient_id),
        fullName: row.patientName || row.patient_name,
      }
    : null;
  const evidenceTelemetryId = row.evidenceTelemetryId ?? row.evidence_telemetry_id;
  const evidenceSampleCount = row.evidenceSampleCount ?? row.evidence_sample_count;
  const evidenceWindowSeconds = row.evidenceWindowSeconds ?? row.evidence_window_seconds;
  const evidenceSummaryJson = row.evidenceSummaryJson ?? row.evidence_summary_json;

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
    evidenceStatus: row.evidenceStatus || row.evidence_status || "none",
    evidenceTelemetryId: evidenceTelemetryId ? Number(evidenceTelemetryId) : null,
    evidenceSampleCount: evidenceSampleCount == null ? 0 : Number(evidenceSampleCount),
    evidenceWindowSeconds: toNullableNumber(evidenceWindowSeconds),
    evidenceSummary: parseMaybeJson(evidenceSummaryJson),
    eventUuid: normalizeEventUuid(rawPayloadJson),
    sampleSeq: extractSampleSeq(rawPayloadJson),
    eventSequence: toNullableNumber(rawPayloadJson?.event_sequence),
    deduplicated: Boolean(row.deduplicated),
    eventTime: toIso(row.event_time),
    rawPayloadJson,
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

async function findExistingEventByUuid({ device, eventUuid }, executor = null) {
  if (!eventUuid) {
    return null;
  }

  const row = await one(
    executor,
    `
      SELECT
        e.*,
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
      WHERE e.device_id = ?
        AND JSON_UNQUOTE(JSON_EXTRACT(e.raw_payload_json, '$.event_uuid')) = ?
      ORDER BY e.id ASC
      LIMIT 1
    `,
    [device.id, eventUuid],
  );

  return row ? mapEventRow(row) : null;
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
        e.evidence_status AS evidenceStatus,
        e.evidence_telemetry_id AS evidenceTelemetryId,
        e.evidence_sample_count AS evidenceSampleCount,
        e.evidence_window_seconds AS evidenceWindowSeconds,
        e.evidence_summary_json AS evidenceSummaryJson,
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

async function recordEventFromMqtt({
  device,
  payload,
  correlationId = null,
  eventTime: eventTimeOverride = null,
  receivedAt = null,
}, executor = null) {
  const startedAt = process.hrtime.bigint();
  const eventType = String(payload.event_type || "device_event");
  const message = deriveMessage(eventType, payload);
  const intensity = toNullableNumber(payload.intensity ?? payload.accel_magnitude);
  const immobility = toBoolean(payload.immobility ?? payload.immobility_confirmed);
  const eventTime = resolveMqttPersistenceTime(payload, receivedAt, eventTimeOverride);
  const eventUuid = normalizeEventUuid(payload);

  if (eventUuid) {
    const existingEvent = await findExistingEventByUuid({ device, eventUuid }, executor);

    if (existingEvent) {
      logger.info("Evento MQTT duplicado ignorado por event_uuid.", {
        correlationId,
        eventUuid,
        duplicateOfEventId: existingEvent.id,
        eventType: existingEvent.eventType,
        deviceId: device.id,
        deviceIdentifier: device.deviceIdentifier,
        deviceUid: device.deviceUid,
        organizationId: existingEvent.organizationId,
        patientId: existingEvent.patientId,
        durationMs: elapsedMsSince(startedAt),
      });

      return {
        ...existingEvent,
        deduplicated: true,
        duplicateReason: "event_uuid",
      };
    }
  }

  const evidence = eventType === "fall_detected"
    ? await resolveFallTelemetryEvidence({ device, eventTime, immobility }, executor)
    : buildEmptyEvidence(immobility);
  const evidenceSummary = buildEvidenceSummaryForPayload(evidence, payload);
  let severity = deriveSeverity(eventType, payload);

  if (eventType === "fall_detected" && evidence.status === "none") {
    severity = "medium";
  }

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
        evidence_status,
        evidence_telemetry_id,
        evidence_sample_count,
        evidence_window_seconds,
        evidence_summary_json,
        event_time,
        raw_payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      evidence.status,
      evidence.telemetryId,
      evidence.sampleCount,
      evidence.windowSeconds,
      JSON.stringify(evidenceSummary),
      eventTime,
      JSON.stringify(payload),
    ],
  );

  await insertEvidenceLinks(result.insertId, evidence, executor);

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
    eventUuid: event.eventUuid,
    sampleSeq: event.sampleSeq,
    deviceId: device.id,
    deviceIdentifier: device.deviceIdentifier,
    deviceUid: device.deviceUid,
    organizationId: event.organizationId,
    patientId: event.patientId,
    evidenceStatus: event.evidenceStatus,
    evidenceSampleCount: event.evidenceSampleCount,
    durationMs: elapsedMsSince(startedAt),
  });

  if (eventType === "fall_detected" && event.evidenceStatus === "none") {
    logger.warn("Evento fall_detected sem evidencia de telemetria recente.", {
      correlationId,
      eventId: event.id,
      deviceId: device.id,
      deviceIdentifier: device.deviceIdentifier,
      deviceUid: device.deviceUid,
      organizationId: event.organizationId,
      patientId: event.patientId,
      evidenceStatus: event.evidenceStatus,
    });
  }

  return event;
}

async function recordTelemetryFromMqtt({
  device,
  payload,
  correlationId = null,
  createdAt: createdAtOverride = null,
  receivedAt = null,
}, executor = null) {
  const startedAt = process.hrtime.bigint();
  const validation = validateTelemetryPayload(payload);

  if (!validation.valid) {
    const error = new Error("Telemetry MQTT sem amostra valida do sensor.");
    error.code = "INVALID_TELEMETRY_SAMPLE";
    error.details = validation;
    throw error;
  }

  const createdAt = resolveMqttPersistenceTime(payload, receivedAt, createdAtOverride);

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
        e.evidence_status AS evidenceStatus,
        e.evidence_telemetry_id AS evidenceTelemetryId,
        e.evidence_sample_count AS evidenceSampleCount,
        e.evidence_window_seconds AS evidenceWindowSeconds,
        e.evidence_summary_json AS evidenceSummaryJson,
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
  buildTelemetryEvidence,
  buildEvidenceSummaryForPayload,
  deriveMessage,
  deriveSeverity,
  getEventById,
  hasTelemetryEvidence,
  listDeviceEvents,
  listEvents,
  mapTelemetryRow,
  normalizeEventUuid,
  recordEventFromMqtt,
  recordTelemetryFromMqtt,
  resolveFallTelemetryEvidence,
  shouldCreateAlert,
  shouldCreateAlertForEvent,
  validateTelemetryPayload,
};
