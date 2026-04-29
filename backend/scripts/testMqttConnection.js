const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
  quiet: true,
});

const mqtt = require("mqtt");

function toPort(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildBrokerUrl(hostArg, portArg) {
  if (hostArg && /^mqtts?:\/\//i.test(hostArg)) {
    return hostArg;
  }

  if (hostArg) {
    return `mqtt://${hostArg}:${toPort(portArg, 1883)}`;
  }

  return process.env.MQTT_BROKER_URL || "mqtt://127.0.0.1:1883";
}

const brokerUrl = buildBrokerUrl(process.argv[2], process.argv[3]);
const clientId = `queda_mqtt_test_${process.pid}_${Date.now()}`;
const connectTimeoutMs = toPort(process.env.MQTT_CONNECT_TIMEOUT_MS, 5000);
const watchdogTimeoutMs = connectTimeoutMs + 3000;

const client = mqtt.connect(brokerUrl, {
  clientId,
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  clean: true,
  connectTimeout: connectTimeoutMs,
  reconnectPeriod: 0,
});

const watchdog = setTimeout(() => {
  console.error(`[mqtt:test] TIMEOUT sem CONNACK em ${brokerUrl}`);
  client.end(true, () => process.exit(1));
}, watchdogTimeoutMs);

client.on("connect", () => {
  clearTimeout(watchdog);
  console.log(`[mqtt:test] MQTT handshake OK em ${brokerUrl}`);
  client.end(true, () => process.exit(0));
});

client.on("error", (error) => {
  clearTimeout(watchdog);
  console.error(
    `[mqtt:test] MQTT handshake falhou em ${brokerUrl}: ${error.message}`,
  );
  client.end(true, () => process.exit(1));
});
