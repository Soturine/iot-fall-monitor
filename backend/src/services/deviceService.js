const { execute, one, transaction } = require("../db/pool");
const {
  parseMaybeJson,
  toBoolean,
  toIso,
  toNullableBoolean,
  toNullableNumber,
} = require("../utils/formatters");
const { HttpError } = require("../utils/httpError");
const { logger } = require("../utils/logger");
const { getPagination } = require("../utils/pagination");
const { createAuditLog } = require("./auditService");
const { computeDeviceBehavior } = require("./deviceBehaviorService");
const { assertRole, buildScopeFilter, canAccessScope } = require("./scopeService");

function toNullableString(value, maxLength = 255) {
  if (value == null || value === "") {
    return null;
  }

  return String(value).slice(0, maxLength);
}

function normalizeDeviceIdentifier(value, fallback = "device") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function normalizeDeviceUid(deviceUid, deviceIdentifier) {
  const normalizedUid = String(deviceUid || "").trim();

  if (normalizedUid) {
    return normalizedUid;
  }

  const normalizedIdentifier = normalizeDeviceIdentifier(deviceIdentifier, "");
  if (!normalizedIdentifier) {
    throw new HttpError(400, "device_uid ou device_identifier é obrigatório.");
  }

  return `legacy:${normalizedIdentifier}`;
}

function buildLegacyDeviceUid(deviceIdentifier) {
  return `legacy:${deviceIdentifier}`;
}

function isClaimedScopedDevice(row) {
  return Boolean(row?.claim_status === "claimed" && row.organization_id);
}

function mapDeviceRow(row) {
  const currentPatient = row.currentPatientId
    ? {
        id: Number(row.currentPatientId),
        fullName: row.currentPatientName,
      }
    : null;

  return {
    id: Number(row.id),
    deviceUid: row.deviceUid || row.device_uid,
    deviceIdentifier: row.deviceIdentifier || row.device_identifier,
    name: row.name,
    location: row.location || "",
    isActive: toBoolean(row.isActive ?? row.is_active),
    claimStatus: row.claimStatus || row.claim_status,
    claimedAt: toIso(row.claimedAt || row.claimed_at),
    currentAssignmentHistoryId: row.currentAssignmentHistoryId
      ? Number(row.currentAssignmentHistoryId)
      : row.current_assignment_history_id
        ? Number(row.current_assignment_history_id)
        : null,
    organization: row.organizationId || row.organization_id
      ? {
          id: Number(row.organizationId || row.organization_id),
          name: row.organizationName || row.organization_name,
          type: row.organizationType || row.organization_type,
        }
      : null,
    currentPatient,
    patientName: currentPatient?.fullName || "",
    activeAlerts: Number(row.activeAlerts || row.active_alerts || 0),
    status: {
      online: toBoolean(row.online),
      wifiRssi: row.wifiRssi ?? row.wifi_rssi ?? null,
      batteryPercent: row.batteryPercent ?? row.battery_percent ?? null,
      batteryPercentSource: row.batteryPercentSource ?? row.battery_percent_source ?? null,
      firmwareVersion: row.firmwareVersion || row.firmware_version || null,
      sensorReady: toNullableBoolean(row.sensorReady ?? row.sensor_ready),
      sensorValid: toNullableBoolean(row.sensorValid ?? row.sensor_valid),
      sensorReadOk: toNullableBoolean(row.sensorReadOk ?? row.sensor_read_ok),
      sensorSampleAgeMs: toNullableNumber(row.sensorSampleAgeMs ?? row.sensor_sample_age_ms),
      sensorFailures: toNullableNumber(row.sensorFailures ?? row.sensor_failures),
      i2cErrorCount: toNullableNumber(row.i2cErrorCount ?? row.i2c_error_count),
      i2cRecoveryCount: toNullableNumber(row.i2cRecoveryCount ?? row.i2c_recovery_count),
      i2cLastError: row.i2cLastError ?? row.i2c_last_error ?? null,
      lastStatusTopic: row.lastStatusTopic ?? row.last_status_topic ?? null,
      lastTelemetryTopic: row.lastTelemetryTopic ?? row.last_telemetry_topic ?? null,
      lastEventTopic: row.lastEventTopic ?? row.last_event_topic ?? null,
      lastTelemetryAt: toIso(row.lastTelemetryAt || row.last_telemetry_at),
      lastEventAt: toIso(row.lastEventAt || row.last_event_at),
      lastSeenAt: toIso(row.lastSeenAt || row.last_seen_at),
      updatedAt: toIso(row.statusUpdatedAt || row.status_updated_at),
    },
  };
}

function mapDeviceIdentityRow(row) {
  const currentPatient = row.currentPatientId || row.current_patient_id
    ? {
        id: Number(row.currentPatientId || row.current_patient_id),
        fullName: row.currentPatientName || row.current_patient_name,
      }
    : null;

  return {
    id: Number(row.id),
    deviceUid: row.deviceUid || row.device_uid,
    deviceIdentifier: row.deviceIdentifier || row.device_identifier,
    name: row.name,
    currentAssignmentHistoryId: row.currentAssignmentHistoryId
      ? Number(row.currentAssignmentHistoryId)
      : row.current_assignment_history_id
        ? Number(row.current_assignment_history_id)
        : null,
    organization: row.organizationId || row.organization_id
      ? {
          id: Number(row.organizationId || row.organization_id),
          name: row.organizationName || row.organization_name,
          type: row.organizationType || row.organization_type,
        }
      : null,
    currentPatient,
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

function mapDeviceEventRow(row) {
  const evidenceTelemetryId = row.evidenceTelemetryId ?? row.evidence_telemetry_id;
  const evidenceSampleCount = row.evidenceSampleCount ?? row.evidence_sample_count;
  const evidenceWindowSeconds = row.evidenceWindowSeconds ?? row.evidence_window_seconds;
  const evidenceSummaryJson = row.evidenceSummaryJson ?? row.evidence_summary_json;

  return {
    id: Number(row.id),
    deviceId: Number(row.device_id),
    organizationId: row.organization_id ? Number(row.organization_id) : null,
    patientId: row.patient_id ? Number(row.patient_id) : null,
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
    eventTime: toIso(row.event_time),
    rawPayloadJson: parseMaybeJson(row.raw_payload_json),
    createdAt: toIso(row.created_at),
  };
}

function mapDeviceAlertRow(row) {
  const evidenceTelemetryId = row.evidenceTelemetryId ?? row.evidence_telemetry_id;
  const evidenceSampleCount = row.evidenceSampleCount ?? row.evidence_sample_count;
  const evidenceWindowSeconds = row.evidenceWindowSeconds ?? row.evidence_window_seconds;
  const evidenceSummaryJson = row.evidenceSummaryJson ?? row.evidence_summary_json;

  return {
    id: Number(row.id),
    status: row.status,
    organizationId: row.organization_id ? Number(row.organization_id) : null,
    patientId: row.patient_id ? Number(row.patient_id) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    event: {
      id: Number(row.event_id),
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
      eventTime: toIso(row.event_time),
      rawPayloadJson: parseMaybeJson(row.raw_payload_json),
    },
  };
}

function buildInClausePlaceholders(values) {
  return values.map(() => "?").join(", ");
}

function groupRowsByDeviceId(rows, mapper) {
  return rows.reduce((accumulator, row) => {
    const deviceId = Number(row.device_id || row.deviceId);
    if (!accumulator.has(deviceId)) {
      accumulator.set(deviceId, []);
    }

    accumulator.get(deviceId).push(mapper(row));
    return accumulator;
  }, new Map());
}

async function fetchTelemetryWindowsByDeviceIds(
  deviceIds,
  sampleLimit = 6,
  executor = null,
) {
  if (!deviceIds.length) {
    return new Map();
  }

  const placeholders = buildInClausePlaceholders(deviceIds);
  const rows = await execute(
    executor,
    `
      SELECT *
      FROM (
        SELECT
          t.*,
          ROW_NUMBER() OVER (
            PARTITION BY t.device_id
            ORDER BY t.created_at DESC, t.id DESC
          ) AS telemetry_rank
        FROM telemetry_logs t
        WHERE t.device_id IN (${placeholders})
      ) ranked
      WHERE ranked.telemetry_rank <= ?
      ORDER BY ranked.device_id ASC, ranked.created_at DESC, ranked.id DESC
    `,
    [...deviceIds, sampleLimit],
  );

  return groupRowsByDeviceId(rows, mapTelemetryRow);
}

async function fetchRecentBehaviorEventsByDeviceIds(deviceIds, executor = null) {
  if (!deviceIds.length) {
    return new Map();
  }

  const placeholders = buildInClausePlaceholders(deviceIds);
  const rows = await execute(
    executor,
    `
      SELECT *
      FROM (
        SELECT
          e.device_id,
          e.event_type,
          e.severity,
          e.immobility,
          e.evidence_status,
          e.evidence_sample_count,
          e.event_time,
          e.created_at,
          ROW_NUMBER() OVER (
            PARTITION BY e.device_id
            ORDER BY e.event_time DESC, e.id DESC
          ) AS event_rank
        FROM events e
        WHERE e.device_id IN (${placeholders})
          AND e.event_type IN ('fall_detected', 'fall_suspected', 'movement_detected', 'sos_pressed', 'manual_sos', 'calibration_started', 'calibration_sample_started')
          AND e.event_time >= UTC_TIMESTAMP() - INTERVAL 10 MINUTE
      ) ranked
      WHERE ranked.event_rank = 1
    `,
    deviceIds,
  );

  return groupRowsByDeviceId(rows, (row) => ({
    eventType: row.event_type,
    severity: row.severity,
    immobility: toBoolean(row.immobility),
    evidenceStatus: row.evidence_status || "none",
    evidenceSampleCount: row.evidence_sample_count == null ? 0 : Number(row.evidence_sample_count),
    eventTime: toIso(row.event_time),
    createdAt: toIso(row.created_at),
  }));
}

async function fetchTelemetryWindowByDeviceId(deviceId, sampleLimit = 6, executor = null) {
  const rows = await execute(
    executor,
    `
      SELECT *
      FROM telemetry_logs
      WHERE device_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `,
    [deviceId, sampleLimit],
  );

  return rows.map(mapTelemetryRow);
}

async function fetchRecentBehaviorEventsByDeviceId(deviceId, executor = null) {
  const rows = await execute(
    executor,
    `
      SELECT
        e.device_id,
        e.event_type,
        e.severity,
        e.immobility,
        e.evidence_status,
        e.evidence_sample_count,
        e.event_time,
        e.created_at
      FROM events e
      WHERE e.device_id = ?
        AND e.event_type IN ('fall_detected', 'fall_suspected', 'movement_detected', 'sos_pressed', 'manual_sos', 'calibration_started', 'calibration_sample_started')
        AND e.event_time >= UTC_TIMESTAMP() - INTERVAL 10 MINUTE
      ORDER BY e.event_time DESC, e.id DESC
      LIMIT 4
    `,
    [deviceId],
  );

  return rows.map((row) => ({
    eventType: row.event_type,
    severity: row.severity,
    immobility: toBoolean(row.immobility),
    evidenceStatus: row.evidence_status || "none",
    evidenceSampleCount: row.evidence_sample_count == null ? 0 : Number(row.evidence_sample_count),
    eventTime: toIso(row.event_time),
    createdAt: toIso(row.created_at),
  }));
}

async function attachBehaviorToDevices(devices, executor = null) {
  if (!devices.length) {
    return devices;
  }

  const deviceIds = devices.map((device) => device.id);
  const [telemetryWindows, recentBehaviorEvents] = await Promise.all([
    fetchTelemetryWindowsByDeviceIds(deviceIds, 12, executor),
    fetchRecentBehaviorEventsByDeviceIds(deviceIds, executor),
  ]);

  return devices.map((device) => ({
    ...device,
    behavior: computeDeviceBehavior({
      status: device.status,
      telemetrySamples: telemetryWindows.get(device.id) || [],
      recentEvents: recentBehaviorEvents.get(device.id) || [],
    }),
  }));
}

async function ensureDeviceStatusRow(deviceId, executor = null) {
  await execute(
    executor,
    `
      INSERT INTO device_status (device_id, online)
      VALUES (?, 0)
      ON DUPLICATE KEY UPDATE updated_at = updated_at
    `,
    [deviceId],
  );
}

async function getDeviceScopeSnapshot(deviceId, executor = null) {
  const row = await one(
    executor,
    `
      SELECT
        organization_id AS organizationId,
        current_patient_id AS patientId,
        current_assignment_history_id AS assignmentHistoryId
      FROM devices
      WHERE id = ?
    `,
    [deviceId],
  );

  if (!row) {
    throw new HttpError(404, "Dispositivo não encontrado.");
  }

  return {
    organizationId: row.organizationId ? Number(row.organizationId) : null,
    patientId: row.patientId ? Number(row.patientId) : null,
    assignmentHistoryId: row.assignmentHistoryId ? Number(row.assignmentHistoryId) : null,
  };
}

async function syncDeviceScopeToStatus(deviceId, executor = null) {
  const scope = await getDeviceScopeSnapshot(deviceId, executor);

  await execute(
    executor,
    `
      INSERT INTO device_status (
        device_id,
        organization_id,
        patient_id,
        device_assignment_history_id,
        online
      )
      VALUES (?, ?, ?, ?, 0)
      ON DUPLICATE KEY UPDATE
        organization_id = VALUES(organization_id),
        patient_id = VALUES(patient_id),
        device_assignment_history_id = VALUES(device_assignment_history_id),
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      deviceId,
      scope.organizationId,
      scope.patientId,
      scope.assignmentHistoryId,
    ],
  );
}

async function getDeviceStatusSnapshot(deviceId, executor = null) {
  const row = await one(
    executor,
    `
      SELECT
        d.id,
        d.device_uid AS deviceUid,
        d.device_identifier AS deviceIdentifier,
        d.name,
        d.location,
        d.is_active AS isActive,
        d.claim_status AS claimStatus,
        d.claimed_at AS claimedAt,
        d.current_assignment_history_id AS currentAssignmentHistoryId,
        o.id AS organizationId,
        o.name AS organizationName,
        o.type AS organizationType,
        p.id AS currentPatientId,
        p.full_name AS currentPatientName,
        ds.online,
        ds.wifi_rssi AS wifiRssi,
        ds.battery_percent AS batteryPercent,
        ds.firmware_version AS firmwareVersion,
        ds.sensor_ready AS sensorReady,
        ds.sensor_valid AS sensorValid,
        ds.sensor_read_ok AS sensorReadOk,
        ds.sensor_sample_age_ms AS sensorSampleAgeMs,
        ds.sensor_failures AS sensorFailures,
        ds.i2c_error_count AS i2cErrorCount,
        ds.i2c_recovery_count AS i2cRecoveryCount,
        ds.i2c_last_error AS i2cLastError,
        ds.last_status_topic AS lastStatusTopic,
        ds.last_telemetry_topic AS lastTelemetryTopic,
        ds.last_event_topic AS lastEventTopic,
        ds.last_telemetry_at AS lastTelemetryAt,
        ds.last_event_at AS lastEventAt,
        ds.last_seen_at AS lastSeenAt,
        ds.updated_at AS statusUpdatedAt,
        (
          SELECT COUNT(*)
          FROM alerts a
          WHERE a.device_id = d.id
            AND a.status IN ('open', 'acknowledged')
        ) AS activeAlerts
      FROM devices d
      LEFT JOIN organizations o ON o.id = d.organization_id
      LEFT JOIN patients p ON p.id = d.current_patient_id
      LEFT JOIN device_status ds ON ds.device_id = d.id
      WHERE d.id = ?
    `,
    [deviceId],
  );

  if (!row) {
    throw new HttpError(404, "Dispositivo não encontrado.");
  }

  const [device] = await attachBehaviorToDevices([mapDeviceRow(row)], executor);
  return device;
}

async function getDeviceIdentitySnapshot(deviceId, executor = null) {
  const row = await one(
    executor,
    `
      SELECT
        d.id,
        d.device_uid AS deviceUid,
        d.device_identifier AS deviceIdentifier,
        d.name,
        d.current_assignment_history_id AS currentAssignmentHistoryId,
        o.id AS organizationId,
        o.name AS organizationName,
        o.type AS organizationType,
        p.id AS currentPatientId,
        p.full_name AS currentPatientName
      FROM devices d
      LEFT JOIN organizations o ON o.id = d.organization_id
      LEFT JOIN patients p ON p.id = d.current_patient_id
      WHERE d.id = ?
    `,
    [deviceId],
  );

  if (!row) {
    throw new HttpError(404, "Dispositivo nÃ£o encontrado.");
  }

  return mapDeviceIdentityRow(row);
}

async function getDeviceBehaviorSnapshot(deviceId, status, executor = null) {
  const telemetrySamples = await fetchTelemetryWindowByDeviceId(deviceId, 12, executor);
  const recentEvents = await fetchRecentBehaviorEventsByDeviceId(deviceId, executor);

  return computeDeviceBehavior({
    status,
    telemetrySamples,
    recentEvents,
  });
}

async function getDeviceForUpdate(deviceId, executor = null) {
  const row = await one(
    executor,
    `
      SELECT *
      FROM devices
      WHERE id = ?
      FOR UPDATE
    `,
    [deviceId],
  );

  if (!row) {
    throw new HttpError(404, "Dispositivo não encontrado.");
  }

  return row;
}

async function findDeviceByUidForUpdate(deviceUid, executor = null) {
  return one(
    executor,
    `
      SELECT
        id,
        device_uid,
        device_identifier,
        claim_status,
        organization_id,
        current_patient_id,
        current_assignment_history_id
      FROM devices
      WHERE device_uid = ?
      LIMIT 1
      FOR UPDATE
    `,
    [deviceUid],
  );
}

async function findClaimedDevicesByIdentifierForUpdate(deviceIdentifier, executor = null) {
  return execute(
    executor,
    `
      SELECT
        id,
        device_uid,
        device_identifier,
        claim_status,
        organization_id,
        current_patient_id,
        current_assignment_history_id
      FROM devices
      WHERE device_identifier = ?
        AND claim_status = 'claimed'
        AND organization_id IS NOT NULL
      ORDER BY id ASC
      LIMIT 2
      FOR UPDATE
    `,
    [deviceIdentifier],
  );
}

async function moveUnclaimedDuplicateDevice({
  sourceDeviceId,
  targetDeviceId,
  targetScope,
  executor = null,
}) {
  const scopeParams = [
    targetDeviceId,
    targetScope.organizationId,
    targetScope.patientId,
    targetScope.assignmentHistoryId,
    sourceDeviceId,
  ];

  await execute(
    executor,
    `
      UPDATE telemetry_logs
      SET
        device_id = ?,
        organization_id = ?,
        patient_id = ?,
        device_assignment_history_id = ?
      WHERE device_id = ?
    `,
    scopeParams,
  );

  await execute(
    executor,
    `
      UPDATE events
      SET
        device_id = ?,
        organization_id = ?,
        patient_id = ?,
        device_assignment_history_id = ?
      WHERE device_id = ?
    `,
    scopeParams,
  );

  await execute(
    executor,
    `
      UPDATE alerts
      SET
        device_id = ?,
        organization_id = ?,
        patient_id = ?
      WHERE device_id = ?
    `,
    [
      targetDeviceId,
      targetScope.organizationId,
      targetScope.patientId,
      sourceDeviceId,
    ],
  );

  await execute(
    executor,
    `
      UPDATE device_pairing_sessions
      SET used_by_device_id = ?
      WHERE used_by_device_id = ?
    `,
    [targetDeviceId, sourceDeviceId],
  );

  await execute(
    executor,
    `
      DELETE FROM device_status
      WHERE device_id = ?
    `,
    [sourceDeviceId],
  );

  await execute(
    executor,
    `
      DELETE FROM devices
      WHERE id = ?
    `,
    [sourceDeviceId],
  );
}

async function reconcileLegacyDeviceIdentity({
  normalizedUid,
  normalizedIdentifier,
  executor = null,
}) {
  if (!normalizedIdentifier) {
    return normalizedUid;
  }

  const legacyUid = buildLegacyDeviceUid(normalizedIdentifier);
  if (normalizedUid === legacyUid) {
    const legacyDevice = await findDeviceByUidForUpdate(legacyUid, executor);
    if (legacyDevice) {
      return normalizedUid;
    }

    const claimedDevices = await findClaimedDevicesByIdentifierForUpdate(
      normalizedIdentifier,
      executor,
    );

    if (claimedDevices.length === 1) {
      logger.info("Mensagem MQTT sem device_uid associada ao device pareado por identificador.", {
        deviceIdentifier: normalizedIdentifier,
        resolvedDeviceUid: claimedDevices[0].device_uid,
        deviceId: Number(claimedDevices[0].id),
        organizationId: Number(claimedDevices[0].organization_id),
      });

      return claimedDevices[0].device_uid;
    }

    return normalizedUid;
  }

  const legacyDevice = await findDeviceByUidForUpdate(legacyUid, executor);
  if (!isClaimedScopedDevice(legacyDevice)) {
    return normalizedUid;
  }

  const uidDevice = await findDeviceByUidForUpdate(normalizedUid, executor);
  if (!uidDevice) {
    await execute(
      executor,
      `
        UPDATE devices
        SET device_uid = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [normalizedUid, legacyDevice.id],
    );

    logger.info("Device MQTT reconciliado com cadastro legado pareado.", {
      deviceIdentifier: normalizedIdentifier,
      previousDeviceUid: legacyUid,
      nextDeviceUid: normalizedUid,
      deviceId: Number(legacyDevice.id),
      organizationId: Number(legacyDevice.organization_id),
    });

    return normalizedUid;
  }

  if (Number(uidDevice.id) === Number(legacyDevice.id)) {
    return normalizedUid;
  }

  const canMergeUnclaimedDuplicate =
    uidDevice.claim_status === "unclaimed" &&
    !uidDevice.organization_id &&
    uidDevice.device_identifier === normalizedIdentifier;

  if (!canMergeUnclaimedDuplicate) {
    logger.warn("Device MQTT real nao foi reconciliado com cadastro legado.", {
      deviceIdentifier: normalizedIdentifier,
      incomingDeviceUid: normalizedUid,
      incomingDeviceId: Number(uidDevice.id),
      incomingClaimStatus: uidDevice.claim_status,
      legacyDeviceId: Number(legacyDevice.id),
      reason: "incoming_uid_already_claimed_or_scoped",
    });

    return normalizedUid;
  }

  const targetScope = {
    organizationId: legacyDevice.organization_id ? Number(legacyDevice.organization_id) : null,
    patientId: legacyDevice.current_patient_id ? Number(legacyDevice.current_patient_id) : null,
    assignmentHistoryId: legacyDevice.current_assignment_history_id
      ? Number(legacyDevice.current_assignment_history_id)
      : null,
  };

  await moveUnclaimedDuplicateDevice({
    sourceDeviceId: Number(uidDevice.id),
    targetDeviceId: Number(legacyDevice.id),
    targetScope,
    executor,
  });

  await execute(
    executor,
    `
      UPDATE devices
      SET device_uid = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [normalizedUid, legacyDevice.id],
  );

  logger.info("Device MQTT duplicado sem tenant foi anexado ao legado pareado.", {
    deviceIdentifier: normalizedIdentifier,
    previousDeviceUid: legacyUid,
    nextDeviceUid: normalizedUid,
    removedDuplicateDeviceId: Number(uidDevice.id),
    targetDeviceId: Number(legacyDevice.id),
    organizationId: targetScope.organizationId,
    patientId: targetScope.patientId,
  });

  return normalizedUid;
}

async function getOrCreateDeviceByIdentity({ deviceUid, deviceIdentifier, name }, executor = null) {
  const normalizedIdentifier = normalizeDeviceIdentifier(deviceIdentifier, "");
  const requestedUid = normalizeDeviceUid(deviceUid, normalizedIdentifier);
  const normalizedUid = await reconcileLegacyDeviceIdentity({
    normalizedUid: requestedUid,
    normalizedIdentifier,
    executor,
  });
  const fallbackName = normalizeDeviceIdentifier(name, normalizedIdentifier || normalizedUid);

  await execute(
    executor,
    `
      INSERT INTO devices (
        device_uid,
        device_identifier,
        name,
        claim_status,
        is_active
      )
      VALUES (?, ?, ?, 'unclaimed', 1)
      ON DUPLICATE KEY UPDATE
        device_identifier = VALUES(device_identifier),
        name = COALESCE(NULLIF(name, ''), VALUES(name)),
        updated_at = CURRENT_TIMESTAMP
    `,
    [normalizedUid, normalizedIdentifier || normalizedUid, fallbackName],
  );

  const row = await one(
    executor,
    `
      SELECT id
      FROM devices
      WHERE device_uid = ?
    `,
    [normalizedUid],
  );

  await ensureDeviceStatusRow(row.id, executor);
  await syncDeviceScopeToStatus(row.id, executor);

  return getDeviceIdentitySnapshot(row.id, executor);
}

async function claimDeviceToOrganization(
  {
    deviceId,
    organizationId,
    claimedByUserId,
    deviceIdentifier,
    name,
    location,
  },
  executor = null,
) {
  const current = await getDeviceForUpdate(deviceId, executor);

  if (
    current.claim_status === "claimed" &&
    current.organization_id &&
    Number(current.organization_id) !== Number(organizationId)
  ) {
    throw new HttpError(409, "Este dispositivo ja esta pareado com outra organizacao.", {
      code: "DEVICE_CLAIMED_ELSEWHERE",
    });
  }

  const nextIdentifier = normalizeDeviceIdentifier(
    deviceIdentifier,
    current.device_identifier || current.device_uid,
  );
  const nextName = String(name || "").trim() || current.name || nextIdentifier;
  const nextLocation = location !== undefined
    ? String(location || "").trim() || null
    : current.location;

  await execute(
    executor,
    `
      UPDATE devices
      SET
        organization_id = ?,
        device_identifier = ?,
        name = ?,
        location = ?,
        claim_status = 'claimed',
        claimed_at = COALESCE(claimed_at, UTC_TIMESTAMP()),
        claimed_by_user_id = COALESCE(claimed_by_user_id, ?),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [organizationId, nextIdentifier, nextName, nextLocation, claimedByUserId, deviceId],
  );

  await ensureDeviceStatusRow(deviceId, executor);
  await syncDeviceScopeToStatus(deviceId, executor);

  return getDeviceStatusSnapshot(deviceId, executor);
}

async function setDevicePatientAssignment(
  {
    deviceId,
    organizationId,
    patientId,
    reason,
    notes,
    actorId,
  },
  executor = null,
) {
  const deviceRow = await getDeviceForUpdate(deviceId, executor);

  if (deviceRow.claim_status !== "claimed") {
    throw new HttpError(
      409,
      "O dispositivo precisa estar pareado antes de ser vinculado a um paciente.",
    );
  }

  if (Number(deviceRow.organization_id) !== Number(organizationId)) {
    throw new HttpError(
      403,
      "O dispositivo não pertence à organização ativa.",
    );
  }

  const currentHistory = await one(
    executor,
    `
      SELECT id, patient_id
      FROM device_assignment_history
      WHERE device_id = ?
        AND assignment_ended_at IS NULL
      ORDER BY assignment_started_at DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [deviceId],
  );

  if (patientId == null) {
    if (currentHistory) {
      await execute(
        executor,
        `
          UPDATE device_assignment_history
          SET
            assignment_ended_at = UTC_TIMESTAMP(),
            reason = COALESCE(?, reason),
            notes = COALESCE(?, notes)
          WHERE id = ?
        `,
        [reason || "manual_unassign", notes || null, currentHistory.id],
      );
    }

    await execute(
      executor,
      `
        UPDATE devices
        SET
          current_patient_id = NULL,
          current_assignment_history_id = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [deviceId],
    );

    await syncDeviceScopeToStatus(deviceId, executor);
    return getDeviceStatusSnapshot(deviceId, executor);
  }

  const patientRow = await one(
    executor,
    `
      SELECT id, full_name
      FROM patients
      WHERE id = ?
        AND organization_id = ?
        AND status = 'active'
      LIMIT 1
      FOR UPDATE
    `,
    [patientId, organizationId],
  );

  if (!patientRow) {
    throw new HttpError(404, "Paciente não encontrado na organização ativa.");
  }

  const conflictingDevice = await one(
    executor,
    `
      SELECT id
      FROM devices
      WHERE current_patient_id = ?
        AND organization_id = ?
        AND claim_status = 'claimed'
        AND id <> ?
      LIMIT 1
      FOR UPDATE
    `,
    [patientId, organizationId, deviceId],
  );

  if (conflictingDevice) {
    throw new HttpError(
      409,
      "Este paciente já possui outro dispositivo ativo. Desvincule-o antes de continuar.",
    );
  }

  if (currentHistory) {
    await execute(
      executor,
      `
        UPDATE device_assignment_history
        SET assignment_ended_at = UTC_TIMESTAMP()
        WHERE id = ?
      `,
      [currentHistory.id],
    );
  }

  const historyResult = await execute(
    executor,
    `
      INSERT INTO device_assignment_history (
        device_id,
        organization_id,
        patient_id,
        assigned_by_user_id,
        assignment_started_at,
        reason,
        notes
      )
      VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), ?, ?)
    `,
    [
      deviceId,
      organizationId,
      patientId,
      actorId || null,
      reason || "manual_assign",
      notes || null,
    ],
  );

  await execute(
    executor,
    `
      UPDATE devices
      SET
        current_patient_id = ?,
        current_assignment_history_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [patientId, historyResult.insertId, deviceId],
  );

  await syncDeviceScopeToStatus(deviceId, executor);
  return getDeviceStatusSnapshot(deviceId, executor);
}

async function upsertDeviceStatus(deviceId, fields, scope = null, executor = null, options = {}) {
  const status = {
    online: fields.online === undefined ? true : Boolean(fields.online),
    wifiRssi: toNullableNumber(fields.wifiRssi),
    batteryPercent: toNullableNumber(fields.batteryPercent),
    batteryPercentSource: toNullableString(fields.batteryPercentSource, 32),
    firmwareVersion: fields.firmwareVersion ? String(fields.firmwareVersion) : null,
    sensorReady: toNullableBoolean(fields.sensorReady),
    sensorValid: toNullableBoolean(fields.sensorValid),
    sensorReadOk: toNullableBoolean(fields.sensorReadOk),
    sensorSampleAgeMs: toNullableNumber(fields.sensorSampleAgeMs),
    sensorFailures: toNullableNumber(fields.sensorFailures),
    i2cErrorCount: toNullableNumber(fields.i2cErrorCount),
    i2cRecoveryCount: toNullableNumber(fields.i2cRecoveryCount),
    i2cLastError: toNullableString(fields.i2cLastError, 120),
    lastStatusTopic: toNullableString(fields.lastStatusTopic),
    lastTelemetryTopic: toNullableString(fields.lastTelemetryTopic),
    lastEventTopic: toNullableString(fields.lastEventTopic),
    lastTelemetryAt: fields.lastTelemetryAt || null,
    lastEventAt: fields.lastEventAt || null,
    lastSeenAt: fields.lastSeenAt || null,
  };
  const clearBatteryPercent =
      status.batteryPercentSource === "not_configured" && status.batteryPercent == null;

  const effectiveScope = scope || (await getDeviceScopeSnapshot(deviceId, executor));

  await execute(
    executor,
    `
      INSERT INTO device_status (
        device_id,
        organization_id,
        patient_id,
        device_assignment_history_id,
        online,
        wifi_rssi,
        battery_percent,
        firmware_version,
        sensor_ready,
        sensor_valid,
        sensor_read_ok,
        sensor_sample_age_ms,
        sensor_failures,
        i2c_error_count,
        i2c_recovery_count,
        i2c_last_error,
        last_status_topic,
        last_telemetry_topic,
        last_event_topic,
        last_telemetry_at,
        last_event_at,
        last_seen_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE
        organization_id = VALUES(organization_id),
        patient_id = VALUES(patient_id),
        device_assignment_history_id = VALUES(device_assignment_history_id),
        online = VALUES(online),
        wifi_rssi = COALESCE(VALUES(wifi_rssi), wifi_rssi),
        battery_percent = IF(? = 1, NULL, COALESCE(VALUES(battery_percent), battery_percent)),
        firmware_version = COALESCE(VALUES(firmware_version), firmware_version),
        sensor_ready = COALESCE(VALUES(sensor_ready), sensor_ready),
        sensor_valid = COALESCE(VALUES(sensor_valid), sensor_valid),
        sensor_read_ok = COALESCE(VALUES(sensor_read_ok), sensor_read_ok),
        sensor_sample_age_ms = COALESCE(VALUES(sensor_sample_age_ms), sensor_sample_age_ms),
        sensor_failures = COALESCE(VALUES(sensor_failures), sensor_failures),
        i2c_error_count = COALESCE(VALUES(i2c_error_count), i2c_error_count),
        i2c_recovery_count = COALESCE(VALUES(i2c_recovery_count), i2c_recovery_count),
        i2c_last_error = COALESCE(VALUES(i2c_last_error), i2c_last_error),
        last_status_topic = COALESCE(VALUES(last_status_topic), last_status_topic),
        last_telemetry_topic = COALESCE(VALUES(last_telemetry_topic), last_telemetry_topic),
        last_event_topic = COALESCE(VALUES(last_event_topic), last_event_topic),
        last_telemetry_at = COALESCE(VALUES(last_telemetry_at), last_telemetry_at),
        last_event_at = COALESCE(VALUES(last_event_at), last_event_at),
        last_seen_at = COALESCE(VALUES(last_seen_at), last_seen_at),
        updated_at = UTC_TIMESTAMP()
    `,
    [
      deviceId,
      effectiveScope.organizationId,
      effectiveScope.patientId,
      effectiveScope.assignmentHistoryId,
      status.online ? 1 : 0,
      status.wifiRssi,
      status.batteryPercent,
      status.firmwareVersion,
      status.sensorReady,
      status.sensorValid,
      status.sensorReadOk,
      status.sensorSampleAgeMs,
      status.sensorFailures,
      status.i2cErrorCount,
      status.i2cRecoveryCount,
      status.i2cLastError,
      status.lastStatusTopic,
      status.lastTelemetryTopic,
      status.lastEventTopic,
      status.lastTelemetryAt,
      status.lastEventAt,
      status.lastSeenAt,
      clearBatteryPercent ? 1 : 0,
    ],
  );

  if (options.returnSnapshot === false) {
    const statusPatch = {
      online: status.online,
      lastSeenAt: toIso(status.lastSeenAt),
      updatedAt: new Date().toISOString(),
    };

    if (status.wifiRssi != null) {
      statusPatch.wifiRssi = status.wifiRssi;
    }

    if (status.batteryPercent != null) {
      statusPatch.batteryPercent = status.batteryPercent;
    }

    if (status.batteryPercentSource) {
      statusPatch.batteryPercentSource = status.batteryPercentSource;
      if (clearBatteryPercent) {
        statusPatch.batteryPercent = null;
      }
    }

    if (status.firmwareVersion) {
      statusPatch.firmwareVersion = status.firmwareVersion;
    }

    if (status.sensorReady != null) {
      statusPatch.sensorReady = status.sensorReady;
    }

    if (status.sensorValid != null) {
      statusPatch.sensorValid = status.sensorValid;
    }

    if (status.sensorReadOk != null) {
      statusPatch.sensorReadOk = status.sensorReadOk;
    }

    if (status.sensorSampleAgeMs != null) {
      statusPatch.sensorSampleAgeMs = status.sensorSampleAgeMs;
    }

    if (status.sensorFailures != null) {
      statusPatch.sensorFailures = status.sensorFailures;
    }

    if (status.i2cErrorCount != null) {
      statusPatch.i2cErrorCount = status.i2cErrorCount;
    }

    if (status.i2cRecoveryCount != null) {
      statusPatch.i2cRecoveryCount = status.i2cRecoveryCount;
    }

    if (status.i2cLastError) {
      statusPatch.i2cLastError = status.i2cLastError;
    }

    if (status.lastStatusTopic) {
      statusPatch.lastStatusTopic = status.lastStatusTopic;
    }

    if (status.lastTelemetryTopic) {
      statusPatch.lastTelemetryTopic = status.lastTelemetryTopic;
    }

    if (status.lastEventTopic) {
      statusPatch.lastEventTopic = status.lastEventTopic;
    }

    if (status.lastTelemetryAt) {
      statusPatch.lastTelemetryAt = toIso(status.lastTelemetryAt);
    }

    if (status.lastEventAt) {
      statusPatch.lastEventAt = toIso(status.lastEventAt);
    }

    return {
      status: statusPatch,
      scope: effectiveScope,
    };
  }

  const snapshot = await getDeviceStatusSnapshot(deviceId, executor);
  if (status.batteryPercentSource) {
    snapshot.status.batteryPercentSource = status.batteryPercentSource;
    if (clearBatteryPercent) {
      snapshot.status.batteryPercent = null;
    }
  }
  return snapshot;
}

async function listDevices(filters = {}, accessContext) {
  const pagination = getPagination(filters, 12, 100);
  const { clauses, params } = buildScopeFilter(accessContext, {
    organizationColumn: "d.organization_id",
    patientColumn: "d.current_patient_id",
  });

  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    clauses.push(
      `
        (
          d.device_identifier LIKE ?
          OR d.device_uid LIKE ?
          OR d.name LIKE ?
          OR COALESCE(p.full_name, '') LIKE ?
          OR COALESCE(d.location, '') LIKE ?
        )
      `,
    );
    params.push(term, term, term, term, term);
  }

  if (filters.status === "online") {
    clauses.push("COALESCE(ds.online, 0) = 1");
  }

  if (filters.status === "offline") {
    clauses.push("COALESCE(ds.online, 0) = 0");
  }

  if (filters.claimStatus) {
    clauses.push("d.claim_status = ?");
    params.push(filters.claimStatus);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const totalRow = await one(
    null,
    `
      SELECT COUNT(*) AS total
      FROM devices d
      LEFT JOIN patients p ON p.id = d.current_patient_id
      LEFT JOIN device_status ds ON ds.device_id = d.id
      ${whereSql}
    `,
    params,
  );

  const rows = await execute(
    null,
    `
      SELECT
        d.id,
        d.device_uid AS deviceUid,
        d.device_identifier AS deviceIdentifier,
        d.name,
        d.location,
        d.is_active AS isActive,
        d.claim_status AS claimStatus,
        d.claimed_at AS claimedAt,
        d.current_assignment_history_id AS currentAssignmentHistoryId,
        o.id AS organizationId,
        o.name AS organizationName,
        o.type AS organizationType,
        p.id AS currentPatientId,
        p.full_name AS currentPatientName,
        ds.online,
        ds.wifi_rssi AS wifiRssi,
        ds.battery_percent AS batteryPercent,
        ds.firmware_version AS firmwareVersion,
        ds.sensor_ready AS sensorReady,
        ds.sensor_valid AS sensorValid,
        ds.sensor_read_ok AS sensorReadOk,
        ds.sensor_sample_age_ms AS sensorSampleAgeMs,
        ds.sensor_failures AS sensorFailures,
        ds.i2c_error_count AS i2cErrorCount,
        ds.i2c_recovery_count AS i2cRecoveryCount,
        ds.i2c_last_error AS i2cLastError,
        ds.last_status_topic AS lastStatusTopic,
        ds.last_telemetry_topic AS lastTelemetryTopic,
        ds.last_event_topic AS lastEventTopic,
        ds.last_telemetry_at AS lastTelemetryAt,
        ds.last_event_at AS lastEventAt,
        ds.last_seen_at AS lastSeenAt,
        ds.updated_at AS statusUpdatedAt,
        (
          SELECT COUNT(*)
          FROM alerts a
          WHERE a.device_id = d.id
            AND a.status IN ('open', 'acknowledged')
        ) AS activeAlerts
      FROM devices d
      LEFT JOIN organizations o ON o.id = d.organization_id
      LEFT JOIN patients p ON p.id = d.current_patient_id
      LEFT JOIN device_status ds ON ds.device_id = d.id
      ${whereSql}
      ORDER BY
        CASE d.claim_status
          WHEN 'claimed' THEN 0
          WHEN 'unclaimed' THEN 1
          ELSE 2
        END,
        COALESCE(ds.online, 0) DESC,
        ds.last_seen_at DESC,
        d.updated_at DESC
      LIMIT ? OFFSET ?
    `,
    [...params, pagination.limit, pagination.offset],
  );

  return {
    items: await attachBehaviorToDevices(rows.map(mapDeviceRow)),
    page: pagination.page,
    limit: pagination.limit,
    total: Number(totalRow.total),
  };
}

async function ensureScopedDevice(deviceId, accessContext, executor = null) {
  const device = await getDeviceStatusSnapshot(deviceId, executor);

  if (
    !canAccessScope(
      accessContext,
      device.organization?.id || null,
      device.currentPatient?.id || null,
    )
  ) {
    throw new HttpError(404, "Dispositivo não encontrado.");
  }

  return device;
}

async function getDeviceById(deviceId, accessContext) {
  const device = await ensureScopedDevice(deviceId, accessContext);
  const patientScoped =
    accessContext.restrictToAssignedPatients &&
    accessContext.assignedPatientIds.length > 0;
  const patientPlaceholders = patientScoped
    ? accessContext.assignedPatientIds.map(() => "?").join(", ")
    : "";
  const patientParams = patientScoped ? accessContext.assignedPatientIds : [];

  const telemetryRows = await execute(
    null,
    `
      SELECT *
      FROM telemetry_logs
      WHERE device_id = ?
        ${patientScoped ? `AND patient_id IN (${patientPlaceholders})` : ""}
      ORDER BY created_at DESC
      LIMIT 30
    `,
    [deviceId, ...patientParams],
  );

  const eventRows = await execute(
    null,
    `
      SELECT *
      FROM events
      WHERE device_id = ?
        ${patientScoped ? `AND patient_id IN (${patientPlaceholders})` : ""}
      ORDER BY event_time DESC, id DESC
      LIMIT 15
    `,
    [deviceId, ...patientParams],
  );

  const alertRows = await execute(
    null,
    `
      SELECT
        a.id,
        a.status,
        a.organization_id,
        a.patient_id,
        a.created_at,
        a.updated_at,
        e.id AS event_id,
        e.event_type,
        e.severity,
        e.intensity,
        e.immobility,
        e.message,
        e.evidence_status,
        e.evidence_telemetry_id,
        e.evidence_sample_count,
        e.evidence_window_seconds,
        e.evidence_summary_json,
        e.event_time,
        e.raw_payload_json
      FROM alerts a
      INNER JOIN events e ON e.id = a.event_id
      WHERE a.device_id = ?
        ${patientScoped ? `AND a.patient_id IN (${patientPlaceholders})` : ""}
      ORDER BY a.updated_at DESC
      LIMIT 10
    `,
    [deviceId, ...patientParams],
  );

  const assignmentHistoryRows = await execute(
    null,
    `
      SELECT
        dah.id,
        dah.patient_id,
        p.full_name AS patient_name,
        dah.assignment_started_at,
        dah.assignment_ended_at,
        dah.reason,
        dah.notes,
        u.id AS assigned_by_user_id,
        u.name AS assigned_by_user_name
      FROM device_assignment_history dah
      LEFT JOIN patients p ON p.id = dah.patient_id
      LEFT JOIN users u ON u.id = dah.assigned_by_user_id
      WHERE dah.device_id = ?
        ${patientScoped ? `AND dah.patient_id IN (${patientPlaceholders})` : ""}
      ORDER BY dah.assignment_started_at DESC, dah.id DESC
      LIMIT 20
    `,
    [deviceId, ...patientParams],
  );

  return {
    device: {
      ...device,
      behavior: computeDeviceBehavior({
        status: device.status,
        telemetrySamples: telemetryRows.map(mapTelemetryRow),
        recentEvents: eventRows.map(mapDeviceEventRow),
      }),
    },
    recentTelemetry: telemetryRows.reverse().map(mapTelemetryRow),
    recentEvents: eventRows.map(mapDeviceEventRow),
    recentAlerts: alertRows.map(mapDeviceAlertRow),
    assignmentHistory: assignmentHistoryRows.map((row) => ({
      id: Number(row.id),
      patient: row.patient_id
        ? {
            id: Number(row.patient_id),
            fullName: row.patient_name,
          }
        : null,
      assignedBy: row.assigned_by_user_id
        ? {
            id: Number(row.assigned_by_user_id),
            name: row.assigned_by_user_name,
          }
        : null,
      assignmentStartedAt: toIso(row.assignment_started_at),
      assignmentEndedAt: toIso(row.assignment_ended_at),
      reason: row.reason || null,
      notes: row.notes || null,
    })),
  };
}

async function createDevice(data, actorId, accessContext) {
  assertRole(
    accessContext,
    ["organization_admin"],
    "Somente administradores da organização podem cadastrar dispositivos manualmente.",
  );

  if (!accessContext.activeOrganizationId) {
    throw new HttpError(400, "Nenhuma organização ativa foi selecionada.");
  }

  return transaction(async (connection) => {
    const device = await getOrCreateDeviceByIdentity(
      {
        deviceUid: data.deviceUid,
        deviceIdentifier: data.deviceIdentifier,
        name: data.name,
      },
      connection,
    );

    const claimedDevice = await claimDeviceToOrganization(
      {
        deviceId: device.id,
        organizationId: accessContext.activeOrganizationId,
        claimedByUserId: actorId,
        deviceIdentifier: data.deviceIdentifier,
        name: data.name,
        location: data.location,
      },
      connection,
    );

    if (data.patientId) {
      await setDevicePatientAssignment(
        {
          deviceId: claimedDevice.id,
          organizationId: accessContext.activeOrganizationId,
          patientId: Number(data.patientId),
          reason: "manual_create_assign",
          notes: "Vínculo criado durante cadastro manual do dispositivo.",
          actorId,
        },
        connection,
      );
    }

    const finalDevice = await getDeviceStatusSnapshot(claimedDevice.id, connection);

    await createAuditLog(
      {
        organizationId: accessContext.activeOrganizationId,
        userId: actorId,
        action: "device.create",
        entityType: "device",
        entityId: finalDevice.id,
        metadata: {
          deviceUid: finalDevice.deviceUid,
          organizationId: accessContext.activeOrganizationId,
        },
      },
      connection,
    );

    return finalDevice;
  });
}

async function updateDevice(deviceId, data, actorId, accessContext) {
  assertRole(
    accessContext,
    ["organization_admin"],
    "Somente administradores da organização podem editar dispositivos.",
  );

  return transaction(async (connection) => {
    const current = await ensureScopedDevice(deviceId, accessContext, connection);

    await execute(
      connection,
      `
        UPDATE devices
        SET
          name = ?,
          location = ?,
          is_active = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        data.name ? String(data.name).trim() : current.name,
        data.location !== undefined ? String(data.location || "").trim() : current.location,
        data.isActive === undefined ? (current.isActive ? 1 : 0) : (data.isActive ? 1 : 0),
        deviceId,
      ],
    );

    const updated = await getDeviceStatusSnapshot(deviceId, connection);

    await createAuditLog(
      {
        organizationId: accessContext.activeOrganizationId,
        userId: actorId,
        action: "device.update",
        entityType: "device",
        entityId: updated.id,
        metadata: {
          before: current,
          after: updated,
        },
      },
      connection,
    );

    return updated;
  });
}

async function assignDeviceToPatient(deviceId, data, accessContext, actorId) {
  assertRole(
    accessContext,
    ["organization_admin"],
    "Somente administradores da organização podem mudar o vínculo do dispositivo.",
  );

  if (!accessContext.activeOrganizationId) {
    throw new HttpError(400, "Nenhuma organização ativa foi selecionada.");
  }

  return transaction(async (connection) => {
    const current = await ensureScopedDevice(deviceId, accessContext, connection);
    const updated = await setDevicePatientAssignment(
      {
        deviceId,
        organizationId: accessContext.activeOrganizationId,
        patientId: data.patientId ? Number(data.patientId) : null,
        reason: data.reason || (data.patientId ? "manual_assign" : "manual_unassign"),
        notes: data.notes || null,
        actorId,
      },
      connection,
    );

    await createAuditLog(
      {
        organizationId: accessContext.activeOrganizationId,
        userId: actorId,
        action: "device.assignment.update",
        entityType: "device",
        entityId: deviceId,
        metadata: {
          before: current.currentPatient,
          after: updated.currentPatient,
          reason: data.reason || null,
        },
      },
      connection,
    );

    return updated;
  });
}

async function deleteDevice(deviceId, actorId, accessContext) {
  assertRole(
    accessContext,
    ["organization_admin"],
    "Somente administradores da organização podem remover dispositivos.",
  );

  return transaction(async (connection) => {
    const current = await ensureScopedDevice(deviceId, accessContext, connection);

    await createAuditLog(
      {
        organizationId: accessContext.activeOrganizationId,
        userId: actorId,
        action: "device.delete",
        entityType: "device",
        entityId: current.id,
        metadata: current,
      },
      connection,
    );

    await execute(
      connection,
      `
        DELETE FROM devices
        WHERE id = ?
      `,
      [deviceId],
    );

    return current;
  });
}

async function listDeviceStatus(accessContext) {
  const result = await listDevices(
    {
      limit: 100,
    },
    accessContext,
  );

  return result.items;
}

async function markDevicesOffline(cutoffDate) {
  const staleRows = await execute(
    null,
    `
      SELECT
        d.id,
        d.device_uid AS deviceUid,
        d.device_identifier AS deviceIdentifier,
        d.name,
        d.location,
        d.is_active AS isActive,
        d.claim_status AS claimStatus,
        d.claimed_at AS claimedAt,
        d.current_assignment_history_id AS currentAssignmentHistoryId,
        o.id AS organizationId,
        o.name AS organizationName,
        o.type AS organizationType,
        p.id AS currentPatientId,
        p.full_name AS currentPatientName,
        ds.online,
        ds.wifi_rssi AS wifiRssi,
        ds.battery_percent AS batteryPercent,
        ds.firmware_version AS firmwareVersion,
        ds.sensor_ready AS sensorReady,
        ds.sensor_valid AS sensorValid,
        ds.sensor_read_ok AS sensorReadOk,
        ds.sensor_sample_age_ms AS sensorSampleAgeMs,
        ds.sensor_failures AS sensorFailures,
        ds.i2c_error_count AS i2cErrorCount,
        ds.i2c_recovery_count AS i2cRecoveryCount,
        ds.i2c_last_error AS i2cLastError,
        ds.last_status_topic AS lastStatusTopic,
        ds.last_telemetry_topic AS lastTelemetryTopic,
        ds.last_event_topic AS lastEventTopic,
        ds.last_telemetry_at AS lastTelemetryAt,
        ds.last_event_at AS lastEventAt,
        ds.last_seen_at AS lastSeenAt,
        ds.updated_at AS statusUpdatedAt,
        (
          SELECT COUNT(*)
          FROM alerts a
          WHERE a.device_id = d.id
            AND a.status IN ('open', 'acknowledged')
        ) AS activeAlerts
      FROM device_status ds
      INNER JOIN devices d ON d.id = ds.device_id
      LEFT JOIN organizations o ON o.id = d.organization_id
      LEFT JOIN patients p ON p.id = d.current_patient_id
      WHERE ds.online = 1
        AND ds.last_seen_at IS NOT NULL
        AND ds.last_seen_at < ?
    `,
    [cutoffDate],
  );

  if (!staleRows.length) {
    return [];
  }

  await execute(
    null,
    `
      UPDATE device_status
      SET online = 0, updated_at = UTC_TIMESTAMP()
      WHERE online = 1
        AND last_seen_at IS NOT NULL
        AND last_seen_at < ?
    `,
    [cutoffDate],
  );

  return attachBehaviorToDevices(
    staleRows.map((row) =>
      mapDeviceRow({
        ...row,
        online: 0,
      }),
    ),
  );
}

module.exports = {
  assignDeviceToPatient,
  claimDeviceToOrganization,
  createDevice,
  deleteDevice,
  ensureDeviceStatusRow,
  getDeviceById,
  getDeviceBehaviorSnapshot,
  getDeviceScopeSnapshot,
  getDeviceStatusSnapshot,
  getOrCreateDeviceByIdentity,
  listDevices,
  listDeviceStatus,
  mapTelemetryRow,
  markDevicesOffline,
  setDevicePatientAssignment,
  syncDeviceScopeToStatus,
  upsertDeviceStatus,
  updateDevice,
};
