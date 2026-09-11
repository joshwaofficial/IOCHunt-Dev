// ════════════════════════════════════════════════════════════════
// IOC Hunt — Authentication Routes
// ════════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireSession, optionalSession } = require('../middlewares/authMiddleware');
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

// ── Login Rate Limiting ──────────────────────────────────────────
// Handled strictly at the User-Account level in authController.js
// (keyed by workspace:username) so one user failing attempts cannot lock out
// other users in the same organization sharing a corporate NAT/proxy IP.
// A pass-through stub is exported for backwards compatibility.
const loginLimiter = (req, res, next) => next();
loginLimiter.resetKey = () => {};

const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 7,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Key by session user_id (for authenticated users) or challenge token (for pending login MFA)
    if (req.session?.user_id) return `mfa_user_${req.session.user_id}`;
    if (req.body?.tempToken) {
      const token = req.body.tempToken.includes(':') ? req.body.tempToken.split(':')[1] : req.body.tempToken;
      return `mfa_token_${token}`;
    }
    return req.ip || 'unknown';
  },
  validate: { default: true, ip: false, keyGeneratorIpFallback: false },
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
router.post('/login', authController.login);
router.post('/setup-branch', authController.setupBranchNode);
router.post('/mfa/verify', mfaLimiter, authController.mfaVerify);

// Protected authentication routes
router.post('/logout', optionalSession, authController.logout);
router.get('/me', requireSession, authController.me);
router.post('/keep-alive', requireSession, authController.keepAlive);
router.post('/change-password', requireSession, changePasswordLimiter, authController.changePassword);

const { requireCentralServer } = require('../middlewares/modeGuard');
const { requireAdmin } = require('../middlewares/authMiddleware');
router.get('/api-key', requireSession, requireAdmin, authController.getApiKey);

router.mfaLimiter = mfaLimiter;
router.loginLimiter = loginLimiter;
router.formatRemainingTime = formatRemainingTime;

module.exports = router;
