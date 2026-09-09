// ════════════════════════════════════════════════════════════════
// IOC Hunt — Global Request Sanitization & Prototype Pollution Guard
// ════════════════════════════════════════════════════════════════

const { stripControlChars, sanitizeText } = require('../utils/inputValidator');

/**
 * Recursively sanitizes objects and arrays against prototype pollution,
 * null bytes, and malicious script tags.
 */
function deepSanitize(obj, depth = 0) {
  if (depth > 20 || !obj || typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return sanitizeText(obj);
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepSanitize(item, depth + 1));
  }

  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    // Block Prototype Pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    const safeKey = stripControlChars(key).trim();
    if (typeof value === 'string') {
      clean[safeKey] = sanitizeText(value);
    } else if (typeof value === 'object' && value !== null) {
      clean[safeKey] = deepSanitize(value, depth + 1);
    } else {
      clean[safeKey] = value;
    }
  }

  return clean;
}

/**
 * Express middleware applied globally to cleanse query, params, and body
 */
function sanitizationMiddleware(req, res, next) {
  try {
    if (req.query && typeof req.query === 'object') {
      req.query = deepSanitize(req.query);
    }
    if (req.params && typeof req.params === 'object') {
      req.params = deepSanitize(req.params);
    }
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      req.body = deepSanitize(req.body);
    }
    next();
  } catch (err) {
    console.error('[Sanitizer Error]', err.message);
    res.status(400).json({ error: 'Malformed input data received' });
  }
}

sanitizationMiddleware.deepSanitize = deepSanitize;
sanitizationMiddleware.sanitizationMiddleware = sanitizationMiddleware;

module.exports = sanitizationMiddleware;
