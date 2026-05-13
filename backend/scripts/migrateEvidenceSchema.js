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

async function indexExists(tableName, indexName) {
  const rows = await execute(
    null,
    `
      SELECT 1 AS found
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1
    `,
    [tableName, indexName],
  );

  return rows.length > 0;
}

async function constraintExists(tableName, constraintName) {
  const rows = await execute(
    null,
    `
      SELECT 1 AS found
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?
      LIMIT 1
    `,
    [tableName, constraintName],
  );

  return rows.length > 0;
}

async function ensureColumn(tableName, columnName, definition) {
  if (await columnExists(tableName, columnName)) {
    console.log(`[migrateEvidenceSchema] coluna ja existe: ${tableName}.${columnName}`);
    return;
  }

  await execute(null, `ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  console.log(`[migrateEvidenceSchema] coluna adicionada: ${tableName}.${columnName}`);
}

async function ensureIndex(tableName, indexName, sql) {
  if (await indexExists(tableName, indexName)) {
    console.log(`[migrateEvidenceSchema] indice ja existe: ${tableName}.${indexName}`);
    return;
  }

  await execute(null, sql);
  console.log(`[migrateEvidenceSchema] indice criado: ${tableName}.${indexName}`);
}

async function ensureConstraint(tableName, constraintName, sql) {
  if (await constraintExists(tableName, constraintName)) {
    console.log(`[migrateEvidenceSchema] constraint ja existe: ${tableName}.${constraintName}`);
    return;
  }

  await execute(null, sql);
  console.log(`[migrateEvidenceSchema] constraint criada: ${tableName}.${constraintName}`);
}

async function ensureEvidenceTable() {
  await execute(
    null,
    `
      CREATE TABLE IF NOT EXISTS event_telemetry_evidence (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        event_id BIGINT UNSIGNED NOT NULL,
        telemetry_log_id BIGINT UNSIGNED NOT NULL,
        relative_ms INT NOT NULL,
        role ENUM('before_peak', 'peak', 'after_peak', 'nearest') NOT NULL DEFAULT 'nearest',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_event_telemetry_evidence (event_id, telemetry_log_id),
        KEY idx_event_evidence_event_role (event_id, role),
        KEY idx_event_evidence_telemetry (telemetry_log_id),
        CONSTRAINT fk_event_evidence_event
          FOREIGN KEY (event_id) REFERENCES events (id)
          ON DELETE CASCADE,
        CONSTRAINT fk_event_evidence_telemetry
          FOREIGN KEY (telemetry_log_id) REFERENCES telemetry_logs (id)
          ON DELETE CASCADE
      )
    `,
  );
  console.log("[migrateEvidenceSchema] tabela garantida: event_telemetry_evidence");
}

async function main() {
  await testConnection();

  if (!(await tableExists("events"))) {
    throw new Error("Tabela events nao existe. Rode npm run db:init --prefix backend antes da migracao.");
  }

  if (!(await tableExists("telemetry_logs"))) {
    throw new Error("Tabela telemetry_logs nao existe. Rode npm run db:init --prefix backend antes da migracao.");
  }

  await ensureColumn(
    "events",
    "evidence_status",
    "evidence_status ENUM('none', 'partial', 'linked') NOT NULL DEFAULT 'none' AFTER message",
  );
  await ensureColumn(
    "events",
    "evidence_telemetry_id",
    "evidence_telemetry_id BIGINT UNSIGNED NULL AFTER evidence_status",
  );
  await ensureColumn(
    "events",
    "evidence_sample_count",
    "evidence_sample_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER evidence_telemetry_id",
  );
  await ensureColumn(
    "events",
    "evidence_window_seconds",
    "evidence_window_seconds DECIMAL(8, 3) NULL AFTER evidence_sample_count",
  );
  await ensureColumn(
    "events",
    "evidence_summary_json",
    "evidence_summary_json JSON NULL AFTER evidence_window_seconds",
  );

  await ensureIndex(
    "events",
    "idx_events_evidence_status",
    "ALTER TABLE events ADD KEY idx_events_evidence_status (evidence_status)",
  );
  await ensureIndex(
    "events",
    "idx_events_evidence_telemetry",
    "ALTER TABLE events ADD KEY idx_events_evidence_telemetry (evidence_telemetry_id)",
  );
  await ensureConstraint(
    "events",
    "fk_events_evidence_telemetry",
    `
      ALTER TABLE events
      ADD CONSTRAINT fk_events_evidence_telemetry
        FOREIGN KEY (evidence_telemetry_id) REFERENCES telemetry_logs (id)
        ON DELETE SET NULL
    `,
  );

  await ensureEvidenceTable();
  console.log("[migrateEvidenceSchema] migracao concluida sem resetar dados.");
}

main()
  .catch((error) => {
    console.error(`[migrateEvidenceSchema] falha: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
