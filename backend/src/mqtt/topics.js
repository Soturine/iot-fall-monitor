const { env } = require("../config/env");

function normalizeBase(base) {
  return String(base || env.mqtt.topicBase).replace(/\/+$/, "");
}

function getSubscriptionTopics(base = env.mqtt.topicBase) {
  const topicBase = normalizeBase(base);
  return [
    `${topicBase}/+/events`,
    `${topicBase}/+/status`,
    `${topicBase}/+/telemetry`,
  ];
}

function parseDeviceTopic(topic, base = env.mqtt.topicBase) {
  const normalizedBase = normalizeBase(base);
  const baseParts = normalizedBase.split("/");
  const topicParts = String(topic || "").split("/");

  if (topicParts.length !== baseParts.length + 2) {
    return null;
  }

  for (let index = 0; index < baseParts.length; index += 1) {
    if (topicParts[index] !== baseParts[index]) {
      return null;
    }
  }

  return {
    topic,
    deviceIdentifier: topicParts[baseParts.length],
    channel: topicParts[baseParts.length + 1],
  };
}

module.exports = {
  getSubscriptionTopics,
  parseDeviceTopic,
};
