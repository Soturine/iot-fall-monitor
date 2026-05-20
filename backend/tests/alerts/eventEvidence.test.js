const assert = require("node:assert/strict");
const test = require("node:test");

const { loadWithMocks } = require("../helpers/moduleSandbox");

function buildDevice(overrides = {}) {
  return {
    id: 5,
    deviceUid: "legacy:esp32_01",
    deviceIdentifier: "esp32_01",
    organization: { id: 1, name: "Familia Demo" },
    currentPatient: { id: 2, fullName: "Paciente Demo" },
    currentAssignmentHistoryId: 3,
    ...overrides,
  };
}

function buildHarness(telemetryRows = [], options = {}) {
  const calls = {
    duplicateQueries: [],
    eventInserts: [],
    evidenceInserts: [],
    telemetryQueries: [],
    logs: [],
  };
  let insertedEvent = null;

  const fakePool = {
    execute: async (_executor, sql, params) => {
      if (/FROM telemetry_logs/.test(sql)) {
        calls.telemetryQueries.push({ sql, params });
        const [deviceId, organizationId, patientId, assignmentId, windowStart, windowEnd] = params;

        return telemetryRows.filter((row) => {
          const createdAt = new Date(row.created_at).getTime();
          return row.device_id === deviceId
            && (row.organization_id ?? null) === organizationId
            && (row.patient_id ?? null) === patientId
            && (row.device_assignment_history_id ?? null) === assignmentId
            && createdAt >= new Date(windowStart).getTime()
            && createdAt <= new Date(windowEnd).getTime();
        });
      }

      if (/INSERT INTO events/.test(sql)) {
        calls.eventInserts.push({ sql, params });
        insertedEvent = params;
        return { insertId: 40, affectedRows: 1 };
      }

      if (/INSERT IGNORE INTO event_telemetry_evidence/.test(sql)) {
        calls.evidenceInserts.push({ sql, params });
        return { insertId: 1, affectedRows: 1 };
      }

      return [];
    },
    one: async (_executor, sql, params) => {
      if (/JSON_UNQUOTE\(JSON_EXTRACT/.test(sql)) {
        calls.duplicateQueries.push({ sql, params });
        return options.duplicateRow || null;
      }

      return {
        id: 40,
        organization_id: insertedEvent[0],
        patient_id: insertedEvent[1],
        device_id: insertedEvent[2],
        device_assignment_history_id: insertedEvent[3],
        event_type: insertedEvent[4],
        severity: insertedEvent[5],
        intensity: insertedEvent[6],
        immobility: insertedEvent[7],
        message: insertedEvent[8],
        evidence_status: insertedEvent[9],
        evidence_telemetry_id: insertedEvent[10],
        evidence_sample_count: insertedEvent[11],
        evidence_window_seconds: insertedEvent[12],
        evidence_summary_json: insertedEvent[13],
        event_time: insertedEvent[14],
        raw_payload_json: insertedEvent[15],
        created_at: new Date("2026-05-13T14:38:15.000Z"),
        deviceId: 5,
        deviceUid: "legacy:esp32_01",
        deviceIdentifier: "esp32_01",
        deviceName: "Pulseira ESP32",
        patientName: "Paciente Demo",
      };
    },
  };

  const { module, restore } = loadWithMocks("src/services/eventService.js", {
    "src/db/pool.js": fakePool,
    "src/utils/logger.js": {
      logger: {
        debug(message, metadata) {
          calls.logs.push({ level: "debug", message, metadata });
        },
        error(message, metadata) {
          calls.logs.push({ level: "error", message, metadata });
        },
        info(message, metadata) {
          calls.logs.push({ level: "info", message, metadata });
        },
        warn(message, metadata) {
          calls.logs.push({ level: "warn", message, metadata });
        },
      },
    },
  });

  return {
    calls,
    eventService: module,
    restore,
  };
}

test("fall_detected com telemetria recente vincula evidencia", async () => {
  const eventTime = new Date("2026-05-13T14:38:10.000Z");
  const harness = buildHarness([
    {
      id: 21,
      device_id: 5,
      organization_id: 1,
      patient_id: 2,
      device_assignment_history_id: 3,
      accel_magnitude: 1.2,
      gyro_magnitude: 18,
      created_at: new Date("2026-05-13T14:38:03.000Z"),
    },
    {
      id: 22,
      device_id: 5,
      organization_id: 1,
      patient_id: 2,
      device_assignment_history_id: 3,
      accel_magnitude: 3.9,
      gyro_magnitude: 181,
      created_at: new Date("2026-05-13T14:38:09.900Z"),
    },
  ]);

  try {
    const event = await harness.eventService.recordEventFromMqtt({
      device: buildDevice(),
      payload: {
        event_type: "fall_detected",
        event_uuid: "evt-fall-001",
        event_sequence: 7,
        sample_seq: 123,
        timestamp: Math.floor(eventTime.getTime() / 1000),
        accel_magnitude: 3.9,
        immobility_confirmed: true,
        decision_source: "firmware",
        algorithm_version: "threshold_fsm_v2_time_features_v1",
        confidence: 0.76,
        features_time_domain: {
          available: true,
          sample_count: 64,
          peak_jerk: 8.4,
        },
      },
      correlationId: "trace_evidence",
    });

    assert.equal(event.evidenceStatus, "linked");
    assert.equal(event.evidenceTelemetryId, 22);
    assert.equal(event.evidenceSampleCount, 2);
    assert.equal(event.severity, "critical");
    assert.equal(event.evidenceSummary.firmwareDecision.decisionSource, "firmware");
    assert.equal(event.eventUuid, "evt-fall-001");
    assert.equal(event.sampleSeq, 123);
    assert.equal(event.evidenceSummary.firmwareDecision.eventUuid, "evt-fall-001");
    assert.equal(event.evidenceSummary.firmwareDecision.sampleSeq, 123);
    assert.equal(
      event.evidenceSummary.firmwareDecision.algorithmVersion,
      "threshold_fsm_v2_time_features_v1",
    );
    assert.equal(event.evidenceSummary.firmwareDecision.featuresTimeDomain.sample_count, 64);
    assert.equal(harness.calls.evidenceInserts.length, 2);
  } finally {
    harness.restore();
  }
});

test("fall_detected sem telemetria recente vira evento tecnico sem evidencia", async () => {
  const harness = buildHarness([]);

  try {
    const event = await harness.eventService.recordEventFromMqtt({
      device: buildDevice(),
      payload: {
        event_type: "fall_detected",
        timestamp: Math.floor(new Date("2026-05-13T14:38:10.000Z").getTime() / 1000),
        immobility_confirmed: true,
      },
    });

    assert.equal(event.evidenceStatus, "none");
    assert.equal(event.evidenceTelemetryId, null);
    assert.equal(event.evidenceSampleCount, 0);
    assert.equal(event.severity, "medium");
    assert.equal(harness.calls.evidenceInserts.length, 0);
    assert.ok(harness.calls.logs.some((entry) => entry.level === "warn"));
  } finally {
    harness.restore();
  }
});

test("fall_detected reenviado com mesmo event_uuid reaproveita evento existente", async () => {
  const duplicateRow = {
    id: 44,
    organization_id: 1,
    patient_id: 2,
    device_id: 5,
    device_assignment_history_id: 3,
    event_type: "fall_detected",
    severity: "critical",
    intensity: 3.7,
    immobility: 1,
    message: "Queda com imobilidade confirmada.",
    evidence_status: "linked",
    evidence_telemetry_id: 22,
    evidence_sample_count: 2,
    evidence_window_seconds: 4,
    evidence_summary_json: JSON.stringify({ firmwareDecision: { eventUuid: "evt-repeat-001" } }),
    event_time: new Date("2026-05-13T14:38:10.000Z"),
    raw_payload_json: JSON.stringify({
      event_type: "fall_detected",
      event_uuid: "evt-repeat-001",
      sample_seq: 99,
    }),
    created_at: new Date("2026-05-13T14:38:15.000Z"),
    deviceId: 5,
    deviceUid: "legacy:esp32_01",
    deviceIdentifier: "esp32_01",
    deviceName: "Pulseira ESP32",
    patientName: "Paciente Demo",
    alertId: 90,
    alertStatus: "open",
  };
  const harness = buildHarness([], { duplicateRow });

  try {
    const event = await harness.eventService.recordEventFromMqtt({
      device: buildDevice(),
      payload: {
        event_type: "fall_detected",
        event_uuid: "evt-repeat-001",
        timestamp: Math.floor(new Date("2026-05-13T14:38:10.000Z").getTime() / 1000),
        immobility_confirmed: true,
      },
      correlationId: "trace_duplicate",
    });

    assert.equal(event.id, 44);
    assert.equal(event.eventUuid, "evt-repeat-001");
    assert.equal(event.deduplicated, true);
    assert.equal(event.duplicateReason, "event_uuid");
    assert.equal(harness.calls.duplicateQueries.length, 1);
    assert.deepEqual(harness.calls.duplicateQueries[0].params, [5, "evt-repeat-001"]);
    assert.equal(harness.calls.eventInserts.length, 0);
    assert.equal(harness.calls.evidenceInserts.length, 0);
    assert.equal(harness.calls.telemetryQueries.length, 0);
    assert.ok(
      harness.calls.logs.some(
        (entry) => entry.message === "Evento MQTT duplicado ignorado por event_uuid.",
      ),
    );
  } finally {
    harness.restore();
  }
});

test("fall_detected nao usa telemetria stale ou de outro device", async () => {
  const eventTime = new Date("2026-05-13T14:38:10.000Z");
  const harness = buildHarness([
    {
      id: 31,
      device_id: 5,
      organization_id: 1,
      patient_id: 2,
      device_assignment_history_id: 3,
      accel_magnitude: 4.1,
      gyro_magnitude: 190,
      created_at: new Date("2026-05-13T14:37:30.000Z"),
    },
    {
      id: 32,
      device_id: 9,
      organization_id: 1,
      patient_id: 2,
      device_assignment_history_id: 3,
      accel_magnitude: 4.1,
      gyro_magnitude: 190,
      created_at: new Date("2026-05-13T14:38:09.000Z"),
    },
  ]);

  try {
    const event = await harness.eventService.recordEventFromMqtt({
      device: buildDevice(),
      payload: {
        event_type: "fall_detected",
        timestamp: Math.floor(eventTime.getTime() / 1000),
      },
    });

    assert.equal(event.evidenceStatus, "none");
    assert.equal(harness.calls.telemetryQueries[0].params[0], 5);
    assert.equal(harness.calls.telemetryQueries[0].params[1], 1);
    assert.equal(harness.calls.telemetryQueries[0].params[2], 2);
    assert.equal(harness.calls.telemetryQueries[0].params[3], 3);
  } finally {
    harness.restore();
  }
});
