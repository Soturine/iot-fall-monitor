const express = require("express");

const systemController = require("../controllers/systemController");

const router = express.Router();

router.get("/network-info", systemController.networkInfo);

module.exports = router;
