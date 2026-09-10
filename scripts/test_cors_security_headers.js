// ════════════════════════════════════════════════════════════════
// IOC Hunt — CORS & Security Headers Verification Suite
// ════════════════════════════════════════════════════════════════
const assert = require('assert');
const http = require('http');
const path = require('path');

// Ensure modules from backend/node_modules can be resolved regardless of cwd
module.paths.push(path.join(__dirname, '../backend/node_modules'));

const express = require('express');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║      IOC Hunt — CORS & Security Headers Verification Suite     ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const { createSecurityHeadersMiddleware, getCspDirectives } = require('../backend/src/middlewares/securityHeaders');
const { createCorsMiddleware, getTrustedOrigins, isOriginAllowed, normalizeOrigin } = require('../backend/src/middlewares/corsConfig');

let passedTests = 0;

/**
 * Helper to make HTTP request to an express instance
 */
function makeRequest(app, { method = 'GET', path = '/', headers = {} } = {}) {
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
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          server.close(() => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body
            });
          });
        });
      });

      req.on('error', (err) => {
        server.close(() => reject(err));
      });

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
  // Section 1: Security Headers Middleware Verification
  // ─────────────────────────────────────────────────────────────
  console.log('[1] Security Headers Middleware (CSP, HSTS, DENY, nosniff, etc.):');

  await test('Sets Content-Security-Policy with required directives', async () => {
    process.env.NODE_ENV = 'production';
    process.env.USE_HTTPS = 'true';
    const app = express();
    app.use(createSecurityHeadersMiddleware());
    app.get('/test', (req, res) => res.send('ok'));

    const res = await makeRequest(app, { path: '/test' });
    const csp = res.headers['content-security-policy'];
    assert.ok(csp, 'CSP header should be present');
    assert.ok(csp.includes("default-src 'self'"), "CSP must include default-src 'self'");
    assert.ok(csp.includes("frame-ancestors 'none'"), "CSP must include frame-ancestors 'none'");
    assert.ok(csp.includes("object-src 'none'"), "CSP must include object-src 'none'");
    assert.ok(csp.includes("base-uri 'self'"), "CSP must include base-uri 'self'");
    assert.ok(csp.includes("form-action 'self'"), "CSP must include form-action 'self'");
    assert.ok(csp.includes("https://fonts.googleapis.com"), 'CSP must allow Google Fonts stylesheets');
    assert.ok(csp.includes("https://fonts.gstatic.com"), 'CSP must allow Google Fonts webfonts');
    assert.ok(csp.includes("upgrade-insecure-requests"), 'CSP must include upgrade-insecure-requests in production HTTPS');
  });

  await test('Sets X-Content-Type-Options to nosniff', async () => {
    const app = express();
    app.use(createSecurityHeadersMiddleware());
    app.get('/test', (req, res) => res.send('ok'));

    const res = await makeRequest(app, { path: '/test' });
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
  });

  await test('Sets X-Frame-Options to DENY', async () => {
    const app = express();
    app.use(createSecurityHeadersMiddleware());
    app.get('/test', (req, res) => res.send('ok'));

    const res = await makeRequest(app, { path: '/test' });
    assert.strictEqual(res.headers['x-frame-options'], 'DENY');
  });

  await test('Sets Strict-Transport-Security (HSTS) in production', async () => {
    process.env.NODE_ENV = 'production';
    const app = express();
    app.use(createSecurityHeadersMiddleware());
    app.get('/test', (req, res) => res.send('ok'));

    const res = await makeRequest(app, { path: '/test' });
    const hsts = res.headers['strict-transport-security'];
    assert.ok(hsts, 'HSTS header must be present in production');
    assert.ok(hsts.includes('max-age=31536000'), 'HSTS must specify at least 1 year (31536000s)');
    assert.ok(hsts.includes('includeSubDomains'), 'HSTS must include includeSubDomains');
  });

  await test('Sets Referrer-Policy to strict-origin-when-cross-origin', async () => {
    const app = express();
    app.use(createSecurityHeadersMiddleware());
    app.get('/test', (req, res) => res.send('ok'));

    const res = await makeRequest(app, { path: '/test' });
    assert.strictEqual(res.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  });

  await test('Sets Permissions-Policy restricting camera, microphone, geolocation, usb', async () => {
    const app = express();
    app.use(createSecurityHeadersMiddleware());
    app.get('/test', (req, res) => res.send('ok'));

    const res = await makeRequest(app, { path: '/test' });
    const pp = res.headers['permissions-policy'];
    assert.ok(pp, 'Permissions-Policy header must be present');
    assert.ok(pp.includes('camera=()'), 'Permissions-Policy must restrict camera');
    assert.ok(pp.includes('microphone=()'), 'Permissions-Policy must restrict microphone');
    assert.ok(pp.includes('geolocation=()'), 'Permissions-Policy must restrict geolocation');
    assert.ok(pp.includes('payment=()'), 'Permissions-Policy must restrict payment');
    assert.ok(pp.includes('usb=()'), 'Permissions-Policy must restrict usb');
  });

  await test('Removes X-Powered-By and Server headers', async () => {
    const app = express();
    app.use(createSecurityHeadersMiddleware());
    app.get('/test', (req, res) => {
      res.setHeader('X-Powered-By', 'Express');
      res.setHeader('Server', 'Node-Server');
      res.send('ok');
    });

    const res = await makeRequest(app, { path: '/test' });
    assert.strictEqual(res.headers['x-powered-by'], undefined);
    assert.strictEqual(res.headers['server'], undefined);
  });

  // ─────────────────────────────────────────────────────────────
  // Section 2: CORS Configuration & Origin Restriction
  // ─────────────────────────────────────────────────────────────
  console.log('\n[2] CORS Configuration & Wildcard Origin Restriction:');

  await test('Wildcard (*) is rejected and never allowed with credentials', async () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = '*';
    const app = express();
    app.use(createCorsMiddleware());
    app.get('/api/test', (req, res) => res.json({ status: 'ok' }));

    // Attacker tries to make a cross-origin request
    const res = await makeRequest(app, {
      path: '/api/test',
      headers: { Origin: 'https://malicious-attacker.com' }
    });

    // Access-Control-Allow-Origin MUST NOT be reflected or set to *
    assert.strictEqual(
      res.headers['access-control-allow-origin'],
      undefined,
      'Untrusted origin must not receive Access-Control-Allow-Origin'
    );
    assert.notStrictEqual(res.headers['access-control-allow-origin'], '*');
  });

  await test('Allows trusted origin configured in FRONTEND_URL with credentials', async () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'https://dashboard.iochunt.corp';
    const app = express();
    app.use(createCorsMiddleware());
    app.get('/api/test', (req, res) => res.json({ status: 'ok' }));

    const res = await makeRequest(app, {
      path: '/api/test',
      headers: { Origin: 'https://dashboard.iochunt.corp' }
    });

    assert.strictEqual(
      res.headers['access-control-allow-origin'],
      'https://dashboard.iochunt.corp',
      'Trusted origin should receive matching Access-Control-Allow-Origin'
    );
    assert.strictEqual(
      res.headers['access-control-allow-credentials'],
      'true',
      'Credentials must be enabled for trusted origin'
    );
  });

  await test('Blocks untrusted origin when specific FRONTEND_URL is set', async () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'https://dashboard.iochunt.corp';
    const app = express();
    app.use(createCorsMiddleware());
    app.get('/api/test', (req, res) => res.json({ status: 'ok' }));

    const res = await makeRequest(app, {
      path: '/api/test',
      headers: { Origin: 'https://evil.corp' }
    });

    assert.strictEqual(
      res.headers['access-control-allow-origin'],
      undefined,
      'Untrusted origin must not receive Access-Control-Allow-Origin'
    );
  });

  await test('Handles preflight OPTIONS from trusted origin with preflight headers', async () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'https://dashboard.iochunt.corp';
    const app = express();
    app.use(createCorsMiddleware());
    app.options('/api/test', (req, res) => res.sendStatus(204));
    app.post('/api/test', (req, res) => res.json({ status: 'ok' }));

    const res = await makeRequest(app, {
      method: 'OPTIONS',
      path: '/api/test',
      headers: {
        Origin: 'https://dashboard.iochunt.corp',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization, X-CSRF-Token'
      }
    });

    assert.strictEqual(res.statusCode, 204);
    assert.strictEqual(res.headers['access-control-allow-origin'], 'https://dashboard.iochunt.corp');
    assert.strictEqual(res.headers['access-control-allow-credentials'], 'true');
    assert.ok(res.headers['access-control-allow-methods'].includes('POST'));
    assert.strictEqual(res.headers['access-control-max-age'], '86400');
  });

  await test('Rejects preflight OPTIONS from untrusted origin', async () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'https://dashboard.iochunt.corp';
    const app = express();
    app.use(createCorsMiddleware());
    app.options('/api/test', (req, res) => res.sendStatus(204));

    const res = await makeRequest(app, {
      method: 'OPTIONS',
      path: '/api/test',
      headers: {
        Origin: 'https://evil.corp',
        'Access-Control-Request-Method': 'POST'
      }
    });

    assert.strictEqual(
      res.headers['access-control-allow-origin'],
      undefined,
      'Untrusted preflight must not receive Access-Control-Allow-Origin'
    );
  });

  await test('Supports multiple comma-separated trusted origins and normalizes slashes', async () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'https://app1.iochunt.corp/, https://app2.iochunt.corp';
    const app = express();
    app.use(createCorsMiddleware());
    app.get('/api/test', (req, res) => res.json({ status: 'ok' }));

    const res1 = await makeRequest(app, {
      path: '/api/test',
      headers: { Origin: 'https://app1.iochunt.corp' }
    });
    assert.strictEqual(res1.headers['access-control-allow-origin'], 'https://app1.iochunt.corp');

    const res2 = await makeRequest(app, {
      path: '/api/test',
      headers: { Origin: 'https://app2.iochunt.corp' }
    });
    assert.strictEqual(res2.headers['access-control-allow-origin'], 'https://app2.iochunt.corp');

    const res3 = await makeRequest(app, {
      path: '/api/test',
      headers: { Origin: 'https://app3.iochunt.corp' }
    });
    assert.strictEqual(res3.headers['access-control-allow-origin'], undefined);
  });

  await test('Allows direct API agent requests without Origin header', async () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'https://dashboard.iochunt.corp';
    const app = express();
    app.use(createCorsMiddleware());
    app.post('/api/logs', express.json(), (req, res) => res.json({ received: true }));

    const res = await makeRequest(app, {
      method: 'POST',
      path: '/api/logs',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'agent-test-key'
      }
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.received, true);
    assert.strictEqual(res.headers['access-control-allow-origin'], undefined);
  });

  await test('Permits standard dev origins in non-production environment', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.FRONTEND_URL;
    delete process.env.CENTRAL_FRONTEND_URL;
    delete process.env.ALLOWED_ORIGINS;
    const app = express();
    app.use(createCorsMiddleware());
    app.get('/api/test', (req, res) => res.json({ status: 'ok' }));

    const res = await makeRequest(app, {
      path: '/api/test',
      headers: { Origin: 'http://localhost:5173' }
    });

    assert.strictEqual(res.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.strictEqual(res.headers['access-control-allow-credentials'], 'true');

    // External origins still rejected
    const extRes = await makeRequest(app, {
      path: '/api/test',
      headers: { Origin: 'https://untrusted-public.com' }
    });
    assert.strictEqual(extRes.headers['access-control-allow-origin'], undefined);
  });

  // Restore env
  Object.keys(process.env).forEach(k => {
    if (!(k in origEnv)) delete process.env[k];
  });
  Object.assign(process.env, origEnv);

  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`  All ${passedTests} security verification tests passed successfully!`);
  console.log(`════════════════════════════════════════════════════════════════\n`);
}

runAllTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
