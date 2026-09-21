const crypto = require('crypto');
const { promisify } = require('util');

const pbkdf2Async = promisify(crypto.pbkdf2);

// ── OWASP Configuration Constants ─────────────────────────────────
const CURRENT_ITERATIONS = 220000; // OWASP recommendation for PBKDF2-HMAC-SHA-512
const LEGACY_ITERATIONS = 100000;  // Previous baseline for existing user hashes
const KEY_LENGTH = 64;             // 64 bytes = 512 bits
const DIGEST = 'sha512';
const SALT_LENGTH = 32;            // 32 bytes = 256 bits of cryptographically secure salt
const ALLOWED_ITERATIONS = new Set([100000, 220000]);

/**
 * Validates and retrieves the 32-byte AES-256 encryption key from the environment.
 * @returns {Buffer} 32-byte key buffer
 */
function getEncryptionKey() {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || typeof keyHex !== 'string') {
    throw new Error('ENCRYPTION_KEY environment variable is required.');
  }

  const trimmed = keyHex.trim();
  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  if (Buffer.byteLength(keyHex, 'utf8') === 32) {
    return Buffer.from(keyHex, 'utf8');
  }

  throw new Error('Invalid ENCRYPTION_KEY configuration: must be exactly 32 bytes (64 hex characters).');
}

/**
 * Generates a secure hash for a password using PBKDF2-HMAC-SHA-512 (non-blocking async).
 * @param {string} password 
 * @param {string} [salt] - Optional existing salt. If omitted, a fresh 32-byte salt is generated.
 * @param {number} [iterations=220000] - Optional iteration count. Defaults to 220,000.
 * @returns {Promise<{ hash: string, salt: string, iterations: number, algorithm: string }>}
 */
async function hashPassword(password, salt, iterations = CURRENT_ITERATIONS) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Invalid password: must be a non-empty string');
  }

  const activeSalt = salt || crypto.randomBytes(SALT_LENGTH).toString('hex');
  const activeIterations = ALLOWED_ITERATIONS.has(iterations) ? iterations : CURRENT_ITERATIONS;

  const derivedBuffer = await pbkdf2Async(
    password,
    activeSalt,
    activeIterations,
    KEY_LENGTH,
    DIGEST
  );

  return {
    hash: derivedBuffer.toString('hex'),
    salt: activeSalt,
    iterations: activeIterations,
    algorithm: 'pbkdf2-sha512'
  };
}

/**
 * Synchronous variant of hashPassword for backward compatibility.
 * @param {string} password 
 * @param {string} [salt] 
 * @param {number} [iterations=220000]
 * @returns {{ hash: string, salt: string, iterations: number, algorithm: string }}
 */
function hashPasswordSync(password, salt, iterations = CURRENT_ITERATIONS) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Invalid password: must be a non-empty string');
  }

  const activeSalt = salt || crypto.randomBytes(SALT_LENGTH).toString('hex');
  const activeIterations = ALLOWED_ITERATIONS.has(iterations) ? iterations : CURRENT_ITERATIONS;

  const derivedBuffer = crypto.pbkdf2Sync(
    password,
    activeSalt,
    activeIterations,
    KEY_LENGTH,
    DIGEST
  );

  return {
    hash: derivedBuffer.toString('hex'),
    salt: activeSalt,
    iterations: activeIterations,
    algorithm: 'pbkdf2-sha512'
  };
}

/**
 * Securely verifies a password against stored credentials (non-blocking async).
 * Supports both modern 220k hashes and legacy 100k hashes seamlessly.
 *
 * Accepted signatures:
 *   verifyPassword(password, storedHash, salt, iterations)
 *   verifyPassword(password, userObject)
 *
 * @param {string} password 
 * @param {string|Object} storedHashOrData - 128-char hex string OR user object with { password_hash, salt }
 * @param {string} [maybeSalt] 
 * @param {number} [maybeIterations] 
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, storedHashOrData, maybeSalt, maybeIterations) {
  if (typeof password !== 'string' || password.length === 0 || !storedHashOrData) {
    return false;
  }

  let storedHash = '';
  let salt = '';
  let iterations = null;

  if (typeof storedHashOrData === 'object') {
    storedHash = storedHashOrData.hash || storedHashOrData.password_hash || '';
    salt = storedHashOrData.salt || '';
    iterations = storedHashOrData.iterations || null;
  } else {
    storedHash = String(storedHashOrData);
    salt = String(maybeSalt || '');
    iterations = typeof maybeIterations === 'number' ? maybeIterations : null;
  }

  if (!/^[a-f0-9]{64}$/i.test(salt) || !/^[a-f0-9]{128}$/i.test(storedHash)) {
    return false;
  }

  const storedHashBuf = Buffer.from(storedHash, 'hex');

  // If iterations are explicitly provided, verify against that count directly
  if (iterations && ALLOWED_ITERATIONS.has(iterations)) {
    const derived = await pbkdf2Async(password, salt, iterations, KEY_LENGTH, DIGEST);
    return crypto.timingSafeEqual(derived, storedHashBuf);
  }

  // Dual-mode compatibility for existing database hashes where iterations was not stored:
  // 1. Try legacy 100,000 iterations (100% of existing user records)
  const legacyDerived = await pbkdf2Async(password, salt, LEGACY_ITERATIONS, KEY_LENGTH, DIGEST);
  if (crypto.timingSafeEqual(legacyDerived, storedHashBuf)) {
    return true;
  }

  // 2. Try current 220,000 iterations
  const currentDerived = await pbkdf2Async(password, salt, CURRENT_ITERATIONS, KEY_LENGTH, DIGEST);
  if (crypto.timingSafeEqual(currentDerived, storedHashBuf)) {
    return true;
  }

  return false;
}

/**
 * Synchronous variant of verifyPassword.
 * @param {string} password 
 * @param {string|Object} storedHashOrData 
 * @param {string} [maybeSalt] 
 * @param {number} [maybeIterations] 
 * @returns {boolean}
 */
function verifyPasswordSync(password, storedHashOrData, maybeSalt, maybeIterations) {
  if (typeof password !== 'string' || password.length === 0 || !storedHashOrData) {
    return false;
  }

  let storedHash = '';
  let salt = '';
  let iterations = null;

  if (typeof storedHashOrData === 'object') {
    storedHash = storedHashOrData.hash || storedHashOrData.password_hash || '';
    salt = storedHashOrData.salt || '';
    iterations = storedHashOrData.iterations || null;
  } else {
    storedHash = String(storedHashOrData);
    salt = String(maybeSalt || '');
    iterations = typeof maybeIterations === 'number' ? maybeIterations : null;
  }

  if (!/^[a-f0-9]{64}$/i.test(salt) || !/^[a-f0-9]{128}$/i.test(storedHash)) {
    return false;
  }

  const storedHashBuf = Buffer.from(storedHash, 'hex');

  if (iterations && ALLOWED_ITERATIONS.has(iterations)) {
    const derived = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST);
    return crypto.timingSafeEqual(derived, storedHashBuf);
  }

  const legacyDerived = crypto.pbkdf2Sync(password, salt, LEGACY_ITERATIONS, KEY_LENGTH, DIGEST);
  if (crypto.timingSafeEqual(legacyDerived, storedHashBuf)) {
    return true;
  }

  const currentDerived = crypto.pbkdf2Sync(password, salt, CURRENT_ITERATIONS, KEY_LENGTH, DIGEST);
  if (crypto.timingSafeEqual(currentDerived, storedHashBuf)) {
    return true;
  }

  return false;
}

/**
 * Generates a cryptographically secure random token.
 * Validates that requested byte count is safe and within limits.
 * @param {number} [bytes=32] 
 * @returns {string} hex encoded token
 */
function generateSecureToken(bytes = 32) {
  if (!Number.isSafeInteger(bytes) || bytes < 16 || bytes > 128) {
    throw new Error('Token byte length must be between 16 and 128');
  }
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Encrypts a plain text string using authenticated AES-256-GCM.
 * Output format: v1:iv_hex:auth_tag_hex:ciphertext_hex
 * Fails closed if ENCRYPTION_KEY is missing or invalid.
 *
 * @param {string} text 
 * @returns {string} v1:iv:authTag:ciphertext
 */
function encryptText(text) {
  if (text == null || text === '') return text;
  if (typeof text !== 'string') {
    throw new Error('Text must be a string');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 12-byte IV standard for AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return [
    'v1',
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex')
  ].join(':');
}

/**
 * Decrypts a ciphertext string.
 * Supports:
 * 1. Modern AES-256-GCM authenticated ciphertexts (v1:iv:authTag:ciphertext)
 * 2. Legacy AES-256-CBC ciphertexts (iv:ciphertext) for existing database records
 *
 * Fails closed on corrupted or tampered data.
 *
 * @param {string} encryptedText 
 * @returns {string} decrypted plaintext
 */
function decryptText(encryptedText) {
  if (encryptedText == null || encryptedText === '') {
    return encryptedText;
  }
  if (typeof encryptedText !== 'string') {
    throw new Error('Encrypted data must be a string');
  }

  // ── Mode 1: Modern AES-256-GCM (v1:iv:authTag:ciphertext) ───────
  if (encryptedText.startsWith('v1:')) {
    const parts = encryptedText.split(':');
    if (parts.length !== 4) {
      throw new Error('Unsupported or invalid encrypted data format');
    }

    const [, ivHex, authTagHex, encryptedHex] = parts;
    if (
      !/^[a-f0-9]{24}$/i.test(ivHex) ||
      !/^[a-f0-9]{32}$/i.test(authTagHex) ||
      !/^(?:[a-f0-9]{2})*$/i.test(encryptedHex)
    ) {
      throw new Error('Invalid or tampered encrypted data');
    }

    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    try {
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      return decrypted.toString('utf8');
    } catch (_) {
      throw new Error('Invalid or tampered encrypted data: authentication tag verification failed');
    }
  }

  // ── Mode 2: Legacy AES-256-CBC (iv:ciphertext) ───────────────────
  if (encryptedText.includes(':')) {
    try {
      const key = getEncryptionKey();
      const parts = encryptedText.split(':');
      const ivHex = parts.shift();
      const encryptedHex = parts.join(':');

      if (/^[a-f0-9]{32}$/i.test(ivHex) && /^(?:[a-f0-9]{2})+$/i.test(encryptedHex)) {
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      }
    } catch (e) {
      console.error('[SECURITY ERROR] Failed to decrypt legacy CBC secret:', e.message);
      throw new Error('Failed to decrypt legacy secret: invalid key or corrupted ciphertext');
    }
  }

  // Return unencrypted plaintext if historical record was unencrypted
  return encryptedText;
}

module.exports = {
  CURRENT_ITERATIONS,
  LEGACY_ITERATIONS,
  hashPassword,
  hashPasswordSync,
  verifyPassword,
  verifyPasswordSync,
  generateSecureToken,
  encryptText,
  decryptText,
  getEncryptionKey
};
