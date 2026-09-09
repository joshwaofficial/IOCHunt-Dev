// ════════════════════════════════════════════════════════════════
// IOC Hunt Super Admin — Input Validation & Sanitization Engine
// ════════════════════════════════════════════════════════════════

const IDENTIFIER_REGEX = /^[a-zA-Z0-9_\-.:]{1,128}$/;
const DB_IDENTIFIER_REGEX = /^[a-z0-9_]{3,63}$/;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const SCRIPT_PATTERN = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const DANGEROUS_HTML_PATTERN = /<[^>]+(onload|onerror|onclick|onmouseover|javascript:|data:text\/html)[^>]*>/gi;

function stripControlChars(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\0/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  let clean = stripControlChars(str);
  clean = clean.replace(SCRIPT_PATTERN, '');
  clean = clean.replace(DANGEROUS_HTML_PATTERN, '');
  return clean.trim();
}

function isString(val, minLen = 1, maxLen = 4096) {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  return trimmed.length >= minLen && trimmed.length <= maxLen;
}

function isInteger(val, min = -Infinity, max = Infinity) {
  if (val === null || val === undefined || val === '') return false;
  const num = Number(val);
  if (!Number.isInteger(num)) return false;
  return num >= min && num <= max;
}

function parseSafeInt(val, fallback = 0, min = -Infinity, max = Infinity) {
  if (val === null || val === undefined || val === '') return fallback;
  const num = parseInt(val, 10);
  if (isNaN(num)) return fallback;
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

function isDbIdentifier(val) {
  if (typeof val !== 'string') return false;
  const clean = val.trim().toLowerCase();
  return DB_IDENTIFIER_REGEX.test(clean);
}

function validatePasswordComplexity(password) {
  if (!password || typeof password !== 'string') {
    return 'Password is required and must be a string';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    return 'Password must contain at least one special character (!@#$%^&* etc.)';
  }
  return null;
}

function deepSanitize(obj, depth = 0) {
  if (depth > 20 || !obj || typeof obj !== 'object') {
    if (typeof obj === 'string') return sanitizeText(obj);
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deepSanitize(item, depth + 1));
  }
  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
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

function superSanitizationMiddleware(req, res, next) {
  try {
    if (req.query && typeof req.query === 'object') req.query = deepSanitize(req.query);
    if (req.params && typeof req.params === 'object') req.params = deepSanitize(req.params);
    if (req.body && typeof req.body === 'object') req.body = deepSanitize(req.body);
    next();
  } catch (err) {
    res.status(400).json({ error: 'Malformed input data' });
  }
}

module.exports = {
  stripControlChars,
  sanitizeText,
  isString,
  isInteger,
  parseSafeInt,
  isDbIdentifier,
  validatePasswordComplexity,
  superSanitizationMiddleware
};
