const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

// Test the crypto helper implementation
async function runTests() {
  console.log('Testing Crypto Security Upgrade...\n');

  const cryptoHelper = require('../src/utils/cryptoHelper');

  // 1. Password Hashing (New 220,000 iterations)
  console.log('[1] Testing Password Hashing (220,000 iterations)...');
  const pwd = 'TestPassword123!@#';
  const hashed = await cryptoHelper.hashPassword(pwd);
  assert.ok(hashed.hash, 'Hash must exist');
  assert.ok(hashed.salt, 'Salt must exist');
  assert.strictEqual(hashed.iterations, 220000, 'Iterations must be 220,000');
  assert.strictEqual(hashed.hash.length, 128, 'Hash must be 128 hex chars (64 bytes)');
  assert.strictEqual(hashed.salt.length, 64, 'Salt must be 64 hex chars (32 bytes)');
  console.log('  ✓ Generated new 220,000-iteration hash');

  // 2. Password Verification (New 220k hash)
  console.log('[2] Testing Password Verification on new 220k hash...');
  const isValid = await cryptoHelper.verifyPassword(pwd, hashed.hash, hashed.salt);
  assert.strictEqual(isValid, true, 'Valid password must verify as true');
  const isInvalid = await cryptoHelper.verifyPassword('WrongPassword', hashed.hash, hashed.salt);
  assert.strictEqual(isInvalid, false, 'Invalid password must verify as false');
  console.log('  ✓ Verification succeeds for correct password and rejects wrong password');

  // 3. Backward Compatibility with Legacy 100,000 iteration hashes
  console.log('[3] Testing Backward Compatibility with Legacy 100,000 iteration hashes...');
  // Generate a legacy 100k hash
  const legacySalt = crypto.randomBytes(32).toString('hex');
  const legacyHash = crypto.pbkdf2Sync('admin', legacySalt, 100000, 64, 'sha512').toString('hex');
  
  // Verify using legacy hash
  const isLegacyValid = await cryptoHelper.verifyPassword('admin', legacyHash, legacySalt);
  assert.strictEqual(isLegacyValid, true, 'Legacy 100k hash must verify as true');
  const isLegacyInvalid = await cryptoHelper.verifyPassword('wrong', legacyHash, legacySalt);
  assert.strictEqual(isLegacyInvalid, false, 'Legacy hash with wrong password must verify as false');
  console.log('  ✓ Existing legacy 100k hashes verify 100% successfully');

  // 4. Verification with object parameter signature
  console.log('[4] Testing verifyPassword with object parameter...');
  const userObj = { password_hash: hashed.hash, salt: hashed.salt, iterations: 220000 };
  assert.strictEqual(await cryptoHelper.verifyPassword(pwd, userObj), true);
  console.log('  ✓ verifyPassword accepts { password_hash, salt } object');

  // 5. AES-256-GCM Encryption & Decryption
  console.log('[5] Testing AES-256-GCM Authenticated Encryption...');
  process.env.ENCRYPTION_KEY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const secret = 'SuperSecretSmtpPassword!123';
  const encrypted = cryptoHelper.encryptText(secret);
  assert.ok(encrypted.startsWith('v1:'), 'GCM encrypted text must start with v1:');
  const decrypted = cryptoHelper.decryptText(encrypted);
  assert.strictEqual(decrypted, secret, 'Decrypted text must match original secret');
  console.log('  ✓ AES-256-GCM encrypts and decrypts correctly');

  // 6. AES-256-GCM Tampering Detection
  console.log('[6] Testing AES-256-GCM Tampering Detection...');
  const parts = encrypted.split(':');
  // Tamper with ciphertext
  const tamperedCipher = parts[3].slice(0, -2) + (parts[3].slice(-2) === 'aa' ? 'bb' : 'aa');
  const tamperedText = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedCipher}`;
  assert.throws(() => {
    cryptoHelper.decryptText(tamperedText);
  }, /Unsupported or invalid encrypted data format|Invalid or tampered encrypted data/i);
  console.log('  ✓ Tampered ciphertext is detected and rejected');

  // 7. Backward Compatibility with Legacy AES-256-CBC
  console.log('[7] Testing Backward Compatibility with Legacy AES-256-CBC ciphertexts...');
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const legacyIv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, legacyIv);
  let legacyEnc = cipher.update(secret, 'utf8', 'hex');
  legacyEnc += cipher.final('hex');
  const legacyCiphertext = legacyIv.toString('hex') + ':' + legacyEnc;

  const decryptedLegacy = cryptoHelper.decryptText(legacyCiphertext);
  assert.strictEqual(decryptedLegacy, secret, 'Legacy CBC ciphertext must decrypt cleanly');
  console.log('  ✓ Existing legacy CBC ciphertexts decrypt 100% cleanly');

  // 8. Token Generation Range Checks
  console.log('[8] Testing generateSecureToken byte validation...');
  const token = cryptoHelper.generateSecureToken(32);
  assert.strictEqual(token.length, 64, '32 bytes must produce 64 hex chars');
  assert.throws(() => cryptoHelper.generateSecureToken(10), /Token byte length must be between 16 and 128/);
  assert.throws(() => cryptoHelper.generateSecureToken(200), /Token byte length must be between 16 and 128/);
  console.log('  ✓ generateSecureToken validates length bounds');

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('ALL CRYPTO SECURITY TESTS PASSED SUCCESSFULLY!');
  console.log('════════════════════════════════════════════════════════════════');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
