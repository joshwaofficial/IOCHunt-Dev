const express = require('express');
const router = express.Router();
const firewallController = require('../controllers/firewallController');
const { requireSession } = require('../middlewares/authMiddleware');

router.use(requireSession);

router.get('/stats', firewallController.getFirewallStats);
router.get('/topology', firewallController.getTopology);
router.get('/devices', firewallController.getDevices);
router.get('/live', firewallController.getLiveEvents);
router.get('/alerts', firewallController.getSecurityAlerts);

module.exports = router;
