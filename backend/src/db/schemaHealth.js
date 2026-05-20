const { execute } = require("./pool");

const REQUIRED_RUNTIME_SCHEMA = [
  { tableName: "events", columnName: "evidence_status" },
  { tableName: "events", columnName: "evidence_telemetry_id" },
  { tableName: "events", columnName: "evidence_sample_count" },
  { tableName: "events", columnName: "evidence_window_seconds" },
  { tableName: "events", columnName: "evidence_summary_json" },
  { tableName: "device_status", columnName: "sensor_ready" },
  { tableName: "device_status", columnName: "sensor_valid" },
  { tableName: "device_status", columnName: "sensor_read_ok" },
  { tableName: "device_status", columnName: "sensor_sample_age_ms" },
  { tableName: "device_status", columnName: "sensor_failures" },
  { tableName: "device_status", columnName: "i2c_error_count" },
  { tableName: "device_status", columnName: "i2c_recovery_count" },
  { tableName: "device_status", columnName: "i2c_last_error" },
  { tableName: "device_status", columnName: "last_status_topic" },
  { tableName: "device_status", columnName: "last_telemetry_topic" },
  { tableName: "device_status", columnName: "last_event_topic" },
  { tableName: "device_status", columnName: "last_telemetry_at" },
  { tableName: "device_status", columnName: "last_event_at" },
];

async function tableExists(tableName) {
  const rows = await execute(
    null,
    `
      SELECT 1 AS found
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      LIMIT 1
    `,
    [tableName],
  );

  return rows.length > 0;
}

async function columnExists(tableName, columnName) {
  const rows = await execute(
    null,
    `
      SELECT 1 AS found
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [tableName, columnName],
  );

  return rows.length > 0;
}

async function checkRuntimeSchema() {
  const missing = [];

  for (const requirement of REQUIRED_RUNTIME_SCHEMA) {
    const exists = await columnExists(requirement.tableName, requirement.columnName);

    if (!exists) {
      missing.push(`${requirement.tableName}.${requirement.columnName}`);
    }
  }

  if (!(await tableExists("event_telemetry_evidence"))) {
    missing.push("event_telemetry_evidence");
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}

module.exports = {
  checkRuntimeSchema,
};
