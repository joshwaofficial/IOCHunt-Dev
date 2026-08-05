const express = require('express');
const router = express.Router();
const fwSourceController = require('../controllers/fwSourceController');
const { requireSession, requireAdmin } = require('../../../middlewares/authMiddleware');

router.use(requireSession);
router.use(requireAdmin);

router.get('/', fwSourceController.getSources);
router.post('/', fwSourceController.addSource);
router.patch('/:id/toggle', fwSourceController.toggleSource);
router.delete('/:id', fwSourceController.deleteSource);

module.exports = router;
