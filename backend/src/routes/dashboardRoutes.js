const express = require("express");

const dashboardController = require("../controllers/dashboardController");

const router = express.Router();

router.get("/summary", dashboardController.summary);
router.get("/recent-alerts", dashboardController.recentAlerts);
router.get("/device-status", dashboardController.deviceStatus);

module.exports = router;
