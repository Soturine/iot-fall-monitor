const assert = require("node:assert/strict");
const test = require("node:test");

const { loadWithMocks } = require("../helpers/moduleSandbox");

const access = {
  activeOrganizationId: 1,
  activeRole: "organization_admin",
  isPlatformAdmin: false,
};

function createHarness({ linkedDevice = false } = {}) {
  const calls = [];
  const audits = [];
  let archived = false;
  const fakePool = {
    execute: async (_executor, sql, params = []) => {
      calls.push({ sql, params });

      if (/FROM caregiver_assignments/.test(sql)) {
        return [];
      }

      if (/FROM patients p/.test(sql)) {
        return [];
      }

      if (/UPDATE patients/.test(sql)) {
        archived = true;
      }

      return { affectedRows: 1 };
    },
    one: async () => ({
      id: 2,
      organization_id: 1,
      full_name: "Paciente Demo",
      status: archived ? "archived" : "active",
      device_id: linkedDevice ? 5 : null,
      device_uid: linkedDevice ? "esp32-demo" : null,
      device_identifier: linkedDevice ? "esp32_01" : null,
      device_name: linkedDevice ? "Pulseira Demo" : null,
      claim_status: linkedDevice ? "claimed" : null,
    }),
    transaction: async (work) => work({ connection: true }),
  };
  const { module, restore } = loadWithMocks("src/services/patientService.js", {
    "src/db/pool.js": fakePool,
    "src/services/auditService.js": {
      createAuditLog: async (entry) => audits.push(entry),
    },
    "src/services/scopeService.js": {
      assertRole() {},
      buildScopeFilter: () => ({ clauses: ["p.organization_id = ?"], params: [1] }),
    },
  });

  return { audits, calls, module, restore };
}

test("listPatients oculta arquivados por padrao e permite inclui-los explicitamente", async () => {
  const harness = createHarness();

  try {
    await harness.module.listPatients(access);
    await harness.module.listPatients(access, { includeArchived: "true" });

    const listQueries = harness.calls.filter((call) => /FROM patients p/.test(call.sql));
    assert.match(listQueries[0].sql, /p\.status = 'active'/);
    assert.doesNotMatch(listQueries[1].sql, /p\.status = 'active'/);
  } finally {
    harness.restore();
  }
});

test("archivePatient muda status sem delete fisico e registra auditoria", async () => {
  const harness = createHarness();

  try {
    const patient = await harness.module.archivePatient(2, access, 7);

    assert.equal(patient.status, "archived");
    assert.ok(harness.calls.some((call) => /UPDATE patients/.test(call.sql)));
    assert.ok(harness.calls.every((call) => !/\bDELETE FROM patients\b/i.test(call.sql)));
    assert.equal(harness.audits.at(-1).action, "patient.archive");
    assert.equal(harness.audits.at(-1).metadata.historyPreserved, true);
  } finally {
    harness.restore();
  }
});

test("archivePatient bloqueia paciente com device vinculado", async () => {
  const harness = createHarness({ linkedDevice: true });

  try {
    await assert.rejects(
      () => harness.module.archivePatient(2, access, 7),
      (error) => error.statusCode === 409,
    );
    assert.ok(harness.calls.every((call) => !/UPDATE patients/.test(call.sql)));
  } finally {
    harness.restore();
  }
});
