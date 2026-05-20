const mqtt = require("mqtt");

const { env } = require("../src/config/env");
const { getSubscriptionTopics } = require("../src/mqtt/topics");

const MAX_PAYLOAD_PREVIEW_CHARS = 360;

function summarizePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  return {
    device_id: payload.device_id,
    device_uid: payload.device_uid,
    event_type: payload.event_type,
    event_uuid: payload.event_uuid,
    event_sequence: payload.event_sequence,
    sample_seq: payload.sample_seq,
    decision_source: payload.decision_source,
    algorithm_version: payload.algorithm_version,
    timestamp: payload.timestamp,
    ax: payload.ax,
    ay: payload.ay,
    az: payload.az,
    accel_magnitude: payload.accel_magnitude,
    gyro_magnitude: payload.gyro_magnitude,
    sensor_ready: payload.sensor_ready,
    sensor_valid: payload.sensor_valid,
    sensor_read_ok: payload.sensor_read_ok,
    sensor_sample_age_ms: payload.sensor_sample_age_ms,
    i2c_last_error: payload.i2c_last_error,
    wifi_rssi: payload.wifi_rssi,
    battery_percent: payload.battery_percent ?? payload.battery_level,
    online: payload.online,
  };
}

function previewText(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_PAYLOAD_PREVIEW_CHARS) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_PAYLOAD_PREVIEW_CHARS)}...`;
}

function logMessage(topic, payloadBuffer) {
  const payloadText = payloadBuffer.toString("utf8");
  const base = {
    timestamp: new Date().toISOString(),
    topic,
    bytes: payloadBuffer.length,
  };

  try {
    const payload = JSON.parse(payloadText);
    console.log(JSON.stringify({
      ...base,
      json: "ok",
      summary: summarizePayload(payload),
      preview: previewText(payloadText),
    }));
  } catch (error) {
    console.log(JSON.stringify({
      ...base,
      json: "error",
      error: error.message,
      preview: previewText(payloadText),
    }));
  }
}

function main() {
  const topics = getSubscriptionTopics();
  const clientId = `${env.mqtt.clientId}-watch-${Date.now()}`;
  const client = mqtt.connect(env.mqtt.brokerUrl, {
    username: env.mqtt.username || undefined,
    password: env.mqtt.password || undefined,
    clientId,
    reconnectPeriod: env.mqtt.reconnectPeriodMs,
    connectTimeout: env.mqtt.connectTimeoutMs,
    keepalive: env.mqtt.keepaliveSeconds,
    clean: true,
  });

  client.on("connect", () => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "connected",
      brokerUrl: env.mqtt.brokerUrl,
      clientId,
      topics,
    }));

    client.subscribe(topics, (error) => {
      if (error) {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          event: "subscribe_error",
          error: error.message,
        }));
        process.exitCode = 1;
        client.end();
        return;
      }

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "subscribed",
        topics,
      }));
    });
  });

  client.on("message", logMessage);
  client.on("error", (error) => {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "mqtt_error",
      error: error.message,
    }));
  });

  const stop = (signal) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "shutdown",
      signal,
    }));
    client.end(false, () => process.exit(0));
  };

  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
}

main();
