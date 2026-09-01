const express = require('express');
const router = express.Router();
const policyController = require('../controllers/policyController');
const { requireSessionOrKey } = require('../middlewares/authMiddleware');

router.get('/', requireSessionOrKey, policyController.getAllPolicies);
router.get('/:machine', requireSessionOrKey, policyController.getMachinePolicy);
router.all('/:machine/current', requireSessionOrKey, policyController.updateMachineCurrentPolicy);
router.all('/:machine/ack', requireSessionOrKey, policyController.ackMachinePolicy);
router.post('/:machine', requireSessionOrKey, policyController.setMachinePolicy);

module.exports = router;
