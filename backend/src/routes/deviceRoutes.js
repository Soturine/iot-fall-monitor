const express = require("express");

const deviceController = require("../controllers/deviceController");
const eventController = require("../controllers/eventController");

const router = express.Router();

router.get("/", deviceController.list);
router.post("/pairing-sessions", deviceController.createPairing);
router.post("/", deviceController.create);
router.get("/:id", deviceController.getById);
router.put("/:id", deviceController.update);
router.delete("/:id", deviceController.remove);
router.post("/:id/assign-patient", deviceController.assignPatient);
router.get("/:id/events", eventController.listByDevice);

module.exports = router;
