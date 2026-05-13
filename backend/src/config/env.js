const path = require("path");

require("dotenv").config({ path: path.resolve(process.cwd(), ".env"), quiet: true });

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toTrimmed(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function toBoolean(value, fallback = false) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function toLogLevel(value, fallback = "info") {
  const normalized = toTrimmed(value, fallback).toLowerCase();
  return ["error", "warn", "info", "debug"].includes(normalized)
    ? normalized
    : fallback;
}

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  port: toNumber(process.env.PORT, 4000),
  jwtSecret: toTrimmed(process.env.JWT_SECRET, "change-me"),
  logLevel: toLogLevel(process.env.LOG_LEVEL, "info"),
  mysql: {
    host: toTrimmed(process.env.MYSQL_HOST, "localhost"),
    port: toNumber(process.env.MYSQL_PORT, 3306),
    user: toTrimmed(process.env.MYSQL_USER, "root"),
    password: process.env.MYSQL_PASSWORD || "",
    database: toTrimmed(process.env.MYSQL_DATABASE, "queda_monitor"),
  },
  mqtt: {
    brokerUrl: toTrimmed(process.env.MQTT_BROKER_URL, "mqtt://localhost:1883"),
    username: process.env.MQTT_USERNAME || "",
    password: process.env.MQTT_PASSWORD || "",
    clientId: toTrimmed(process.env.MQTT_CLIENT_ID, "queda-backend"),
    topicBase: toTrimmed(process.env.MQTT_TOPIC_BASE, "queda/devices"),
    reconnectPeriodMs: toNumber(process.env.MQTT_RECONNECT_PERIOD_MS, 4000),
    connectTimeoutMs: toNumber(process.env.MQTT_CONNECT_TIMEOUT_MS, 30000),
    keepaliveSeconds: toNumber(process.env.MQTT_KEEPALIVE_SECONDS, 60),
    tlsRejectUnauthorized: toBoolean(
      process.env.MQTT_TLS_REJECT_UNAUTHORIZED,
      true,
    ),
    tlsCaFile: toTrimmed(process.env.MQTT_TLS_CA_FILE, ""),
  },
  deviceOfflineThresholdSeconds: toNumber(
    process.env.DEVICE_OFFLINE_THRESHOLD_SECONDS,
    120,
  ),
};

module.exports = {
  env,
};
