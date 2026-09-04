// ════════════════════════════════════════════════════════════════
// IOC Hunt — Unified Security Platform Server
// ════════════════════════════════════════════════════════════════
// Supports:
// 1. Dynamic Mode: Central Management Server vs Branch Aggregator
// 2. Separate PostgreSQL Database per Aggregator Node
// 3. First-Time Web Setup Wizard with Mode Selection
// 4. Unified Direct Agent Ingestion (Scenario 2) & Aggregator Ingestion (Scenario 1)
// ════════════════════════════════════════════════════════════════

const express = require('express');
const helmet = require('helmet');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
require('dotenv').config();

// ── Auto-Generate SSL Certificates ─────────────────────────────
try {
  const sslDir = path.join(__dirname, '../../nginx/ssl');
  if (fs.existsSync(sslDir)) {
    const crtPath = path.join(sslDir, 'iochunt.crt');
    const keyPath = path.join(sslDir, 'iochunt.key');
    if (!fs.existsSync(crtPath) || !fs.existsSync(keyPath)) {
      console.log('[Setup] SSL certificates missing. Generating self-signed certificates...');
      execSync(`openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${crtPath}" -days 3650 -nodes -subj "/CN=iochunt-platform/O=DefSecOne/C=IN"`, { stdio: 'ignore' });
      console.log('[Setup] SSL certificates generated successfully.');
    }
  }
} catch (err) {
  console.error('[Setup] Failed to auto-generate SSL certificates:', err.message);
}

const db = require('./config/db');
const appMode = require('./config/appMode');
const { databaseContext } = require('./middlewares/tenantMiddleware');
const { requireCentralServer, requireAggregator } = require('./middlewares/modeGuard');
const { requireSession, requireKey } = require('./middlewares/authMiddleware');
const sseBroadcaster = require('./services/sseBroadcaster');

const app = express();
app.set('trust proxy', 1); // Trust Reverse Proxy X-Forwarded-For

// ── CORS Configuration ─────────────────────────────────────────
const frontendUrl = process.env.CENTRAL_FRONTEND_URL || process.env.FRONTEND_URL || '*';
app.use(cors({
  origin: frontendUrl === '*' ? true : [frontendUrl, 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:9090', 'http://localhost:4000', 'http://localhost:4001', 'http://localhost:80'],
  credentials: true
}));

app.use(helmet({
  contentSecurityPolicy: false // Allows inline assets for frontend dashboard
}));
app.use(hpp());
app.use(cookieParser());

// ── Database Context Middleware ─────────────────────────────────
app.use(databaseContext);

// ── Core Routes ────────────────────────────────────────────────
const instanceRoutes = require('./routes/instanceRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const machineRoutes = require('./routes/machineRoutes');
const incidentRoutes = require('./routes/incidentRoutes');
const reportRoutes = require('./routes/reportRoutes');
const emailRoutes = require('./routes/emailRoutes');
const policyRoutes = require('./routes/policyRoutes');
const groupRoutes = require('./routes/groupRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const firewallController = require('./controllers/firewallController');
const logRoutes = require('./routes/logRoutes');

// Instance Information & Setup Wizard
app.use('/api/instance', express.json(), instanceRoutes);

// Auth & Users
app.use('/api/auth', express.json(), authRoutes);
app.use('/api/users', express.json(), userRoutes);

// Agent Connection Verification Challenge
app.get('/api/challenge', requireKey, (req, res) => {
  const crypto = require('crypto');
  const nonce = req.query.nonce;
  if (!nonce) return res.status(400).json({ error: 'nonce required' });
  
  // Use the raw key provided by the agent in the request to compute the HMAC
  const rawKey = req.headers['x-api-key'] || req.headers['x-aggregator-key'] || req.query.key;
  if (!rawKey) return res.status(401).json({ error: 'missing key' });

  const signature = crypto
    .createHmac('sha256', rawKey)
    .update(nonce)
    .digest('hex');
  res.json({ signature });
});

// Direct Agent Ingestion Endpoint (Scenario 2 or local branch agents)
app.use('/api/logs', express.json({ limit: '50mb' }), logRoutes);

// Machines & Incidents
app.use('/api/machines', express.json(), machineRoutes);
app.use('/api/incidents', express.json(), incidentRoutes);

// Reports & Email Schedules
app.use('/api/reports', express.json(), reportRoutes);
app.use('/api/smtp', express.json(), emailRoutes);

// Policy & Machine Groups
app.use('/api/policy', express.json(), policyRoutes);
app.use('/api/groups', express.json(), groupRoutes);


// Firewall Analytics
app.get('/api/firewall/devices', requireSession, firewallController.getDevices);
app.get('/api/firewall/topology', requireSession, firewallController.getTopology);
app.get('/api/firewall/stats', requireSession, firewallController.getFirewallStats);
app.get('/api/firewall/alerts', requireSession, firewallController.getSecurityAlerts);
app.get('/api/firewall/live', requireSession, firewallController.getLiveEvents);
app.get('/api/firewall/config-info', requireSession, firewallController.getConfigInfo);

// SSE Real-Time Stream
app.get('/api/stream', sseBroadcaster.subscribe);

// ── Central Server Specific Modules ─────────────────────────────
const aggregatorRoutes = require('./routes/aggregatorRoutes');
const ingestRoutes = require('./routes/ingestRoutes');

// Intercept GET /api/aggregators to prevent 403 errors on the frontend when running as an Aggregator
app.get('/api/aggregators', (req, res, next) => {
  const appMode = require('./config/appMode');
  if (!appMode.isCentralServer()) {
    return res.json({ data: [] });
  }
  next();
});

app.use('/api/aggregators', requireCentralServer, express.json(), aggregatorRoutes);
app.use('/api/ingest', requireCentralServer, ingestRoutes); // Handles batch streams

// ── Aggregator Specific Modules ─────────────────────────────────
const aggregatorSettingsRoutes = require('./modules/aggregator/routes/settingsRoutes');
const fwSourceRoutes = require('./modules/aggregator/routes/fwSourceRoutes');

app.use('/api/settings', requireAggregator, express.json(), aggregatorSettingsRoutes);
app.use('/api/fw-sources', requireAggregator, express.json(), fwSourceRoutes);

// ── Health Check ────────────────────────────────────────────────
app.get('/api/ping', (req, res) => {
  const config = appMode.getConfig();
  res.json({
    ok: true,
    mode: config.mode,
    deployment_mode: config.deploymentMode,
    company_id: config.companyId,
    setup_complete: config.setupComplete
  });
});

// ── Server Status (API Status) ──────────────────────────────────
app.get('/api/status', (req, res) => {
  const config = appMode.getConfig();
  res.json({
    status: 'online',
    service: 'IOC Hunt Unified Security Platform',
    mode: config.mode,
    deployment_mode: config.deploymentMode,
    company_name: config.companyName,
    setupCompleted: config.setupComplete,
    version: process.env.APP_VERSION || '2.0.0',
    protocol: process.env.USE_HTTPS !== 'false' ? 'HTTPS (Secure)' : 'HTTP',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/ping',
      instance: '/api/instance/info',
      auth: '/api/auth/login'
    }
  });
});

// Dashboard Metrics (Catch-all for /api routes)
app.use('/api', dashboardRoutes);

// Global Error Handler for malformed JSON payloads
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.warn(`[HTTP] Bad JSON payload received from ${req.ip} on ${req.method} ${req.originalUrl}:`, err.message);
    return res.status(400).json({ error: 'Malformed JSON payload' });
  }
  next(err);
});

// Static Frontend Serving
const staticPath = path.join(__dirname, '../../frontend/dist');
if (process.env.SERVE_STATIC === 'true' || fs.existsSync(staticPath)) {
  app.use(express.static(staticPath));
  app.use((req, res, next) => {
    // Only send index.html for navigation requests that expect HTML
    // Exclude API requests and direct requests for files with extensions (like .js, .css, .png)
    if (req.method === 'GET' && !req.path.startsWith('/api') && req.accepts('html') && !req.path.match(/\.[a-z0-9]+$/i)) {
      const indexPath = path.join(staticPath, 'index.html');
      return res.sendFile(indexPath, err => {
        if (err) next();
      });
    }
    next();
  });
}

// ── Background Session Cleaner (every 15 minutes) ───────────────
setInterval(async () => {
  try {
    const now = Math.floor(Date.now() / 1000);
    await db.query('DELETE FROM sessions WHERE expires_at < $1', [now]);
    await db.query('DELETE FROM mfa_pending WHERE expires_at < $1', [now]);
  } catch (e) {
    console.error('[Cleanup Error]', e.message);
  }
}, 15 * 60 * 1000);

// ── Server Bootstrap & Background Services Initialization ───────
const PORT = process.env.PORT || process.env.CENTRAL_PORT || process.env.AGGREGATOR_PORT || 4001;

const { initSchedules } = require('./utils/emailScheduler');
const { initSyslogReceiver } = require('./utils/syslogReceiver');
const { initSourceWatchers } = require('./utils/fwWatcher');
const { startSyncService } = require('./modules/aggregator/services/syncService');
const { startRetentionService } = require('./modules/aggregator/services/retentionService');
const { ensureCertificates } = require('./utils/certManager');
const { startWorker } = require('./workers/bulkWorker');

const https = require('https');
const http = require('http');

db.initDB().then(async () => {
  // Check and generate TLS certificates
  const certInfo = ensureCertificates();

  // Load instance configuration from DB or Env
  const config = await appMode.loadInstanceConfig(db);

  const useHttps = process.env.USE_HTTPS !== 'false';
  const protocol = useHttps && certInfo?.certPath ? 'HTTPS (Strictly Encrypted)' : 'HTTP';

  console.log('══════════════════════════════════════════════════════');
  console.log(`  IOC Hunt — Unified Security Platform`);
  console.log(`  Instance Mode:   ${config.mode.toUpperCase()}`);
  console.log(`  Deployment:      ${config.deploymentMode.toUpperCase()}`);
  if (config.companyName) {
    console.log(`  Company:         ${config.companyName}`);
  }
  console.log(`  Protocol:        ${protocol}`);
  console.log(`  Setup Completed: ${config.setupComplete ? 'YES' : 'PENDING (Setup Wizard Available)'}`);
  console.log(`  Port:            ${PORT}`);
  console.log('══════════════════════════════════════════════════════');

  // Initialize Email Reporting Schedules
  initSchedules().catch(console.error);

  // If running in Aggregator mode, start local syslog, watchers, and central sync
  if (appMode.isAggregator()) {
    console.log('[Bootstrap] Initializing Aggregator Background Services...');
    initSyslogReceiver().catch(err => console.error('[Syslog Error]', err.message));
    initSourceWatchers().catch(err => console.error('[Watcher Error]', err.message));
    startSyncService();
    startRetentionService();
  }

  // If running in Central Server mode, start multi-tenant syslog and bulk ingest worker
  if (config.mode === 'central_server') {
    console.log('[Bootstrap] Initializing Central SaaS Background Services...');
    initSyslogReceiver().catch(err => console.error('[Syslog Error]', err.message));
    startWorker().catch(err => console.error('[BulkWorker Error]', err.message));
  }

  // Strictly HTTPS Server by default
  let server;
  if (useHttps && certInfo && certInfo.keyPath && certInfo.certPath && fs.existsSync(certInfo.keyPath) && fs.existsSync(certInfo.certPath)) {
    const tlsOptions = {
      key: fs.readFileSync(certInfo.keyPath),
      cert: fs.readFileSync(certInfo.certPath)
    };
    const { getNetworkIps } = require('./utils/networkHelper');
    server = https.createServer(tlsOptions, app);
    server.listen(PORT, '0.0.0.0', () => {
      const ips = getNetworkIps();
      console.log(`[HTTPS] Strictly Secure TLS Server active:`);
      console.log(`  ➜ Local:   https://localhost:${PORT}`);
      ips.forEach(ip => console.log(`  ➜ Network: https://${ip}:${PORT}`));
    });
  } else {
    const { getNetworkIps } = require('./utils/networkHelper');
    server = http.createServer(app);
    server.listen(PORT, '0.0.0.0', () => {
      const ips = getNetworkIps();
      console.log(`[HTTP] Server active:`);
      console.log(`  ➜ Local:   http://localhost:${PORT}`);
      ips.forEach(ip => console.log(`  ➜ Network: http://${ip}:${PORT}`));
    });
  }
}).catch(err => {
  console.error('[FATAL] Initialization failed:', err.message);
  process.exit(1);
});
// Trigger reload: 2026-08-04T22:03:00

