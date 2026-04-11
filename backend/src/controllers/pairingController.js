const { asyncHandler } = require("../utils/asyncHandler");
const {
  claimDeviceWithPairingCode,
  syncDevicePatientProfile,
} = require("../services/pairingService");
const { emitScopedEvent } = require("../socket/scopedEmitter");

const claim = asyncHandler(async (req, res) => {
  const result = await claimDeviceWithPairingCode(req.body);

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
  const result = await syncDevicePatientProfile(req.body);
  res.json(result);
});

module.exports = {
  claim,
  syncProfile,
};
