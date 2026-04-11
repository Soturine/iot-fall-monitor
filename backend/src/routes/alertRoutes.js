const express = require("express");

const alertController = require("../controllers/alertController");

const router = express.Router();

router.get("/", alertController.list);
router.get("/:id", alertController.getById);
router.post("/:id/acknowledge", alertController.acknowledge);
router.post("/:id/cancel", alertController.cancel);
router.post("/:id/resolve", alertController.resolve);

module.exports = router;
