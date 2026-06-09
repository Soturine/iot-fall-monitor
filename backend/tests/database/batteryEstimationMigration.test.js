const assert = require("node:assert/strict");
const test = require("node:test");

const { loadWithMocks } = require("../helpers/moduleSandbox");

test("migracao de bateria e idempotente e nao reseta dados", async () => {
  const calls = [];
  const fakePool = {
    execute: async (_executor, sql, params = []) => {
      calls.push({ sql, params });
      if (/information_schema\.TABLES/.test(sql)) {
        return [{ found: 1 }];
      }
      if (/information_schema\.COLUMNS/.test(sql)) {
        return [];
      }
      return [];
    },
    pool: { end: async () => undefined },
    testConnection: async () => undefined,
  };
  const { module: migration, restore } = loadWithMocks(
    "scripts/migrateBatteryEstimationSchema.js",
    {
      "src/db/pool.js": fakePool,
    },
  );

  try {
    await migration.ensureBatteryEstimationSchema();

    const combinedSql = calls.map((call) => call.sql).join("\n");
    assert.match(combinedSql, /CREATE TABLE IF NOT EXISTS battery_calibrations/);
    assert.match(combinedSql, /ALTER TABLE device_status ADD COLUMN/);
    assert.doesNotMatch(combinedSql, /\bDROP TABLE\b|\bTRUNCATE TABLE\b|\bDELETE FROM\b/i);
  } finally {
    restore();
  }
});
