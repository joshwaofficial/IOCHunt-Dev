const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { requireSession } = require('../middlewares/authMiddleware');

router.use(requireSession);

router.get('/', settingsController.getSettings);
router.post('/pair', settingsController.pairCentral);
router.post('/disconnect', settingsController.disconnectCentral);
router.put('/retention', settingsController.updateRetention);

module.exports = router;
