// ════════════════════════════════════════════════════════════════
// IOC Hunt — Aggregator Routes (Central Server Mode Only)
// ════════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const aggregatorController = require('../controllers/aggregatorController');
const { requireSession, requireAdmin } = require('../middlewares/authMiddleware');

// Admin creating a new aggregator (with separate database)
router.post('/', requireSession, requireAdmin, aggregatorController.createAggregator);

// Admin generating pairing code for an aggregator
router.post('/generate-code', requireSession, requireAdmin, aggregatorController.generateCode);

// Aggregator node consuming pairing code (public/unauthenticated endpoint)
router.post('/pair', aggregatorController.pair);


// Admin listing aggregators & health
router.get('/', requireSession, aggregatorController.getAggregators);

// View logs for a specific aggregator
router.get('/:id/logs', requireSession, aggregatorController.getAggregatorLogs);

// Admin deleting aggregator
router.delete('/:id', requireSession, requireAdmin, aggregatorController.deleteAggregator);

module.exports = router;
