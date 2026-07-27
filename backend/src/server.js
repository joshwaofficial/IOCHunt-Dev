// ════════════════════════════════════════════════════════════════
// IOC Hunt — Central Server (Dockerized)
// ════════════════════════════════════════════════════════════════
// TLS is handled by Nginx. This is a plain HTTP Express server.
// Docker manages restarts — no PM2 needed.
// ════════════════════════════════════════════════════════════════

const express = require('express');
const helmet = require('helmet');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { requireSession } = require('./middlewares/authMiddleware');

const cors = require('cors');
require('dotenv').config();

const db = require('./config/db');
const sseBroadcaster = require('./services/sseBroadcaster');
const aggregatorRoutes = require('./routes/aggregatorRoutes');
const ingestRoutes = require('./routes/ingestRoutes');

const app = express();

// ── CORS Configuration ─────────────────────────────────────────
// In Docker, Nginx proxies everything. Accept the frontend URL from env.
const frontendUrl = process.env.CENTRAL_FRONTEND_URL || process.env.FRONTEND_URL || '*';
app.use(cors({
  origin: frontendUrl === '*' ? true : [frontendUrl, 'http://localhost:5173', 'http://localhost:9090'],
  credentials: true
}));

app.use(helmet());
app.use(hpp());
app.use(cookieParser());

// ── Routes ──────────────────────────────────────────────────────
// Parse JSON for regular routes
app.use('/api/aggregators', express.json(), aggregatorRoutes);

// Ingestion route handles raw gzip stream internally
app.use('/api/ingest', ingestRoutes);

// SSE Stream
app.get('/api/stream', sseBroadcaster.subscribe);

const dashboardRoutes = require('./routes/dashboardRoutes');
const firewallController = require('./controllers/firewallController');

const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', express.json(), authRoutes);

const userRoutes = require('./routes/userRoutes');
app.use('/api/users', express.json(), userRoutes);
const machineRoutes = require('./routes/machineRoutes');
app.use('/api/machines', express.json(), machineRoutes);
const incidentRoutes = require('./routes/incidentRoutes');
app.use('/api/incidents', express.json(), incidentRoutes);

const reportRoutes = require('./routes/reportRoutes');
app.use('/api/reports', express.json(), reportRoutes);

const emailRoutes = require('./routes/emailRoutes');
app.use('/api/smtp', express.json(), emailRoutes);

// Dashboard endpoints (real DB queries)
app.use('/api', dashboardRoutes);

// Policy and Group routes
const policyRoutes = require('./routes/policyRoutes');
const groupRoutes = require('./routes/groupRoutes');
app.use('/api/policy', express.json(), policyRoutes);
app.use('/api/groups', express.json(), groupRoutes);

// Real Firewall routes
app.get('/api/firewall/devices', firewallController.getDevices);
app.get('/api/firewall/topology', firewallController.getTopology);
app.get('/api/firewall/stats', firewallController.getFirewallStats);
app.get('/api/firewall/alerts', firewallController.getSecurityAlerts);
app.get('/api/firewall/live', firewallController.getLiveEvents);
app.get('/api/incidents/summary', (req, res) => res.json({ open: 0, p1Open: 0, byStatus: [] }));

// ── Health Check (Docker uses this) ─────────────────────────────
app.get('/api/ping', (req, res) => res.json({ ok: true }));

// ── Session Cleanup ─────────────────────────────────────────────
setInterval(async () => {
  try {
    const now = Math.floor(Date.now() / 1000);
    await db.query('DELETE FROM sessions WHERE expires_at < $1', [now]);
  } catch (e) { console.error('[Cleanup Error]', e.message); }
}, 3600000);

// ── Start Server ────────────────────────────────────────────────
const PORT = process.env.CENTRAL_PORT || process.env.PORT || 4001;

const { initSchedules } = require('./utils/emailScheduler');

db.initDB().then(() => {
  // Initialize email schedules cron jobs
  initSchedules().catch(console.error);

  // Single HTTP server — Nginx handles TLS termination
  app.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════════');
    console.log('  IOC Hunt — Central Server');
    console.log(`  Version: ${process.env.APP_VERSION || '1.0.0'}`);
    console.log(`  Port: ${PORT}`);
    console.log('  TLS: Handled by Nginx');
    console.log('  Process Manager: Docker');
    console.log('═══════════════════════════════════════════');
  });
}).catch(err => {
  console.error('[FATAL] Database initialization failed:', err.message);
  process.exit(1);
});
