const express = require('express');
const { requireRole } = require('../middlewares/rbac');
const router = express.Router();
const incidentController = require('../controllers/incidentController');
const { requireSession } = require('../middlewares/authMiddleware');

router.use(requireSession);

router.get('/', incidentController.getIncidents);
router.get('/summary', incidentController.getIncidentSummary);
router.post('/', requireRole(['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST', 'ADMIN']), incidentController.createIncident);
router.get('/:id', incidentController.getIncident);
router.patch('/:id', requireRole(['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST', 'ADMIN']), incidentController.updateIncident);
router.post('/:id/assign', requireRole(['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST', 'ADMIN']), incidentController.assignIncident);
router.post('/:id/notes', requireRole(['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST', 'ADMIN']), incidentController.addNote);
router.post('/:id/events', requireRole(['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST', 'ADMIN']), incidentController.linkEvents);
router.delete('/:id', requireRole(['ADMIN']), incidentController.deleteIncident);

module.exports = router;
