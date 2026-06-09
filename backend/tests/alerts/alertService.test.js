const assert = require("node:assert/strict");
const test = require("node:test");

const { loadWithMocks } = require("../helpers/moduleSandbox");

const access = {
  user: { id: 1 },
  isPlatformAdmin: false,
  activeOrganizationId: 1,
  activeRole: "organization_admin",
  restrictToAssignedPatients: false,
  assignedPatientIds: [],
};

function alertRow(overrides = {}) {
  return {
    id: 10,
    organizationId: 1,
    patientId: 2,
    status: "open",
    acknowledged_at: null,
    canceled_at: null,
    resolved_at: null,
    created_at: new Date("2026-05-12T21:00:00.000Z"),
    updated_at: new Date("2026-05-12T21:00:00.000Z"),
    acknowledgedById: null,
    acknowledgedByName: null,
    canceledById: null,
    canceledByName: null,
    resolvedById: null,
    resolvedByName: null,
    deviceId: 5,
    deviceUid: "esp32-chip-077000",
    deviceIdentifier: "esp32_01",
    deviceName: "Pulseira ESP32",
    patientName: "Paciente Demo",
    eventId: 7,
    eventType: "fall_detected",
    severity: "critical",
    intensity: 3.4,
    immobility: 1,
    message: "Queda com imobilidade confirmada.",
    eventTime: new Date("2026-05-12T21:00:00.000Z"),
    rawPayloadJson: '{"event_type":"fall_detected"}',
    ...overrides,
  };
}

function loadAlertService(fakePool) {
  return loadWithMocks("src/services/alertService.js", {
    "src/db/pool.js": fakePool,
    "src/services/auditService.js": {
      createAuditLog: async () => undefined,
    },
    "src/utils/logger.js": {
      logger: {
        debug() {},
        error() {},
        info() {},
        warn() {},
      },
    },
  });
}

test("createAlertForEvent cria alerta open idempotente por event_id", async () => {
  const calls = [];
  const fakePool = {
    execute: async (_executor, sql, params) => {
      calls.push({ sql, params });
      assert.match(sql, /ON DUPLICATE KEY UPDATE/);
      return { insertId: 10, affectedRows: 1 };
    },
    one: async () => alertRow(),
    transaction: async (work) => work({}),
  };
  const { module: alertService, restore } = loadAlertService(fakePool);

  try {
    const alert = await alertService.createAlertForEvent(
      {
        id: 7,
        organizationId: 1,
        patientId: 2,
        device: { id: 5 },
      },
      {},
      { correlationId: "test_trace" },
    );

    assert.equal(alert.id, 10);
    assert.equal(alert.status, "open");
    assert.equal(alert.event.evidenceStatus, "none");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].params, [1, 2, 7, 5]);
  } finally {
    restore();
  }
});

test("getAlertById expoe resumo de evidencia do evento", async () => {
  const fakePool = {
    one: async () => alertRow({
      evidenceStatus: "linked",
      evidenceTelemetryId: 22,
      evidenceSampleCount: 3,
      evidenceWindowSeconds: 8,
      evidenceSummaryJson: JSON.stringify({
        maxAccelMagnitude: 3.9,
        maxGyroMagnitude: 181,
        immobilityConfirmed: true,
        firstSampleAt: "2026-05-13T14:38:02.000Z",
        lastSampleAt: "2026-05-13T14:38:10.000Z",
      }),
    }),
    execute: async () => [],
    transaction: async (work) => work({}),
  };
  const { module: alertService, restore } = loadAlertService(fakePool);

  try {
    const alert = await alertService.getAlertById(10, access);

    assert.equal(alert.event.evidenceStatus, "linked");
    assert.equal(alert.event.evidenceTelemetryId, 22);
    assert.equal(alert.event.evidenceSampleCount, 3);
    assert.equal(alert.event.evidenceSummary.maxAccelMagnitude, 3.9);
  } finally {
    restore();
  }
});

test("createAlertForEvent reaproveita alerta existente sem duplicar", async () => {
  let insertCalls = 0;
  const fakePool = {
    execute: async () => {
      insertCalls += 1;
      return { insertId: 10, affectedRows: 2 };
    },
    one: async () => alertRow(),
    transaction: async (work) => work({}),
  };
  const { module: alertService, restore } = loadAlertService(fakePool);

  try {
    const alert = await alertService.createAlertForEvent(
      {
        id: 7,
        organizationId: 1,
        patientId: 2,
        device: { id: 5 },
      },
      {},
    );

    assert.equal(alert.id, 10);
    assert.equal(insertCalls, 1);
  } finally {
    restore();
  }
});

async function runTransition(actionType, expectedStatus) {
  const actionInserts = [];
  const fakePool = {
    transaction: async (work) => work({ connection: true }),
    one: async (_executor, sql) => {
      if (/FOR UPDATE/.test(sql)) {
        return {
          id: 10,
          organization_id: 1,
          patient_id: 2,
          status: "open",
        };
      }

      return alertRow({ status: expectedStatus });
    },
    execute: async (_executor, sql, params) => {
      if (/UPDATE alerts/.test(sql)) {
        return { affectedRows: 1 };
      }

      if (/INSERT INTO alert_actions/.test(sql)) {
        actionInserts.push(params);
        return { insertId: 33, affectedRows: 1 };
      }

      if (/FROM alert_actions/.test(sql)) {
        return [
          {
            id: 33,
            action_type: actionType,
            note: "ok",
            created_at: new Date("2026-05-12T21:01:00.000Z"),
            userId: 1,
            userName: "Admin",
            userEmail: "admin@queda.local",
          },
        ];
      }

      return { affectedRows: 1 };
    },
  };
  const { module: alertService, restore } = loadAlertService(fakePool);

  try {
    const alert = await alertService.updateAlertStatus(
      10,
      actionType,
      1,
      "ok",
      access,
    );

    assert.equal(alert.status, expectedStatus);
    assert.equal(alert.actions.length, 1);
    assert.deepEqual(actionInserts[0], [10, 1, actionType, "ok"]);
  } finally {
    restore();
  }
}

test("updateAlertStatus permite acknowledge, resolve e cancel com alert_actions", async () => {
  await runTransition("acknowledge", "acknowledged");
  await runTransition("resolve", "resolved");
  await runTransition("cancel", "canceled");
});

test("updateAlertStatus impede transicao invalida", async () => {
  const fakePool = {
    transaction: async (work) => work({}),
    one: async () => ({
      id: 10,
      organization_id: 1,
      patient_id: 2,
      status: "resolved",
    }),
    execute: async () => ({ affectedRows: 1 }),
  };
  const { module: alertService, restore } = loadAlertService(fakePool);

  try {
    await assert.rejects(
      () => alertService.updateAlertStatus(10, "acknowledge", 1, null, access),
      (error) => error.statusCode === 409,
    );
  } finally {
    restore();
  }
});

test("getAlertById e updateAlertStatus bloqueiam outra organizacao", async () => {
  const otherOrgAccess = {
    ...access,
    activeOrganizationId: 99,
  };
  const fakePool = {
    transaction: async (work) => work({}),
    one: async (_executor, sql) => {
      if (/FOR UPDATE/.test(sql)) {
        return {
          id: 10,
          organization_id: 1,
          patient_id: 2,
          status: "open",
        };
      }

      return alertRow();
    },
    execute: async () => [],
  };
  const { module: alertService, restore } = loadAlertService(fakePool);

  try {
    await assert.rejects(
      () => alertService.getAlertById(10, otherOrgAccess),
      (error) => error.statusCode === 404,
    );
    await assert.rejects(
      () => alertService.updateAlertStatus(10, "resolve", 1, null, otherOrgAccess),
      (error) => error.statusCode === 404,
    );
  } finally {
    restore();
  }
});

test("exportAlertsReport respeita filtros, escopo e limite maximo", async () => {
  const calls = [];
  const fakePool = {
    execute: async (_executor, sql, params) => {
      calls.push({ sql, params });
      return [
        alertRow({
          acknowledgedById: 3,
          acknowledgedByName: "Cuidadora Demo",
          acknowledged_at: new Date("2026-05-12T21:01:00.000Z"),
          evidenceStatus: "linked",
        }),
      ];
    },
    one: async () => null,
    transaction: async (work) => work({}),
  };
  const { module: alertService, restore } = loadAlertService(fakePool);

  try {
    const report = await alertService.exportAlertsReport(
      {
        status: "acknowledged",
        severity: "critical",
        deviceId: "5",
        startDate: "2026-05-01",
        endDate: "2026-05-31",
        limit: "9999",
      },
      {
        ...access,
        activeOrganization: {
          id: 1,
          name: "Familia Demo",
          type: "family",
          status: "active",
        },
      },
    );

    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /a\.organization_id = \?/);
    assert.match(calls[0].sql, /a\.status = \?/);
    assert.match(calls[0].sql, /a\.device_id = \?/);
    assert.match(calls[0].sql, /e\.severity = \?/);
    assert.match(calls[0].sql, /e\.event_time >= \?/);
    assert.match(calls[0].sql, /e\.event_time <= \?/);
    assert.match(calls[0].sql, /LIMIT \?/);
    assert.equal(calls[0].params.at(-1), 500);
    assert.deepEqual(calls[0].params.slice(0, 4), [
      1,
      "acknowledged",
      5,
      "critical",
    ]);

    assert.equal(report.organization.name, "Familia Demo");
    assert.deepEqual(report.filters, {
      status: "acknowledged",
      severity: "critical",
      deviceId: 5,
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    assert.equal(report.total, 1);
    assert.equal(report.items[0].alertId, 10);
    assert.equal(report.items[0].acknowledgedBy, "Cuidadora Demo");
    assert.equal(report.items[0].evidenceStatus, "linked");
  } finally {
    restore();
  }
});

test("exportAlertsReport respeita pacientes atribuidos no escopo restrito", async () => {
  const calls = [];
  const fakePool = {
    execute: async (_executor, sql, params) => {
      calls.push({ sql, params });
      return [];
    },
    one: async () => null,
    transaction: async (work) => work({}),
  };
  const { module: alertService, restore } = loadAlertService(fakePool);

  try {
    const report = await alertService.exportAlertsReport(
      {},
      {
        ...access,
        activeRole: "caregiver",
        restrictToAssignedPatients: true,
        assignedPatientIds: [2, 9],
      },
    );

    assert.match(calls[0].sql, /a\.organization_id = \?/);
    assert.match(calls[0].sql, /a\.patient_id IN \(\?, \?\)/);
    assert.deepEqual(calls[0].params, [1, 2, 9, 500]);
    assert.equal(report.total, 0);
  } finally {
    restore();
  }
});
