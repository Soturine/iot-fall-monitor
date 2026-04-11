const express = require("express");

const eventController = require("../controllers/eventController");

const router = express.Router();

router.get("/", eventController.list);
router.get("/:id", eventController.getById);

module.exports = router;
