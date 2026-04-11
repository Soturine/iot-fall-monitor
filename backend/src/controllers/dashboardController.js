const { asyncHandler } = require("../utils/asyncHandler");
const {
  getDeviceStatusOverview,
  getRecentAlerts,
  getSummary,
} = require("../services/dashboardService");

const summary = asyncHandler(async (req, res) => {
  const result = await getSummary(req.access);
  res.json(result);
});

const recentAlerts = asyncHandler(async (req, res) => {
  const items = await getRecentAlerts(req.access);
  res.json({ items });
});

const deviceStatus = asyncHandler(async (req, res) => {
  const items = await getDeviceStatusOverview(req.access);
  res.json({ items });
});

module.exports = {
  deviceStatus,
  recentAlerts,
  summary,
};
