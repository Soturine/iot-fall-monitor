const assert = require("node:assert/strict");
const test = require("node:test");

const { loadWithMocks } = require("../helpers/moduleSandbox");

function topicInfo(channel = "telemetry", deviceIdentifier = "esp32_01") {
  return {
    topic: `queda/devices/${deviceIdentifier}/${channel}`,
    deviceIdentifier,
    channel,
  };
}

function buildHarness(options = {}) {
  const calls = {
    alerts: [],
    events: [],
    emits: [],
    identities: [],
    logs: [],
    status: [],
    telemetry: [],
    transactions: 0,
  };
  let activeIdentityCalls = 0;
  let maxActiveIdentityCalls = 0;
  let eventId = 100;
  let telemetryId = 200;
  const organization = options.organization === null
    ? null
    : { id: options.organizationId || 1, name: "Familia Demo" };
  const currentPatient = options.patient === null
    ? null
    : { id: options.patientId || 2, fullName: "Paciente Demo" };
  const device = {
    id: options.deviceId || 5,
    deviceUid: options.deviceUid || "legacy:esp32_01",
    deviceIdentifier: options.deviceIdentifier || "esp32_01",
    name: "Pulseira ESP32",
    organization,
    currentPatient,
    currentAssignmentHistoryId: currentPatient ? 3 : null,
  };
  const logger = {
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
  };
  const fakePool = {
    transaction: async (work) => {
      calls.transactions += 1;
      return work({ connection: true });
    },
  };
  const fakeDeviceService = {
    getDeviceBehaviorSnapshot: async () => ({
      state: "pre_calibracao",
      confidence: "baixo",
      reason: "Teste",
      experimental: true,
      version: "test",
      source: "test",
      updatedAt: new Date().toISOString(),
      telemetrySampleCount: 1,
      telemetryWindowSeconds: 0,
      plannedFutureStates: [],
    }),
    getOrCreateDeviceByIdentity: async (identity) => {
      calls.identities.push(identity);
      activeIdentityCalls += 1;
      maxActiveIdentityCalls = Math.max(maxActiveIdentityCalls, activeIdentityCalls);
      if (options.identityDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.identityDelayMs));
      }
      activeIdentityCalls -= 1;
      return device;
    },
    upsertDeviceStatus: async (deviceId, fields, scope, _executor, updateOptions = {}) => {
      calls.status.push({ deviceId, fields, scope, options: updateOptions });
      const statusPatch = {
        online: fields.online ?? true,
        wifiRssi: fields.wifiRssi ?? null,
        batteryPercent: fields.batteryPercent ?? null,
        firmwareVersion: fields.firmwareVersion ?? null,
        lastSeenAt: fields.lastSeenAt instanceof Date
          ? fields.lastSeenAt.toISOString()
          : fields.lastSeenAt || null,
        updatedAt: new Date().toISOString(),
      };

      if (updateOptions.returnSnapshot === false) {
        return {
          status: statusPatch,
          scope,
        };
      }

      return {
        ...device,
        status: statusPatch,
      };
    },
  };
  const fakeEventService = {
    validateTelemetryPayload: (payload) => {
      const requiredFields = ["ax", "ay", "az", "gx", "gy", "gz"];
      const missingFields = requiredFields.filter((field) => {
        const parsed = Number(payload[field]);
        return !Number.isFinite(parsed);
      });
      const sensorValid = payload.sensor_valid === undefined
        ? true
        : payload.sensor_valid === true || payload.sensor_valid === 1 || payload.sensor_valid === "true";

      return {
        valid: sensorValid && missingFields.length === 0,
        missingFields,
        sensorValid,
        reason: !sensorValid
          ? "sensor_invalid"
          : missingFields.length
            ? "missing_sensor_axes"
            : null,
      };
    },
    recordEventFromMqtt: async ({ payload, eventTime, receivedAt }) => {
      calls.events.push({ payload, eventTime, receivedAt });
      const eventType = payload.event_type || "device_event";
      const evidenceStatus = eventType === "fall_detected"
        ? options.fallEvidenceStatus || "linked"
        : "none";
      return {
        id: eventId += 1,
        organizationId: organization?.id || null,
        patientId: currentPatient?.id || null,
        eventType,
        severity: payload.immobility_confirmed ? "critical" : "high",
        evidenceStatus,
        evidenceTelemetryId: evidenceStatus === "none" ? null : 200,
        evidenceSampleCount: evidenceStatus === "linked" ? 2 : evidenceStatus === "partial" ? 1 : 0,
        evidenceWindowSeconds: evidenceStatus === "none" ? 0 : 3,
        evidenceSummary: null,
        device: {
          id: device.id,
          deviceUid: device.deviceUid,
          deviceIdentifier: device.deviceIdentifier,
          name: device.name,
        },
      };
    },
    recordTelemetryFromMqtt: async ({ payload, createdAt, receivedAt }) => {
      calls.telemetry.push({ payload, createdAt, receivedAt });
      return {
        id: telemetryId += 1,
        deviceId: device.id,
        organizationId: organization?.id || null,
        patientId: currentPatient?.id || null,
        ax: Number(payload.ax || 0),
        ay: Number(payload.ay || 0),
        az: Number(payload.az || 1),
        gx: Number(payload.gx || 0),
        gy: Number(payload.gy || 0),
        gz: Number(payload.gz || 0),
        accelMagnitude: Number(payload.accel_magnitude || 1),
        gyroMagnitude: Number(payload.gyro_magnitude || 0),
        pitchDeg: Number(payload.pitch_deg || 0),
        rollDeg: Number(payload.roll_deg || 0),
        createdAt: new Date().toISOString(),
      };
    },
    shouldCreateAlert: (eventType) => ["fall_detected", "sos_pressed"].includes(eventType),
    shouldCreateAlertForEvent: (event) =>
      event.eventType === "sos_pressed" ||
      (event.eventType === "fall_detected" && ["linked", "partial"].includes(event.evidenceStatus)),
  };
  const fakeAlertService = {
    createAlertForEvent: async (event) => {
      calls.alerts.push(event);
      return {
        id: 900 + calls.alerts.length,
        organizationId: event.organizationId,
        patientId: event.patientId,
        status: "open",
        device: event.device,
        event,
      };
    },
  };
  const fakeEmitter = {
    emitScopedEvent: (_io, eventName, payload, scope, diagnostics) => {
      calls.emits.push({ eventName, payload, scope, diagnostics });
    },
  };
  const { module, restore } = loadWithMocks("src/services/mqttIngestionService.js", {
    "src/db/pool.js": fakePool,
    "src/services/deviceService.js": fakeDeviceService,
    "src/services/eventService.js": fakeEventService,
    "src/services/alertService.js": fakeAlertService,
    "src/socket/scopedEmitter.js": fakeEmitter,
    "src/utils/logger.js": { logger },
  });

  return {
    calls,
    handleMqttMessage: module.handleMqttMessage,
    maxActiveIdentityCalls: () => maxActiveIdentityCalls,
    restore,
  };
}

async function withHarness(options, work) {
  const harness = buildHarness(options);
  try {
    await work(harness);
  } finally {
    harness.restore();
  }
}

test("JSON invalido nao derruba o processo e gera descarte claro", async () => {
  await withHarness({}, async ({ calls, handleMqttMessage }) => {
    await handleMqttMessage({
      topicInfo: topicInfo("telemetry"),
      payloadText: "{",
      io: {},
    });

    assert.equal(calls.transactions, 0);
    assert.equal(calls.logs[0].metadata.reason, "invalid_json");
  });
});

test("payload sem device_id/topico sem device e canal invalido sao rejeitados", async () => {
  await withHarness({}, async ({ calls, handleMqttMessage }) => {
    await handleMqttMessage({
      topicInfo: topicInfo("status", ""),
      payloadText: JSON.stringify({ online: true }),
      io: {},
    });
    await handleMqttMessage({
      topicInfo: topicInfo("bad"),
      payloadText: JSON.stringify({ device_id: "esp32_01" }),
      io: {},
    });

    assert.equal(calls.transactions, 0);
    assert.deepEqual(
      calls.logs.filter((entry) => entry.level === "warn").map((entry) => entry.metadata.reason),
      ["missing_device_id", "unsupported_channel"],
    );
  });
});

test("status atualiza device_status e emite device:status no escopo correto", async () => {
  await withHarness({}, async ({ calls, handleMqttMessage }) => {
    await handleMqttMessage({
      topicInfo: topicInfo("status"),
      payloadText: JSON.stringify({
        device_id: "esp32_01",
        device_uid: "legacy:esp32_01",
        timestamp: Math.floor(Date.now() / 1000),
        wifi_rssi: -58,
        battery_level: 86,
      }),
      io: {},
    });

    assert.equal(calls.status.length, 1);
    assert.equal(calls.emits.length, 1);
    assert.equal(calls.emits[0].eventName, "device:status");
    assert.deepEqual(calls.emits[0].scope, { organizationId: 1, patientId: 2 });
    assert.ok(calls.emits[0].diagnostics.correlationId);
  });
});

test("telemetry grava amostra, atualiza status e emite telemetry:new", async () => {
  await withHarness({}, async ({ calls, handleMqttMessage }) => {
    await handleMqttMessage({
      topicInfo: topicInfo("telemetry"),
      payloadText: JSON.stringify({
        device_id: "esp32_01",
        timestamp: Math.floor(Date.now() / 1000),
        ax: 0.04,
        ay: -0.02,
        az: 0.98,
        gx: 5.2,
        gy: -1.1,
        gz: 3.6,
        accel_magnitude: 0.98,
        gyro_magnitude: 6.4,
      }),
      io: {},
    });

    assert.equal(calls.telemetry.length, 1);
    assert.equal(calls.emits[0].eventName, "telemetry:new");
    assert.equal(calls.emits[0].payload.deviceId, 5);
    assert.equal(calls.emits[0].payload.organizationId, 1);
  });
});

test("fall_detected e sos_pressed geram evento, alerta e alert:new", async () => {
  await withHarness({}, async ({ calls, handleMqttMessage }) => {
    for (const eventType of ["fall_detected", "sos_pressed"]) {
      await handleMqttMessage({
        topicInfo: topicInfo("events"),
        payloadText: JSON.stringify({
          device_id: "esp32_01",
          event_type: eventType,
          immobility_confirmed: eventType === "fall_detected",
          timestamp: Math.floor(Date.now() / 1000),
        }),
        io: {},
      });
    }

    assert.equal(calls.events.length, 2);
    assert.equal(calls.alerts.length, 2);
    assert.deepEqual(calls.emits.map((entry) => entry.eventName), ["alert:new", "alert:new"]);
  });
});

test("fall_detected sem evidencia suficiente nao cria alerta automatico", async () => {
  await withHarness({ fallEvidenceStatus: "none" }, async ({ calls, handleMqttMessage }) => {
    await handleMqttMessage({
      topicInfo: topicInfo("events"),
      payloadText: JSON.stringify({
        device_id: "esp32_01",
        event_type: "fall_detected",
        immobility_confirmed: true,
        timestamp: Math.floor(Date.now() / 1000),
      }),
      io: {},
    });

    assert.equal(calls.events.length, 1);
    assert.equal(calls.alerts.length, 0);
    assert.equal(calls.emits.length, 0);
    assert.ok(
      calls.logs.some(
        (entry) => entry.metadata?.eventType === "fall_detected" &&
          entry.metadata?.evidenceStatus === "none",
      ),
    );
  });
});

test("timestamp absurdo usa fallback do backend e loga diagnostico", async () => {
  await withHarness({}, async ({ calls, handleMqttMessage }) => {
    await handleMqttMessage({
      topicInfo: topicInfo("telemetry"),
      payloadText: JSON.stringify({
        device_id: "esp32_01",
        timestamp: 1,
        ax: 0,
        ay: 0,
        az: 1,
        gx: 0,
        gy: 0,
        gz: 0,
      }),
      io: {},
    });

    const lastSeenAt = calls.status[0].fields.lastSeenAt;
    assert.ok(lastSeenAt instanceof Date);
    assert.ok(Date.now() - lastSeenAt.getTime() < 10_000);
    assert.ok(
      calls.logs.some(
        (entry) => entry.metadata?.reason === "implausible_device_timestamp",
      ),
    );
  });
});

test("timestamp plausivel mas stale nao derruba status realtime para offline", async () => {
  await withHarness({}, async ({ calls, handleMqttMessage }) => {
    await handleMqttMessage({
      topicInfo: topicInfo("telemetry"),
      payloadText: JSON.stringify({
        device_id: "esp32_01",
        timestamp: Math.floor(new Date("2026-01-01T00:00:00.000Z").getTime() / 1000),
        ax: 0,
        ay: 0,
        az: 1,
        gx: 0,
        gy: 0,
        gz: 0,
      }),
      io: {},
    });

    const lastSeenAt = calls.status[0].fields.lastSeenAt;
    const createdAt = calls.telemetry[0].createdAt;

    assert.ok(lastSeenAt instanceof Date);
    assert.ok(Date.now() - lastSeenAt.getTime() < 10_000);
    assert.ok(createdAt instanceof Date);
    assert.ok(Date.now() - createdAt.getTime() < 10_000);
    assert.ok(
      calls.logs.some(
        (entry) => entry.metadata?.reason === "device_clock_skew_exceeded",
      ),
    );
  });
});

test("device sem organizacao nao vaza realtime tenant indevido", async () => {
  await withHarness({ organization: null, patient: null }, async ({ calls, handleMqttMessage }) => {
    await handleMqttMessage({
      topicInfo: topicInfo("telemetry"),
      payloadText: JSON.stringify({
        device_id: "stress_orphan",
        timestamp: Math.floor(Date.now() / 1000),
        ax: 0,
        ay: 0,
        az: 1,
        gx: 0,
        gy: 0,
        gz: 0,
      }),
      io: {},
    });

    assert.deepEqual(calls.emits[0].scope, { organizationId: null, patientId: null });
    assert.ok(
      calls.logs.some(
        (entry) => entry.metadata?.reason === "device_without_organization_scope",
      ),
    );
  });
});

test("telemetry sem amostra valida atualiza status mas nao grava telemetry_logs", async () => {
  await withHarness({}, async ({ calls, handleMqttMessage }) => {
    await handleMqttMessage({
      topicInfo: topicInfo("telemetry"),
      payloadText: JSON.stringify({
        device_id: "esp32_01",
        device_uid: "legacy:esp32_01",
        timestamp: Math.floor(Date.now() / 1000),
        sensor_ready: true,
        sensor_valid: false,
        sensor_read_ok: false,
        sensor_sample_age_ms: 0,
        i2c_last_error: "raw_read_failed",
      }),
      io: {},
    });

    assert.equal(calls.telemetry.length, 0);
    assert.equal(calls.status.length, 1);
    assert.equal(calls.emits.length, 1);
    assert.equal(calls.emits[0].eventName, "device:status");
    assert.ok(
      calls.logs.some(
        (entry) => entry.metadata?.validation?.reason === "sensor_invalid",
      ),
    );
  });
});

test("mensagens concorrentes do mesmo device passam pelo lock por chave", async () => {
  await withHarness({ identityDelayMs: 20 }, async (harness) => {
    await Promise.all(
      Array.from({ length: 5 }, () =>
        harness.handleMqttMessage({
          topicInfo: topicInfo("status"),
          payloadText: JSON.stringify({
            device_id: "esp32_01",
            timestamp: Math.floor(Date.now() / 1000),
          }),
          io: {},
        }),
      ),
    );

    assert.equal(harness.calls.transactions, 5);
    assert.equal(harness.maxActiveIdentityCalls(), 1);
  });
});
