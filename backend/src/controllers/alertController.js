const { asyncHandler } = require("../utils/asyncHandler");
const { emitScopedEvent } = require("../socket/scopedEmitter");
const {
  getAlertById,
  listAlerts,
  updateAlertStatus,
} = require("../services/alertService");

const list = asyncHandler(async (req, res) => {
  const result = await listAlerts(req.query, req.access);
  res.json(result);
});

const getById = asyncHandler(async (req, res) => {
  const alert = await getAlertById(Number(req.params.id), req.access);
  res.json({ alert });
});

function createActionHandler(actionType) {
  return asyncHandler(async (req, res) => {
    const alert = await updateAlertStatus(
      Number(req.params.id),
      actionType,
      req.user.id,
      req.body.note,
      req.access,
    );

    emitScopedEvent(req.app.get("io"), "alert:updated", alert, {
      organizationId: alert.organizationId || null,
      patientId: alert.patientId || null,
    });

    res.json({
      alert,
      action: actionType,
    });
  });
}

module.exports = {
  acknowledge: createActionHandler("acknowledge"),
  cancel: createActionHandler("cancel"),
  getById,
  list,
  resolve: createActionHandler("resolve"),
};
