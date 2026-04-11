const { execute, one } = require("../db/pool");
const { listAlerts } = require("./alertService");
const { listDeviceStatus } = require("./deviceService");
const { buildScopeFilter } = require("./scopeService");

function toIso(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function countRows(sql, params = []) {
  const row = await one(null, sql, params);
  return Number(row?.total || 0);
}

async function getSummary(accessContext) {
  const deviceScope = buildScopeFilter(accessContext, {
    organizationColumn: "d.organization_id",
    patientColumn: "d.current_patient_id",
  });
  const eventScope = buildScopeFilter(accessContext, {
    organizationColumn: "e.organization_id",
    patientColumn: "e.patient_id",
  });
  const alertScope = buildScopeFilter(accessContext, {
    organizationColumn: "a.organization_id",
    patientColumn: "a.patient_id",
  });
  const telemetryScope = buildScopeFilter(accessContext, {
    organizationColumn: "t.organization_id",
    patientColumn: "t.patient_id",
  });
  const statusScope = buildScopeFilter(accessContext, {
    organizationColumn: "ds.organization_id",
    patientColumn: "ds.patient_id",
  });

  const patientScoped =
    accessContext.restrictToAssignedPatients &&
    accessContext.assignedPatientIds.length > 0;
  const patientPlaceholders = patientScoped
    ? accessContext.assignedPatientIds.map(() => "?").join(", ")
    : "";

  const [
    totalDevices,
    onlineDevices,
    offlineDevices,
    activeAlerts,
    criticalAlerts,
    eventsLast24h,
    telemetryLastHour,
    lastSeenRow,
    patientRow,
    recentEventRows,
  ] = await Promise.all([
    countRows(
      `
        SELECT COUNT(*) AS total
        FROM devices d
        ${deviceScope.clauses.length ? `WHERE ${deviceScope.clauses.join(" AND ")}` : ""}
      `,
      deviceScope.params,
    ),
    countRows(
      `
        SELECT COUNT(*) AS total
        FROM device_status ds
        ${statusScope.clauses.length ? `WHERE ${statusScope.clauses.join(" AND ")} AND ds.online = 1` : "WHERE ds.online = 1"}
      `,
      statusScope.params,
    ),
    countRows(
      `
        SELECT COUNT(*) AS total
        FROM device_status ds
        ${statusScope.clauses.length ? `WHERE ${statusScope.clauses.join(" AND ")} AND COALESCE(ds.online, 0) = 0` : "WHERE COALESCE(ds.online, 0) = 0"}
      `,
      statusScope.params,
    ),
    countRows(
      `
        SELECT COUNT(*) AS total
        FROM alerts a
        ${alertScope.clauses.length ? `WHERE ${alertScope.clauses.join(" AND ")} AND a.status IN ('open', 'acknowledged')` : "WHERE a.status IN ('open', 'acknowledged')"}
      `,
      alertScope.params,
    ),
    countRows(
      `
        SELECT COUNT(*) AS total
        FROM alerts a
        INNER JOIN events e ON e.id = a.event_id
        ${alertScope.clauses.length ? `WHERE ${alertScope.clauses.join(" AND ")} AND a.status IN ('open', 'acknowledged') AND e.severity = 'critical'` : "WHERE a.status IN ('open', 'acknowledged') AND e.severity = 'critical'"}
      `,
      alertScope.params,
    ),
    countRows(
      `
        SELECT COUNT(*) AS total
        FROM events e
        ${eventScope.clauses.length ? `WHERE ${eventScope.clauses.join(" AND ")} AND e.event_time >= UTC_TIMESTAMP() - INTERVAL 1 DAY` : "WHERE e.event_time >= UTC_TIMESTAMP() - INTERVAL 1 DAY"}
      `,
      eventScope.params,
    ),
    countRows(
      `
        SELECT COUNT(*) AS total
        FROM telemetry_logs t
        ${telemetryScope.clauses.length ? `WHERE ${telemetryScope.clauses.join(" AND ")} AND t.created_at >= UTC_TIMESTAMP() - INTERVAL 1 HOUR` : "WHERE t.created_at >= UTC_TIMESTAMP() - INTERVAL 1 HOUR"}
      `,
      telemetryScope.params,
    ),
    one(
      null,
      `
        SELECT MAX(ds.last_seen_at) AS lastSeenAt
        FROM device_status ds
        ${statusScope.clauses.length ? `WHERE ${statusScope.clauses.join(" AND ")}` : ""}
      `,
      statusScope.params,
    ),
    one(
      null,
      `
        SELECT COUNT(*) AS totalPatients
        FROM patients p
        ${
          accessContext.activeOrganizationId || !accessContext.isPlatformAdmin
            ? `WHERE p.organization_id = ? ${
                patientScoped ? `AND p.id IN (${patientPlaceholders})` : ""
              }`
            : patientScoped
              ? `WHERE p.id IN (${patientPlaceholders})`
              : ""
        }
      `,
      accessContext.activeOrganizationId || !accessContext.isPlatformAdmin
        ? [
            accessContext.activeOrganizationId,
            ...(
              patientScoped
                ? accessContext.assignedPatientIds
                : []
            ),
          ]
        : patientScoped
          ? accessContext.assignedPatientIds
          : [],
    ),
    execute(
      null,
      `
        SELECT
          e.id,
          e.organization_id AS organizationId,
          e.patient_id AS patientId,
          e.device_assignment_history_id AS assignmentHistoryId,
          e.event_type AS eventType,
          e.severity,
          e.intensity,
          e.immobility,
          e.message,
          e.event_time AS eventTime,
          e.raw_payload_json AS rawPayloadJson,
          e.created_at AS createdAt,
          d.id AS deviceId,
          d.device_uid AS deviceUid,
          d.device_identifier AS deviceIdentifier,
          d.name AS deviceName,
          p.full_name AS patientName
        FROM events e
        INNER JOIN devices d ON d.id = e.device_id
        LEFT JOIN patients p ON p.id = e.patient_id
        ${eventScope.clauses.length ? `WHERE ${eventScope.clauses.join(" AND ")}` : ""}
        ORDER BY e.event_time DESC, e.id DESC
        LIMIT 8
      `,
      eventScope.params,
    ),
  ]);

  const systemState =
    criticalAlerts > 0 ? "critical" : activeAlerts > 0 ? "attention" : "stable";

  return {
    organization: accessContext.activeOrganization,
    metrics: {
      totalDevices,
      totalPatients: Number(patientRow?.totalPatients || 0),
      onlineDevices,
      offlineDevices,
      activeAlerts,
      criticalAlerts,
      eventsLast24h,
      telemetryLastHour,
    },
    systemStatus: {
      state: systemState,
      lastSeenAt: toIso(lastSeenRow?.lastSeenAt),
      generatedAt: new Date().toISOString(),
    },
    recentEvents: recentEventRows.map((row) => ({
      id: Number(row.id),
      organizationId: row.organizationId ? Number(row.organizationId) : null,
      patientId: row.patientId ? Number(row.patientId) : null,
      assignmentHistoryId: row.assignmentHistoryId ? Number(row.assignmentHistoryId) : null,
      eventType: row.eventType,
      severity: row.severity,
      intensity: row.intensity == null ? null : Number(row.intensity),
      immobility: Boolean(row.immobility),
      message: row.message,
      eventTime: toIso(row.eventTime),
      rawPayloadJson: null,
      createdAt: toIso(row.createdAt),
      device: {
        id: Number(row.deviceId),
        deviceUid: row.deviceUid || undefined,
        deviceIdentifier: row.deviceIdentifier,
        name: row.deviceName,
        patientName: row.patientName || "",
      },
      patient: row.patientId
        ? {
            id: Number(row.patientId),
            fullName: row.patientName,
          }
        : null,
      alert: null,
    })),
  };
}

async function getRecentAlerts(accessContext) {
  const alerts = await listAlerts(
    {
      page: 1,
      limit: 8,
    },
    accessContext,
  );

  return alerts.items;
}

async function getDeviceStatusOverview(accessContext) {
  return listDeviceStatus(accessContext);
}

module.exports = {
  getDeviceStatusOverview,
  getRecentAlerts,
  getSummary,
};
