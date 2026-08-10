const express = require('express');
const router = express.Router();
const machineController = require('../controllers/machineController');
const { requireSession, requireAdmin, requireSessionOrKey } = require('../middlewares/authMiddleware');

// All machine routes are protected
router.use(requireSessionOrKey);

// Get list of clients
router.get('/', machineController.getAllMachines);

// Get clients with status and risk
router.get('/clients', machineController.getClients);



module.exports = router;
