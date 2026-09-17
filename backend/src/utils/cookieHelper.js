const appMode = require('../config/appMode');

const DEFAULT_CENTRAL_COOKIE_NAME = 'iochunt_central_session';
const DEFAULT_AGGREGATOR_COOKIE_NAME = 'iochunt_aggregator_session';
const LEGACY_COOKIE_NAME = 'iochunt_session';

/**
 * Returns the primary session cookie name for the current instance mode.
 * - Central Server: 'iochunt_central_session'
 * - Branch Aggregator: 'iochunt_aggregator_session'
 * Can be overridden globally via process.env.SESSION_COOKIE_NAME.
 *
 * @param {import('express').Request} [req] - Optional request object
 * @returns {string}
 */
function getSessionCookieName(req) {
  if (process.env.SESSION_COOKIE_NAME) {
    return process.env.SESSION_COOKIE_NAME;
  }
  return appMode.isAggregator() ? DEFAULT_AGGREGATOR_COOKIE_NAME : DEFAULT_CENTRAL_COOKIE_NAME;
}

/**
 * Returns candidates of cookie names to check when reading incoming request cookies.
 * Checks the instance-specific cookie first, followed by legacy 'iochunt_session'
 * for backward compatibility with active sessions.
 *
 * @param {import('express').Request} [req] - Optional request object
 * @returns {string[]}
 */
function getCandidateCookieNames(req) {
  const primary = getSessionCookieName(req);
  const candidates = [primary];
  if (primary !== LEGACY_COOKIE_NAME) {
    candidates.push(LEGACY_COOKIE_NAME);
  }
  return candidates;
}

/**
 * Returns cookie names to clear on logout or session reset.
 * Clears the active instance cookie and legacy cookie, but never clears the opposing instance cookie.
 *
 * @param {import('express').Request} [req] - Optional request object
 * @returns {string[]}
 */
function getClearCookieNames(req) {
  return getCandidateCookieNames(req);
}

/**
 * Resolves standard secure cookie options for session management.
 * Enforces:
 * - HttpOnly: true (prevents client-side JavaScript access / XSS theft)
 * - SameSite: 'strict' (prevents CSRF attacks from external contexts)
 * - Secure: true (enforced in production, when behind HTTPS, or when COOKIE_SECURE=true)
 * - Path: '/' (consistent path scoping across the entire dashboard)
 *
 * @param {import('express').Request} [req] - Express request object
 * @param {Object} [extraOptions] - Additional cookie options (e.g. maxAge)
 * @returns {import('express').CookieOptions}
 */
function getSessionCookieOptions(req, extraOptions = {}) {
  const isProduction = process.env.NODE_ENV === 'production';
  const forceSecure = process.env.COOKIE_SECURE === 'true';
  const disableSecure = process.env.COOKIE_SECURE === 'false';

  let isSecure = true;
  if (disableSecure) {
    isSecure = false;
  } else if (!isProduction && !forceSecure) {
    // In local development / test environments without forced HTTPS:
    // Respect req.secure or reverse-proxy proto header
    isSecure = Boolean(req && (req.secure || req.headers?.['x-forwarded-proto'] === 'https'));
  }

  const options = {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'strict',
    path: '/'
  };

  if (extraOptions.maxAge !== undefined && extraOptions.maxAge !== null) {
    options.maxAge = extraOptions.maxAge;
  }

  return options;
}

/**
 * Returns matching options for res.clearCookie to guarantee that
 * modern browsers (Chrome, Safari, Firefox) successfully remove
 * the session cookie rather than ignoring the instruction.
 *
 * @param {import('express').Request} [req] - Express request object
 * @returns {import('express').CookieOptions}
 */
function getClearCookieOptions(req) {
  return getSessionCookieOptions(req);
}

module.exports = {
  DEFAULT_CENTRAL_COOKIE_NAME,
  DEFAULT_AGGREGATOR_COOKIE_NAME,
  LEGACY_COOKIE_NAME,
  getSessionCookieName,
  getCandidateCookieNames,
  getClearCookieNames,
  getSessionCookieOptions,
  getClearCookieOptions
};

