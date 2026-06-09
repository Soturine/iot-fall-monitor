const { asyncHandler } = require("../utils/asyncHandler");
const {
  archivePatient,
  createPatient,
  getPatientById,
  listPatients,
  updatePatient,
} = require("../services/patientService");

const list = asyncHandler(async (req, res) => {
  const items = await listPatients(req.access, req.query);
  res.json({ items });
});

const archive = asyncHandler(async (req, res) => {
  const patient = await archivePatient(
    Number(req.params.id),
    req.access,
    req.user.id,
  );
  res.json({ patient });
});

const getById = asyncHandler(async (req, res) => {
  const patient = await getPatientById(Number(req.params.id), req.access);
  res.json({ patient });
});

const create = asyncHandler(async (req, res) => {
  const patient = await createPatient(req.body, req.access, req.user.id);
  res.status(201).json({ patient });
});

const update = asyncHandler(async (req, res) => {
  const patient = await updatePatient(Number(req.params.id), req.body, req.access, req.user.id);
  res.json({ patient });
});

module.exports = {
  archive,
  create,
  getById,
  list,
  update,
};
