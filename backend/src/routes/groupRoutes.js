const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const { requireSession, requireAdmin } = require('../middlewares/authMiddleware');

router.get('/', requireSession, groupController.getGroups);
router.post('/', requireSession, requireAdmin, groupController.createGroup);
router.delete('/:id', requireSession, requireAdmin, groupController.deleteGroup);
router.put('/:id/policy', requireSession, requireAdmin, groupController.updateGroupPolicy);
router.post('/:id/machines', requireSession, requireAdmin, groupController.updateGroupMachines);
router.delete('/:id/machines/:machine', requireSession, requireAdmin, groupController.removeMachineFromGroup);

module.exports = router;
