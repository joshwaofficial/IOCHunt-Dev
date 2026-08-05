const express = require('express');
const router = express.Router();
const agentLogController = require('../controllers/agentLogController');
const { requireKey } = require('../middlewares/authMiddleware');

// Unified Agent Log Ingestion Endpoint
router.post('/', requireKey, agentLogController.ingestAgentLogs);

module.exports = router;
