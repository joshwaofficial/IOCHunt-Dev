const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const { requireSession } = require('../middlewares/authMiddleware');

router.get('/', requireSession, groupController.getGroups);
router.post('/', requireSession, groupController.createGroup);
router.delete('/:id', requireSession, groupController.deleteGroup);
router.put('/:id/policy', requireSession, groupController.updateGroupPolicy);
router.post('/:id/machines', requireSession, groupController.updateGroupMachines);
router.delete('/:id/machines/:machine', requireSession, groupController.removeMachineFromGroup);

module.exports = router;
