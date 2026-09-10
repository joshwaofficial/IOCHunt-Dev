// ════════════════════════════════════════════════════════════════
// IOC Hunt — Secure CORS Configuration & Middleware
// ════════════════════════════════════════════════════════════════
// Restricts allowed origins strictly to trusted domains.
// Prohibits wildcard (*) origins when credentials are enabled.
// Provides defense-in-depth origin validation for production.
// ════════════════════════════════════════════════════════════════

const cors = require('cors');
const { logSecurityEvent, EVENTS, SEVERITY } = require('../utils/securityLogger');

// Development default trusted origins (only active when NODE_ENV !== 'production')
const DEV_DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4000',
  'http://localhost:4001',
  'http://localhost:4002',
  'http://localhost:8083',
  'http://localhost:9090',
  'http://localhost:80',
  'http://localhost:443',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:4000',
  'http://127.0.0.1:4001',
  'http://127.0.0.1:8083'
];

/**
 * Normalizes an origin string: trims whitespace and removes trailing slashes.
 */
function normalizeOrigin(origin) {
  if (!origin || typeof origin !== 'string') return '';
  return origin.trim().replace(/\/+$/, '').toLowerCase();
}

/**
 * Parses and returns the list of trusted origins from environment variables.
 * Automatically filters out wildcard (*) to prevent credential leakage.
 */
function getTrustedOrigins() {
  const isProduction = process.env.NODE_ENV === 'production';
  const origins = new Set();

  // Parse FRONTEND_URL, CENTRAL_FRONTEND_URL, and ALLOWED_ORIGINS
  const rawSources = [
    process.env.FRONTEND_URL,
    process.env.CENTRAL_FRONTEND_URL,
    process.env.ALLOWED_ORIGINS
  ];

  let wildcardAttempted = false;

  for (const src of rawSources) {
    if (!src) continue;
    // May be comma-separated list of origins
    const parts = src.split(',').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (part === '*') {
        wildcardAttempted = true;
      } else {
        const norm = normalizeOrigin(part);
        if (norm) {
          origins.add(norm);
        }
      }
    }
  }

  if (wildcardAttempted) {
    console.warn('[CORS Security Warning] Insecure wildcard origin (*) was rejected. Wildcard origins cannot be used when credentials are enabled.');
  }

  // Include localhost dev origins only when NOT in production
  if (!isProduction) {
    DEV_DEFAULT_ORIGINS.forEach(o => origins.add(normalizeOrigin(o)));
  } else if (origins.size === 0) {
    console.warn('[CORS Security Warning] No trusted origins configured for production (FRONTEND_URL not set). Cross-origin requests with credentials will be blocked.');
  }

  return Array.from(origins);
}

/**
 * Checks if a requesting origin is in the trusted whitelist.
 */
function isOriginAllowed(requestOrigin, trustedOrigins) {
  if (!requestOrigin) return false;
  const normalized = normalizeOrigin(requestOrigin);
  return trustedOrigins.some(trusted => normalizeOrigin(trusted) === normalized);
}

/**
 * Express CORS middleware factory with strict origin enforcement.
 */
function createCorsMiddleware() {
  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server, endpoint agents)
      if (!origin) {
        return callback(null, true);
      }

      const trusted = getTrustedOrigins();
      if (isOriginAllowed(origin, trusted)) {
        return callback(null, true);
      }

      // Origin is not trusted
      try {
        logSecurityEvent({
          event: EVENTS.AUTH_RATE_LIMIT || 'CORS_POLICY_VIOLATION',
          severity: SEVERITY.WARN,
          details: `Untrusted CORS origin blocked: ${origin}`
        });
      } catch (_) {
        // Fallback if logger is unavailable
        console.warn(`[CORS Blocked] Request from untrusted origin: ${origin}`);
      }

      // Do not reflect the untrusted origin — omitting Access-Control-Allow-Origin
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-API-Key',
      'X-Aggregator-Key',
      'X-CSRF-Token',
      'Accept',
      'Origin',
      'Cache-Control',
      'Pragma'
    ],
    exposedHeaders: ['Content-Length', 'Content-Type'],
    maxAge: 86400, // 24 hours preflight cache
    optionsSuccessStatus: 204
  });
}

module.exports = {
  createCorsMiddleware,
  getTrustedOrigins,
  isOriginAllowed,
  normalizeOrigin
};
