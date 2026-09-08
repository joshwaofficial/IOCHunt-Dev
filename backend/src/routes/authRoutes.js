// ════════════════════════════════════════════════════════════════
// IOC Hunt — Authentication Routes
// ════════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireSession } = require('../middlewares/authMiddleware');
const rateLimit = require('express-rate-limit');

function formatRemainingTime(ms) {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0 && seconds > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} and ${seconds} second${seconds !== 1 ? 's' : ''}`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 7,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: (req, res) => {
    const resetTime = req.rateLimit?.resetTime ? new Date(req.rateLimit.resetTime).getTime() : (Date.now() + 15 * 60 * 1000);
    const msRemaining = Math.max(1000, resetTime - Date.now());
    const formatted = formatRemainingTime(msRemaining);
    const retrySec = Math.ceil(msRemaining / 1000);
    const errorMsg = `Too many login attempts. Please try again in ${formatted}.`;
    res.setHeader('Retry-After', retrySec);
    return res.status(429).json({
      error: errorMsg,
      message: errorMsg,
      retryAfter: retrySec
    });
  }
});

const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 7,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: (req, res) => {
    const resetTime = req.rateLimit?.resetTime ? new Date(req.rateLimit.resetTime).getTime() : (Date.now() + 15 * 60 * 1000);
    const msRemaining = Math.max(1000, resetTime - Date.now());
    const formatted = formatRemainingTime(msRemaining);
    const retrySec = Math.ceil(msRemaining / 1000);
    const errorMsg = `Too many MFA verification attempts. Please try again in ${formatted}.`;
    res.setHeader('Retry-After', retrySec);
    return res.status(429).json({
      error: errorMsg,
      message: errorMsg,
      retryAfter: retrySec
    });
  }
});

const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 7,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.session?.user_id ? `user_${req.session.user_id}` : (req.ip || 'unknown');
  },
  validate: { default: true, ip: false, keyGeneratorIpFallback: false },
  handler: (req, res) => {
    const resetTime = req.rateLimit?.resetTime ? new Date(req.rateLimit.resetTime).getTime() : (Date.now() + 15 * 60 * 1000);
    const msRemaining = Math.max(1000, resetTime - Date.now());
    const formatted = formatRemainingTime(msRemaining);
    const retrySec = Math.ceil(msRemaining / 1000);
    const errorMsg = `Too many password change attempts. Account protection engaged. Please try again in ${formatted}.`;
    res.setHeader('Retry-After', retrySec);
    return res.status(429).json({
      error: errorMsg,
      message: errorMsg,
      retryAfter: retrySec
    });
  }
});

// Public authentication routes
router.post('/login', loginLimiter, authController.login);
router.post('/setup-branch', loginLimiter, authController.setupBranchNode);
router.post('/mfa/verify', mfaLimiter, authController.mfaVerify);

// Protected authentication routes
router.post('/logout', requireSession, authController.logout);
router.get('/me', requireSession, authController.me);
router.post('/change-password', requireSession, changePasswordLimiter, authController.changePassword);

const { requireCentralServer } = require('../middlewares/modeGuard');
const { requireAdmin } = require('../middlewares/authMiddleware');
router.get('/api-key', requireSession, requireAdmin, authController.getApiKey);

router.mfaLimiter = mfaLimiter;
router.loginLimiter = loginLimiter;
router.formatRemainingTime = formatRemainingTime;

module.exports = router;
