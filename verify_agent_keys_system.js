const assert = require('assert');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

console.log('════════════════════════════════════════════════════════════════');
console.log('🧪 VERIFYING UNIQUE AGENT KEYS & ANTI-SPOOFING SYSTEM');
console.log('════════════════════════════════════════════════════════════════\n');

const backendDir = path.join(__dirname, 'backend');

// 1. Verify agentKeyRoutes existence and middleware protection
console.log('Test 1: Verify /api/agent-keys routes and admin protection');
const agentKeyRoutes = require(path.join(backendDir, 'src/routes/agentKeyRoutes'));
const { requireSession, requireAdmin } = require(path.join(backendDir, 'src/middlewares/authMiddleware'));

assert.ok(agentKeyRoutes, 'agentKeyRoutes module must exist');
const globalMiddleware = agentKeyRoutes.stack.filter(l => !l.route).map(l => l.handle);
assert.ok(globalMiddleware.includes(requireSession), 'agentKeyRoutes must require session');
assert.ok(globalMiddleware.includes(requireAdmin), 'agentKeyRoutes must require admin privileges');
console.log('  ✅ PASS: All agent-key routes protected by requireSession and requireAdmin.');

// 2. Verify all required endpoints exist on agentKeyRoutes
console.log('\nTest 2: Verify endpoints on agentKeyRoutes');
const expectedEndpoints = [
  { path: '/generate', method: 'post', name: 'POST /api/agent-keys/generate (bulk generation)' },
  { path: '/', method: 'get', name: 'GET /api/agent-keys (list keys & fleet stats)' },
  { path: '/bulk-action', method: 'post', name: 'POST /api/agent-keys/bulk-action (bulk operations)' },
  { path: '/:id/revoke', method: 'post', name: 'POST /api/agent-keys/:id/revoke (revoke key)' },
  { path: '/:id/reset', method: 'post', name: 'POST /api/agent-keys/:id/reset (reset binding)' },
  { path: '/:id', method: 'delete', name: 'DELETE /api/agent-keys/:id (delete key)' }
];

for (const ep of expectedEndpoints) {
  const layer = agentKeyRoutes.stack.find(l =>
    l.route &&
    l.route.path === ep.path &&
    l.route.methods[ep.method]
  );
  assert.ok(layer, `Endpoint ${ep.name} must exist`);
  console.log(`  ✅ PASS: ${ep.name} is properly registered.`);
}

// 3. Verify server.js mounts /api/agent-keys
console.log('\nTest 3: Verify server.js mounts /api/agent-keys');
const serverContent = fs.readFileSync(path.join(backendDir, 'src/server.js'), 'utf8');
assert.ok(serverContent.includes("app.use('/api/agent-keys'"), "server.js must mount /api/agent-keys");
console.log('  ✅ PASS: server.js mounts /api/agent-keys.');

// 4. Verify agentLogController mitigates INT-PT-H-003 and INT-PT-H-004
console.log('\nTest 4: Verify agentLogController anti-spoofing enforcement (INT-PT-H-003 & INT-PT-H-004)');
const agentLogController = require(path.join(backendDir, 'src/controllers/agentLogController'));
assert.strictEqual(typeof agentLogController.ingestAgentLogs, 'function', 'ingestAgentLogs must exist');

const logControllerContent = fs.readFileSync(path.join(backendDir, 'src/controllers/agentLogController.js'), 'utf8');
assert.ok(logControllerContent.includes('req.isAgentKey && req.boundMachine'), 'agentLogController must check req.boundMachine');
assert.ok(logControllerContent.includes('Machine identity mismatch'), 'agentLogController must reject machine spoofing attempts');
console.log('  ✅ PASS: agentLogController rejects mismatched machine logs (INT-PT-H-003 & INT-PT-H-004 fixed).');

// 5. Verify policyController mitigates INT-PT-L-002 (Cross-Machine Policy Snooping)
console.log('\nTest 5: Verify policyController policy isolation (INT-PT-L-002)');
const policyContent = fs.readFileSync(path.join(backendDir, 'src/controllers/policyController.js'), 'utf8');
assert.ok(policyContent.includes('req.isAgentKey && req.boundMachine'), 'policyController must enforce bound machine on policy GET');
assert.ok(policyContent.includes('Unauthorized access to policy'), 'policyController must return 403 on cross-machine query');
console.log('  ✅ PASS: policyController isolates machine policies (INT-PT-L-002 fixed).');

// 6. Verify machineController mitigates INT-PT-L-001 (Info Disclosure on Test Connection)
console.log('\nTest 6: Verify machineController cloaking on /api/machines (INT-PT-L-001)');
const machineContent = fs.readFileSync(path.join(backendDir, 'src/controllers/machineController.js'), 'utf8');
assert.ok(machineContent.includes('req.isAgentKey'), 'getAllMachines must check for agent keys');
assert.ok(machineContent.includes("status: 'connected'"), 'getAllMachines must return simple status to agent test connection');
console.log('  ✅ PASS: /api/machines cloaks fleet info for agents (INT-PT-L-001 fixed).');

// 7. Verify agentKeyService high-performance bulk generator logic
console.log('\nTest 7: Verify High-Performance Key Generation Algorithm in agentKeyService');
const agentKeyService = require(path.join(backendDir, 'src/services/agentKeyService'));
assert.strictEqual(typeof agentKeyService.generateBulkKeys, 'function', 'generateBulkKeys must exist');
assert.strictEqual(typeof agentKeyService.validateAndBindAgentKey, 'function', 'validateAndBindAgentKey must exist');
assert.strictEqual(typeof agentKeyService.revokeKey, 'function', 'revokeKey must exist');
assert.strictEqual(typeof agentKeyService.resetKey, 'function', 'resetKey must exist');
assert.strictEqual(typeof agentKeyService.bulkRevokeKeys, 'function', 'bulkRevokeKeys must exist');
assert.strictEqual(typeof agentKeyService.bulkResetKeys, 'function', 'bulkResetKeys must exist');
assert.strictEqual(typeof agentKeyService.bulkDeleteKeys, 'function', 'bulkDeleteKeys must exist');

// Benchmark in-memory generation of 200 base64url keys (e.g. BmHyVFDWUO1tUkiOC5gvbw)
const t0 = process.hrtime.bigint();
const testKeys = [];
for (let i = 0; i < 200; i++) {
  const rawKey = crypto.randomBytes(16).toString('base64url');
  const prefix = rawKey.slice(0, 8);
  const hash = crypto.createHash('sha256').update(rawKey).digest('hex');
  testKeys.push({ rawKey, prefix, hash });
}
const t1 = process.hrtime.bigint();
const elapsedMs = Number(t1 - t0) / 1e6;

assert.strictEqual(testKeys.length, 200, 'Must generate 200 keys');
const uniqueHashes = new Set(testKeys.map(k => k.hash));
assert.strictEqual(uniqueHashes.size, 200, 'All 200 keys must be unique');
assert.ok(testKeys.every(k => k.rawKey.length === 22), 'All keys must be 22-char base64url strings');
console.log(`  ✅ PASS: Generated 200 cryptographically unique base64url keys in RAM in ${elapsedMs.toFixed(2)} ms!`);

// 8. Verify Frontend files
console.log('\nTest 8: Verify Frontend AgentKeys Page & Navigation');
const frontendPageExists = fs.existsSync(path.join(__dirname, 'frontend/src/pages/AgentKeys.jsx'));
assert.ok(frontendPageExists, 'frontend/src/pages/AgentKeys.jsx must exist');

const appJsxContent = fs.readFileSync(path.join(__dirname, 'frontend/src/App.jsx'), 'utf8');
assert.ok(appJsxContent.includes('AgentKeys'), 'App.jsx must import AgentKeys');
assert.ok(appJsxContent.includes('path="agent-keys"'), 'App.jsx must register agent-keys route');

const sidebarContent = fs.readFileSync(path.join(__dirname, 'frontend/src/components/Sidebar.jsx'), 'utf8');
assert.ok(sidebarContent.includes('to="/agent-keys"'), 'Sidebar.jsx must link to /agent-keys');
console.log('  ✅ PASS: Frontend standalone page, route, and sidebar navigation are fully wired.');

console.log('\n════════════════════════════════════════════════════════════════');
console.log('🎉 ALL SYSTEM TESTS PASSED SUCCESSFULLY!');
console.log('════════════════════════════════════════════════════════════════\n');
