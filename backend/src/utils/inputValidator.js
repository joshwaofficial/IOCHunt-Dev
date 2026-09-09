// ════════════════════════════════════════════════════════════════
// IOC Hunt — Input Validation & Sanitization Engine
// ════════════════════════════════════════════════════════════════
// Reusable, zero-dependency validation and sanitization utilities
// to prevent SQL injection, command injection, script injection (XSS),
// path traversal, and type confusion crashes.
// ════════════════════════════════════════════════════════════════

const path = require('path');
const fs = require('fs');

// Regular Expressions for strict validation
const IDENTIFIER_REGEX = /^[a-zA-Z0-9_\-.:]{1,128}$/;
const DB_IDENTIFIER_REGEX = /^[a-z0-9_]{3,63}$/;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const IP_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const TOTP_REGEX = /^[0-9]{6}$/;
const SCRIPT_PATTERN = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const DANGEROUS_HTML_PATTERN = /<[^>]+(onload|onerror|onclick|onmouseover|javascript:|data:text\/html)[^>]*>/gi;

/**
 * Strips null bytes and invisible ASCII control codes (except \t, \n, \r)
 */
function stripControlChars(str) {
  if (typeof str !== 'string') return str;
  // Remove null byte and C0 controls except tab (0x09), LF (0x0A), CR (0x0D)
  return str.replace(/\0/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Escapes characters for safe HTML output / script injection prevention
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#27;');
}

/**
 * Removes dangerous tags and script protocols from user-provided text
 */
function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  let clean = stripControlChars(str);
  clean = clean.replace(SCRIPT_PATTERN, '');
  clean = clean.replace(DANGEROUS_HTML_PATTERN, '');
  return clean.trim();
}

/**
 * Checks if a value is a valid non-empty string within min and max lengths
 */
function isString(val, minLen = 1, maxLen = 4096) {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  return trimmed.length >= minLen && trimmed.length <= maxLen;
}

/**
 * Checks if a value is an integer within range (handles numbers and string-encoded integers)
 */
function isInteger(val, min = -Infinity, max = Infinity) {
  if (val === null || val === undefined || val === '') return false;
  const num = Number(val);
  if (!Number.isInteger(num)) return false;
  return num >= min && num <= max;
}

/**
 * Parses an integer safely, returning a fallback if invalid or NaN
 */
function parseSafeInt(val, fallback = 0, min = -Infinity, max = Infinity) {
  if (val === null || val === undefined || val === '') return fallback;
  const num = parseInt(val, 10);
  if (isNaN(num)) return fallback;
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

/**
 * Checks if a value is a positive integer (>= 1)
 */
function isPositiveInteger(val) {
  return isInteger(val, 1, Number.MAX_SAFE_INTEGER);
}

/**
 * Checks if a value is a valid email address
 */
function isEmail(val) {
  if (typeof val !== 'string') return false;
  const clean = val.trim();
  return clean.length <= 254 && EMAIL_REGEX.test(clean);
}

/**
 * Checks if a value matches identifier constraints
 */
function isIdentifier(val, minLen = 1, maxLen = 64) {
  if (typeof val !== 'string') return false;
  const clean = val.trim();
  return clean.length >= minLen && clean.length <= maxLen && IDENTIFIER_REGEX.test(clean);
}

/**
 * Checks if a value is a safe PostgreSQL database/role name
 */
function isDbIdentifier(val) {
  if (typeof val !== 'string') return false;
  const clean = val.trim().toLowerCase();
  return DB_IDENTIFIER_REGEX.test(clean);
}

/**
 * Checks if a value is one of allowed enum values
 */
function isEnum(val, allowedValues) {
  if (typeof val !== 'string') return false;
  return allowedValues.includes(val.trim());
}

/**
 * Validates a URL and prevents SSRF to internal/cloud metadata addresses
 */
function isValidSafeUrl(urlString) {
  if (typeof urlString !== 'string') return false;
  const trimmed = urlString.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();

    // SSRF Protections
    // 1. Reject AWS/GCP/Azure link-local metadata IP
    if (hostname === '169.254.169.254' || hostname.startsWith('169.254.')) {
      return false;
    }
    // 2. Reject metadata domain names
    if (hostname === 'metadata.google.internal' || hostname.endsWith('.metadata.google.internal')) {
      return false;
    }
    // 3. Reject invalid or blank hostname
    if (!hostname || hostname.includes(' ') || hostname.includes('\0')) {
      return false;
    }

    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Checks if a path is safe for log file ingestion (prevents path traversal)
 */
function isSafeLogPath(filePath) {
  if (typeof filePath !== 'string') return false;
  const trimmed = filePath.trim();
  if (!trimmed) return false;

  // Prevent null bytes
  if (trimmed.includes('\0')) return false;

  // Prevent path traversal sequences
  if (trimmed.includes('..')) return false;

  const resolved = path.resolve(trimmed);

  // Reject sensitive OS directories
  const dangerousDirs = [
    '/etc',
    '/proc',
    '/sys',
    '/dev',
    '/root',
    '/boot',
    '/bin',
    '/sbin',
    '/usr/bin',
    '/usr/sbin'
  ];

  for (const dir of dangerousDirs) {
    if (resolved === dir || resolved.startsWith(dir + path.sep)) {
      return false;
    }
  }

  // Reject dotfiles and secret files
  const baseName = path.basename(resolved);
  if (baseName.startsWith('.') || baseName.includes('password') || baseName.includes('shadow')) {
    return false;
  }

  // Must have recognized log/data file extension
  const allowedExts = ['.log', '.txt', '.csv', '.json', '.out'];
  const ext = path.extname(resolved).toLowerCase();
  if (!allowedExts.includes(ext)) {
    return false;
  }

  return true;
}

/**
 * Validates password complexity for NEW passwords or updates
 */
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

/**
 * Express middleware generator for validating request payloads
 * Returns 400 Bad Request with a clear message if validation fails.
 */
function validate(schema) {
  return (req, res, next) => {
    try {
      // 1. Validate req.params
      if (schema.params) {
        for (const [key, validator] of Object.entries(schema.params)) {
          const val = req.params ? req.params[key] : undefined;
          const result = validator(val);
          if (result !== true) {
            return res.status(400).json({
              error: typeof result === 'string' ? result : `Invalid parameter: '${key}'`
            });
          }
        }
      }

      // 2. Validate req.query
      if (schema.query) {
        for (const [key, validator] of Object.entries(schema.query)) {
          const val = req.query ? req.query[key] : undefined;
          const result = validator(val);
          if (result !== true) {
            return res.status(400).json({
              error: typeof result === 'string' ? result : `Invalid query parameter: '${key}'`
            });
          }
        }
      }

      // 3. Validate req.body
      if (schema.body) {
        if (typeof req.body !== 'object' || req.body === null) {
          return res.status(400).json({ error: 'Request body must be a JSON object' });
        }
        for (const [key, validator] of Object.entries(schema.body)) {
          const val = req.body[key];
          const result = validator(val);
          if (result !== true) {
            return res.status(400).json({
              error: typeof result === 'string' ? result : `Invalid field: '${key}'`
            });
          }
        }
      }

      next();
    } catch (err) {
      console.error('[Validator Error]', err.message);
      return res.status(400).json({ error: 'Request validation failed' });
    }
  };
}

module.exports = {
  stripControlChars,
  escapeHtml,
  sanitizeText,
  isString,
  isInteger,
  parseSafeInt,
  isPositiveInteger,
  isEmail,
  isIdentifier,
  isDbIdentifier,
  isEnum,
  isValidSafeUrl,
  isSafeLogPath,
  validatePasswordComplexity,
  validate,
  TOTP_REGEX,
  IP_REGEX
};
