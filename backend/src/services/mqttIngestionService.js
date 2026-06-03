const { transaction } = require("../db/pool");
const {
  createCorrelationId,
  elapsedMsSince,
} = require("../utils/correlation");
const { logger } = require("../utils/logger");
const { toBoolean, toNullableNumber } = require("../utils/formatters");
const { resolveRealtimeMqttTimestamp } = require("../utils/time");
const {
  getDeviceBehaviorSnapshot,
  getOrCreateDeviceByIdentity,
  upsertDeviceStatus,
} = require("./deviceService");
const {
  recordEventFromMqtt,
  recordTelemetryFromMqtt,
  shouldCreateAlert,
  shouldCreateAlertForEvent,
  validateTelemetryPayload,
} = require("./eventService");
const { createAlertForEvent } = require("./alertService");
const { emitScopedEvent } = require("../socket/scopedEmitter");
const { runWithKeyedLock } = require("../utils/keyedLock");

function buildStatusUpdateFromPayload(payload, receivedAt, diagnostics = {}) {
  return {
    online: payload.online === undefined ? true : toBoolean(payload.online),
    wifiRssi: toNullableNumber(payload.wifi_rssi),
    batteryPercent: toNullableNumber(payload.battery_percent ?? payload.battery_level),
    firmwareVersion: payload.firmware_version ? String(payload.firmware_version) : null,
    lastSeenAt: receivedAt,
    sensorReady: payload.sensor_ready,
    sensorValid: payload.sensor_valid,
    sensorReadOk: payload.sensor_read_ok,
    sensorSampleAgeMs: toNullableNumber(payload.sensor_sample_age_ms),
    sensorFailures: toNullableNumber(payload.sensor_failures),
    i2cErrorCount: toNullableNumber(payload.i2c_error_count),
    i2cRecoveryCount: toNullableNumber(payload.i2c_recovery_count),
    i2cLastError: payload.i2c_last_error ? String(payload.i2c_last_error) : null,
    lastStatusTopic: diagnostics.lastStatusTopic || null,
    lastTelemetryTopic: diagnostics.lastTelemetryTopic || null,
    lastEventTopic: diagnostics.lastEventTopic || null,
    lastTelemetryAt: diagnostics.lastTelemetryAt || null,
    lastEventAt: diagnostics.lastEventAt || null,
  };
}

function buildTelemetryLogSummary(payload) {
  return {
    ax: toNullableNumber(payload.ax),
    ay: toNullableNumber(payload.ay),
    az: toNullableNumber(payload.az),
    gx: toNullableNumber(payload.gx),
    gy: toNullableNumber(payload.gy),
    gz: toNullableNumber(payload.gz),
    accelMagnitude: toNullableNumber(payload.accel_magnitude),
    gyroMagnitude: toNullableNumber(payload.gyro_magnitude),
    sensorReady: payload.sensor_ready === undefined ? null : toBoolean(payload.sensor_ready),
    sensorValid: payload.sensor_valid === undefined ? null : toBoolean(payload.sensor_valid),
    sensorReadOk: payload.sensor_read_ok === undefined ? null : toBoolean(payload.sensor_read_ok),
    sampleAgeMs: toNullableNumber(payload.sensor_sample_age_ms),
    i2cLastError: payload.i2c_last_error ? String(payload.i2c_last_error) : null,
  };
}

async function handleMqttMessage({ topicInfo, payloadText, io }) {
  const correlationId = createCorrelationId("mqtt");
  const messageStartedAt = process.hrtime.bigint();
  const receivedAt = new Date();
  const payloadBytes = Buffer.byteLength(payloadText || "", "utf8");
  let payload;

  try {
    payload = JSON.parse(payloadText);
  } catch (error) {
    logger.warn("Mensagem MQTT ignorada por JSON inválido.", {
      topic: topicInfo.topic,
      channel: topicInfo.channel,
      correlationId,
      payloadBytes,
      reason: "invalid_json",
      durationMs: elapsedMsSince(messageStartedAt),
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
      correlationId,
      payloadKeys: Object.keys(payload || {}),
      payloadBytes,
      reason: "missing_device_id",
      durationMs: elapsedMsSince(messageStartedAt),
    });
    return;
  }

  if (!["events", "status", "telemetry"].includes(topicInfo.channel)) {
    logger.warn("Mensagem MQTT ignorada por canal não suportado.", {
      topic: topicInfo.topic,
      channel: topicInfo.channel,
      correlationId,
      payloadBytes,
      reason: "unsupported_channel",
      durationMs: elapsedMsSince(messageStartedAt),
    });
    return;
  }

  if (
    topicInfo.deviceIdentifier &&
    payload.device_id &&
    String(topicInfo.deviceIdentifier) !== String(payload.device_id)
  ) {
    logger.warn("MQTT device_id do payload diverge do device no topico.", {
      topic: topicInfo.topic,
      channel: topicInfo.channel,
      topicDeviceIdentifier: topicInfo.deviceIdentifier,
      payloadDeviceId: deviceIdentifier,
      deviceUid: deviceUid || null,
      correlationId,
      payloadBytes,
      reason: "topic_payload_device_mismatch",
    });
  }

  const timestampResolution = resolveRealtimeMqttTimestamp(payload.timestamp, receivedAt);

  if (timestampResolution.reason) {
    logger.info("Timestamp MQTT normalizado para hora de recebimento do backend.", {
      topic: topicInfo.topic,
      channel: topicInfo.channel,
      payloadDeviceId: deviceIdentifier,
      timestamp: payload.timestamp,
      correlationId,
      reason: timestampResolution.reason,
      skewSeconds: timestampResolution.skewSeconds,
      receivedAt: receivedAt.toISOString(),
    });
  }

  logger.info(`MQTT ${topicInfo.channel} recebido.`, {
    topic: topicInfo.topic,
    channel: topicInfo.channel,
    topicDeviceIdentifier: topicInfo.deviceIdentifier,
    payloadDeviceId: deviceIdentifier,
    deviceUid: deviceUid || null,
    eventType: topicInfo.channel === "events" ? payload.event_type || "device_event" : null,
    correlationId,
    payloadBytes,
    receivedAt: receivedAt.toISOString(),
    timestampSource: timestampResolution.source,
  });

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
        correlationId,
      };

      if (topicInfo.channel === "status") {
        logger.info("MQTT status recebido com escopo resolvido.", {
          topic: topicInfo.topic,
          topicDeviceIdentifier: topicInfo.deviceIdentifier,
          payloadDeviceId: deviceIdentifier,
          payloadDeviceUid: deviceUid || null,
          organizationId: currentScope.organizationId,
          patientId: currentScope.patientId,
          assignmentHistoryId: currentScope.assignmentHistoryId,
          sensorReady: payload.sensor_ready === undefined ? null : toBoolean(payload.sensor_ready),
          sensorValid: payload.sensor_valid === undefined ? null : toBoolean(payload.sensor_valid),
          sensorReadOk: payload.sensor_read_ok === undefined ? null : toBoolean(payload.sensor_read_ok),
          sampleAgeMs: toNullableNumber(payload.sensor_sample_age_ms),
          i2cLastError: payload.i2c_last_error || null,
          correlationId,
        });

        const status = await upsertDeviceStatus(
          device.id,
          buildStatusUpdateFromPayload(payload, receivedAt, {
            lastStatusTopic: topicInfo.topic,
          }),
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
        const telemetryValidation = validateTelemetryPayload(payload);

        logger.info("MQTT telemetry recebida com escopo resolvido.", {
          topic: topicInfo.topic,
          topicDeviceIdentifier: topicInfo.deviceIdentifier,
          payloadDeviceId: deviceIdentifier,
          payloadDeviceUid: deviceUid || null,
          organizationId: currentScope.organizationId,
          patientId: currentScope.patientId,
          assignmentHistoryId: currentScope.assignmentHistoryId,
          validation: telemetryValidation,
          sample: buildTelemetryLogSummary(payload),
          correlationId,
        });

        if (!telemetryValidation.valid) {
          const status = await upsertDeviceStatus(
            device.id,
            buildStatusUpdateFromPayload(payload, receivedAt, {
              lastTelemetryTopic: topicInfo.topic,
            }),
            currentScope,
            connection,
          );

          return {
            channel: "telemetry_skipped",
            deviceLog,
            status,
            validation: telemetryValidation,
          };
        }

        const statusUpdate = await upsertDeviceStatus(
          device.id,
          buildStatusUpdateFromPayload(payload, receivedAt, {
            lastTelemetryTopic: topicInfo.topic,
            lastTelemetryAt: receivedAt,
          }),
          currentScope,
          connection,
          { returnSnapshot: false },
        );

        const telemetry = await recordTelemetryFromMqtt(
          {
            device,
            payload,
            correlationId,
            createdAt: timestampResolution.date,
            receivedAt,
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
          lastSeenAt: receivedAt,
          lastEventTopic: topicInfo.topic,
          lastEventAt: receivedAt,
        },
        currentScope,
        connection,
        { returnSnapshot: false },
      );

      const event = await recordEventFromMqtt(
        {
          device,
          payload,
          correlationId,
          eventTime: timestampResolution.date,
          receivedAt,
        },
        connection,
      );

      logger.info("MQTT event recebido com escopo resolvido.", {
        topic: topicInfo.topic,
        topicDeviceIdentifier: topicInfo.deviceIdentifier,
        payloadDeviceId: deviceIdentifier,
        payloadDeviceUid: deviceUid || null,
        organizationId: currentScope.organizationId,
        patientId: currentScope.patientId,
        assignmentHistoryId: currentScope.assignmentHistoryId,
        eventType: event.eventType,
        eventId: event.id,
        eventUuid: event.eventUuid || null,
        sampleSeq: event.sampleSeq ?? null,
        deduplicated: Boolean(event.deduplicated),
        evidenceStatus: event.evidenceStatus,
        evidenceSampleCount: event.evidenceSampleCount,
        alertCandidate: shouldCreateAlert(event.eventType),
        correlationId,
      });

      if (event.deduplicated) {
        return {
          channel: "events_duplicate",
          deviceLog,
          event,
          alert: null,
        };
      }

      if (shouldCreateAlertForEvent(event)) {
        const alert = await createAlertForEvent(event, connection, {
          correlationId,
          dedupeRecentFallAlert: true,
        });

        return {
          channel: "events",
          deviceLog,
          event,
          alert,
        };
      }

      if (shouldCreateAlert(event.eventType) && event.eventType === "fall_detected") {
        logger.warn("Alerta de queda bloqueado por evidencia insuficiente.", {
          topic: topicInfo.topic,
          correlationId,
          device: deviceLog,
          eventId: event.id,
          eventType: event.eventType,
          evidenceStatus: event.evidenceStatus,
          evidenceSampleCount: event.evidenceSampleCount,
        });
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
        correlationId,
        device: result.deviceLog,
        online: result.status.status?.online ?? null,
        lastSeenAt: result.status.status?.lastSeenAt || null,
        realtimeEvent: "device:status",
        durationMs: elapsedMsSince(messageStartedAt),
      });
      if (!result.status.organization?.id) {
        logger.warn("MQTT status processado sem organizacao pareada; realtime tenant nao sera entregue.", {
          topic: topicInfo.topic,
          correlationId,
          device: result.deviceLog,
          reason: "device_without_organization_scope",
          durationMs: elapsedMsSince(messageStartedAt),
        });
      }
      emitScopedEvent(io, "device:status", result.status, {
        organizationId: result.status.organization?.id || null,
        patientId: result.status.currentPatient?.id || null,
      }, { correlationId });
      return;
    }

    if (result.channel === "telemetry_skipped") {
      logger.warn("MQTT telemetry ignorada sem gravar telemetry_logs.", {
        topic: topicInfo.topic,
        correlationId,
        device: result.deviceLog,
        validation: result.validation,
        realtimeEvent: "device:status",
        durationMs: elapsedMsSince(messageStartedAt),
      });
      emitScopedEvent(io, "device:status", result.status, {
        organizationId: result.status.organization?.id || null,
        patientId: result.status.currentPatient?.id || null,
      }, { correlationId });
      return;
    }

    if (result.channel === "telemetry") {
      logger.info("MQTT telemetry processada.", {
        topic: topicInfo.topic,
        correlationId,
        device: result.deviceLog,
        telemetryId: result.telemetry.id,
        createdAt: result.telemetry.createdAt,
        ax: result.telemetry.ax,
        ay: result.telemetry.ay,
        az: result.telemetry.az,
        gx: result.telemetry.gx,
        gy: result.telemetry.gy,
        gz: result.telemetry.gz,
        wroteTelemetryLog: true,
        realtimeEvent: "telemetry:new",
        durationMs: elapsedMsSince(messageStartedAt),
      });
      if (!result.telemetry.organizationId) {
        logger.warn("MQTT telemetry processada sem organizacao pareada; realtime tenant nao sera entregue.", {
          topic: topicInfo.topic,
          correlationId,
          device: result.deviceLog,
          telemetryId: result.telemetry.id,
          reason: "device_without_organization_scope",
          durationMs: elapsedMsSince(messageStartedAt),
        });
      }
      emitScopedEvent(io, "telemetry:new", result.telemetry, {
        organizationId: result.telemetry.organizationId || null,
        patientId: result.telemetry.patientId || null,
      }, { correlationId });
      return;
    }

    if (result.channel === "events_duplicate") {
      logger.info("MQTT event duplicado ignorado sem criar alerta.", {
        topic: topicInfo.topic,
        correlationId,
        device: result.deviceLog,
        eventId: result.event.id,
        eventType: result.event.eventType,
        eventUuid: result.event.eventUuid || null,
        duplicateReason: result.event.duplicateReason || "event_uuid",
        alertCreated: false,
        realtimeEvent: null,
        durationMs: elapsedMsSince(messageStartedAt),
      });
      return;
    }

    logger.info("MQTT event processado.", {
      topic: topicInfo.topic,
      correlationId,
      device: result.deviceLog,
      eventId: result.event.id,
      eventType: result.event.eventType,
      eventUuid: result.event.eventUuid || null,
      sampleSeq: result.event.sampleSeq ?? null,
      evidenceStatus: result.event.evidenceStatus,
      evidenceSampleCount: result.event.evidenceSampleCount,
      alertId: result.alert?.id || null,
      alertCreated: Boolean(result.alert),
      realtimeEvent: result.alert ? "alert:new" : null,
      durationMs: elapsedMsSince(messageStartedAt),
    });

    if (result.alert) {
      emitScopedEvent(io, "alert:new", result.alert, {
        organizationId: result.alert.organizationId || null,
        patientId: result.alert.patientId || null,
      }, { correlationId });
    }
  });
}

module.exports = {
  handleMqttMessage,
};
