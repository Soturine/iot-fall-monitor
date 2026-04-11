const { env } = require("../config/env");

const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function shouldLog(level) {
  const configured = LEVELS[env.logLevel] ?? LEVELS.info;
  const current = LEVELS[level] ?? LEVELS.info;
  return current <= configured;
}

function log(level, message, metadata = null) {
  if (!shouldLog(level)) {
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    pid: process.pid,
  };

  if (metadata) {
    payload.metadata = metadata;
  }

  const serialized = JSON.stringify(payload);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  console.log(serialized);
}

const logger = {
  info(message, metadata) {
    log("info", message, metadata);
  },
  warn(message, metadata) {
    log("warn", message, metadata);
  },
  error(message, metadata) {
    log("error", message, metadata);
  },
  debug(message, metadata) {
    log("debug", message, metadata);
  },
};

module.exports = {
  logger,
};
