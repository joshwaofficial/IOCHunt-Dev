// ════════════════════════════════════════════════════════════════
// IOC Hunt — Security Headers Middleware
// ════════════════════════════════════════════════════════════════
// Sets comprehensive defense-in-depth HTTP security headers:
// - Content-Security-Policy (CSP) to mitigate XSS and injection
// - X-Content-Type-Options: nosniff to prevent MIME sniffing
// - X-Frame-Options: DENY to prevent clickjacking
// - Strict-Transport-Security (HSTS) for transport security
// - Referrer-Policy: strict-origin-when-cross-origin
// - Permissions-Policy to restrict sensitive browser APIs
// ════════════════════════════════════════════════════════════════

const helmet = require('helmet');

const { getTrustedOrigins } = require('./corsConfig');

/**
 * Builds the CSP directives configuration.
 */
function getCspDirectives() {
  const isProduction = process.env.NODE_ENV === 'production';
  const useHttps = process.env.USE_HTTPS === 'true' || process.env.FORCE_HTTPS === 'true';

  const scriptSrc = ["'self'", "'unsafe-inline'"];
  if (!isProduction) {
    scriptSrc.push("'unsafe-eval'");
  }

  const connectSrc = ["'self'", 'ws:', 'wss:'];
  try {
    const trusted = getTrustedOrigins();
    trusted.forEach(origin => {
      if (!connectSrc.includes(origin) && origin !== '*') {
        connectSrc.push(origin);
      }
    });
  } catch (_) {}

  const directives = {
    defaultSrc: ["'self'"],
    scriptSrc,
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
    imgSrc: ["'self'", 'data:', 'blob:'],
    connectSrc,
    frameAncestors: ["'none'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"]
  };

  // Enforce HTTPS upgrade only when in production HTTPS environment
  if (isProduction && useHttps) {
    directives.upgradeInsecureRequests = [];
  } else {
    directives.upgradeInsecureRequests = null;
  }

  return directives;
}

/**
 * Creates the combined security headers middleware.
 */
function createSecurityHeadersMiddleware(options = {}) {
  const isProduction = process.env.NODE_ENV === 'production';

  // Base Helmet middleware configured for the platform
  const helmetMiddleware = helmet({
    contentSecurityPolicy: {
      directives: options.cspDirectives || getCspDirectives()
    },
    frameguard: {
      action: 'deny' // Sets X-Frame-Options: DENY
    },
    xContentTypeOptions: true, // Sets X-Content-Type-Options: nosniff
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin' // Sets Referrer-Policy: strict-origin-when-cross-origin
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    hidePoweredBy: true,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  });

  // Permissions-Policy header configuration to restrict sensitive hardware and browser APIs
  const permissionsPolicyValue = options.permissionsPolicy || [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'display-capture=()',
    'screen-wake-lock=()',
    'accelerometer=()',
    'gyroscope=()',
    'magnetometer=()'
  ].join(', ');

  return function securityHeaders(req, res, next) {
    // Intercept setHeader to prevent downstream middleware or Express from setting information leakage headers
    const origSetHeader = res.setHeader.bind(res);
    res.setHeader = function (key, val) {
      if (typeof key === 'string') {
        const lower = key.toLowerCase();
        if (lower === 'x-powered-by' || lower === 'server') {
          return;
        }
      }
      return origSetHeader(key, val);
    };

    // Strip identity and version leakage headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');

    // Run Helmet suite
    helmetMiddleware(req, res, (err) => {
      if (err) return next(err);

      // Explicitly enforce required security headers in case of proxy or downstream overrides
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', permissionsPolicyValue);

      // Ensure HSTS is set (especially when running in production or behind TLS proxy)
      if (isProduction || req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      }

      next();
    });
  };
}

module.exports = {
  createSecurityHeadersMiddleware,
  getCspDirectives
};
