const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const mqtt = require("mqtt");

const brokerUrl = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
const topicBase = (process.env.MQTT_TOPIC_BASE || "queda/devices").replace(/\/+$/, "");
const username = process.env.MQTT_USERNAME || undefined;
const password = process.env.MQTT_PASSWORD || undefined;
const clientId = `${process.env.MQTT_CLIENT_ID || "queda-backend"}-mock`;
const deviceId = process.argv[2] || "esp32_01";
const deviceUid = `legacy:${deviceId}`;

const client = mqtt.connect(brokerUrl, {
  username,
  password,
  clientId,
});

let temperatureSeed = 27;
let accelSeed = 1.0;

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function publish(channel, payload) {
  const topic = `${topicBase}/${deviceId}/${channel}`;
  client.publish(topic, JSON.stringify(payload));
  console.log(`[mockPublisher] ${topic}`, payload);
}

function randomBetween(min, max, precision = 2) {
  const factor = 10 ** precision;
  return Math.round((Math.random() * (max - min) + min) * factor) / factor;
}

function publishStatus() {
  publish("status", {
    device_uid: deviceUid,
    device_id: deviceId,
    event_type: "device_status",
    timestamp: nowUnix(),
    accel_magnitude: accelSeed,
    gyro_magnitude: randomBetween(4, 22, 2),
    immobility_confirmed: false,
    battery_level: Math.max(48, Math.min(100, 92 - Math.floor(Math.random() * 10))),
    wifi_rssi: -1 * Math.floor(randomBetween(47, 76, 0)),
    firmware_version: "1.0.0",
    buffered_events: 0,
    sensor_ready: true,
    sensor_valid: true,
    sensor_read_ok: true,
    sensor_sample_age_ms: 0,
    sensor_failures: 0,
    i2c_error_count: 0,
    i2c_recovery_count: 0,
    i2c_last_error: "none",
  });
}

function publishTelemetry() {
  accelSeed = randomBetween(0.92, 1.28, 3);
  temperatureSeed = randomBetween(26.5, 29.3, 2);

  publish("telemetry", {
    device_uid: deviceUid,
    device_id: deviceId,
    timestamp: nowUnix(),
    ax: randomBetween(-0.22, 0.22, 3),
    ay: randomBetween(-0.24, 0.24, 3),
    az: accelSeed,
    gx: randomBetween(-18, 18, 2),
    gy: randomBetween(-16, 16, 2),
    gz: randomBetween(-14, 14, 2),
    accel_magnitude: accelSeed,
    gyro_magnitude: randomBetween(2, 24, 2),
    pitch_deg: randomBetween(-12, 12, 2),
    roll_deg: randomBetween(-18, 18, 2),
    temperature: temperatureSeed,
    sensor_ready: true,
    sensor_valid: true,
    sensor_read_ok: true,
    sensor_sample_age_ms: 0,
    sensor_failures: 0,
    i2c_error_count: 0,
    i2c_recovery_count: 0,
    i2c_last_error: "none",
  });
}

function publishAlert() {
  const fallDetected = Math.random() > 0.4;

  publish("events", {
    device_uid: deviceUid,
    device_id: deviceId,
    event_type: fallDetected ? "fall_detected" : "sos_pressed",
    timestamp: nowUnix(),
    accel_magnitude: fallDetected ? randomBetween(2.8, 5.4, 2) : randomBetween(0.9, 1.4, 2),
    gyro_magnitude: fallDetected ? randomBetween(130, 260, 2) : randomBetween(12, 40, 2),
    immobility_confirmed: fallDetected,
    battery_level: Math.max(48, Math.min(100, 92 - Math.floor(Math.random() * 10))),
    message: fallDetected
      ? "Queda simulada com possível imobilidade."
      : "SOS manual simulado.",
  });
}

client.on("connect", () => {
  console.log(`[mockPublisher] Connected to ${brokerUrl} as ${clientId}`);

  publishStatus();
  publishTelemetry();

  setInterval(publishTelemetry, 2000);
  setInterval(publishStatus, 15000);
  setInterval(() => {
    if (Math.random() > 0.7) {
      publishAlert();
    }
  }, 12000);
});

client.on("error", (error) => {
  console.error("[mockPublisher] MQTT error:", error.message);
});
