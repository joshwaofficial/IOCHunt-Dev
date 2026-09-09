const express = require('express');
const router = express.Router();
const instanceController = require('../controllers/instanceController');
const { setupLimiter } = require('../middlewares/rateLimiters');

// Public route for checking setup state & instance mode
router.get('/info', instanceController.getInstanceInfo);

// Setup wizard completion endpoint
router.post('/setup', setupLimiter, instanceController.completeSetup);

module.exports = router;
