const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireSession } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/rbac');

const requireAdmin = requireRole(['ADMIN']);

router.use(requireSession);
router.get('/', userController.getUsers);
router.get('/assignable', userController.getAssignableUsers);
router.post('/', requireAdmin, userController.createUser);
router.patch('/:id', userController.updateUser);
router.delete('/:id', requireAdmin, userController.deleteUser);
router.post('/:id/mfa-disable', userController.disableMfa);

// MFA Setup
router.get('/mfa/generate', userController.generateMfa);
router.post('/mfa/verify', userController.verifyMfa);

module.exports = router;
