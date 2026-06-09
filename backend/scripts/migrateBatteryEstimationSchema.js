const { execute, pool, testConnection } = require("../src/db/pool");

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

async function ensureColumn(columnName, definition) {
  if (await columnExists("device_status", columnName)) {
    console.log(`[migrateBatteryEstimationSchema] coluna ja existe: device_status.${columnName}`);
    return;
  }

  await execute(null, `ALTER TABLE device_status ADD COLUMN ${definition}`);
  console.log(`[migrateBatteryEstimationSchema] coluna adicionada: device_status.${columnName}`);
}

async function ensureBatteryEstimationSchema() {
  if (!(await tableExists("device_status")) || !(await tableExists("devices"))) {
    throw new Error(
      "Tabelas device_status/devices nao existem. Use db:init apenas em ambiente que possa ser resetado.",
    );
  }
  await ensureColumn(
    "battery_percent_source",
    "battery_percent_source VARCHAR(32) NULL AFTER battery_percent",
  );
  await ensureColumn(
    "battery_manual_percent",
    "battery_manual_percent TINYINT UNSIGNED NULL AFTER battery_percent_source",
  );
  await ensureColumn(
    "battery_manual_updated_at",
    "battery_manual_updated_at DATETIME NULL AFTER battery_manual_percent",
  );
  await ensureColumn(
    "battery_minutes_per_percent",
    "battery_minutes_per_percent DOUBLE NULL AFTER battery_manual_updated_at",
  );
  await ensureColumn(
    "battery_estimated_remaining_minutes",
    "battery_estimated_remaining_minutes INT UNSIGNED NULL AFTER battery_minutes_per_percent",
  );
  await ensureColumn(
    "battery_calibration_count",
    "battery_calibration_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER battery_estimated_remaining_minutes",
  );
  await ensureColumn("detector_mode", "detector_mode VARCHAR(16) NULL AFTER firmware_version");
  await ensureColumn(
    "sample_interval_ms",
    "sample_interval_ms INT UNSIGNED NULL AFTER detector_mode",
  );
  await ensureColumn(
    "telemetry_interval_ms",
    "telemetry_interval_ms INT UNSIGNED NULL AFTER sample_interval_ms",
  );

  await execute(
    null,
    `
      CREATE TABLE IF NOT EXISTS battery_calibrations (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        device_id BIGINT UNSIGNED NOT NULL,
        battery_percent TINYINT UNSIGNED NOT NULL,
        calibrated_at DATETIME NOT NULL,
        source VARCHAR(32) NOT NULL DEFAULT 'portal_manual',
        calibration_sequence BIGINT UNSIGNED NULL,
        observed_minutes_per_percent DOUBLE NULL,
        applied_minutes_per_percent DOUBLE NOT NULL,
        ignored_reason VARCHAR(80) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_battery_calibration_device_sequence (device_id, calibration_sequence),
        KEY idx_battery_calibration_device_time (device_id, calibrated_at),
        CONSTRAINT fk_battery_calibration_device
          FOREIGN KEY (device_id) REFERENCES devices (id)
          ON DELETE CASCADE
      )
    `,
  );

  console.log("[migrateBatteryEstimationSchema] migracao concluida sem resetar dados.");
}

async function main() {
  await testConnection();
  await ensureBatteryEstimationSchema();
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`[migrateBatteryEstimationSchema] falha: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}

module.exports = {
  ensureBatteryEstimationSchema,
  main,
};
