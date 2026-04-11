const { asyncHandler } = require("../utils/asyncHandler");
const { toAuthUser } = require("../services/scopeService");

const me = asyncHandler(async (req, res) => {
  const user = toAuthUser(req.access);
  res.json({ user });
});

module.exports = {
  me,
};
