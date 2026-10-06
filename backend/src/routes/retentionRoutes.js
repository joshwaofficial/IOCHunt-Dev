const express = require('express');
const router = express.Router();
const retentionController = require('../controllers/retentionController');
const { requireSession, requireAdmin } = require('../middlewares/authMiddleware');

router.use(requireSession);
router.use(requireAdmin);

router.get('/status', retentionController.getRetentionStatus);
router.put('/policy', retentionController.updateRetentionPolicy);
router.post('/purge', retentionController.purgeExpiredData);

module.exports = router;
