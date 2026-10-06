const assert = require('assert');

async function runTests() {
  console.log('Testing Database Retention & Aggregator Isolation...\n');

  const retentionController = require('../src/controllers/retentionController');

  // Test 1: updateRetentionPolicy validation
  console.log('[1] Testing updateRetentionPolicy input validation...');
  {
    let statusCode = 200;
    let jsonBody = null;
    const req = {
      body: {}
    };
    const res = {
      status(c) { statusCode = c; return this; },
      json(data) { jsonBody = data; return this; }
    };
    await retentionController.updateRetentionPolicy(req, res);
    assert.strictEqual(statusCode, 400);
    assert.ok(jsonBody.error.includes('must be an integer'));
    console.log('  ✓ Correctly rejects empty retention payload with 400');
  }

  // Test 2: purgeExpiredData log_type validation
  console.log('[2] Testing purgeExpiredData log_type validation...');
  {
    let statusCode = 200;
    let jsonBody = null;
    const req = {
      body: { log_type: 'invalid_type', days: 30 }
    };
    const res = {
      status(c) { statusCode = c; return this; },
      json(data) { jsonBody = data; return this; }
    };
    await retentionController.purgeExpiredData(req, res);
    assert.strictEqual(statusCode, 400);
    assert.ok(jsonBody.error.includes('Invalid log_type'));
    console.log('  ✓ Correctly rejects invalid log_type with 400');
  }

  // Test 3: Aggregator settingsController getSettings and updateRetention
  console.log('[3] Testing Aggregator settingsController methods...');
  {
    const settingsController = require('../src/modules/aggregator/controllers/settingsController');
    let statusCode = 200;
    let jsonBody = null;
    const req = {
      body: { local_retention_days: 'invalid' }
    };
    const res = {
      status(c) { statusCode = c; return this; },
      json(data) { jsonBody = data; return this; }
    };
    await settingsController.updateRetention(req, res);
    assert.strictEqual(statusCode, 400);
    assert.ok(jsonBody.error.includes('must be an integer'));
    console.log('  ✓ Aggregator settingsController rejects invalid retention days with 400');
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  All Retention & Aggregator Isolation tests passed successfully!');
  console.log('════════════════════════════════════════════════════════════════\n');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
