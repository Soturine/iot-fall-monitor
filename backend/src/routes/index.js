const express = require("express");

const authRoutes = require("./authRoutes");
const deviceRoutes = require("./deviceRoutes");
const eventRoutes = require("./eventRoutes");
const alertRoutes = require("./alertRoutes");
const dashboardRoutes = require("./dashboardRoutes");
const organizationRoutes = require("./organizationRoutes");
const patientRoutes = require("./patientRoutes");
const pairingRoutes = require("./pairingRoutes");
const systemRoutes = require("./systemRoutes");
const { me } = require("../controllers/meController");
const { requireAccessContext } = require("../middlewares/auth");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/pairing", pairingRoutes);
router.get("/me", requireAccessContext, me);
router.use("/devices", requireAccessContext, deviceRoutes);
router.use("/events", requireAccessContext, eventRoutes);
router.use("/alerts", requireAccessContext, alertRoutes);
router.use("/dashboard", requireAccessContext, dashboardRoutes);
router.use("/organization", requireAccessContext, organizationRoutes);
router.use("/patients", requireAccessContext, patientRoutes);
router.use("/system", requireAccessContext, systemRoutes);

module.exports = router;
