const express = require('express');
const router = express.Router();
const ingestController = require('../controllers/ingestController');

// Accept raw gzip body
router.post('/batch', express.raw({ type: 'application/octet-stream', limit: '50mb' }), ingestController.batchIngest);

// Accept JSON forwarded events from branch aggregators
router.post('/events', express.json({ limit: '50mb' }), ingestController.ingestEvents);

// Aggregator incident proxy routes
router.get('/incidents', ingestController.getAggregatorIncidents);
router.get('/incidents/summary', ingestController.getAggregatorIncidentSummary);
router.get('/incidents/:id', ingestController.getAggregatorIncident);

module.exports = router;
