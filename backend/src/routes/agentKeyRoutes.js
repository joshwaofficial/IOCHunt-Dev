// ════════════════════════════════════════════════════════════════
// IOC Hunt — Agent Key Management Routes
// ════════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const agentKeyController = require('../controllers/agentKeyController');
const { requireSession, requireAdmin } = require('../middlewares/authMiddleware');

// All agent key management routes require active admin web session
router.use(requireSession, requireAdmin);

// Bulk generate keys
router.post('/generate', agentKeyController.generateKeys);

// Email generated keys CSV securely via SMTP
router.post('/email-keys', agentKeyController.emailKeys);

// List keys and fleet metrics
router.get('/', agentKeyController.listKeys);

// Bulk action on multiple keys (revoke, reset, delete)
router.post('/bulk-action', agentKeyController.bulkAction);

// Revoke a specific key
router.post('/:id/revoke', agentKeyController.revokeKey);

// Reset a key (clear machine binding)
router.post('/:id/reset', agentKeyController.resetKey);

// Delete a key permanently
router.delete('/:id', agentKeyController.deleteKey);

module.exports = router;
