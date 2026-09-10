// ════════════════════════════════════════════════════════════════
// IOC Hunt — Session Cookie Configuration Helper
// ════════════════════════════════════════════════════════════════

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
  getSessionCookieOptions,
  getClearCookieOptions
};
