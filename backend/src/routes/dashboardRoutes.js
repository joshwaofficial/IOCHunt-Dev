const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Global events & machines
router.get('/machines', dashboardController.getMachines);
router.get('/events', dashboardController.getEvents);
router.get('/events/stats', dashboardController.getStats);
router.get('/events/top-stats', dashboardController.getTopLevelStats);
router.get('/events/network/topology', dashboardController.getNetworkTopology);

// Category specific routes (side-pages)
router.get('/events/ad-attacks', dashboardController.getADAttacks);
router.get('/events/malicious', dashboardController.getMaliciousEvents);
router.get('/events/usb', dashboardController.getUsbEvents);
router.get('/events/user-events', dashboardController.getUserEvents);

module.exports = router;
