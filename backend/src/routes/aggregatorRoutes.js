const express = require('express');
const router = express.Router();
const aggregatorController = require('../controllers/aggregatorController');

// Admin generating pairing code
router.post('/generate-code', aggregatorController.generateCode);

// Aggregator consuming pairing code
router.post('/pair', aggregatorController.pair);

// Admin listing aggregators
router.get('/', aggregatorController.getAggregators);

// Admin deleting aggregator
router.delete('/:id', aggregatorController.deleteAggregator);

module.exports = router;
