// ════════════════════════════════════════════════════════════════
// IOC Hunt — Aggregator Server (Dockerized)
// ════════════════════════════════════════════════════════════════
// TLS is handled by Nginx. This is a plain HTTP Express server.
// Docker manages restarts — no PM2 needed.
// ════════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');

// Load environment variables
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const eventRoutes = require('./routes/eventRoutes');
const machineRoutes = require('./routes/machineRoutes');
const incidentRoutes = require('./routes/incidentRoutes');
const groupRoutes = require('./routes/groupRoutes');
const ingestRoutes = require('./routes/ingestRoutes');
const sseBroadcaster = require('./sse/sseBroadcaster');
const { requireSession } = require('./middlewares/authMiddleware');
const userRoutes = require('./routes/userRoutes');
const emailRoutes = require('./routes/emailRoutes');
const reportRoutes = require('./routes/reportRoutes');
const firewallRoutes = require('./routes/firewallRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const { initSchedules } = require('./utils/emailScheduler');

const app = express();
app.set('trust proxy', 1); // Trust Nginx X-Forwarded-For to prevent rate-limit crashes

app.use(helmet());
app.use(hpp());

// ── CORS Configuration ─────────────────────────────────────────
const frontendUrl = process.env.AGGREGATOR_FRONTEND_URL || process.env.FRONTEND_URL || '*';
app.use(cors({
  origin: frontendUrl === '*' ? true : [frontendUrl, 'http://localhost:5173', 'http://localhost:9090'],
  credentials: true
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    error: 'Too many login attempts, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false
  }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

const policyRoutes = require('./routes/policyRoutes');
const fwSourceRoutes = require('./routes/fwSourceRoutes');

// ── Routes ──────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/machines', machineRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/policy', policyRoutes);
app.use('/api/logs', ingestRoutes);
app.use('/api/users', userRoutes);
app.use('/api/smtp', emailRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/firewall', firewallRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/fw/sources', fwSourceRoutes);

// SSE Setup
app.get('/api/stream', requireSession, sseBroadcaster.subscribe);

// ── Health Check (Docker uses this) ─────────────────────────────
app.get('/api/ping', (req, res) => res.json({ ok: true }));

// ── Server Cert Fingerprint (for agent cert pinning) ────────────
const { requireKey } = require('./middlewares/authMiddleware');

app.get('/api/fingerprint', requireKey, (req, res) => {
  try {
    const certPaths = [
      process.env.CERT_PATH,
      '/etc/nginx/ssl/central.crt',
      './iochunt.crt',
      '../iochunt.crt',
    ].filter(Boolean);

    let certPem = null;
    for (const p of certPaths) {
      try {
        if (fs.existsSync(p)) {
          certPem = fs.readFileSync(p);
          break;
        }
      } catch (_) { }
    }

    if (!certPem) {
      return res.json({ fingerprint: 'N/A — no TLS cert configured', generated: new Date().toISOString() });
    }

    const certDer = crypto.createHash('sha256').update(certPem).digest('hex').toUpperCase();
    const fingerprint = certDer.match(/.{2}/g).join(':');
    res.json({ fingerprint, generated: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Challenge-Response Auth (agent HMAC verification) ───────────
app.get('/api/challenge', requireKey, (req, res) => {
  const nonce = req.query.nonce;
  if (!nonce) return res.status(400).json({ error: 'nonce required' });
  const API_KEY = process.env.API_KEY || process.env.AGGREGATOR_API_KEY || 'iochunt-agent-key-2024';
  const signature = crypto
    .createHmac('sha256', API_KEY)
    .update(nonce)
    .digest('hex');
  res.json({ signature });
});

const { initSourceWatchers } = require('./utils/fwWatcher');
const db = require('./config/db');
let initSyslogReceiver;
try {
  initSyslogReceiver = require('./utils/syslogReceiver').initSyslogReceiver;
} catch (e) {
  console.log('[Syslog] Syslog receiver module not found yet');
}

// ── Session Cleanup ─────────────────────────────────────────────
setInterval(async () => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const info = await db.query('DELETE FROM sessions WHERE expires_at < $1', [now]);
    const mfaInfo = await db.query('DELETE FROM mfa_pending WHERE expires_at < $1', [now]);
    if (info.rowCount > 0 || mfaInfo.rowCount > 0) {
      console.log(`[Cleanup] Purged ${info.rowCount} expired sessions, ${mfaInfo.rowCount} MFA tokens`);
    }
  } catch (e) {
    console.error('[Cleanup Error]', e.message);
  }
}, 3600000); // 1 hour

// ── Start Server ────────────────────────────────────────────────
const PORT = process.env.AGGREGATOR_PORT || process.env.PORT || 4011;

const { startSyncService } = require('./services/syncService');
const { startRetentionService } = require('./services/retentionService');

// Helper to init background services
function initBackgroundServices() {
  initSchedules().catch(console.error);
  initSourceWatchers().catch(console.error);
  if (initSyslogReceiver) initSyslogReceiver().catch(console.error);
  startSyncService();
  startRetentionService();
}

// Single HTTP server — Nginx handles TLS
app.listen(PORT, '0.0.0.0', () => {
  console.log('═══════════════════════════════════════════');
  console.log('  IOC Hunt — Aggregator Server');
  console.log(`  Aggregator: ${process.env.AGGREGATOR_NAME || 'default'}`);
  console.log(`  Version: ${process.env.APP_VERSION || '1.0.0'}`);
  console.log(`  Port: ${PORT}`);
  console.log('  TLS: Handled by Nginx');
  console.log('  Process Manager: Docker');
  console.log('═══════════════════════════════════════════');
  initBackgroundServices();
});
