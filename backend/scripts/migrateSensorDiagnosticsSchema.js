const { execute, pool, testConnection } = require("../src/db/pool");

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

async function ensureColumn(tableName, columnName, definition) {
  if (await columnExists(tableName, columnName)) {
    console.log(`[migrateSensorDiagnosticsSchema] coluna ja existe: ${tableName}.${columnName}`);
    return;
  }

  await execute(null, `ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  console.log(`[migrateSensorDiagnosticsSchema] coluna adicionada: ${tableName}.${columnName}`);
}

async function main() {
  await testConnection();

  if (!(await tableExists("device_status"))) {
    throw new Error("Tabela device_status nao existe. Rode npm run db:init --prefix backend antes da migracao.");
  }

  await ensureColumn(
    "device_status",
    "sensor_ready",
    "sensor_ready TINYINT(1) NULL AFTER firmware_version",
  );
  await ensureColumn(
    "device_status",
    "sensor_valid",
    "sensor_valid TINYINT(1) NULL AFTER sensor_ready",
  );
  await ensureColumn(
    "device_status",
    "sensor_read_ok",
    "sensor_read_ok TINYINT(1) NULL AFTER sensor_valid",
  );
  await ensureColumn(
    "device_status",
    "sensor_sample_age_ms",
    "sensor_sample_age_ms INT UNSIGNED NULL AFTER sensor_read_ok",
  );
  await ensureColumn(
    "device_status",
    "sensor_failures",
    "sensor_failures BIGINT UNSIGNED NULL AFTER sensor_sample_age_ms",
  );
  await ensureColumn(
    "device_status",
    "i2c_error_count",
    "i2c_error_count BIGINT UNSIGNED NULL AFTER sensor_failures",
  );
  await ensureColumn(
    "device_status",
    "i2c_recovery_count",
    "i2c_recovery_count BIGINT UNSIGNED NULL AFTER i2c_error_count",
  );
  await ensureColumn(
    "device_status",
    "i2c_last_error",
    "i2c_last_error VARCHAR(120) NULL AFTER i2c_recovery_count",
  );
  await ensureColumn(
    "device_status",
    "last_status_topic",
    "last_status_topic VARCHAR(255) NULL AFTER i2c_last_error",
  );
  await ensureColumn(
    "device_status",
    "last_telemetry_topic",
    "last_telemetry_topic VARCHAR(255) NULL AFTER last_status_topic",
  );
  await ensureColumn(
    "device_status",
    "last_event_topic",
    "last_event_topic VARCHAR(255) NULL AFTER last_telemetry_topic",
  );
  await ensureColumn(
    "device_status",
    "last_telemetry_at",
    "last_telemetry_at DATETIME NULL AFTER last_event_topic",
  );
  await ensureColumn(
    "device_status",
    "last_event_at",
    "last_event_at DATETIME NULL AFTER last_telemetry_at",
  );

  console.log("[migrateSensorDiagnosticsSchema] migracao concluida sem resetar dados.");
}

main()
  .catch((error) => {
    console.error(`[migrateSensorDiagnosticsSchema] falha: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
