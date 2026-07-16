const express = require("express");
const router = express.Router();
const controller = require("../controllers/agentController");

router.post("/", controller.handlePergunta);

module.exports = router;
