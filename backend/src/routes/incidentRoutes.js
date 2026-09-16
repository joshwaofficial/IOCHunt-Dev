const express = require('express');
const { requireRole } = require('../middlewares/rbac');
const router = express.Router();
const incidentController = require('../controllers/incidentController');
const { requireSession } = require('../middlewares/authMiddleware');
const appMode = require('../config/appMode');

/**
 * Middleware ensuring incident mutations (creation, updates, assignment, notes/chat, event linking)
 * are strictly restricted to Central Server. Branch Aggregators have read-only access.
 */
function blockAggregatorWrite(req, res, next) {
  const role = req.session?.role?.toUpperCase();
  const isAgg = appMode.isAggregator() || 
                role === 'AGGREGATOR_ADMIN' || 
                Boolean(req.session?.aggregator_name);
  if (isAgg) {
    return res.status(403).json({
      error: 'Forbidden: Incidents are managed centrally. Branch aggregators have read-only access.'
    });
  }
  next();
}

router.use(requireSession);

// Read-only endpoints accessible by both Central Server and Branch Aggregators
router.get('/', incidentController.getIncidents);
router.get('/summary', incidentController.getIncidentSummary);
router.get('/:id', incidentController.getIncident);

// Write/Mutate endpoints strictly blocked on Aggregators
router.post('/', blockAggregatorWrite, requireRole(['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST', 'ADMIN']), incidentController.createIncident);
router.patch('/:id', blockAggregatorWrite, requireRole(['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST', 'ADMIN']), incidentController.updateIncident);
router.post('/:id/assign', blockAggregatorWrite, requireRole(['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST', 'ADMIN']), incidentController.assignIncident);
router.post('/:id/notes', blockAggregatorWrite, requireRole(['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST', 'ADMIN']), incidentController.addNote);
router.post('/:id/events', blockAggregatorWrite, requireRole(['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST', 'ADMIN']), incidentController.linkEvents);

module.exports = router;



