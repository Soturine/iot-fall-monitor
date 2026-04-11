const express = require("express");

const pairingController = require("../controllers/pairingController");

const router = express.Router();

router.post("/claim", pairingController.claim);
router.post("/device-profile-sync", pairingController.syncProfile);

module.exports = router;
