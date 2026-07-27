const express = require('express');
const router = express.Router();
const machineController = require('../controllers/machineController');
const { requireSession, requireAdmin, requireSessionOrKey } = require('../middlewares/authMiddleware');

// All machine routes are protected
router.use(requireSessionOrKey);

// Get list of clients
router.get('/', machineController.getAllMachines);

// Get machine specific policy
router.get('/:id/policy', machineController.getMachinePolicy);

// Update machine specific policy (Admin only)
router.post('/:id/policy', requireAdmin, machineController.updateMachinePolicy);

module.exports = router;
