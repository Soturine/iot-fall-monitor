const { env } = require("../config/env");
const { logger } = require("../utils/logger");
const { markDevicesOffline } = require("../services/deviceService");
const { emitScopedEvent } = require("../socket/scopedEmitter");

function startDeviceStatusJob(io) {
  const intervalMs = 30_000;

  const timer = setInterval(async () => {
    try {
      const cutoffDate = new Date(
        Date.now() - env.deviceOfflineThresholdSeconds * 1000,
      );
      const offlineDevices = await markDevicesOffline(cutoffDate);

      offlineDevices.forEach((device) => {
        emitScopedEvent(io, "device:status", device, {
          organizationId: device.organization?.id || null,
          patientId: device.currentPatient?.id || null,
        });
      });
    } catch (error) {
      logger.error("Falha ao atualizar dispositivos offline.", {
        message: error.message,
      });
    }
  }, intervalMs);

  return () => clearInterval(timer);
}

module.exports = {
  startDeviceStatusJob,
};
