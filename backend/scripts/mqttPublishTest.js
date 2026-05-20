const mqtt = require("mqtt");

const { env } = require("../src/config/env");

function parseArgs(argv) {
  const options = {
    deviceId: "esp32_01",
    deviceUid: "legacy:esp32_01",
    count: 5,
    intervalMs: 1000,
    eventType: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--device" && next) {
      options.deviceId = next;
      index += 1;
    } else if (arg === "--uid" && next) {
      options.deviceUid = next;
      index += 1;
    } else if (arg === "--count" && next) {
      options.count = Math.max(1, Number(next) || options.count);
      index += 1;
    } else if (arg === "--interval-ms" && next) {
      options.intervalMs = Math.max(100, Number(next) || options.intervalMs);
      index += 1;
    } else if (arg === "--event" && next) {
      options.eventType = next;
      index += 1;
    }
  }

  return options;
}

function topicFor(deviceId, channel) {
  return `${env.mqtt.topicBase.replace(/\/+$/, "")}/${deviceId}/${channel}`;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

let eventSequence = 0;

function nextEventMetadata(options, eventType) {
  eventSequence += 1;
  return {
    event_uuid: `${options.deviceUid}-${eventType}-${Date.now()}-${eventSequence}`,
    event_sequence: eventSequence,
    sample_seq: options.count,
  };
}

function buildStatus(options) {
  return {
    device_id: options.deviceId,
    device_uid: options.deviceUid,
    online: true,
    wifi_rssi: -58,
    battery_percent: 86,
    firmware_version: "mqtt-publish-test",
    sensor_ready: true,
    sensor_valid: true,
    sensor_read_ok: true,
    sensor_sample_age_ms: 0,
    sensor_failures: 0,
    i2c_error_count: 0,
    i2c_recovery_count: 0,
    i2c_last_error: "none",
    timestamp: nowSeconds(),
  };
}

function buildTelemetry(options, index) {
  const angle = index / 4;
  const ax = Number((Math.sin(angle) * 0.04).toFixed(3));
  const ay = Number((Math.cos(angle) * 0.04).toFixed(3));
  const az = Number((0.98 + Math.sin(angle) * 0.02).toFixed(3));

  return {
    device_id: options.deviceId,
    device_uid: options.deviceUid,
    ax,
    ay,
    az,
    gx: Number((Math.sin(angle) * 1.5).toFixed(3)),
    gy: Number((Math.cos(angle) * 1.5).toFixed(3)),
    gz: 0.12,
    accel_magnitude: Number(Math.sqrt(ax ** 2 + ay ** 2 + az ** 2).toFixed(3)),
    gyro_magnitude: 1.5,
    pitch_deg: 1.1,
    roll_deg: -0.8,
    wifi_rssi: -58,
    battery_percent: 86,
    sensor_ready: true,
    sensor_valid: true,
    sensor_read_ok: true,
    sensor_sample_age_ms: 0,
    sensor_failures: 0,
    i2c_error_count: 0,
    i2c_recovery_count: 0,
    i2c_last_error: "none",
    timestamp: nowSeconds(),
  };
}

function buildEvent(options) {
  const fallDetected = options.eventType === "fall_detected";
  const eventMetadata = nextEventMetadata(options, options.eventType);

  return {
    device_id: options.deviceId,
    device_uid: options.deviceUid,
    event_type: options.eventType,
    ...eventMetadata,
    severity: ["fall_detected", "sos_pressed", "manual_sos", "sensor_fault"].includes(options.eventType)
      ? "high"
      : "medium",
    immobility_confirmed: false,
    accel_magnitude: 2.8,
    gyro_magnitude: 180,
    decision_source: fallDetected ? "firmware" : undefined,
    algorithm_version: fallDetected ? "mqtt_publish_test_threshold_fsm_v2_time_features_v1" : undefined,
    detected: fallDetected || undefined,
    candidate: fallDetected || undefined,
    reason: fallDetected ? "impact_orientation_immobility" : undefined,
    activity_state_estimate: fallDetected ? "queda_suspeita" : undefined,
    confidence: fallDetected ? 0.62 : undefined,
    analysis_window_ms: fallDetected ? 2800 : undefined,
    sample_count: fallDetected ? 56 : undefined,
    peak_accel_g: fallDetected ? 2.8 : undefined,
    peak_gyro_dps: fallDetected ? 180 : undefined,
    orientation_delta_deg: fallDetected ? 52 : undefined,
    features_time_domain: fallDetected
      ? {
          available: true,
          sample_count: 56,
          window_duration_ms: 2800,
          peak_accel_magnitude: 2.8,
          peak_gyro_magnitude: 180,
          peak_jerk: 7.1,
        }
      : undefined,
    features_frequency_domain: fallDetected
      ? {
          available: false,
          experimental: true,
          reason: "fft_experimental_disabled",
          window_size: 64,
          sample_interval_ms: 50,
        }
      : undefined,
    message: "Evento MQTT de teste local.",
    timestamp: nowSeconds(),
  };
}

function publishJson(client, topic, payload, options = {}) {
  const text = JSON.stringify(payload);
  const qos = options.qos ?? 0;

  return new Promise((resolve, reject) => {
    client.publish(topic, text, { qos, retain: false }, (error) => {
      if (error) {
        reject(error);
        return;
      }

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "published",
        topic,
        qos,
        bytes: Buffer.byteLength(text, "utf8"),
        device_id: payload.device_id,
        event_type: payload.event_type || null,
        event_uuid: payload.event_uuid || null,
      }));
      resolve();
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const clientId = `${env.mqtt.clientId}-publish-test-${Date.now()}`;
  const client = mqtt.connect(env.mqtt.brokerUrl, {
    username: env.mqtt.username || undefined,
    password: env.mqtt.password || undefined,
    clientId,
    reconnectPeriod: 0,
    connectTimeout: env.mqtt.connectTimeoutMs,
    keepalive: env.mqtt.keepaliveSeconds,
    clean: true,
  });

  await new Promise((resolve, reject) => {
    client.once("connect", resolve);
    client.once("error", reject);
  });

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: "connected",
    brokerUrl: env.mqtt.brokerUrl,
    clientId,
    deviceId: options.deviceId,
  }));

  await publishJson(client, topicFor(options.deviceId, "status"), buildStatus(options));

  for (let index = 0; index < options.count; index += 1) {
    await publishJson(
      client,
      topicFor(options.deviceId, "telemetry"),
      buildTelemetry(options, index),
    );
    if (index < options.count - 1) {
      await wait(options.intervalMs);
    }
  }

  if (options.eventType) {
    await publishJson(
      client,
      topicFor(options.deviceId, "events"),
      buildEvent(options),
      { qos: 1 },
    );
  }

  client.end();
}

run().catch((error) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: "publish_test_error",
    error: error.message,
  }));
  process.exit(1);
});
