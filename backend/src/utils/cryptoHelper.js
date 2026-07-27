const crypto = require('crypto');

/**
 * Generates a secure hash for a given password using PBKDF2.
 * @param {string} password 
 * @param {string} salt - Optional. If not provided, a new random salt is generated.
 * @returns {Object} { hash, salt }
 */
function hashPassword(password, salt) {
  if (!salt) {
    salt = crypto.randomBytes(32).toString('hex');
  }
  
  // High iteration count for PBKDF2 to resist brute force attacks
  const iterations = 100000;
  const keylen = 64;
  const digest = 'sha512';
  
  const hash = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest).toString('hex');
  return { hash, salt };
}

/**
 * Verifies a password against a stored hash and salt securely, mitigating timing attacks.
 * @param {string} password 
 * @param {string} storedHash 
 * @param {string} salt 
 * @returns {boolean} true if match
 */
function verifyPassword(password, storedHash, salt) {
  if (!password || !storedHash || !salt) return false;
  
  const { hash } = hashPassword(password, salt);
  
  const hashBuffer = Buffer.from(hash, 'hex');
  const storedHashBuffer = Buffer.from(storedHash, 'hex');
  
  // Prevent buffer length mismatch error before timingSafeEqual
  if (hashBuffer.length !== storedHashBuffer.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(hashBuffer, storedHashBuffer);
}

/**
 * Generates a cryptographically secure random token.
 * @param {number} bytes 
 * @returns {string} hex encoded token
 */
function generateSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Encrypts a plain text string using AES-256-CBC.
 * @param {string} text
 * @returns {string} iv:encrypted_text
 */
function encryptText(text) {
  if (!text) return text;
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    console.warn('[SECURITY WARNING] No ENCRYPTION_KEY in .env, falling back to plain text for SMTP password!');
    return text;
  }
  
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypts a cipher text string using AES-256-CBC.
 * @param {string} encryptedText - Format iv:encrypted_text
 * @returns {string} plain_text
 */
function decryptText(encryptedText) {
  if (!encryptedText) return encryptedText;
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || !encryptedText.includes(':')) {
    // Fallback for unencrypted old passwords or missing key
    return encryptedText;
  }
  
  try {
    const key = Buffer.from(keyHex, 'hex');
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encrypted = parts.join(':');
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (e) {
    console.error('[SECURITY ERROR] Failed to decrypt SMTP password:', e.message);
    // If decryption completely fails (wrong key, bad format), it might have been plain text
    return encryptedText;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  encryptText,
  decryptText
};
