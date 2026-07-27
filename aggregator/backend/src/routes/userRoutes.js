const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireSession } = require('../middlewares/authMiddleware');

const { requireRole } = require('../middlewares/rbac');
// Use RBAC middleware for admin-only routes
const requireAdmin = requireRole(['ADMIN']);

router.use(requireSession);
router.get('/', requireSession, userController.getUsers);
router.post('/', requireSession, requireAdmin, userController.createUser);
router.patch('/:id', requireSession, userController.updateUser);
router.delete('/:id', requireSession, requireAdmin, userController.deleteUser);
router.post('/:id/mfa-disable', requireSession, userController.disableMfa);

// MFA Setup for current user
router.get('/mfa/generate', requireSession, userController.generateMfa);
router.post('/mfa/verify', requireSession, userController.verifyMfa);

module.exports = router;
