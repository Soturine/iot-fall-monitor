const { transaction } = require("../db/pool");
const { logger } = require("../utils/logger");
const { toBoolean } = require("../utils/formatters");
const { toDateFromUnixSeconds } = require("../utils/time");
const {
  getOrCreateDeviceByIdentity,
  getDeviceStatusSnapshot,
  upsertDeviceStatus,
} = require("./deviceService");
const {
  recordEventFromMqtt,
  recordTelemetryFromMqtt,
  shouldCreateAlert,
} = require("./eventService");
const { createAlertForEvent } = require("./alertService");
const { emitScopedEvent } = require("../socket/scopedEmitter");

function toNullableNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTimestamp(value) {
  if (value == null) {
    return new Date();
  }

  return toDateFromUnixSeconds(value);
}

function buildStatusUpdateFromPayload(payload) {
  return {
    online: payload.online === undefined ? true : toBoolean(payload.online),
    wifiRssi: toNullableNumber(payload.wifi_rssi),
    batteryPercent: toNullableNumber(payload.battery_percent ?? payload.battery_level),
    firmwareVersion: payload.firmware_version ? String(payload.firmware_version) : null,
    lastSeenAt: normalizeTimestamp(payload.timestamp),
  };
}

async function handleMqttMessage({ topicInfo, payloadText, io }) {
  let payload;

  try {
    payload = JSON.parse(payloadText);
  } catch (error) {
    logger.warn("Mensagem MQTT ignorada por JSON inválido.", {
      topic: topicInfo.topic,
      payloadText,
    });
    return;
  }

  const deviceIdentifier = String(
    payload.device_id || topicInfo.deviceIdentifier || "",
  ).trim();
  const deviceUid = String(payload.device_uid || "").trim();

  if (!deviceIdentifier) {
    logger.warn("Mensagem MQTT ignorada sem device_id.", {
      topic: topicInfo.topic,
      payload,
    });
    return;
  }

  const result = await transaction(async (connection) => {
    const device = await getOrCreateDeviceByIdentity(
      {
        deviceUid,
        deviceIdentifier,
        name: payload.device_name || payload.name || deviceIdentifier,
      },
      connection,
    );

    const currentScope = {
      organizationId: device.organization?.id || null,
      patientId: device.currentPatient?.id || null,
      assignmentHistoryId: device.currentAssignmentHistoryId || null,
    };

    if (topicInfo.channel === "status") {
      const status = await upsertDeviceStatus(
        device.id,
        buildStatusUpdateFromPayload(payload),
        currentScope,
        connection,
      );

      return {
        channel: "status",
        status,
      };
    }

    if (topicInfo.channel === "telemetry") {
      await upsertDeviceStatus(
        device.id,
        {
          online: true,
          lastSeenAt: normalizeTimestamp(payload.timestamp),
        },
        currentScope,
        connection,
      );

      const telemetry = await recordTelemetryFromMqtt(
        {
          device,
          payload,
        },
        connection,
      );
      const deviceSnapshot = await getDeviceStatusSnapshot(device.id, connection);

      return {
        channel: "telemetry",
        telemetry: {
          ...telemetry,
          deviceIdentifier,
          deviceBehavior: deviceSnapshot.behavior,
        },
      };
    }

    await upsertDeviceStatus(
      device.id,
      {
        online: true,
        lastSeenAt: normalizeTimestamp(payload.timestamp),
      },
      currentScope,
      connection,
    );

    const event = await recordEventFromMqtt(
      {
        device,
        payload,
      },
      connection,
    );

    if (shouldCreateAlert(event.eventType)) {
      const alert = await createAlertForEvent(event.id, connection);

      return {
        channel: "events",
        event,
        alert,
      };
    }

    return {
      channel: "events",
      event,
      alert: null,
    };
  });

  if (result.channel === "status") {
    emitScopedEvent(io, "device:status", result.status, {
      organizationId: result.status.organization?.id || null,
      patientId: result.status.currentPatient?.id || null,
    });
    return;
  }

  if (result.channel === "telemetry") {
    emitScopedEvent(io, "telemetry:new", result.telemetry, {
      organizationId: result.telemetry.organizationId || null,
      patientId: result.telemetry.patientId || null,
    });
    return;
  }

  if (result.alert) {
    emitScopedEvent(io, "alert:new", result.alert, {
      organizationId: result.alert.organizationId || null,
      patientId: result.alert.patientId || null,
    });
  }
}

module.exports = {
  handleMqttMessage,
};
