const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireSession } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/rbac');
const { accountCreationLimiter } = require('../middlewares/rateLimiters');

const requireAdmin = requireRole(['ADMIN']);

router.use(requireSession);
router.get('/session-settings', userController.getSessionSettings);
router.put('/session-settings', requireAdmin, userController.updateSessionSettings);
router.get('/active-sessions', requireAdmin, userController.getActiveSessions);
router.delete('/sessions/:token', requireAdmin, userController.terminateSession);
router.post('/sessions/terminate-all-others', requireAdmin, userController.terminateAllOtherSessions);
router.get('/session-audit-logs', requireAdmin, userController.getSessionAuditLogs);
router.get('/', userController.getUsers);
router.get('/assignable', userController.getAssignableUsers);
router.post('/', requireAdmin, accountCreationLimiter, userController.createUser);
router.patch('/:id', userController.updateUser);
router.delete('/:id', requireAdmin, userController.deleteUser);
router.post('/:id/mfa-disable', userController.disableMfa);

const { mfaLimiter } = require('./authRoutes');

// MFA Setup
router.get('/mfa/generate', userController.generateMfa);
router.post('/mfa/verify', mfaLimiter, userController.verifyMfa);

module.exports = router;
