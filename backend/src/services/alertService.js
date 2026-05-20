const { execute, one, transaction } = require("../db/pool");
const { elapsedMsSince } = require("../utils/correlation");
const { parseMaybeJson, toBoolean } = require("../utils/formatters");
const { HttpError } = require("../utils/httpError");
const { logger } = require("../utils/logger");
const { getPagination } = require("../utils/pagination");
const { parseDateBoundary } = require("../utils/time");
const { createAuditLog } = require("./auditService");
const { assertRole, buildScopeFilter, canAccessScope } = require("./scopeService");

const RECENT_FALL_ALERT_DEDUP_WINDOW_SECONDS = 20;

function toIso(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toNullableNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function findRecentOpenFallAlert(event, executor = null) {
  if (!event?.device?.id || event.eventType !== "fall_detected" || !event.eventTime) {
    return null;
  }

  const eventTime = event.eventTime instanceof Date
    ? event.eventTime
    : new Date(event.eventTime);

  if (Number.isNaN(eventTime.getTime())) {
    return null;
  }

  const row = await one(
    executor,
    `
      SELECT a.id
      FROM alerts a
      INNER JOIN events e ON e.id = a.event_id
      WHERE a.device_id = ?
        AND e.event_type = 'fall_detected'
        AND a.status IN ('open', 'acknowledged')
        AND ABS(TIMESTAMPDIFF(SECOND, e.event_time, ?)) <= ?
      ORDER BY e.event_time DESC, a.id DESC
      LIMIT 1
    `,
    [event.device.id, eventTime, RECENT_FALL_ALERT_DEDUP_WINDOW_SECONDS],
  );

  return row?.id ? Number(row.id) : null;
}

function mapAlertRow(row) {
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
    status: row.status,
    acknowledgedAt: toIso(row.acknowledged_at),
    canceledAt: toIso(row.canceled_at),
    resolvedAt: toIso(row.resolved_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    acknowledgedBy: row.acknowledgedById
      ? { id: Number(row.acknowledgedById), name: row.acknowledgedByName }
      : null,
    canceledBy: row.canceledById
      ? { id: Number(row.canceledById), name: row.canceledByName }
      : null,
    resolvedBy: row.resolvedById
      ? { id: Number(row.resolvedById), name: row.resolvedByName }
      : null,
    device: {
      id: Number(row.deviceId),
      deviceUid: row.deviceUid,
      deviceIdentifier: row.deviceIdentifier,
      name: row.deviceName,
      patientName: patient?.fullName || "",
    },
    patient,
    event: {
      id: Number(row.eventId),
      eventType: row.eventType,
      severity: row.severity,
      intensity: toNullableNumber(row.intensity),
      immobility: toBoolean(row.immobility),
      message: row.message,
      evidenceStatus: row.evidenceStatus || row.evidence_status || "none",
      evidenceTelemetryId: evidenceTelemetryId ? Number(evidenceTelemetryId) : null,
      evidenceSampleCount: evidenceSampleCount == null ? 0 : Number(evidenceSampleCount),
      evidenceWindowSeconds: toNullableNumber(evidenceWindowSeconds),
      evidenceSummary: parseMaybeJson(evidenceSummaryJson),
      eventTime: toIso(row.eventTime),
      rawPayloadJson: parseMaybeJson(row.rawPayloadJson),
    },
  };
}

async function fetchAlertRow(alertId, executor = null) {
  const row = await one(
    executor,
    `
      SELECT
        a.id,
        a.organization_id AS organizationId,
        a.patient_id AS patientId,
        a.status,
        a.acknowledged_at,
        a.canceled_at,
        a.resolved_at,
        a.created_at,
        a.updated_at,
        ack.id AS acknowledgedById,
        ack.name AS acknowledgedByName,
        cancel_user.id AS canceledById,
        cancel_user.name AS canceledByName,
        resolve_user.id AS resolvedById,
        resolve_user.name AS resolvedByName,
        d.id AS deviceId,
        d.device_uid AS deviceUid,
        d.device_identifier AS deviceIdentifier,
        d.name AS deviceName,
        p.full_name AS patientName,
        e.id AS eventId,
        e.event_type AS eventType,
        e.severity,
        e.intensity,
        e.immobility,
        e.message,
        e.evidence_status AS evidenceStatus,
        e.evidence_telemetry_id AS evidenceTelemetryId,
        e.evidence_sample_count AS evidenceSampleCount,
        e.evidence_window_seconds AS evidenceWindowSeconds,
        e.evidence_summary_json AS evidenceSummaryJson,
        e.event_time AS eventTime,
        e.raw_payload_json AS rawPayloadJson
      FROM alerts a
      INNER JOIN events e ON e.id = a.event_id
      INNER JOIN devices d ON d.id = a.device_id
      LEFT JOIN patients p ON p.id = a.patient_id
      LEFT JOIN users ack ON ack.id = a.acknowledged_by
      LEFT JOIN users cancel_user ON cancel_user.id = a.canceled_by
      LEFT JOIN users resolve_user ON resolve_user.id = a.resolved_by
      WHERE a.id = ?
    `,
    [alertId],
  );

  if (!row) {
    throw new HttpError(404, "Alerta não encontrado.");
  }

  return mapAlertRow(row);
}

async function createAlertForEvent(event, executor = null, options = {}) {
  const startedAt = process.hrtime.bigint();
  if (options.dedupeRecentFallAlert) {
    const existingAlertId = await findRecentOpenFallAlert(event, executor);

    if (existingAlertId) {
      const alert = await fetchAlertRow(existingAlertId, executor);
      logger.info("Alerta recente de queda reaproveitado.", {
        correlationId: options.correlationId || null,
        eventId: event.id,
        alertId: alert.id,
        status: alert.status,
        organizationId: alert.organizationId,
        patientId: alert.patientId,
        dedupWindowSeconds: RECENT_FALL_ALERT_DEDUP_WINDOW_SECONDS,
        durationMs: elapsedMsSince(startedAt),
      });
      return alert;
    }
  }

  const result = await execute(
    executor,
    `
      INSERT INTO alerts (
        organization_id,
        patient_id,
        event_id,
        device_id,
        status
      )
      VALUES (?, ?, ?, ?, 'open')
      ON DUPLICATE KEY UPDATE
        id = LAST_INSERT_ID(id)
    `,
    [event.organizationId || null, event.patientId || null, event.id, event.device.id],
  );

  const alert = await fetchAlertRow(result.insertId, executor);

  logger.info("Alerta de evento garantido.", {
    correlationId: options.correlationId || null,
    eventId: event.id,
    alertId: alert.id,
    status: alert.status,
    organizationId: alert.organizationId,
    patientId: alert.patientId,
    inserted: result.affectedRows === 1,
    durationMs: elapsedMsSince(startedAt),
  });

  return alert;
}

function buildAlertFilters(filters, accessContext) {
  const { clauses, params } = buildScopeFilter(accessContext, {
    organizationColumn: "a.organization_id",
    patientColumn: "a.patient_id",
  });

  if (filters.status) {
    clauses.push("a.status = ?");
    params.push(filters.status);
  }

  if (filters.deviceId) {
    clauses.push("a.device_id = ?");
    params.push(Number(filters.deviceId));
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

async function listAlerts(filters = {}, accessContext) {
  const pagination = getPagination(filters, 12, 100);
  const { whereSql, params } = buildAlertFilters(filters, accessContext);

  const totalRow = await one(
    null,
    `
      SELECT COUNT(*) AS total
      FROM alerts a
      INNER JOIN events e ON e.id = a.event_id
      WHERE ${whereSql}
    `,
    params,
  );

  const rows = await execute(
    null,
    `
      SELECT
        a.id,
        a.organization_id AS organizationId,
        a.patient_id AS patientId,
        a.status,
        a.acknowledged_at,
        a.canceled_at,
        a.resolved_at,
        a.created_at,
        a.updated_at,
        ack.id AS acknowledgedById,
        ack.name AS acknowledgedByName,
        cancel_user.id AS canceledById,
        cancel_user.name AS canceledByName,
        resolve_user.id AS resolvedById,
        resolve_user.name AS resolvedByName,
        d.id AS deviceId,
        d.device_uid AS deviceUid,
        d.device_identifier AS deviceIdentifier,
        d.name AS deviceName,
        p.full_name AS patientName,
        e.id AS eventId,
        e.event_type AS eventType,
        e.severity,
        e.intensity,
        e.immobility,
        e.message,
        e.evidence_status AS evidenceStatus,
        e.evidence_telemetry_id AS evidenceTelemetryId,
        e.evidence_sample_count AS evidenceSampleCount,
        e.evidence_window_seconds AS evidenceWindowSeconds,
        e.evidence_summary_json AS evidenceSummaryJson,
        e.event_time AS eventTime,
        e.raw_payload_json AS rawPayloadJson
      FROM alerts a
      INNER JOIN events e ON e.id = a.event_id
      INNER JOIN devices d ON d.id = a.device_id
      LEFT JOIN patients p ON p.id = a.patient_id
      LEFT JOIN users ack ON ack.id = a.acknowledged_by
      LEFT JOIN users cancel_user ON cancel_user.id = a.canceled_by
      LEFT JOIN users resolve_user ON resolve_user.id = a.resolved_by
      WHERE ${whereSql}
      ORDER BY
        CASE a.status
          WHEN 'open' THEN 0
          WHEN 'acknowledged' THEN 1
          WHEN 'resolved' THEN 2
          ELSE 3
        END,
        e.event_time DESC,
        a.id DESC
      LIMIT ? OFFSET ?
    `,
    [...params, pagination.limit, pagination.offset],
  );

  return {
    items: rows.map(mapAlertRow),
    page: pagination.page,
    limit: pagination.limit,
    total: Number(totalRow.total),
  };
}

async function getAlertById(alertId, accessContext, executor = null) {
  const alert = await fetchAlertRow(alertId, executor);

  if (!canAccessScope(accessContext, alert.organizationId, alert.patientId)) {
    throw new HttpError(404, "Alerta não encontrado.");
  }

  const actionRows = await execute(
    executor,
    `
      SELECT
        aa.id,
        aa.action_type,
        aa.note,
        aa.created_at,
        u.id AS userId,
        u.name AS userName,
        u.email AS userEmail
      FROM alert_actions aa
      INNER JOIN users u ON u.id = aa.user_id
      WHERE aa.alert_id = ?
      ORDER BY aa.created_at DESC
    `,
    [alertId],
  );

  return {
    ...alert,
    actions: actionRows.map((row) => ({
      id: Number(row.id),
      actionType: row.action_type,
      note: row.note,
      createdAt: toIso(row.created_at),
      user: {
        id: Number(row.userId),
        name: row.userName,
        email: row.userEmail,
      },
    })),
  };
}

function resolveNextStatus(currentStatus, actionType) {
  if (actionType === "acknowledge" && currentStatus === "open") {
    return "acknowledged";
  }

  if (actionType === "cancel" && ["open", "acknowledged"].includes(currentStatus)) {
    return "canceled";
  }

  if (actionType === "resolve" && ["open", "acknowledged"].includes(currentStatus)) {
    return "resolved";
  }

  throw new HttpError(
    409,
    `Não é possível executar a ação "${actionType}" para um alerta em estado "${currentStatus}".`,
  );
}

async function updateAlertStatus(alertId, actionType, userId, note, accessContext) {
  assertRole(
    accessContext,
    ["organization_admin", "caregiver", "operator"],
    "Seu papel atual não pode alterar alertas.",
  );

  return transaction(async (connection) => {
    const lockedRow = await one(
      connection,
      `
        SELECT
          a.id,
          a.organization_id,
          a.patient_id,
          a.status
        FROM alerts a
        WHERE a.id = ?
        FOR UPDATE
      `,
      [alertId],
    );

    if (!lockedRow) {
      throw new HttpError(404, "Alerta não encontrado.");
    }

    if (
      !canAccessScope(
        accessContext,
        lockedRow.organization_id ? Number(lockedRow.organization_id) : null,
        lockedRow.patient_id ? Number(lockedRow.patient_id) : null,
      )
    ) {
      throw new HttpError(404, "Alerta não encontrado.");
    }

    const currentStatus = lockedRow.status;
    const nextStatus = resolveNextStatus(currentStatus, actionType);

    const updates = {
      acknowledge: {
        status: nextStatus,
        acknowledgedBy: userId,
      },
      cancel: {
        status: nextStatus,
        canceledBy: userId,
      },
      resolve: {
        status: nextStatus,
        resolvedBy: userId,
      },
    }[actionType];

    const result = await execute(
      connection,
      `
        UPDATE alerts
        SET
          status = ?,
          acknowledged_by = COALESCE(?, acknowledged_by),
          acknowledged_at = CASE WHEN ? IS NOT NULL THEN UTC_TIMESTAMP() ELSE acknowledged_at END,
          canceled_by = COALESCE(?, canceled_by),
          canceled_at = CASE WHEN ? IS NOT NULL THEN UTC_TIMESTAMP() ELSE canceled_at END,
          resolved_by = COALESCE(?, resolved_by),
          resolved_at = CASE WHEN ? IS NOT NULL THEN UTC_TIMESTAMP() ELSE resolved_at END,
          updated_at = UTC_TIMESTAMP()
        WHERE id = ?
          AND status = ?
      `,
      [
        updates.status,
        updates.acknowledgedBy || null,
        updates.acknowledgedBy || null,
        updates.canceledBy || null,
        updates.canceledBy || null,
        updates.resolvedBy || null,
        updates.resolvedBy || null,
        alertId,
        currentStatus,
      ],
    );

    if (result.affectedRows !== 1) {
      throw new HttpError(
        409,
        "O estado do alerta mudou antes da sua ação ser concluída. Recarregue a fila e tente novamente.",
      );
    }

    await execute(
      connection,
      `
        INSERT INTO alert_actions (alert_id, user_id, action_type, note)
        VALUES (?, ?, ?, ?)
      `,
      [alertId, userId, actionType, note ? String(note).trim() : null],
    );

    await createAuditLog(
      {
        organizationId: accessContext.activeOrganizationId,
        userId,
        action: `alert.${actionType}`,
        entityType: "alert",
        entityId: alertId,
        metadata: {
          before: currentStatus,
          after: nextStatus,
          note: note || null,
        },
      },
      connection,
    );

    return getAlertById(alertId, accessContext, connection);
  });
}

module.exports = {
  createAlertForEvent,
  getAlertById,
  listAlerts,
  updateAlertStatus,
};
