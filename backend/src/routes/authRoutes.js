// ════════════════════════════════════════════════════════════════
// IOC Hunt — Authentication Routes
// ════════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireSession } = require('../middlewares/authMiddleware');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

const mfaLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { message: 'Too many MFA verification attempts. Please try again after 5 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public authentication routes
router.post('/login', loginLimiter, authController.login);
router.post('/setup-branch', loginLimiter, authController.setupBranchNode);
router.post('/mfa/verify', mfaLimiter, authController.mfaVerify);

// Protected authentication routes
router.post('/logout', requireSession, authController.logout);
router.get('/me', requireSession, authController.me);
router.post('/change-password', requireSession, authController.changePassword);

const { requireCentralServer } = require('../middlewares/modeGuard');
const { requireAdmin } = require('../middlewares/authMiddleware');
router.get('/api-key', requireSession, requireAdmin, authController.getApiKey);

module.exports = router;
