const { asyncHandler } = require("../utils/asyncHandler");
const {
  claimDeviceWithPairingCode,
  syncDevicePatientProfile,
} = require("../services/pairingService");
const { emitScopedEvent } = require("../socket/scopedEmitter");

function normalizeClaimPayload(body = {}) {
  return {
    ...body,
    deviceUid: body.device_uid ?? body.deviceUid,
    deviceIdentifier:
      body.device_id ?? body.deviceIdentifier ?? body.deviceId,
    deviceName: body.device_name ?? body.deviceName,
    pairingCode: body.pairing_code ?? body.pairingCode,
  };
}

function normalizeProfileSyncPayload(body = {}) {
  return {
    ...body,
    deviceUid: body.device_uid ?? body.deviceUid,
    deviceIdentifier:
      body.device_id ?? body.deviceIdentifier ?? body.deviceId,
    deviceSyncToken:
      body.device_sync_token ?? body.deviceSyncToken,
  };
}

const claim = asyncHandler(async (req, res) => {
  const result = await claimDeviceWithPairingCode(normalizeClaimPayload(req.body));

  const io = req.app.get("io");
  if (io) {
    emitScopedEvent(io, "device:status", result.device, {
      organizationId: result.device.organization?.id || null,
      patientId: result.device.currentPatient?.id || null,
    });
  }

  res.json(result);
});

const syncProfile = asyncHandler(async (req, res) => {
  const result = await syncDevicePatientProfile(
    normalizeProfileSyncPayload(req.body),
  );
  res.json(result);
});

module.exports = {
  claim,
  syncProfile,
};
