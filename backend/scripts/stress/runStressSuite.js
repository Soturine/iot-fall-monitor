const path = require("path");
const { performance } = require("perf_hooks");

const {
  createStressLogger,
  summarizeLatencies,
} = require("./stressLogger");
const { validateTelemetryPayload } = require("../../src/services/eventService");

const backendRoot = path.resolve(__dirname, "..", "..");

function resolveBackendPath(relativePath) {
  return path.resolve(backendRoot, relativePath);
}

function loadWithMocks(targetRelativePath, mocks = {}) {
  const targetPath = resolveBackendPath(targetRelativePath);
  const mockEntries = Object.entries(mocks).map(([relativePath, exports]) => [
    resolveBackendPath(relativePath),
    exports,
  ]);
  const touchedPaths = [targetPath, ...mockEntries.map(([mockPath]) => mockPath)];
  const previousCache = new Map();

  touchedPaths.forEach((modulePath) => {
    previousCache.set(modulePath, require.cache[modulePath]);
    delete require.cache[modulePath];
  });

  mockEntries.forEach(([modulePath, exports]) => {
    require.cache[modulePath] = {
      id: modulePath,
      filename: modulePath,
      loaded: true,
      exports,
    };
  });

  const loaded = require(targetPath);

  return {
    module: loaded,
    restore() {
      delete require.cache[targetPath];
      mockEntries.forEach(([modulePath]) => delete require.cache[modulePath]);
      previousCache.forEach((cacheEntry, modulePath) => {
        if (cacheEntry) {
          require.cache[modulePath] = cacheEntry;
        } else {
          delete require.cache[modulePath];
        }
      });
    },
  };
}

function readNumber(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function topicInfo(deviceId, channel) {
  return {
    topic: `queda/devices/${deviceId}/${channel}`,
    deviceIdentifier: deviceId,
    channel,
  };
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function buildHarness({ stressLogger, totals, failures, latencies }) {
  const devicesByIdentifier = new Map();
  const activeByDevice = new Map();
  const maxConcurrentByDevice = new Map();
  let nextDeviceId = 1000;
  let nextTelemetryId = 5000;
  let nextEventId = 7000;
  let nextAlertId = 9000;

  function getDevice(identity) {
    const identifier = String(identity.deviceIdentifier || "stress_unknown");
    if (!devicesByIdentifier.has(identifier)) {
      const orphan = identifier.includes("orphan");
      const id = nextDeviceId += 1;
      devicesByIdentifier.set(identifier, {
        id,
        deviceUid: identity.deviceUid || `legacy:${identifier}`,
        deviceIdentifier: identifier,
        name: identity.name || identifier,
        organization: orphan ? null : { id: 501, name: "stress_organization" },
        currentPatient: orphan ? null : { id: 601, fullName: "stress_patient" },
        currentAssignmentHistoryId: orphan ? null : 701,
      });
    }

    return devicesByIdentifier.get(identifier);
  }

  const logger = {
    debug(message, metadata) {
      stressLogger.write({
        level: "info",
        phase: "mqtt_ingestion",
        scenario: metadata?.scenario || null,
        topic: metadata?.topic || null,
        message,
        success: true,
        metadata,
      });
    },
    error(message, metadata) {
      totals.failed += 1;
      failures.push({
        scenario: metadata?.scenario || "mqtt_ingestion",
        reason: message,
        topic: metadata?.topic || null,
        payload: null,
        stack: metadata?.stack || null,
        recommendation: "Revise a exception no ponto indicado pelo correlationId.",
      });
      stressLogger.write({
        level: "error",
        phase: "mqtt_ingestion",
        topic: metadata?.topic || null,
        message,
        success: false,
        error: metadata?.message || message,
        metadata,
      });
    },
    info(message, metadata) {
      stressLogger.write({
        level: "info",
        phase: "mqtt_ingestion",
        topic: metadata?.topic || null,
        message,
        success: true,
        metadata,
      });
    },
    warn(message, metadata) {
      if (["invalid_json", "missing_device_id", "unsupported_channel"].includes(metadata?.reason)) {
        totals.discarded += 1;
      }
      if (metadata?.reason === "missing_device_id") {
        totals.missingDevice += 1;
      }
      stressLogger.write({
        level: "warn",
        phase: "mqtt_ingestion",
        topic: metadata?.topic || null,
        message,
        success: false,
        error: metadata?.reason || message,
        metadata,
      });
    },
  };

  const fakePool = {
    transaction: async (work) => work({ stressConnection: true }),
  };
  const fakeDeviceService = {
    getDeviceBehaviorSnapshot: async (_deviceId, status) => ({
      state: status?.online ? "pre_calibracao" : "desconhecido",
      confidence: "baixo",
      reason: "Stress dry-run sem inferencia clinica.",
      experimental: true,
      version: "stress",
      source: "stress",
      updatedAt: status?.lastSeenAt || new Date().toISOString(),
      telemetrySampleCount: 1,
      telemetryWindowSeconds: 0,
      plannedFutureStates: [],
    }),
    getOrCreateDeviceByIdentity: async (identity) => {
      const identifier = String(identity.deviceIdentifier || "stress_unknown");
      activeByDevice.set(identifier, (activeByDevice.get(identifier) || 0) + 1);
      maxConcurrentByDevice.set(
        identifier,
        Math.max(maxConcurrentByDevice.get(identifier) || 0, activeByDevice.get(identifier)),
      );
      await new Promise((resolve) => setTimeout(resolve, 1));
      activeByDevice.set(identifier, Math.max(0, (activeByDevice.get(identifier) || 1) - 1));
      return getDevice(identity);
    },
    upsertDeviceStatus: async (deviceId, fields, scope, _executor, options = {}) => {
      const status = {
        online: fields.online ?? true,
        wifiRssi: fields.wifiRssi ?? null,
        batteryPercent: fields.batteryPercent ?? null,
        firmwareVersion: fields.firmwareVersion ?? null,
        lastSeenAt: fields.lastSeenAt instanceof Date
          ? fields.lastSeenAt.toISOString()
          : fields.lastSeenAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const device = [...devicesByIdentifier.values()].find((item) => item.id === deviceId);

      if (options.returnSnapshot === false) {
        return { status, scope };
      }

      return {
        ...device,
        status,
      };
    },
  };
  const fakeEventService = {
    validateTelemetryPayload,
    recordEventFromMqtt: async ({ device, payload }) => {
      nextEventId += 1;
      totals.persisted += 1;
      totals.eventsPersisted += 1;
      if (payload.event_type === "fall_detected") {
        totals.fallEvents += 1;
      }
      const evidenceStatus = payload.event_type === "fall_detected"
        ? payload.no_evidence
          ? "none"
          : payload.immobility_confirmed
            ? "linked"
            : "partial"
        : "none";
      if (payload.event_type === "fall_detected" && evidenceStatus === "none") {
        totals.fallEventsWithoutEvidence += 1;
      }
      if (payload.event_type === "fall_detected" && evidenceStatus !== "none") {
        totals.fallEventsWithEvidence += 1;
      }
      stressLogger.write({
        phase: "db_insert",
        scenario: payload.__scenario,
        deviceId: device.deviceIdentifier,
        topic: `queda/devices/${device.deviceIdentifier}/events`,
        message: "Evento persistido em dry-run.",
        success: true,
        metadata: { eventId: nextEventId, eventType: payload.event_type },
      });
      return {
        id: nextEventId,
        organizationId: device.organization?.id || null,
        patientId: device.currentPatient?.id || null,
        eventType: payload.event_type || "device_event",
        severity: payload.immobility_confirmed ? "critical" : "high",
        evidenceStatus,
        evidenceTelemetryId: evidenceStatus === "none" ? null : nextTelemetryId,
        evidenceSampleCount: evidenceStatus === "linked" ? 2 : evidenceStatus === "partial" ? 1 : 0,
        evidenceWindowSeconds: evidenceStatus === "none" ? 0 : 5,
        evidenceSummary: evidenceStatus === "none"
          ? null
          : {
              maxAccelMagnitude: Number(payload.accel_magnitude || 0),
              maxGyroMagnitude: Number(payload.gyro_magnitude || 0),
              immobilityConfirmed: Boolean(payload.immobility_confirmed),
              firstSampleAt: new Date().toISOString(),
              lastSampleAt: new Date().toISOString(),
            },
        device: {
          id: device.id,
          deviceUid: device.deviceUid,
          deviceIdentifier: device.deviceIdentifier,
          name: device.name,
        },
      };
    },
    recordTelemetryFromMqtt: async ({ device, payload }) => {
      nextTelemetryId += 1;
      totals.persisted += 1;
      totals.telemetryPersisted += 1;
      stressLogger.write({
        phase: "db_insert",
        scenario: payload.__scenario,
        deviceId: device.deviceIdentifier,
        topic: `queda/devices/${device.deviceIdentifier}/telemetry`,
        message: "Telemetria persistida em dry-run.",
        success: true,
        metadata: { telemetryId: nextTelemetryId },
      });
      return {
        id: nextTelemetryId,
        deviceId: device.id,
        organizationId: device.organization?.id || null,
        patientId: device.currentPatient?.id || null,
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
    shouldCreateAlertForEvent: (event) => {
      const allowed = event.eventType === "sos_pressed" ||
        (event.eventType === "fall_detected" && ["linked", "partial"].includes(event.evidenceStatus));

      if (!allowed && event.eventType === "fall_detected") {
        totals.alertsBlocked += 1;
      }

      return allowed;
    },
  };
  const fakeAlertService = {
    createAlertForEvent: async (event) => {
      nextAlertId += 1;
      totals.alertsCreated += 1;
      if (event.evidenceStatus && event.evidenceStatus !== "none") {
        totals.alertsWithEvidence += 1;
      } else {
        totals.alertsWithoutEvidence += 1;
      }
      stressLogger.write({
        phase: "alert_create",
        scenario: "fall_burst",
        deviceId: event.device.deviceIdentifier,
        topic: `queda/devices/${event.device.deviceIdentifier}/events`,
        message: "Alerta interno criado em dry-run.",
        success: true,
        metadata: { alertId: nextAlertId, eventId: event.id },
      });
      return {
        id: nextAlertId,
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
      totals.socketEvents += 1;
      stressLogger.write({
        phase: "socket_emit",
        scenario: payload?.__scenario || null,
        deviceId: payload?.deviceIdentifier || payload?.device?.deviceIdentifier || null,
        message: `Socket.IO ${eventName} emitido em dry-run.`,
        success: true,
        metadata: { eventName, scope, diagnostics },
      });
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

  async function ingest({ scenario, deviceId, channel, payloadText, payload }) {
    const start = performance.now();
    totals.published += 1;
    totals.received += 1;
    const topic = topicInfo(deviceId, channel);

    try {
      await module.handleMqttMessage({
        topicInfo: topic,
        payloadText: payloadText || JSON.stringify({ ...payload, __scenario: scenario }),
        io: {},
      });
      totals.processed += 1;
      const durationMs = performance.now() - start;
      latencies.push(durationMs);
      stressLogger.write({
        phase: "mqtt_publish",
        scenario,
        deviceId,
        topic: topic.topic,
        message: "Mensagem simulada processada.",
        durationMs: Number(durationMs.toFixed(2)),
        success: true,
      });
    } catch (error) {
      totals.failed += 1;
      failures.push({
        scenario,
        reason: error.message,
        topic: topic.topic,
        payload: payload || payloadText || null,
        stack: String(error.stack || "").split("\n").slice(0, 4).join("\n"),
        recommendation: "Verifique o correlationId da mensagem e a transacao associada.",
      });
      stressLogger.write({
        level: "error",
        phase: "mqtt_ingestion",
        scenario,
        deviceId,
        topic: topic.topic,
        message: "Falha ao processar mensagem simulada.",
        success: false,
        error: error.message,
      });
    }
  }

  return {
    ingest,
    maxConcurrentByDevice,
    restore,
  };
}

async function runInChunks(items, size, work) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(work));
  }
}

async function runTelemetryBurst(harness, config, scenarioResults) {
  const scenario = "telemetry_burst";
  const startedAt = performance.now();
  const totalMessages = Math.max(
    1,
    Math.floor(config.telemetryDeviceCount * config.telemetryRatePerSecond * (config.telemetryDurationMs / 1000)),
  );
  const messages = Array.from({ length: totalMessages }, (_, index) => {
    const deviceNumber = (index % config.telemetryDeviceCount) + 1;
    const deviceId = `stress_esp32_${String(deviceNumber).padStart(3, "0")}`;
    return {
      scenario,
      deviceId,
      channel: "telemetry",
      payload: {
        device_id: deviceId,
        device_uid: `stress:${deviceId}`,
        timestamp: nowUnix(),
        ax: Math.sin(index / 10) / 10,
        ay: Math.cos(index / 10) / 10,
        az: 1,
        gx: index % 4,
        gy: index % 5,
        gz: index % 6,
        accel_magnitude: 1 + ((index % 9) / 100),
        gyro_magnitude: index % 20,
        wifi_rssi: -58,
        battery_level: 86,
      },
    };
  });

  await runInChunks(messages, config.chunkSize, (message) => harness.ingest(message));
  scenarioResults.push({
    name: scenario,
    messages: totalMessages,
    durationMs: Number((performance.now() - startedAt).toFixed(2)),
  });
}

async function runFallBurst(harness, config, scenarioResults) {
  const scenario = "fall_burst";
  const startedAt = performance.now();
  const messages = [
    {
      deviceId: "stress_esp32_001",
      eventType: "fall_detected",
      immobility: true,
      offsetSeconds: 0,
    },
    ...Array.from({ length: 10 }, (_, index) => ({
      deviceId: "stress_esp32_001",
      eventType: "fall_detected",
      immobility: index % 2 === 0,
      offsetSeconds: -index,
    })),
    ...Array.from({ length: config.fallEventCount }, (_, index) => ({
      deviceId: `stress_esp32_${String((index % config.telemetryDeviceCount) + 1).padStart(3, "0")}`,
      eventType: index % 5 === 0 ? "sos_pressed" : "fall_detected",
      immobility: index % 3 === 0,
      offsetSeconds: index % 2 === 0 ? -index : index,
    })),
  ];

  await runInChunks(messages, config.chunkSize, (message) =>
    harness.ingest({
      scenario,
      deviceId: message.deviceId,
      channel: "events",
      payload: {
        device_id: message.deviceId,
        device_uid: `stress:${message.deviceId}`,
        event_type: message.eventType,
        timestamp: nowUnix() + message.offsetSeconds,
        accel_magnitude: message.immobility ? 3.7 : 2.4,
        gyro_magnitude: message.immobility ? 180 : 130,
        immobility_confirmed: message.immobility,
        no_evidence: message.eventType === "fall_detected" && message.offsetSeconds % 11 === 0,
      },
    }),
  );
  scenarioResults.push({
    name: scenario,
    messages: messages.length,
    durationMs: Number((performance.now() - startedAt).toFixed(2)),
  });
}

async function runBadPayloads(harness, scenarioResults) {
  const scenario = "bad_payloads";
  const startedAt = performance.now();
  const hugePayload = {
    device_id: "stress_esp32_bad",
    timestamp: nowUnix(),
    ax: "nan?",
    blob: "x".repeat(20_000),
  };
  const cases = [
    { deviceId: "stress_esp32_bad", channel: "telemetry", payloadText: "{" },
    { deviceId: "", channel: "telemetry", payload: { timestamp: nowUnix() } },
    { deviceId: "stress_esp32_bad", channel: "invalid", payload: { device_id: "stress_esp32_bad" } },
    { deviceId: "stress_esp32_bad", channel: "telemetry", payload: { device_id: "" } },
    { deviceId: "stress_esp32_bad", channel: "telemetry", payload: { device_id: "stress_esp32_bad", device_uid: "other:uid", timestamp: nowUnix(), ax: "lixo" } },
    { deviceId: "stress_esp32_bad", channel: "telemetry", payload: { device_id: "stress_esp32_bad", timestamp: 1, ax: "NaN", ay: "bad", az: "trash" } },
    { deviceId: "stress_esp32_bad", channel: "events", payload: { device_id: "stress_esp32_bad", event_type: "fall_detected", timestamp: nowUnix() + 60 * 60 * 24 * 365 } },
    { deviceId: "stress_orphan_001", channel: "events", payload: { device_id: "stress_orphan_001", event_type: "sos_pressed", timestamp: nowUnix() } },
    { deviceId: "stress_esp32_bad", channel: "telemetry", payload: hugePayload },
  ];

  await runInChunks(cases, 5, (message) => harness.ingest({ scenario, ...message }));
  scenarioResults.push({
    name: scenario,
    messages: cases.length,
    durationMs: Number((performance.now() - startedAt).toFixed(2)),
  });
}

async function runConcurrency(harness, config, scenarioResults) {
  const scenario = "concurrency_same_device";
  const startedAt = performance.now();
  const deviceId = "stress_esp32_lock";
  const messages = Array.from({ length: config.concurrencyMessages }, (_, index) => ({
    scenario,
    deviceId,
    channel: "telemetry",
    payload: {
      device_id: deviceId,
      device_uid: `stress:${deviceId}`,
      timestamp: nowUnix(),
      ax: index / 100,
      ay: 0,
      az: 1,
    },
  }));

  await Promise.all(messages.map((message) => harness.ingest(message)));
  scenarioResults.push({
    name: scenario,
    messages: messages.length,
    maxConcurrentSameDevice: harness.maxConcurrentByDevice.get(deviceId) || 0,
    durationMs: Number((performance.now() - startedAt).toFixed(2)),
  });
}

async function main() {
  const fullMode = process.argv.includes("--full") || process.env.STRESS_FULL === "1";
  const runId = `stress-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const startedAt = new Date();
  const stressLogger = createStressLogger(runId);
  const totals = {
    published: 0,
    received: 0,
    processed: 0,
    persisted: 0,
    telemetryPersisted: 0,
    eventsPersisted: 0,
    alertsCreated: 0,
    alertsWithEvidence: 0,
    alertsWithoutEvidence: 0,
    alertsBlocked: 0,
    fallEvents: 0,
    fallEventsWithEvidence: 0,
    fallEventsWithoutEvidence: 0,
    socketEvents: 0,
    failed: 0,
    discarded: 0,
    missingDevice: 0,
    invalidTelemetry: 0,
  };
  const failures = [];
  const latencies = [];
  const scenarios = [];
  const config = {
    chunkSize: readNumber("STRESS_CHUNK_SIZE", 50),
    concurrencyMessages: readNumber("STRESS_CONCURRENCY_MESSAGES", fullMode ? 120 : 30),
    fallEventCount: readNumber("STRESS_FALL_EVENTS", fullMode ? 100 : 25),
    telemetryDeviceCount: readNumber("STRESS_DEVICE_COUNT", fullMode ? 20 : 5),
    telemetryDurationMs: readNumber("STRESS_DURATION_MS", fullMode ? 30_000 : 3_000),
    telemetryRatePerSecond: readNumber("STRESS_RATE_PER_SECOND", fullMode ? 20 : 10),
  };
  const harness = buildHarness({ stressLogger, totals, failures, latencies });

  stressLogger.write({
    phase: "summary",
    message: "Suite de stress iniciada em dry-run.",
    metadata: {
      config,
      alertDeliveryDryRun: process.env.ALERT_DELIVERY_DRY_RUN !== "false",
      mode: "dry-run",
    },
  });

  try {
    await runTelemetryBurst(harness, config, scenarios);
    await runFallBurst(harness, config, scenarios);
    await runBadPayloads(harness, scenarios);
    await runConcurrency(harness, config, scenarios);
  } finally {
    harness.restore();
  }

  const finishedAt = new Date();
  const memoryUsage = process.memoryUsage();
  totals.memoryRssMb = Number((memoryUsage.rss / 1024 / 1024).toFixed(2));
  const summary = {
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    mode: "dry-run",
    logFile: stressLogger.jsonlPath,
    environment: {
      backend: "mockado em processo local",
      broker: "mockado em processo local",
      database: "mockado em processo local",
    },
    scenarios,
    totals,
    latency: summarizeLatencies(latencies),
    failures,
    recommendations: [
      "Use stress:real para medir broker, backend e MySQL reais.",
      "Compare alertas bloqueados com fall_detected sem evidencia antes de validar o prototipo fisico.",
    ],
  };
  const artifactPaths = stressLogger.writeArtifacts(summary);

  stressLogger.write({
    phase: "summary",
    message: "Suite de stress concluida.",
    success: failures.length === 0,
    metadata: {
      ...artifactPaths,
      totals,
      latency: summary.latency,
    },
  });

  console.table({
    modo: summary.mode,
    publicadas: totals.published,
    processadas: totals.processed,
    persistidas: totals.persisted,
    alertas: totals.alertsCreated,
    bloqueados: totals.alertsBlocked,
    falhas: failures.length,
    p95Ms: summary.latency.p95Ms,
  });
  console.log(`[stress] runId=${runId}`);
  console.log(`[stress] jsonl=${stressLogger.jsonlPath}`);
  console.log(`[stress] summary=${artifactPaths.summaryPath}`);
  console.log(`[stress] failures=${artifactPaths.failuresPath}`);
  console.log(`[stress] report=${artifactPaths.reportPath}`);

  if (failures.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[stress] Falha fatal: ${error.stack || error.message}`);
  process.exit(1);
});
