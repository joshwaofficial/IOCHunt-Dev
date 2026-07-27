const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const { requireSession, requireAdmin } = require('../middlewares/authMiddleware');

router.use(requireSession);

router.get('/config', requireAdmin, emailController.getSmtpConfig);
router.post('/config', requireAdmin, emailController.updateSmtpConfig);
router.post('/test', requireAdmin, emailController.testSmtp);

router.get('/schedules', emailController.getSchedules);
router.post('/schedules', emailController.createSchedule);
router.patch('/schedules/:id', emailController.updateSchedule);
router.delete('/schedules/:id', emailController.deleteSchedule);
router.post('/schedules/:id/run', emailController.runSchedule);

module.exports = router;
