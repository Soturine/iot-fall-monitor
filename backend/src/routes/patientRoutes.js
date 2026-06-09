const express = require("express");

const patientController = require("../controllers/patientController");

const router = express.Router();

router.get("/", patientController.list);
router.post("/", patientController.create);
router.get("/:id", patientController.getById);
router.put("/:id", patientController.update);
router.post("/:id/archive", patientController.archive);

module.exports = router;
