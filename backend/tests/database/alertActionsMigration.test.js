const assert = require("node:assert/strict");
const test = require("node:test");

const { loadWithMocks } = require("../helpers/moduleSandbox");

test("migracao garante alert_actions sem resetar tabelas ou dados", async () => {
  const calls = [];
  const fakePool = {
    execute: async (_executor, sql, params = []) => {
      calls.push({ sql, params });
      return /information_schema\.TABLES/.test(sql) ? [{ found: 1 }] : [];
    },
    pool: { end: async () => undefined },
    testConnection: async () => undefined,
  };
  const { module: migration, restore } = loadWithMocks(
    "scripts/migrateAlertActionsSchema.js",
    {
      "src/db/pool.js": fakePool,
    },
  );

  try {
    await migration.ensureAlertActionsTable();

    const combinedSql = calls.map((call) => call.sql).join("\n");
    assert.match(combinedSql, /CREATE TABLE IF NOT EXISTS alert_actions/);
    assert.match(combinedSql, /FOREIGN KEY \(alert_id\) REFERENCES alerts \(id\)/);
    assert.match(combinedSql, /FOREIGN KEY \(user_id\) REFERENCES users \(id\)/);
    assert.doesNotMatch(combinedSql, /\bDROP TABLE\b|\bTRUNCATE TABLE\b|\bDELETE FROM\b/i);
  } finally {
    restore();
  }
});
