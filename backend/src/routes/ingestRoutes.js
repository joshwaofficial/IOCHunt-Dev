const express = require('express');
const router = express.Router();
const ingestController = require('../controllers/ingestController');
const { requireKey } = require('../middlewares/authMiddleware');

// Accept raw gzip body
router.post('/batch', express.raw({ type: 'application/octet-stream', limit: '50mb' }), ingestController.batchIngest);

// Accept JSON forwarded events from branch aggregators
router.post('/events', express.json({ limit: '50mb' }), ingestController.ingestEvents);

// Aggregator incident proxy routes (protected by requireKey so req.tenantId is set)
router.get('/incidents', requireKey, ingestController.getAggregatorIncidents);
router.get('/incidents/summary', requireKey, ingestController.getAggregatorIncidentSummary);
router.get('/incidents/:id', requireKey, ingestController.getAggregatorIncident);

module.exports = router;
