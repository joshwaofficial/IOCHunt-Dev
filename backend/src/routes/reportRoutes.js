const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { requireSession } = require('../middlewares/authMiddleware');
const { reportGenerationLimiter } = require('../middlewares/rateLimiters');

router.get('/generate', requireSession, reportGenerationLimiter, reportController.generateReport);
router.get('/baseline', requireSession, reportGenerationLimiter, reportController.generateBaseline);

module.exports = router;
