const express = require('express');
const router = express.Router();
const ingestController = require('../controllers/ingestController');
const { requireKey } = require('../middlewares/authMiddleware');

router.post('/', requireKey, ingestController.ingestLogs);

module.exports = router;
