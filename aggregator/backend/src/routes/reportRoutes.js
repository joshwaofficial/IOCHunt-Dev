const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { requireSession } = require('../middlewares/authMiddleware');

router.get('/generate', requireSession, reportController.generateReport);
router.get('/baseline', requireSession, reportController.generateBaseline);

module.exports = router;
