const { asyncHandler } = require("../utils/asyncHandler");
const {
  getEventById,
  listDeviceEvents,
  listEvents,
} = require("../services/eventService");

const list = asyncHandler(async (req, res) => {
  const result = await listEvents(req.query, req.access);
  res.json(result);
});

const getById = asyncHandler(async (req, res) => {
  const event = await getEventById(Number(req.params.id), req.access);
  res.json({ event });
});

const listByDevice = asyncHandler(async (req, res) => {
  const result = await listDeviceEvents(Number(req.params.id), req.query, req.access);
  res.json(result);
});

module.exports = {
  getById,
  list,
  listByDevice,
};
