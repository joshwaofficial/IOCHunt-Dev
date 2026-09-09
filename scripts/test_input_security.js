// ════════════════════════════════════════════════════════════════
// IOC Hunt — Input Validation & Reliability Verification Suite
// ════════════════════════════════════════════════════════════════
const assert = require('assert');
const path = require('path');
const zlib = require('zlib');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║   IOC Hunt — Input Validation & Reliability Security Tests     ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const {
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
  isValidSafeUrl,
  isSafeLogPath,
  validatePasswordComplexity,
  validate
} = require('../backend/src/utils/inputValidator');

const { deepSanitize } = require('../backend/src/middlewares/sanitizationMiddleware');

let passedTests = 0;

async function runTests() {
  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passedTests++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.stack || err.message}`);
      process.exit(1);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Section 1: Password Complexity vs Existing Passwords
  // ─────────────────────────────────────────────────────────────
  console.log('[1] Password Validation Requirements:');

  await test('Rejects weak new passwords missing uppercase', () => {
    const res = validatePasswordComplexity('weakpass123!');
    assert.strictEqual(res, 'Password must contain at least one uppercase letter');
  });

  await test('Rejects weak new passwords missing lowercase', () => {
    const res = validatePasswordComplexity('WEAKPASS123!');
    assert.strictEqual(res, 'Password must contain at least one lowercase letter');
  });

  await test('Rejects weak new passwords missing numbers', () => {
    const res = validatePasswordComplexity('WeakPassWord!');
    assert.strictEqual(res, 'Password must contain at least one number');
  });

  await test('Rejects weak new passwords missing special characters', () => {
    const res = validatePasswordComplexity('WeakPassword123');
    assert.strictEqual(res, 'Password must contain at least one special character (!@#$%^&* etc.)');
  });

  await test('Rejects short passwords under 8 characters', () => {
    const res = validatePasswordComplexity('Sh0rt!');
    assert.strictEqual(res, 'Password must be at least 8 characters long');
  });

  await test('Accepts compliant complex new passwords', () => {
    assert.strictEqual(validatePasswordComplexity('SuperSecureP@ssw0rd!'), null);
    assert.strictEqual(validatePasswordComplexity('P#ssw0rd2026'), null);
  });

  await test('Type safety: non-string passwords return error string without crashing', () => {
    assert.ok(typeof validatePasswordComplexity(null) === 'string');
    assert.ok(typeof validatePasswordComplexity(undefined) === 'string');
    assert.ok(typeof validatePasswordComplexity(12345678) === 'string');
    assert.ok(typeof validatePasswordComplexity({}) === 'string');
    assert.ok(typeof validatePasswordComplexity([]) === 'string');
  });

  // ─────────────────────────────────────────────────────────────
  // Section 2: Type Confusion & Crash Resistance
  // ─────────────────────────────────────────────────────────────
  console.log('\n[2] Type Confusion & Crash Resistance:');

  await test('isString handles non-string inputs safely without exceptions', () => {
    assert.strictEqual(isString(null), false);
    assert.strictEqual(isString(undefined), false);
    assert.strictEqual(isString(12345), false);
    assert.strictEqual(isString({ foo: 'bar' }), false);
    assert.strictEqual(isString(['admin']), false);
    assert.strictEqual(isString(true), false);
    assert.strictEqual(isString('   ', 1), false);
    assert.strictEqual(isString('valid_string', 1, 20), true);
  });

  await test('parseSafeInt handles invalid, NaN, and out-of-bound numbers without throwing', () => {
    assert.strictEqual(parseSafeInt('50', 10, 1, 100), 50);
    assert.strictEqual(parseSafeInt('NaN', 10, 1, 100), 10);
    assert.strictEqual(parseSafeInt(null, 10, 1, 100), 10);
    assert.strictEqual(parseSafeInt(undefined, 10, 1, 100), 10);
    assert.strictEqual(parseSafeInt({ malicious: 1 }, 10, 1, 100), 10);
    assert.strictEqual(parseSafeInt('-5', 10, 1, 100), 1); // clamps to min
    assert.strictEqual(parseSafeInt('999999', 10, 1, 100), 100); // clamps to max
    assert.strictEqual(parseSafeInt('1 OR 1=1', 10, 1, 100), 1); // parses safe int prefix or bounds
  });

  await test('isPositiveInteger validates strictly >= 1 and rejects SQLi strings / negatives', () => {
    assert.strictEqual(isPositiveInteger(1), true);
    assert.strictEqual(isPositiveInteger('42'), true);
    assert.strictEqual(isPositiveInteger(0), false);
    assert.strictEqual(isPositiveInteger(-10), false);
    assert.strictEqual(isPositiveInteger('1; DROP TABLE users;'), false);
    assert.strictEqual(isPositiveInteger(NaN), false);
    assert.strictEqual(isPositiveInteger('abc'), false);
  });

  // ─────────────────────────────────────────────────────────────
  // Section 3: SQL Injection & Database Identifier Safety
  // ─────────────────────────────────────────────────────────────
  console.log('\n[3] SQL Injection & Database Identifier Safety:');

  await test('isDbIdentifier only accepts clean lowercase alphanumeric identifiers', () => {
    assert.strictEqual(isDbIdentifier('agg_branch_01'), true);
    assert.strictEqual(isDbIdentifier('company_a'), true);
    assert.strictEqual(isDbIdentifier('tenant123'), true);
    
    // Malicious SQLi attempts
    assert.strictEqual(isDbIdentifier('test; DROP DATABASE test; --'), false);
    assert.strictEqual(isDbIdentifier('agg" OR "1"="1'), false);
    assert.strictEqual(isDbIdentifier('agg name with space'), false);
    assert.strictEqual(isDbIdentifier('agg/../../etc/passwd'), false);
    assert.strictEqual(isDbIdentifier(''), false);
    assert.strictEqual(isDbIdentifier('ab'), false); // under min length
  });

  await test('isIdentifier safely restricts usernames, machine hostnames, and group IDs', () => {
    assert.strictEqual(isIdentifier('WIN-SRV-2022.corp.local'), true);
    assert.strictEqual(isIdentifier('grp_1710000000_abcde'), true);
    assert.strictEqual(isIdentifier('analyst_01'), true);
    assert.strictEqual(isIdentifier('192.168.1.50'), true);
    
    // Injections and dangerous chars
    assert.strictEqual(isIdentifier("admin' OR '1'='1"), false);
    assert.strictEqual(isIdentifier("user; shutdown"), false);
    assert.strictEqual(isIdentifier("<script>"), false);
    assert.strictEqual(isIdentifier(""), false);
  });

  // ─────────────────────────────────────────────────────────────
  // Section 4: SSRF (Server-Side Request Forgery) Prevention
  // ─────────────────────────────────────────────────────────────
  console.log('\n[4] SSRF (Server-Side Request Forgery) Prevention:');

  await test('isValidSafeUrl blocks AWS / Cloud Link-Local Metadata (169.254.169.254)', () => {
    assert.strictEqual(isValidSafeUrl('http://169.254.169.254/latest/meta-data/'), false);
    assert.strictEqual(isValidSafeUrl('https://169.254.169.254/'), false);
    assert.strictEqual(isValidSafeUrl('http://169.254.1.1/'), false);
  });

  await test('isValidSafeUrl blocks GCP Metadata domains and malicious protocols', () => {
    assert.strictEqual(isValidSafeUrl('http://metadata.google.internal/computeMetadata/v1/'), false);
    assert.strictEqual(isValidSafeUrl('file:///etc/passwd'), false);
    assert.strictEqual(isValidSafeUrl('gopher://127.0.0.1:6379/'), false);
    assert.strictEqual(isValidSafeUrl('javascript:alert(1)'), false);
  });

  await test('isValidSafeUrl accepts valid HTTPS / HTTP central server targets', () => {
    assert.strictEqual(isValidSafeUrl('https://central.iochunt.internal:8443'), true);
    assert.strictEqual(isValidSafeUrl('https://iochunt-cloud.example.com'), true);
    assert.strictEqual(isValidSafeUrl('http://192.168.10.5:8443'), true);
  });

  // ─────────────────────────────────────────────────────────────
  // Section 5: Path Traversal & Arbitrary File Access
  // ─────────────────────────────────────────────────────────────
  console.log('\n[5] Path Traversal & Arbitrary File Read Prevention:');

  await test('isSafeLogPath blocks path traversal directory escape attempts', () => {
    assert.strictEqual(isSafeLogPath('../../../etc/shadow'), false);
    assert.strictEqual(isSafeLogPath('/var/log/../../etc/passwd'), false);
    assert.strictEqual(isSafeLogPath('/etc/passwd.log'), false);
    assert.strictEqual(isSafeLogPath('/proc/self/environ.txt'), false);
    assert.strictEqual(isSafeLogPath('/sys/kernel/debug.log'), false);
  });

  await test('isSafeLogPath blocks null bytes and unallowed file extensions', () => {
    assert.strictEqual(isSafeLogPath('/var/log/app.log\0.txt'), false);
    assert.strictEqual(isSafeLogPath('/var/log/source.exe'), false);
    assert.strictEqual(isSafeLogPath('/var/log/shadow'), false);
    assert.strictEqual(isSafeLogPath('/var/log/.hidden.log'), false);
  });

  await test('isSafeLogPath allows legitimate firewall and system log files', () => {
    assert.strictEqual(isSafeLogPath('/var/log/suricata/eve.json'), true);
    assert.strictEqual(isSafeLogPath('/var/log/pfsense.log'), true);
    assert.strictEqual(isSafeLogPath('/opt/logs/firewall.txt'), true);
  });

  // ─────────────────────────────────────────────────────────────
  // Section 6: Script Injection (XSS) & Sanitization
  // ─────────────────────────────────────────────────────────────
  console.log('\n[6] Script Injection (XSS) & Sanitization:');

  await test('sanitizeText strips <script> tags and active event handlers', () => {
    const dirty = '<script>alert("XSS")</script>Incident occurred';
    const clean = sanitizeText(dirty);
    assert.strictEqual(clean, 'Incident occurred');
  });

  await test('sanitizeText strips dangerous onerror/onload payloads', () => {
    const dirty = '<img src=x onerror=alert(document.cookie)>Malware Alert';
    const clean = sanitizeText(dirty);
    assert.strictEqual(clean, 'Malware Alert');
  });

  await test('deepSanitize removes prototype pollution keys', () => {
    const maliciousPayload = {
      title: 'Safe Title',
      __proto__: { isAdmin: true },
      constructor: { malicious: true },
      nested: {
        tag: 'FIREWALL\0_EVENT',
        prototype: { polluted: true }
      }
    };

    const sanitized = deepSanitize(maliciousPayload);
    assert.strictEqual(sanitized.title, 'Safe Title');
    assert.strictEqual(sanitized.nested.tag, 'FIREWALL_EVENT'); // null byte stripped
    assert.strictEqual(Object.prototype.isAdmin, undefined, 'Prototype pollution must not occur');
  });

  // ─────────────────────────────────────────────────────────────
  // Section 7: Controller Reliability & UI Error Handling
  // ─────────────────────────────────────────────────────────────
  console.log('\n[7] Controller Reliability & UI Error Handling:');

  await test('authController.login does NOT crash when sent non-string types', async () => {
    const authController = require('../backend/src/controllers/authController');
    
    let statusCode = 200;
    let jsonResponse = null;
    const mockReq = {
      body: {
        username: { malicious: 'object' },
        password: ['array', 'password']
      }
    };
    const mockRes = {
      status: (code) => { statusCode = code; return mockRes; },
      json: (data) => { jsonResponse = data; return mockRes; }
    };

    await authController.login(mockReq, mockRes);
    assert.strictEqual(statusCode, 400, 'Must return HTTP 400 Bad Request');
    assert.ok(jsonResponse.error, 'Must return clear error message for UI');
    assert.strictEqual(jsonResponse.error, 'Username and password are required and must be strings');
  });

  await test('settingsController.pairCentral rejects invalid URL with 400 without crashing', async () => {
    const settingsController = require('../backend/src/modules/aggregator/controllers/settingsController');
    
    let statusCode = 200;
    let jsonResponse = null;
    const mockReq = {
      body: {
        url: 'http://169.254.169.254/latest/meta-data',
        pairing_code: 'code123'
      }
    };
    const mockRes = {
      status: (code) => { statusCode = code; return mockRes; },
      json: (data) => { jsonResponse = data; return mockRes; }
    };

    await settingsController.pairCentral(mockReq, mockRes);
    assert.strictEqual(statusCode, 400);
    assert.strictEqual(jsonResponse.error, 'Invalid or prohibited central server URL');
  });

  await test('policyController.getMachinePolicy rejects illegal machine names with 400', async () => {
    const policyController = require('../backend/src/controllers/policyController');
    
    let statusCode = 200;
    let jsonResponse = null;
    const mockReq = {
      params: { machine: "WIN'; DROP TABLE policies; --" },
      queryTenant: async () => ({ rows: [] })
    };
    const mockRes = {
      status: (code) => { statusCode = code; return mockRes; },
      json: (data) => { jsonResponse = data; return mockRes; }
    };

    await policyController.getMachinePolicy(mockReq, mockRes);
    assert.strictEqual(statusCode, 400);
    assert.strictEqual(jsonResponse.error, 'Invalid machine identifier');
  });

  await test('emailController.updateSmtpConfig rejects malformed from_addr with 400', async () => {
    const emailController = require('../backend/src/controllers/emailController');
    
    let statusCode = 200;
    let jsonResponse = null;
    const mockReq = {
      body: {
        host: 'smtp.example.com',
        from_addr: 'not-an-email-address<script>'
      },
      queryTenant: async () => ({ rows: [] })
    };
    const mockRes = {
      status: (code) => { statusCode = code; return mockRes; },
      json: (data) => { jsonResponse = data; return mockRes; }
    };

    await emailController.updateSmtpConfig(mockReq, mockRes);
    assert.strictEqual(statusCode, 400);
    assert.strictEqual(jsonResponse.error, 'Invalid from_addr email address');
  });

  await test('emailController.testSmtp validates recipient email address with 400', async () => {
    const emailController = require('../backend/src/controllers/emailController');
    
    let statusCode = 200;
    let jsonResponse = null;
    const mockReq = {
      body: { to: 'invalid_recipient' }
    };
    const mockRes = {
      status: (code) => { statusCode = code; return mockRes; },
      json: (data) => { jsonResponse = data; return mockRes; }
    };

    await emailController.testSmtp(mockReq, mockRes);
    assert.strictEqual(statusCode, 400);
    assert.strictEqual(jsonResponse.error, 'Valid destination email address required');
  });

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`ALL ${passedTests} SECURITY & RELIABILITY TESTS PASSED SUCCESSFULLY!`);
  console.log('════════════════════════════════════════════════════════════════\n');
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
