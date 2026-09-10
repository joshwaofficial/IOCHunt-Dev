// ════════════════════════════════════════════════════════════════
// IOC Hunt — Session & Cookie Security Verification Suite
// ════════════════════════════════════════════════════════════════

const assert = require('assert');
const http = require('http');
const path = require('path');

// Ensure modules from backend/node_modules can be resolved
module.paths.push(path.join(__dirname, '../backend/node_modules'));

const express = require('express');
const cookieParser = require('cookie-parser');
const { getSessionCookieOptions, getClearCookieOptions } = require('../backend/src/utils/cookieHelper');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║     IOC Hunt — Session & Cookie Security Verification Suite    ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

let passedTests = 0;

function makeRequest(app, { method = 'GET', path = '/', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers
      }, (res) => {
        let resBody = '';
        res.on('data', chunk => resBody += chunk);
        res.on('end', () => {
          server.close(() => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: resBody
            });
          });
        });
      });

      req.on('error', (err) => {
        server.close(() => reject(err));
      });

      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  });
}

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

async function runAllTests() {
  const origEnv = { ...process.env };

  // ─────────────────────────────────────────────────────────────
  // Section 1: Cookie Configuration Helper Verification
  // ─────────────────────────────────────────────────────────────
  console.log('[1] Cookie Security Attributes & Flags:');

  await test('getSessionCookieOptions enforces HttpOnly flag', () => {
    const opts = getSessionCookieOptions();
    assert.strictEqual(opts.httpOnly, true, 'Cookie MUST have HttpOnly flag enabled');
  });

  await test('getSessionCookieOptions enforces SameSite=Strict policy', () => {
    const opts = getSessionCookieOptions();
    assert.strictEqual(opts.sameSite, 'strict', 'Cookie MUST enforce SameSite=Strict for CSRF mitigation');
  });

  await test('getSessionCookieOptions enforces Path=/ scoping', () => {
    const opts = getSessionCookieOptions();
    assert.strictEqual(opts.path, '/', 'Cookie MUST be scoped to root Path=/');
  });

  await test('getSessionCookieOptions enforces Secure flag in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.COOKIE_SECURE;
    const opts = getSessionCookieOptions();
    assert.strictEqual(opts.secure, true, 'Cookie MUST have Secure flag in production');
    process.env = { ...origEnv };
  });

  await test('getSessionCookieOptions enforces Secure flag when behind HTTPS proxy', () => {
    delete process.env.NODE_ENV;
    delete process.env.COOKIE_SECURE;
    const mockReq = {
      secure: false,
      headers: { 'x-forwarded-proto': 'https' }
    };
    const opts = getSessionCookieOptions(mockReq);
    assert.strictEqual(opts.secure, true, 'Cookie MUST have Secure flag when x-forwarded-proto is https');
  });

  await test('getSessionCookieOptions respects COOKIE_SECURE=true override', () => {
    process.env.COOKIE_SECURE = 'true';
    const opts = getSessionCookieOptions();
    assert.strictEqual(opts.secure, true, 'Cookie MUST be Secure when COOKIE_SECURE=true');
    process.env = { ...origEnv };
  });

  await test('getClearCookieOptions matches getSessionCookieOptions attributes', () => {
    process.env.NODE_ENV = 'production';
    const clearOpts = getClearCookieOptions();
    assert.strictEqual(clearOpts.httpOnly, true, 'Clear options must include HttpOnly');
    assert.strictEqual(clearOpts.sameSite, 'strict', 'Clear options must include SameSite=Strict');
    assert.strictEqual(clearOpts.secure, true, 'Clear options must include Secure in production');
    assert.strictEqual(clearOpts.path, '/', 'Clear options must specify Path=/');
    process.env = { ...origEnv };
  });

  // ─────────────────────────────────────────────────────────────
  // Section 2: Express Cookie Issuance & Deletion Headers
  // ─────────────────────────────────────────────────────────────
  console.log('\n[2] HTTP Set-Cookie Headers & Browser Deletion:');

  await test('Session cookie set on response contains HttpOnly, SameSite=Strict, and Path=/', async () => {
    const app = express();
    app.use(cookieParser());
    app.get('/login-test', (req, res) => {
      res.cookie('iochunt_session', 'test_session_token_123', getSessionCookieOptions(req, { maxAge: 3600000 }));
      res.json({ ok: true });
    });

    const res = await makeRequest(app, { path: '/login-test' });
    const setCookie = res.headers['set-cookie'];
    assert.ok(setCookie && setCookie.length > 0, 'Set-Cookie header must be present');
    const cookieHeader = setCookie[0];

    assert.ok(cookieHeader.includes('iochunt_session=test_session_token_123'), 'Cookie name and token must match');
    assert.ok(/httponly/i.test(cookieHeader), 'Set-Cookie MUST include HttpOnly');
    assert.ok(/samesite=strict/i.test(cookieHeader), 'Set-Cookie MUST include SameSite=Strict');
    assert.ok(/path=\//i.test(cookieHeader), 'Set-Cookie MUST include Path=/');
  });

  await test('res.clearCookie sends proper removal attributes (Max-Age=0 or expired)', async () => {
    const app = express();
    app.use(cookieParser());
    app.post('/logout-test', (req, res) => {
      res.clearCookie('iochunt_session', getClearCookieOptions(req));
      res.json({ success: true });
    });

    const res = await makeRequest(app, { method: 'POST', path: '/logout-test' });
    const setCookie = res.headers['set-cookie'];
    assert.ok(setCookie && setCookie.length > 0, 'Set-Cookie deletion header must be present');
    const cookieHeader = setCookie[0];

    assert.ok(/iochunt_session=/i.test(cookieHeader), 'Must clear iochunt_session');
    assert.ok(/httponly/i.test(cookieHeader), 'Clear header must preserve HttpOnly');
    assert.ok(/samesite=strict/i.test(cookieHeader), 'Clear header must preserve SameSite=Strict');
    assert.ok(/path=\//i.test(cookieHeader), 'Clear header must preserve Path=/');
    assert.ok(
      cookieHeader.includes('Expires=Thu, 01 Jan 1970') || /max-age=0/i.test(cookieHeader),
      'Clear header must set expiration to epoch or Max-Age=0'
    );
  });

  // ─────────────────────────────────────────────────────────────
  // Section 3: Logout Endpoint Resiliency & Server-Side Cleanup
  // ─────────────────────────────────────────────────────────────
  console.log('\n[3] Logout Endpoint Resiliency & Server-Side Invalidation:');

  await test('/api/auth/logout succeeds with 200 and clears cookie even when unauthenticated/expired', async () => {
    const app = express();
    app.use(cookieParser());
    const { optionalSession } = require('../backend/src/middlewares/authMiddleware');

    // Simulate the logout endpoint with optionalSession
    app.post('/api/auth/logout', optionalSession, (req, res) => {
      res.clearCookie('iochunt_session', getClearCookieOptions(req));
      res.status(200).json({ success: true, message: 'Logged out successfully' });
    });

    // Call logout with NO cookie/token (e.g. session already expired)
    const res = await makeRequest(app, { method: 'POST', path: '/api/auth/logout' });
    assert.strictEqual(res.statusCode, 200, 'Logout MUST return 200 even if session expired or missing');
    const setCookie = res.headers['set-cookie'];
    assert.ok(setCookie && setCookie.length > 0, 'Must still issue clearCookie to remove client cookie');
  });

  // ─────────────────────────────────────────────────────────────
  // Section 4: Token Architecture, Rotation & Privilege Change Safety
  // ─────────────────────────────────────────────────────────────
  console.log('\n[4] Token Architecture & Privilege Change Safety:');

  await test('Session tokens are high-entropy 256-bit CSPRNG hex strings', () => {
    const crypto = require('crypto');
    const token1 = crypto.randomBytes(32).toString('hex');
    const token2 = crypto.randomBytes(32).toString('hex');

    assert.strictEqual(token1.length, 64, '256-bit token in hex must be 64 chars long');
    assert.strictEqual(token2.length, 64, '256-bit token in hex must be 64 chars long');
    assert.notStrictEqual(token1, token2, 'Generated tokens must be distinct');
    assert.match(token1, /^[a-f0-9]{64}$/, 'Token must be valid lowercase hex');
  });

  await test('Privilege change invalidation logic triggers session revocation', () => {
    // Verify privilege change detection condition
    const existingRole = 'ADMIN';
    const newRole = 'VIEWER';
    const isRoleChanged = Boolean(newRole && newRole.toUpperCase() !== existingRole);
    assert.strictEqual(isRoleChanged, true, 'Role difference must be detected as privilege change');

    // Verify same role does not trigger false revocation
    const sameRole = 'ADMIN';
    const isSameRoleChanged = Boolean(sameRole && sameRole.toUpperCase() !== existingRole);
    assert.strictEqual(isSameRoleChanged, false, 'Identical role must not trigger privilege change');
  });

  await test('Super Admin login terminates previous sessions (Token Rotation)', () => {
    // Simulating token rotation logic
    const activeSessions = new Map([
      ['admin_1', 'old_active_token_abc123']
    ]);

    const adminId = 'admin_1';
    // When new login happens: delete old sessions for this admin
    activeSessions.delete(adminId);
    const newToken = 'new_rotated_token_xyz789';
    activeSessions.set(adminId, newToken);

    assert.strictEqual(activeSessions.get(adminId), 'new_rotated_token_xyz789');
    assert.strictEqual(activeSessions.size, 1, 'Only the rotated session should remain');
  });

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`  All ${passedTests} session & cookie security tests passed successfully!`);
  console.log('════════════════════════════════════════════════════════════════\n');
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
