// ════════════════════════════════════════════════════════════════
// IOC Hunt — Mode Guard Middleware
// ════════════════════════════════════════════════════════════════
// Ensures endpoints are only accessible by the appropriate instance mode
// ════════════════════════════════════════════════════════════════

const appMode = require('../config/appMode');

const { parseSessionCookie, getSession } = require('./authMiddleware');

async function requireCentralServer(req, res, next) {
  // Endpoints needed for provisioning and remote branch pairing should always be reachable on Central Server
  if (req.path === '/provision-remote' || req.path === '/pair') {
    return next();
  }
  if (appMode.isCentralServer()) {
    return next();
  }

  let session = req.session;
  if (!session) {
    const token = parseSessionCookie(req) || req.cookies?.iochunt_session;
    if (token) {
      session = await getSession(token);
      if (session) {
        req.session = session;
      }
    }
  }

  const role = session?.role?.toUpperCase();
  if ((role === 'ADMIN' || role === 'SUPERADMIN') && !session?.aggregator_name) {
    return next();
  }

  return res.status(403).json({
    error: 'This feature is only available on a Central Server instance',
    currentMode: appMode.getConfig().mode
  });
}

async function requireAggregator(req, res, next) {
  if (appMode.isAggregator()) {
    return next();
  }

  let session = req.session;
  if (!session) {
    const token = parseSessionCookie(req) || req.cookies?.iochunt_session;
    if (token) {
      session = await getSession(token);
      if (session) {
        req.session = session;
      }
    }
  }

  const role = session?.role?.toUpperCase();
  if (session?.aggregator_name || role === 'AGGREGATOR_ADMIN' || role === 'ADMIN' || role === 'SUPERADMIN') {
    return next();
  }

  return res.status(403).json({
    error: 'This feature is only available on a Branch Aggregator instance or for Branch Administrators',
    currentMode: appMode.getConfig().mode
  });
}

function requireConfigured(req, res, next) {
  if (!appMode.isConfigured()) {
    return res.status(403).json({
      error: 'Instance setup is incomplete. Please complete setup wizard.',
      needsSetup: true
    });
  }
  next();
}

module.exports = {
  requireCentralServer,
  requireAggregator,
  requireConfigured
};
