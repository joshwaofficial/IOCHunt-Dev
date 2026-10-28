const express = require('express');
const router = express.Router();
const threatHuntingController = require('../controllers/threatHuntingController');
const { requireSession, requireAdmin } = require('../middlewares/authMiddleware');

router.use(requireSession);

// Status and Threat Hunting Dashboard
router.get('/status', threatHuntingController.getStatus);
router.get('/matches', threatHuntingController.getMatches);
router.get('/indicators', threatHuntingController.getIndicators);

// Administration & Ingestion Management
router.post('/config', requireAdmin, threatHuntingController.saveConfig);
router.post('/sync-now', requireAdmin, threatHuntingController.syncNow);

module.exports = router;
