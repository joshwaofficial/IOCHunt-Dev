const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const { requireSession } = require('../middlewares/authMiddleware');

// All event routes are protected
router.use(requireSession);

// Standard logs
router.get('/stats', eventController.getStats);
router.get('/', eventController.getEvents);
router.get('/ad-attacks', eventController.getADAttacks);
router.get('/malicious', eventController.getMaliciousEvents);
router.get('/usb', eventController.getUsbEvents);
router.get('/user-events', eventController.getUserEvents);
router.get('/firewall', eventController.getFirewallEvents);
router.get('/network/topology', eventController.getTopology);
router.get('/clients', eventController.getClients);

// Machine list for dropdowns (used by AllLogs filter)
router.get('/machines', async (req, res) => {
  try {
    const db = require('../config/db');
    const result = await db.query('SELECT DISTINCT machine AS id FROM events WHERE machine IS NOT NULL ORDER BY machine');
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
