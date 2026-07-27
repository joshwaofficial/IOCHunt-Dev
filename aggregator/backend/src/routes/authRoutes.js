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

// Public routes
router.post('/login', loginLimiter, authController.login);
router.post('/signup', authController.signup);
router.post('/mfa/verify', authController.mfaVerify);

// Protected routes
router.post('/logout', requireSession, authController.logout);
router.get('/me', requireSession, authController.me);

module.exports = router;
