// ════════════════════════════════════════════════════════════════
// IOC Hunt — Centralised Rate Limiters
// ════════════════════════════════════════════════════════════════
// All limiters use express-rate-limit v8 in-memory store.
// Auth-route limiters (login / MFA / change-password) live in
// authRoutes.js and are imported there directly.
// ════════════════════════════════════════════════════════════════

const rateLimit = require('express-rate-limit');

// ── Helpers ────────────────────────────────────────────────────

function formatRemainingTime(ms) {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0 && seconds > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} and ${seconds} second${seconds !== 1 ? 's' : ''}`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

function rateLimitHandler(label) {
  return (req, res) => {
    const resetTime = req.rateLimit?.resetTime
      ? new Date(req.rateLimit.resetTime).getTime()
      : Date.now() + 15 * 60 * 1000;
    const msRemaining = Math.max(1000, resetTime - Date.now());
    const retrySec = Math.ceil(msRemaining / 1000);
    const msg = `${label}. Please try again in ${formatRemainingTime(msRemaining)}.`;
    res.setHeader('Retry-After', retrySec);
    return res.status(429).json({ error: msg, message: msg, retryAfter: retrySec });
  };
}

// ── 1. Account Creation ────────────────────────────────────────
// Applies to POST /api/users  (admin creating new users)
// Keyed by session user_id so each admin gets their own bucket.
const accountCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 20,                     // 20 new accounts per hour per admin
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.session?.user_id ? `acct_create_${req.session.user_id}` : (req.ip || 'unknown'),
  validate: { default: true, ip: false, keyGeneratorIpFallback: false },
  handler: rateLimitHandler('Too many account creation requests'),
});

// ── 2. Setup Wizard ────────────────────────────────────────────
// Applies to POST /api/instance/setup  (one-time first-run wizard)
// Keyed by IP — setup is unauthenticated.
const setupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 5,                      // 5 setup attempts per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: rateLimitHandler('Too many setup attempts'),
});

// ── 3. Report Generation ───────────────────────────────────────
// Applies to GET /api/reports/generate & /api/reports/baseline
// Reports are CPU/query-heavy so keep the window generous.
const reportGenerationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 15,                     // 15 report requests per 15 min per user
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.session?.user_id ? `report_${req.session.user_id}` : (req.ip || 'unknown'),
  validate: { default: true, ip: false, keyGeneratorIpFallback: false },
  handler: rateLimitHandler('Report generation limit reached'),
});

// ── 4. AI / Heavy-Compute Generation ──────────────────────────
// Placeholder for future AI endpoints (e.g. /api/ai/analyze).
// Apply this to any route that calls an LLM or heavy async job.
const aiGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 30,                     // 30 AI requests per hour per user
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.session?.user_id ? `ai_${req.session.user_id}` : (req.ip || 'unknown'),
  validate: { default: true, ip: false, keyGeneratorIpFallback: false },
  handler: rateLimitHandler('AI generation limit reached. Please try again later'),
});

// ── 5. Aggregator Pairing ──────────────────────────────────────
// Applies to POST /api/aggregators/pair  (public, unauthenticated)
const aggregatorPairLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 10,                     // 10 pairing attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: rateLimitHandler('Too many pairing attempts'),
});

// ── 6. Global API Limiter ──────────────────────────────────────
// Broad defence against scraping / enumeration on all /api/* routes.
// Agent-facing ingestion routes (/api/logs, /api/policy, /api/ingest,
// /api/challenge, /api/ping, /api/status) are skipped via the skip fn.
const AGENT_PATH_PREFIXES = [
  '/api/logs',
  '/api/policy',
  '/api/ingest',
  '/api/challenge',
  '/api/ping',
  '/api/status',
];

const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 500,                    // 500 requests per 15 min per IP (generous for UIs)
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  skip: (req) => {
    // Skip rate limiting for agent pipeline routes
    return AGENT_PATH_PREFIXES.some((prefix) => req.path.startsWith(prefix));
  },
  handler: rateLimitHandler('Too many requests. Please slow down'),
});

module.exports = {
  accountCreationLimiter,
  setupLimiter,
  reportGenerationLimiter,
  aiGenerationLimiter,
  aggregatorPairLimiter,
  globalApiLimiter,
};
