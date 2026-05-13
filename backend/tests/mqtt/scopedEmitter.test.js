const assert = require("node:assert/strict");
const test = require("node:test");

const {
  emitScopedEvent,
  getRoomsForAccessContext,
  getRoomsForScope,
} = require("../../src/socket/scopedEmitter");

test("getRoomsForAccessContext resolve rooms por plataforma, organizacao e pacientes", () => {
  assert.deepEqual(
    getRoomsForAccessContext({
      isPlatformAdmin: true,
      activeOrganizationId: null,
    }),
    ["scope:platform:global"],
  );
  assert.deepEqual(
    getRoomsForAccessContext({
      isPlatformAdmin: false,
      activeOrganizationId: 1,
      restrictToAssignedPatients: false,
      assignedPatientIds: [],
    }),
    ["scope:org:1"],
  );
  assert.deepEqual(
    getRoomsForAccessContext({
      isPlatformAdmin: false,
      activeOrganizationId: 1,
      restrictToAssignedPatients: true,
      assignedPatientIds: [2, 3],
    }),
    ["scope:patient:2", "scope:patient:3"],
  );
});

test("getRoomsForScope nao entrega tenant quando organizacao esta ausente", () => {
  assert.deepEqual(getRoomsForScope({ organizationId: null, patientId: null }), [
    "scope:platform:global",
  ]);
  assert.deepEqual(getRoomsForScope({ organizationId: 1, patientId: 2 }), [
    "scope:platform:global",
    "scope:org:1",
    "scope:patient:2",
  ]);
});

test("emitScopedEvent publica alert:new, telemetry:new e device:status no escopo correto", () => {
  const emitted = [];
  const io = {
    to(rooms) {
      return {
        emit(eventName, payload) {
          emitted.push({ rooms, eventName, payload });
        },
      };
    },
  };

  emitScopedEvent(io, "device:status", { id: 5 }, { organizationId: 1, patientId: 2 });
  emitScopedEvent(io, "telemetry:new", { id: 6 }, { organizationId: 1, patientId: 2 });
  emitScopedEvent(io, "alert:new", { id: 7 }, { organizationId: null, patientId: null });

  assert.equal(emitted[0].eventName, "device:status");
  assert.deepEqual(emitted[0].rooms, [
    "scope:platform:global",
    "scope:org:1",
    "scope:patient:2",
  ]);
  assert.equal(emitted[1].eventName, "telemetry:new");
  assert.deepEqual(emitted[2].rooms, ["scope:platform:global"]);
});
