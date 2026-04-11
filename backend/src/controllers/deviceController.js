const { asyncHandler } = require("../utils/asyncHandler");
const { emitScopedEvent } = require("../socket/scopedEmitter");
const {
  assignDeviceToPatient,
  createDevice,
  deleteDevice,
  getDeviceById,
  listDevices,
  updateDevice,
} = require("../services/deviceService");
const { createPairingSession } = require("../services/pairingService");

const list = asyncHandler(async (req, res) => {
  const result = await listDevices(req.query, req.access);
  res.json(result);
});

const getById = asyncHandler(async (req, res) => {
  const result = await getDeviceById(Number(req.params.id), req.access);
  res.json(result);
});

const create = asyncHandler(async (req, res) => {
  const device = await createDevice(req.body, req.user.id, req.access);
  res.status(201).json({ device });
});

const update = asyncHandler(async (req, res) => {
  const device = await updateDevice(Number(req.params.id), req.body, req.user.id, req.access);
  res.json({ device });
});

const remove = asyncHandler(async (req, res) => {
  const device = await deleteDevice(Number(req.params.id), req.user.id, req.access);
  res.json({ device });
});

const assignPatient = asyncHandler(async (req, res) => {
  const device = await assignDeviceToPatient(
    Number(req.params.id),
    req.body,
    req.access,
    req.user.id,
  );

  emitScopedEvent(req.app.get("io"), "device:status", device, {
    organizationId: device.organization?.id || null,
    patientId: device.currentPatient?.id || null,
  });
  res.json({ device });
});

const createPairing = asyncHandler(async (req, res) => {
  const session = await createPairingSession(req.access, req.body, req.user.id);
  res.status(201).json({ session });
});

module.exports = {
  assignPatient,
  create,
  createPairing,
  getById,
  list,
  remove,
  update,
};
