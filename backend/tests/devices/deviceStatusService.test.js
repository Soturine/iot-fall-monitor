const assert = require("node:assert/strict");
const test = require("node:test");

const { loadWithMocks } = require("../helpers/moduleSandbox");

test("upsertDeviceStatus usa zero quando batteryCalibrationCount estiver ausente", async () => {
  const calls = [];
  const { module: deviceService, restore } = loadWithMocks(
    "src/services/deviceService.js",
    {
      "src/db/pool.js": {
        execute: async (executor, sql, params) => {
          calls.push({ executor, sql, params });
          return [];
        },
        one: async () => null,
        transaction: async (work) => work(null),
      },
    },
  );

  try {
    const result = await deviceService.upsertDeviceStatus(
      5,
      {
        online: true,
        lastSeenAt: new Date("2026-06-09T12:00:00.000Z"),
      },
      {
        organizationId: 1,
        patientId: 2,
        assignmentHistoryId: 3,
      },
      null,
      { returnSnapshot: false },
    );

    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /battery_calibration_count/);
    assert.equal(calls[0].params[12], 0);
    assert.equal(result.status.batteryCalibrationCount, 0);
  } finally {
    restore();
  }
});
