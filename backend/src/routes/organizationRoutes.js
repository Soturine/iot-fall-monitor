const express = require("express");

const organizationController = require("../controllers/organizationController");

const router = express.Router();

router.get("/", organizationController.current);
router.get("/members", organizationController.members);
router.post("/members", organizationController.createOrganizationMember);

module.exports = router;
