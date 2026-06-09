const assert = require("node:assert/strict");
const test = require("node:test");

const { loadWithMocks } = require("../helpers/moduleSandbox");

const adminAccess = {
  activeOrganizationId: 1,
  activeRole: "organization_admin",
  isPlatformAdmin: false,
  restrictToAssignedPatients: false,
  assignedPatientIds: [],
};

function createHarness() {
  const calls = [];
  const audits = [];
  const state = {
    organizationId: 1,
    patientId: 2,
    assignmentHistoryId: 22,
    claimStatus: "claimed",
  };

  const snapshotRow = () => ({
    id: 5,
    deviceUid: "esp32-demo",
    deviceIdentifier: "esp32_01",
    name: "Pulseira Demo",
    location: "Bancada",
    isActive: 1,
    claimStatus: state.claimStatus,
    claimedAt: state.claimStatus === "claimed" ? new Date("2026-06-01T10:00:00Z") : null,
    currentAssignmentHistoryId: state.assignmentHistoryId,
    organizationId: state.organizationId,
    organizationName: state.organizationId ? "Familia Demo" : null,
    organizationType: state.organizationId ? "family" : null,
    currentPatientId: state.patientId,
    currentPatientName: state.patientId ? "Paciente Demo" : null,
    online: 1,
    activeAlerts: 0,
  });

  const fakePool = {
    execute: async (_executor, sql, params = []) => {
      calls.push({ sql, params });

      if (/FROM telemetry_logs|FROM events e/.test(sql)) {
        return [];
      }

      if (/UPDATE devices\s+SET\s+organization_id = NULL/.test(sql)) {
        state.organizationId = null;
        state.patientId = null;
        state.assignmentHistoryId = null;
        state.claimStatus = "unclaimed";
      }

      if (/UPDATE devices\s+SET\s+current_patient_id = NULL/.test(sql)) {
        state.patientId = null;
        state.assignmentHistoryId = null;
      }

      return { affectedRows: 1 };
    },
    one: async (_executor, sql) => {
      if (/SELECT \*\s+FROM devices/.test(sql)) {
        return {
          id: 5,
          device_uid: "esp32-demo",
          device_identifier: "esp32_01",
          claim_status: state.claimStatus,
          organization_id: state.organizationId,
          current_patient_id: state.patientId,
          current_assignment_history_id: state.assignmentHistoryId,
        };
      }

      if (/FROM device_assignment_history/.test(sql)) {
        return state.assignmentHistoryId
          ? { id: state.assignmentHistoryId, patient_id: state.patientId }
          : null;
      }

      if (/organization_id AS organizationId/.test(sql)) {
        return {
          organizationId: state.organizationId,
          patientId: state.patientId,
          assignmentHistoryId: state.assignmentHistoryId,
        };
      }

      if (/FROM devices d/.test(sql)) {
        return snapshotRow();
      }

      return null;
    },
    transaction: async (work) => work({ connection: true }),
  };

  const { module, restore } = loadWithMocks("src/services/deviceService.js", {
    "src/db/pool.js": fakePool,
    "src/services/auditService.js": {
      createAuditLog: async (entry) => audits.push(entry),
    },
    "src/services/deviceBehaviorService.js": {
      computeDeviceBehavior: () => ({
        state: "sem_telemetria_suficiente",
        confidence: "baixo",
        reason: "Teste",
        experimental: true,
        version: "test",
        source: "test",
        updatedAt: null,
        telemetrySampleCount: 0,
        telemetryWindowSeconds: 0,
        plannedFutureStates: [],
      }),
    },
    "src/services/scopeService.js": {
      assertRole(access, allowed, message) {
        if (!allowed.includes(access.activeRole)) {
          const error = new Error(message);
          error.statusCode = 403;
          throw error;
        }
      },
      buildScopeFilter: () => ({ clauses: [], params: [] }),
      canAccessScope: (access, organizationId) =>
        Number(access.activeOrganizationId) === Number(organizationId),
    },
  });

  return { audits, calls, module, restore, state };
}

test("assign-patient com patientId null encerra vinculo sem apagar historico", async () => {
  const harness = createHarness();

  try {
    const device = await harness.module.assignDeviceToPatient(
      5,
      { patientId: null },
      adminAccess,
      7,
    );

    assert.equal(device.currentPatient, null);
    assert.ok(
      harness.calls.some((call) =>
        /UPDATE device_assignment_history/.test(call.sql) &&
        call.params.includes("manual_unassign"),
      ),
    );
    assert.ok(harness.calls.every((call) => !/\bDELETE\b/i.test(call.sql)));
    assert.equal(harness.audits.at(-1).action, "device.assignment.update");
  } finally {
    harness.restore();
  }
});

test("resetDeviceClaim exige admin, respeita escopo e preserva historico", async () => {
  const roleHarness = createHarness();
  await assert.rejects(
    () => roleHarness.module.resetDeviceClaim(
      5,
      { ...adminAccess, activeRole: "viewer" },
      7,
    ),
    (error) => error.statusCode === 403,
  );
  roleHarness.restore();

  const scopeHarness = createHarness();
  await assert.rejects(
    () => scopeHarness.module.resetDeviceClaim(
      5,
      { ...adminAccess, activeOrganizationId: 99 },
      7,
    ),
    (error) => error.statusCode === 404,
  );
  scopeHarness.restore();

  const harness = createHarness();
  try {
    const result = await harness.module.resetDeviceClaim(5, adminAccess, 7);

    assert.equal(result.device.claimStatus, "unclaimed");
    assert.equal(result.device.organization, null);
    assert.equal(result.device.currentPatient, null);
    assert.equal(result.previousScope.organizationId, 1);
    assert.ok(harness.calls.every((call) => !/\bDELETE\b/i.test(call.sql)));
    assert.equal(harness.audits.at(-1).action, "device.reset_claim");
    assert.equal(harness.audits.at(-1).metadata.historyPreserved, true);
  } finally {
    harness.restore();
  }
});
