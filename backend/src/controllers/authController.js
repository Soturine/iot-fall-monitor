const { asyncHandler } = require("../utils/asyncHandler");
const { loginUser, registerUser } = require("../services/userService");

const register = asyncHandler(async (req, res) => {
  const result = await registerUser(req.body);
  res.status(201).json(result);
});

const login = asyncHandler(async (req, res) => {
  const result = await loginUser({
    ...req.body,
    organizationId: req.headers["x-organization-id"] || req.body.organizationId || null,
  });
  res.json(result);
});

module.exports = {
  login,
  register,
};
