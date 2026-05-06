const { transaction } = require("../db/pool");
const { logger } = require("../utils/logger");
const { toBoolean } = require("../utils/formatters");
const {
  isPlausibleDeviceUnixSeconds,
  toDateFromDeviceTimestamp,
} = require("../utils/time");
const {
  getDeviceBehaviorSnapshot,
  getOrCreateDeviceByIdentity,
  upsertDeviceStatus,
} = require("./deviceService");
const {
  recordEventFromMqtt,
  recordTelemetryFromMqtt,
  shouldCreateAlert,
} = require("./eventService");
const { createAlertForEvent } = require("./alertService");
const { emitScopedEvent } = require("../socket/scopedEmitter");
const { runWithKeyedLock } = require("../utils/keyedLock");

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

  return toDateFromDeviceTimestamp(value);
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
      channel: topicInfo.channel,
      payloadBytes: Buffer.byteLength(payloadText || "", "utf8"),
      reason: "invalid_json",
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
      channel: topicInfo.channel,
      payloadKeys: Object.keys(payload || {}),
      reason: "missing_device_id",
    });
    return;
  }

  if (!["events", "status", "telemetry"].includes(topicInfo.channel)) {
    logger.warn("Mensagem MQTT ignorada por canal não suportado.", {
      topic: topicInfo.topic,
      channel: topicInfo.channel,
      reason: "unsupported_channel",
    });
    return;
  }

  if (topicInfo.channel === "status" || topicInfo.channel === "telemetry") {
    logger.info(`MQTT ${topicInfo.channel} recebido.`, {
      topic: topicInfo.topic,
      topicDeviceIdentifier: topicInfo.deviceIdentifier,
      payloadDeviceId: deviceIdentifier,
      deviceUid: deviceUid || null,
    });
  }

  if (
    payload.timestamp != null &&
    !isPlausibleDeviceUnixSeconds(payload.timestamp)
  ) {
    logger.debug("Timestamp MQTT do device ignorado; usando hora do backend.", {
      topic: topicInfo.topic,
      channel: topicInfo.channel,
      payloadDeviceId: deviceIdentifier,
      timestamp: payload.timestamp,
      reason: "implausible_device_timestamp",
    });
  }

  return runWithKeyedLock(`mqtt:${deviceIdentifier}`, async () => {
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
      const deviceLog = {
        id: device.id,
        deviceUid: device.deviceUid,
        deviceIdentifier: device.deviceIdentifier,
        organizationId: currentScope.organizationId,
        patientId: currentScope.patientId,
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
          deviceLog,
          status,
        };
      }

      if (topicInfo.channel === "telemetry") {
        const statusUpdate = await upsertDeviceStatus(
          device.id,
          buildStatusUpdateFromPayload(payload),
          currentScope,
          connection,
          { returnSnapshot: false },
        );

        const telemetry = await recordTelemetryFromMqtt(
          {
            device,
            payload,
          },
          connection,
        );
        const deviceBehavior = await getDeviceBehaviorSnapshot(
          device.id,
          statusUpdate.status,
          connection,
        );

        return {
          channel: "telemetry",
          deviceLog,
          telemetry: {
            ...telemetry,
            deviceIdentifier: device.deviceIdentifier,
            deviceUid: device.deviceUid,
            deviceStatusPatch: statusUpdate.status,
            deviceBehavior,
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
        { returnSnapshot: false },
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
          deviceLog,
          event,
          alert,
        };
      }

      return {
        channel: "events",
        deviceLog,
        event,
        alert: null,
      };
    });

    if (result.channel === "status") {
      logger.info("MQTT status processado.", {
        topic: topicInfo.topic,
        device: result.deviceLog,
        online: result.status.status?.online ?? null,
        lastSeenAt: result.status.status?.lastSeenAt || null,
      });
      if (!result.status.organization?.id) {
        logger.warn("MQTT status processado sem organizacao pareada; realtime tenant nao sera entregue.", {
          topic: topicInfo.topic,
          device: result.deviceLog,
          reason: "device_without_organization_scope",
        });
      }
      emitScopedEvent(io, "device:status", result.status, {
        organizationId: result.status.organization?.id || null,
        patientId: result.status.currentPatient?.id || null,
      });
      return;
    }

    if (result.channel === "telemetry") {
      logger.info("MQTT telemetry processada.", {
        topic: topicInfo.topic,
        device: result.deviceLog,
        telemetryId: result.telemetry.id,
        createdAt: result.telemetry.createdAt,
      });
      if (!result.telemetry.organizationId) {
        logger.warn("MQTT telemetry processada sem organizacao pareada; realtime tenant nao sera entregue.", {
          topic: topicInfo.topic,
          device: result.deviceLog,
          telemetryId: result.telemetry.id,
          reason: "device_without_organization_scope",
        });
      }
      emitScopedEvent(io, "telemetry:new", result.telemetry, {
        organizationId: result.telemetry.organizationId || null,
        patientId: result.telemetry.patientId || null,
      });
      return;
    }

    logger.debug("MQTT event processado.", {
      topic: topicInfo.topic,
      device: result.deviceLog,
      eventId: result.event.id,
      eventType: result.event.eventType,
    });

    if (result.alert) {
      emitScopedEvent(io, "alert:new", result.alert, {
        organizationId: result.alert.organizationId || null,
        patientId: result.alert.patientId || null,
      });
    }
  });
}

module.exports = {
  handleMqttMessage,
};
