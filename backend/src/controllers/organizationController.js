const { asyncHandler } = require("../utils/asyncHandler");
const {
  createMember,
  getCurrentOrganization,
  listMembers,
} = require("../services/organizationService");

const current = asyncHandler(async (req, res) => {
  const result = await getCurrentOrganization(req.access);
  res.json(result);
});

const members = asyncHandler(async (req, res) => {
  const items = await listMembers(req.access);
  res.json({ items });
});

const createOrganizationMember = asyncHandler(async (req, res) => {
  const member = await createMember(req.access, req.body, req.user.id);
  res.status(201).json({ member });
});

module.exports = {
  createOrganizationMember,
  current,
  members,
};
