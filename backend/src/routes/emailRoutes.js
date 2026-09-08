const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const { requireSession, requireAdmin } = require('../middlewares/authMiddleware');

router.use(requireSession);

// SMTP Configuration (admin only)
router.get('/config', requireAdmin, emailController.getSmtpConfig);
router.post('/config', requireAdmin, emailController.updateSmtpConfig);
router.post('/test', requireAdmin, emailController.testSmtp);

// Email Schedules (Admin only for modifications)
router.get('/schedules', emailController.getSchedules);
router.post('/schedules', requireAdmin, emailController.createSchedule);
router.patch('/schedules/:id', requireAdmin, emailController.updateSchedule);
router.delete('/schedules/:id', requireAdmin, emailController.deleteSchedule);
router.post('/schedules/:id/run', requireAdmin, emailController.runSchedule);

module.exports = router;
