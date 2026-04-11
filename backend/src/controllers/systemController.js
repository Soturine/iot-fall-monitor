const { asyncHandler } = require("../utils/asyncHandler");
const { getNetworkInfo } = require("../services/systemService");

const networkInfo = asyncHandler(async (req, res) => {
  res.json(getNetworkInfo());
});

module.exports = {
  networkInfo,
};
