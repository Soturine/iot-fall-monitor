const mqtt = require("mqtt");
const { performance } = require("perf_hooks");

const { env } = require("../../src/config/env");
const { execute, pool, testConnection } = require("../../src/db/pool");
const {
  createStressLogger,
  summarizeLatencies,
} = require("./stressLogger");

function readNumber(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function topic(deviceId, channel) {
  return `${env.mqtt.topicBase.replace(/\/+$/, "")}/${deviceId}/${channel}`;
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function buildFailure(phase, reason, metadata = {}) {
  return {
    phase,
    scenario: metadata.scenario || "prerequisites",
    reason,
    topic: metadata.topic || null,
    payload: metadata.payload || null,
    stack: metadata.stack || null,
    recommendation: metadata.recommendation ||
      "Confirme backend, broker MQTT e MySQL locais antes de executar stress:real.",
  };
}

function assertSafeEnvironment() {
  if (env.isProduction || /^prod(uction)?$/i.test(env.nodeEnv)) {
    throw Object.assign(new Error("stress:real bloqueado em ambiente de producao."), {
      phase: "environment",
      recommendation: "Use NODE_ENV=development ou test em banco local/dev.",
    });
  }

  const requireDevDb = process.env.STRESS_REQUIRE_DEV_DB !== "false";
  if (requireDevDb && !/(dev|test|local|queda_monitor|stress)/i.test(env.mysql.database)) {
    throw Object.assign(
      new Error(`Banco "${env.mysql.database}" nao parece ser local/dev/test.`),
      {
        phase: "environment",
        recommendation: "Use MYSQL_DATABASE de desenvolvimento ou defina STRESS_REQUIRE_DEV_DB=false conscientemente.",
      },
    );
  }
}

async function checkBackend(backendUrl) {
  const response = await fetch(`${backendUrl.replace(/\/+$/, "")}/health`, {
    method: "GET",
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw Object.assign(new Error(`Backend /health respondeu HTTP ${response.status}.`), {
      phase: "backend",
    });
  }

  return response.json();
}

async function validateDatabaseSchema() {
  const columnRows = await execute(
    null,
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = 'events'
        AND COLUMN_NAME IN (
          'evidence_status',
          'evidence_telemetry_id',
          'evidence_sample_count',
          'evidence_window_seconds',
          'evidence_summary_json'
        )
    `,
    [env.mysql.database],
  );
  const tableRows = await execute(
    null,
    `
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = 'event_telemetry_evidence'
    `,
    [env.mysql.database],
  );
  const columns = new Set(columnRows.map((row) => row.COLUMN_NAME));
  const missingColumns = [
    "evidence_status",
    "evidence_telemetry_id",
    "evidence_sample_count",
    "evidence_window_seconds",
    "evidence_summary_json",
  ].filter((column) => !columns.has(column));

  if (missingColumns.length || !tableRows.length) {
    throw Object.assign(
      new Error(
        `Schema de evidencia incompleto. Campos ausentes: ${missingColumns.join(", ") || "nenhum"}; tabela event_telemetry_evidence: ${tableRows.length ? "OK" : "ausente"}.`,
      ),
      {
        phase: "database",
        recommendation: "Atualize o banco local com database/schema.sql ou rode npm run db:init antes do stress:real.",
      },
    );
  }
}

function connectMqtt() {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(env.mqtt.brokerUrl, {
      username: env.mqtt.username || undefined,
      password: env.mqtt.password || undefined,
      clientId: `${env.mqtt.clientId}-stress-${Date.now()}`,
      connectTimeout: env.mqtt.connectTimeoutMs,
      keepalive: env.mqtt.keepaliveSeconds,
      reconnectPeriod: 0,
      rejectUnauthorized: env.mqtt.tlsRejectUnauthorized,
    });

    const timeout = setTimeout(() => {
      client.end(true);
      reject(Object.assign(new Error("Timeout no handshake MQTT."), { phase: "broker" }));
    }, env.mqtt.connectTimeoutMs + 1000);

    client.once("connect", () => {
      clearTimeout(timeout);
      resolve(client);
    });

    client.once("error", (error) => {
      clearTimeout(timeout);
      client.end(true);
      reject(Object.assign(error, { phase: "broker" }));
    });
  });
}

function publishAsync(client, publishTopic, payload) {
  const startedAt = performance.now();

  return new Promise((resolve, reject) => {
    client.publish(publishTopic, JSON.stringify(payload), { qos: 0 }, (error) => {
      const durationMs = performance.now() - startedAt;

      if (error) {
        reject(Object.assign(error, { durationMs }));
        return;
      }

      resolve(durationMs);
    });
  });
}

async function collectDatabaseMetrics(startedAt) {
  const [telemetryRow] = await execute(
    null,
    `
      SELECT COUNT(*) AS total
      FROM telemetry_logs tl
      INNER JOIN devices d ON d.id = tl.device_id
      WHERE d.device_identifier LIKE 'stress_esp32_%'
        AND tl.created_at >= ?
    `,
    [startedAt],
  );
  const [eventRow] = await execute(
    null,
    `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN e.event_type = 'fall_detected' THEN 1 ELSE 0 END) AS fallEvents,
        SUM(CASE WHEN e.event_type = 'fall_detected' AND e.evidence_status <> 'none' THEN 1 ELSE 0 END) AS fallEventsWithEvidence,
        SUM(CASE WHEN e.event_type = 'fall_detected' AND e.evidence_status = 'none' THEN 1 ELSE 0 END) AS fallEventsWithoutEvidence
      FROM events e
      INNER JOIN devices d ON d.id = e.device_id
      WHERE d.device_identifier LIKE 'stress_esp32_%'
        AND e.created_at >= ?
    `,
    [startedAt],
  );
  const [alertRow] = await execute(
    null,
    `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN e.evidence_status <> 'none' THEN 1 ELSE 0 END) AS withEvidence,
        SUM(CASE WHEN e.evidence_status = 'none' THEN 1 ELSE 0 END) AS withoutEvidence
      FROM alerts a
      INNER JOIN events e ON e.id = a.event_id
      INNER JOIN devices d ON d.id = a.device_id
      WHERE d.device_identifier LIKE 'stress_esp32_%'
        AND a.created_at >= ?
    `,
    [startedAt],
  );

  return {
    telemetryPersisted: Number(telemetryRow?.total || 0),
    eventsPersisted: Number(eventRow?.total || 0),
    fallEvents: Number(eventRow?.fallEvents || 0),
    fallEventsWithEvidence: Number(eventRow?.fallEventsWithEvidence || 0),
    fallEventsWithoutEvidence: Number(eventRow?.fallEventsWithoutEvidence || 0),
    alertsCreated: Number(alertRow?.total || 0),
    alertsWithEvidence: Number(alertRow?.withEvidence || 0),
    alertsWithoutEvidence: Number(alertRow?.withoutEvidence || 0),
  };
}

async function runRealScenario({ client, stressLogger, totals, failures, latencies, config }) {
  const devices = Array.from({ length: config.deviceCount }, (_, index) =>
    `stress_esp32_${String(index + 1).padStart(3, "0")}`);
  const startedAt = performance.now();
  const scenarios = [];

  const telemetryMessages = Math.max(
    1,
    Math.floor(config.deviceCount * config.telemetryRateHz * config.durationSeconds),
  );

  for (let index = 0; index < telemetryMessages; index += 1) {
    const deviceId = devices[index % devices.length];
    const publishTopic = topic(deviceId, "telemetry");
    const payload = {
      device_id: deviceId,
      device_uid: `stress:${deviceId}`,
      timestamp: nowUnix(),
      ax: Math.sin(index / 5) / 10,
      ay: Math.cos(index / 5) / 10,
      az: 1,
      gx: index % 7,
      gy: index % 5,
      gz: index % 3,
      accel_magnitude: 1 + ((index % 11) / 100),
      gyro_magnitude: index % 25,
      wifi_rssi: -58,
      battery_level: 86,
    };

    totals.published += 1;
    try {
      const durationMs = await publishAsync(client, publishTopic, payload);
      totals.brokerAccepted += 1;
      latencies.push(durationMs);
      stressLogger.write({
        phase: "mqtt_publish",
        scenario: "real_telemetry_burst",
        deviceId,
        topic: publishTopic,
        message: "Telemetria publicada no broker real.",
        durationMs: Number(durationMs.toFixed(2)),
        success: true,
      });
    } catch (error) {
      totals.failed += 1;
      failures.push(buildFailure("mqtt_publish", error.message, {
        scenario: "real_telemetry_burst",
        topic: publishTopic,
        payload,
        stack: String(error.stack || "").split("\n").slice(0, 4).join("\n"),
      }));
    }
  }

  scenarios.push({
    name: "real_telemetry_burst",
    messages: telemetryMessages,
    durationMs: Number((performance.now() - startedAt).toFixed(2)),
  });

  if (config.evidenceSettleMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, config.evidenceSettleMs));
    stressLogger.write({
      phase: "summary",
      scenario: "real_telemetry_burst",
      message: "Pausa curta para o backend persistir telemetria antes dos eventos de queda.",
      durationMs: config.evidenceSettleMs,
      success: true,
    });
  }

  const fallStartedAt = performance.now();
  for (let index = 0; index < config.fallEvents; index += 1) {
    const deviceId = devices[index % devices.length];
    const publishTopic = topic(deviceId, "events");
    const payload = {
      device_id: deviceId,
      device_uid: `stress:${deviceId}`,
      event_type: index % 5 === 0 ? "sos_pressed" : "fall_detected",
      timestamp: nowUnix(),
      accel_magnitude: index % 2 === 0 ? 3.8 : 2.4,
      gyro_magnitude: index % 2 === 0 ? 180 : 120,
      immobility_confirmed: index % 3 === 0,
    };

    totals.published += 1;
    try {
      const durationMs = await publishAsync(client, publishTopic, payload);
      totals.brokerAccepted += 1;
      latencies.push(durationMs);
      stressLogger.write({
        phase: "mqtt_publish",
        scenario: "real_fall_burst",
        deviceId,
        topic: publishTopic,
        message: "Evento publicado no broker real.",
        durationMs: Number(durationMs.toFixed(2)),
        success: true,
        metadata: { eventType: payload.event_type },
      });
    } catch (error) {
      totals.failed += 1;
      failures.push(buildFailure("mqtt_publish", error.message, {
        scenario: "real_fall_burst",
        topic: publishTopic,
        payload,
        stack: String(error.stack || "").split("\n").slice(0, 4).join("\n"),
      }));
    }
  }

  scenarios.push({
    name: "real_fall_burst",
    messages: config.fallEvents,
    durationMs: Number((performance.now() - fallStartedAt).toFixed(2)),
  });

  return scenarios;
}

async function main() {
  process.env.ALERT_DELIVERY_DRY_RUN = process.env.ALERT_DELIVERY_DRY_RUN || "true";

  const runId = `stress-real-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const startedAt = new Date();
  const stressLogger = createStressLogger(runId);
  const failures = [];
  const latencies = [];
  const totals = {
    published: 0,
    brokerAccepted: 0,
    processed: 0,
    persisted: 0,
    telemetryPersisted: 0,
    eventsPersisted: 0,
    alertsCreated: 0,
    alertsWithEvidence: 0,
    alertsWithoutEvidence: 0,
    fallEvents: 0,
    fallEventsWithEvidence: 0,
    fallEventsWithoutEvidence: 0,
    alertsBlocked: 0,
    socketEvents: 0,
    failed: 0,
    discarded: 0,
  };
  const config = {
    backendUrl: process.env.STRESS_BACKEND_URL || `http://localhost:${env.port}`,
    deviceCount: readNumber("STRESS_DEVICE_COUNT", 2),
    durationSeconds: readNumber("STRESS_DURATION_SECONDS", 5),
    telemetryRateHz: readNumber("STRESS_TELEMETRY_RATE_HZ", 2),
    fallEvents: readNumber("STRESS_FALL_EVENTS", 5),
    evidenceSettleMs: readNumber("STRESS_EVIDENCE_SETTLE_MS", 1000),
    settleMs: readNumber("STRESS_SETTLE_MS", 3000),
  };
  const environment = {
    backend: "nao validado",
    broker: "nao validado",
    database: "nao validado",
  };
  let client = null;
  let scenarios = [];

  try {
    assertSafeEnvironment();
    await checkBackend(config.backendUrl);
    environment.backend = `${config.backendUrl}/health OK`;
    await testConnection();
    await validateDatabaseSchema();
    environment.database = `${env.mysql.host}:${env.mysql.port}/${env.mysql.database} OK`;
    client = await connectMqtt();
    environment.broker = `${env.mqtt.brokerUrl} OK`;

    stressLogger.write({
      phase: "summary",
      message: "stress:real iniciou com prerequisitos validos.",
      metadata: { config, environment },
    });

    scenarios = await runRealScenario({
      client,
      stressLogger,
      totals,
      failures,
      latencies,
      config,
    });

    await new Promise((resolve) => setTimeout(resolve, config.settleMs));
    const dbMetrics = await collectDatabaseMetrics(startedAt);
    Object.assign(totals, dbMetrics);
    totals.processed = dbMetrics.telemetryPersisted + dbMetrics.eventsPersisted;
    totals.persisted = totals.processed;
    totals.alertsBlocked = Math.max(0, totals.fallEvents - totals.alertsWithEvidence);
  } catch (error) {
    totals.failed += 1;
    failures.push(buildFailure(error.phase || "stress_real", error.message, {
      stack: String(error.stack || "").split("\n").slice(0, 4).join("\n"),
      recommendation: error.recommendation,
    }));
  } finally {
    if (client) {
      client.end(true);
    }
  }

  const finishedAt = new Date();
  const memoryUsage = process.memoryUsage();
  totals.memoryRssMb = Number((memoryUsage.rss / 1024 / 1024).toFixed(2));
  const summary = {
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    mode: "real",
    logFile: stressLogger.jsonlPath,
    environment,
    scenarios,
    totals,
    latency: summarizeLatencies(latencies),
    failures,
    recommendations: [
      "Se publicadas for maior que persistidas, verificar logs do backend pelo correlationId e topico.",
      "Se fall_detected sem evidencia crescer, publicar telemetria por alguns segundos antes dos eventos de queda.",
    ],
  };
  const artifactPaths = stressLogger.writeArtifacts(summary);

  console.table({
    modo: summary.mode,
    publicadas: totals.published,
    aceitasBroker: totals.brokerAccepted,
    persistidas: totals.persisted,
    alertas: totals.alertsCreated,
    comEvidencia: totals.alertsWithEvidence,
    semEvidencia: totals.alertsWithoutEvidence,
    falhas: failures.length,
    p95Ms: summary.latency.p95Ms,
  });
  console.log(`[stress:real] runId=${runId}`);
  console.log(`[stress:real] jsonl=${stressLogger.jsonlPath}`);
  console.log(`[stress:real] summary=${artifactPaths.summaryPath}`);
  console.log(`[stress:real] failures=${artifactPaths.failuresPath}`);
  console.log(`[stress:real] report=${artifactPaths.reportPath}`);

  await pool.end();

  if (failures.length) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(`[stress:real] Falha fatal: ${error.stack || error.message}`);
  await pool.end();
  process.exit(1);
});
