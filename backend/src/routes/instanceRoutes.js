// ════════════════════════════════════════════════════════════════
// IOC Hunt — Instance Setup Routes
// ════════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const instanceController = require('../controllers/instanceController');

// Public route for checking setup state & instance mode
router.get('/info', instanceController.getInstanceInfo);

// Setup wizard completion endpoint
router.post('/setup', instanceController.completeSetup);

module.exports = router;
