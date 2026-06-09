const { execute, pool, testConnection } = require("../src/db/pool");

const ALERT_ACTIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS alert_actions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    alert_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    action_type ENUM('acknowledge', 'cancel', 'resolve') NOT NULL,
    note VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_alert_actions_alert_created (alert_id, created_at),
    CONSTRAINT fk_alert_actions_alert
      FOREIGN KEY (alert_id) REFERENCES alerts (id)
      ON DELETE CASCADE,
    CONSTRAINT fk_alert_actions_user
      FOREIGN KEY (user_id) REFERENCES users (id)
      ON DELETE CASCADE
  )
`;

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

async function ensureAlertActionsTable() {
  if (!(await tableExists("alerts")) || !(await tableExists("users"))) {
    throw new Error(
      "Tabelas alerts/users nao existem. Rode npm run db:init --prefix backend apenas em um ambiente que possa ser resetado.",
    );
  }

  await execute(null, ALERT_ACTIONS_TABLE_SQL);
  console.log("[migrateAlertActionsSchema] tabela garantida: alert_actions");
}

async function main() {
  await testConnection();
  await ensureAlertActionsTable();
  console.log("[migrateAlertActionsSchema] migracao concluida sem resetar dados.");
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`[migrateAlertActionsSchema] falha: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}

module.exports = {
  ALERT_ACTIONS_TABLE_SQL,
  ensureAlertActionsTable,
  main,
};
