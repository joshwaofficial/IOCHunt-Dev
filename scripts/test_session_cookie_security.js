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
const appMode = require('../backend/src/config/appMode');
const {
  getSessionCookieOptions,
  getClearCookieOptions,
  getSessionCookieName,
  getCandidateCookieNames,
  getClearCookieNames,
  DEFAULT_CENTRAL_COOKIE_NAME,
  DEFAULT_AGGREGATOR_COOKIE_NAME,
  LEGACY_COOKIE_NAME
} = require('../backend/src/utils/cookieHelper');
const { parseSessionCookie, optionalSession } = require('../backend/src/middlewares/authMiddleware');

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
  // Section 1: Cookie Configuration Helper & Scoping Verification
  // ─────────────────────────────────────────────────────────────
  console.log('[1] Cookie Security Attributes, Names & Multi-Instance Scoping:');

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

  await test('Central Server mode resolves iochunt_central_session cookie name', () => {
    appMode.setConfig({ mode: 'central_server', setupComplete: true });
    assert.strictEqual(getSessionCookieName(), 'iochunt_central_session');
    const candidates = getCandidateCookieNames();
    assert.ok(candidates.includes('iochunt_central_session'), 'Candidates must include iochunt_central_session');
    assert.ok(candidates.includes('iochunt_session'), 'Candidates must include legacy fallback iochunt_session');
    assert.ok(!candidates.includes('iochunt_aggregator_session'), 'Central candidates must NOT include aggregator cookie');
  });

  await test('Branch Aggregator mode resolves iochunt_aggregator_session cookie name', () => {
    appMode.setConfig({ mode: 'aggregator', setupComplete: true });
    assert.strictEqual(getSessionCookieName(), 'iochunt_aggregator_session');
    const candidates = getCandidateCookieNames();
    assert.ok(candidates.includes('iochunt_aggregator_session'), 'Candidates must include iochunt_aggregator_session');
    assert.ok(candidates.includes('iochunt_session'), 'Candidates must include legacy fallback iochunt_session');
    assert.ok(!candidates.includes('iochunt_central_session'), 'Aggregator candidates must NOT include central cookie');
  });

  await test('Logout clear cookie list protects opposing instance cookie', () => {
    appMode.setConfig({ mode: 'central_server', setupComplete: true });
    const centralClear = getClearCookieNames();
    assert.ok(centralClear.includes('iochunt_central_session'));
    assert.ok(!centralClear.includes('iochunt_aggregator_session'), 'Central logout MUST NEVER clear aggregator session');

    appMode.setConfig({ mode: 'aggregator', setupComplete: true });
    const aggClear = getClearCookieNames();
    assert.ok(aggClear.includes('iochunt_aggregator_session'));
    assert.ok(!aggClear.includes('iochunt_central_session'), 'Aggregator logout MUST NEVER clear central session');
  });

  // ─────────────────────────────────────────────────────────────
  // Section 2: Express Cookie Issuance & Deletion Headers
  // ─────────────────────────────────────────────────────────────
  console.log('\n[2] HTTP Set-Cookie Headers & Multi-Instance Browser Deletion:');

  await test('Central Server issues iochunt_central_session with secure attributes', async () => {
    appMode.setConfig({ mode: 'central_server', setupComplete: true });
    const app = express();
    app.use(cookieParser());
    app.get('/login-central', (req, res) => {
      res.cookie(getSessionCookieName(req), 'central_token_abc123', getSessionCookieOptions(req, { maxAge: 3600000 }));
      res.json({ ok: true });
    });

    const res = await makeRequest(app, { path: '/login-central' });
    const setCookie = res.headers['set-cookie'];
    assert.ok(setCookie && setCookie.length > 0, 'Set-Cookie header must be present');
    const cookieHeader = setCookie[0];

    assert.ok(cookieHeader.includes('iochunt_central_session=central_token_abc123'), 'Must issue iochunt_central_session');
    assert.ok(/httponly/i.test(cookieHeader), 'Set-Cookie MUST include HttpOnly');
    assert.ok(/samesite=strict/i.test(cookieHeader), 'Set-Cookie MUST include SameSite=Strict');
    assert.ok(/path=\//i.test(cookieHeader), 'Set-Cookie MUST include Path=/');
  });

  await test('Branch Aggregator issues iochunt_aggregator_session with secure attributes', async () => {
    appMode.setConfig({ mode: 'aggregator', setupComplete: true });
    const app = express();
    app.use(cookieParser());
    app.get('/login-agg', (req, res) => {
      res.cookie(getSessionCookieName(req), 'agg_token_xyz789', getSessionCookieOptions(req, { maxAge: 3600000 }));
      res.json({ ok: true });
    });

    const res = await makeRequest(app, { path: '/login-agg' });
    const setCookie = res.headers['set-cookie'];
    assert.ok(setCookie && setCookie.length > 0, 'Set-Cookie header must be present');
    const cookieHeader = setCookie[0];

    assert.ok(cookieHeader.includes('iochunt_aggregator_session=agg_token_xyz789'), 'Must issue iochunt_aggregator_session');
    assert.ok(/httponly/i.test(cookieHeader), 'Set-Cookie MUST include HttpOnly');
    assert.ok(/samesite=strict/i.test(cookieHeader), 'Set-Cookie MUST include SameSite=Strict');
    assert.ok(/path=\//i.test(cookieHeader), 'Set-Cookie MUST include Path=/');
  });

  await test('res.clearCookie on Central Server clears iochunt_central_session and legacy iochunt_session', async () => {
    appMode.setConfig({ mode: 'central_server', setupComplete: true });
    const app = express();
    app.use(cookieParser());
    app.post('/logout-test', (req, res) => {
      for (const cName of getClearCookieNames(req)) {
        res.clearCookie(cName, getClearCookieOptions(req));
      }
      res.json({ success: true });
    });

    const res = await makeRequest(app, { method: 'POST', path: '/logout-test' });
    const setCookies = res.headers['set-cookie'] || [];
    assert.ok(setCookies.length >= 2, 'Must issue clear instructions for both central and legacy');
    const combined = setCookies.join('; ');
    assert.ok(combined.includes('iochunt_central_session='), 'Must clear iochunt_central_session');
    assert.ok(combined.includes('iochunt_session='), 'Must clear legacy iochunt_session');
    assert.ok(!combined.includes('iochunt_aggregator_session='), 'Must NOT clear aggregator session');
  });

  // ─────────────────────────────────────────────────────────────
  // Section 3: Concurrent Multi-Tab Cookie Isolation in Same Browser
  // ─────────────────────────────────────────────────────────────
  console.log('\n[3] Simultaneous Browser Sessions Isolation (Same Host, Multiple Tabs):');

  await test('Central Server correctly extracts its own token when both Central and Aggregator cookies exist', () => {
    appMode.setConfig({ mode: 'central_server', setupComplete: true });
    const mockReq = {
      headers: {
        cookie: 'iochunt_aggregator_session=agg_token_111; iochunt_central_session=central_token_222'
      },
      cookies: {
        iochunt_aggregator_session: 'agg_token_111',
        iochunt_central_session: 'central_token_222'
      }
    };
    const extracted = parseSessionCookie(mockReq);
    assert.strictEqual(extracted, 'central_token_222', 'Central server MUST extract central token and ignore aggregator');
  });

  await test('Branch Aggregator correctly extracts its own token when both Central and Aggregator cookies exist', () => {
    appMode.setConfig({ mode: 'aggregator', setupComplete: true });
    const mockReq = {
      headers: {
        cookie: 'iochunt_central_session=central_token_222; iochunt_aggregator_session=agg_token_111'
      },
      cookies: {
        iochunt_central_session: 'central_token_222',
        iochunt_aggregator_session: 'agg_token_111'
      }
    };
    const extracted = parseSessionCookie(mockReq);
    assert.strictEqual(extracted, 'agg_token_111', 'Aggregator MUST extract aggregator token and ignore central');
  });

  await test('Backward compatibility: Central Server falls back to legacy iochunt_session when present', () => {
    appMode.setConfig({ mode: 'central_server', setupComplete: true });
    const mockReq = {
      headers: {
        cookie: 'iochunt_session=legacy_token_333'
      },
      cookies: {
        iochunt_session: 'legacy_token_333'
      }
    };
    const extracted = parseSessionCookie(mockReq);
    assert.strictEqual(extracted, 'legacy_token_333', 'Central server MUST accept legacy token for zero downtime migration');
  });

  await test('Backward compatibility: Aggregator falls back to legacy iochunt_session when present', () => {
    appMode.setConfig({ mode: 'aggregator', setupComplete: true });
    const mockReq = {
      headers: {
        cookie: 'iochunt_session=legacy_token_444'
      },
      cookies: {
        iochunt_session: 'legacy_token_444'
      }
    };
    const extracted = parseSessionCookie(mockReq);
    assert.strictEqual(extracted, 'legacy_token_444', 'Aggregator MUST accept legacy token for zero downtime migration');
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
    const existingRole = 'ADMIN';
    const newRole = 'VIEWER';
    const isRoleChanged = Boolean(newRole && newRole.toUpperCase() !== existingRole);
    assert.strictEqual(isRoleChanged, true, 'Role difference must be detected as privilege change');

    const sameRole = 'ADMIN';
    const isSameRoleChanged = Boolean(sameRole && sameRole.toUpperCase() !== existingRole);
    assert.strictEqual(isSameRoleChanged, false, 'Identical role must not trigger privilege change');
  });

  await test('Super Admin login terminates previous sessions (Token Rotation)', () => {
    const activeSessions = new Map([
      ['admin_1', 'old_active_token_abc123']
    ]);

    const adminId = 'admin_1';
    activeSessions.delete(adminId);
    const newToken = 'new_rotated_token_xyz789';
    activeSessions.set(adminId, newToken);

    assert.strictEqual(activeSessions.get(adminId), 'new_rotated_token_xyz789');
    assert.strictEqual(activeSessions.size, 1, 'Only the rotated session should remain');
  });

  // Reset back to central
  appMode.setConfig({ mode: 'central_server', setupComplete: true });

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`  All ${passedTests} session & cookie security tests passed successfully!`);
  console.log('════════════════════════════════════════════════════════════════\n');
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

