const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('=== VERIFYING MEDIUM SCOPE RESTRICTION FIXES ===\n');

const backendDir = fs.existsSync(path.join(__dirname, 'src'))
  ? __dirname
  : path.join(__dirname, 'backend');

const groupRoutes = require(path.join(backendDir, 'src/routes/groupRoutes'));
const groupController = require(path.join(backendDir, 'src/controllers/groupController'));
const emailRoutes = require(path.join(backendDir, 'src/routes/emailRoutes'));
const { requireAdmin } = require(path.join(backendDir, 'src/middlewares/authMiddleware'));

// 1. Verify groupRoutes requireAdmin on all mutating endpoints (Issues 8, 9, 10, 11, 12)
console.log('Test 1: Verify groupRoutes requireAdmin on all mutating endpoints');
const mutatingGroupRoutes = [
  { path: '/', method: 'post', name: 'POST /groups (createGroup)' },
  { path: '/:id', method: 'delete', name: 'DELETE /groups/:id (deleteGroup)' },
  { path: '/:id/policy', method: 'put', name: 'PUT /groups/:id/policy (updateGroupPolicy)' },
  { path: '/:id/machines', method: 'post', name: 'POST /groups/:id/machines (updateGroupMachines)' },
  { path: '/:id/machines/:machine', method: 'delete', name: 'DELETE /groups/:id/machines/:machine (removeMachineFromGroup)' }
];

for (const target of mutatingGroupRoutes) {
  const layer = groupRoutes.stack.find(l => 
    l.route && 
    l.route.path === target.path && 
    l.route.methods[target.method]
  );
  assert.ok(layer, `Route ${target.name} must exist`);
  
  const hasRequireAdmin = layer.route.stack.some(s => s.handle === requireAdmin || s.name === 'requireAdmin');
  assert.ok(hasRequireAdmin, `Route ${target.name} must have requireAdmin middleware`);
  console.log(`  PASS: ${target.name} has requireAdmin middleware.`);
}

// 2. Verify GET /groups remains accessible to authenticated users (read-only for UI)
console.log('\nTest 2: Verify GET /groups remains read-only with requireSession');
const getGroupsLayer = groupRoutes.stack.find(l => l.route && l.route.path === '/' && l.route.methods.get);
assert.ok(getGroupsLayer, 'GET /groups must exist');
const getHasRequireAdmin = getGroupsLayer.route.stack.some(s => s.handle === requireAdmin || s.name === 'requireAdmin');
assert.strictEqual(getHasRequireAdmin, false, 'GET /groups should allow authenticated analysts for reading group memberships');
console.log('  PASS: GET /groups allows read access.\n');

// 3. Verify groupController 404 existence checks
console.log('Test 3: Verify groupController 404 existence checks on nonexistent groups');
async function testGroupControllerExistence() {
  function makeReqRes(params = { id: 'grp_nonexistent' }, body = {}) {
    let statusCode = 200;
    let jsonBody = null;
    const req = {
      params,
      body,
      queryTenant: async (sql, p) => {
        if (sql.includes('SELECT id FROM pol_groups WHERE id=$1')) {
          return { rows: [] }; // nonexistent
        }
        return { rows: [] };
      }
    };
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonBody = data; return res; }
    };
    return { req, res, getResult: () => ({ statusCode, jsonBody }) };
  }

  // deleteGroup
  {
    const { req, res, getResult } = makeReqRes();
    await groupController.deleteGroup(req, res);
    assert.strictEqual(getResult().statusCode, 404, 'deleteGroup on nonexistent group must return 404');
  }

  // updateGroupPolicy
  {
    const { req, res, getResult } = makeReqRes({ id: 'grp_nonexistent' }, { policy: {} });
    await groupController.updateGroupPolicy(req, res);
    assert.strictEqual(getResult().statusCode, 404, 'updateGroupPolicy on nonexistent group must return 404');
  }

  // updateGroupMachines
  {
    const { req, res, getResult } = makeReqRes({ id: 'grp_nonexistent' }, { machines: ['host1'] });
    await groupController.updateGroupMachines(req, res);
    assert.strictEqual(getResult().statusCode, 404, 'updateGroupMachines on nonexistent group must return 404');
  }

  // removeMachineFromGroup
  {
    const { req, res, getResult } = makeReqRes({ id: 'grp_nonexistent', machine: 'host1' });
    await groupController.removeMachineFromGroup(req, res);
    assert.strictEqual(getResult().statusCode, 404, 'removeMachineFromGroup on nonexistent group must return 404');
  }

  console.log('  PASS: deleteGroup, updateGroupPolicy, updateGroupMachines, and removeMachineFromGroup all return 404 when group does not exist.\n');
}

// 4. Verify Issue 13: POST /smtp/schedules has requireAdmin
console.log('Test 4: Verify Issue 13: POST /smtp/schedules has requireAdmin middleware');
const postScheduleLayer = emailRoutes.stack.find(l => l.route && l.route.path === '/schedules' && l.route.methods.post);
assert.ok(postScheduleLayer, 'POST /schedules route must exist');
const postScheduleHasRequireAdmin = postScheduleLayer.route.stack.some(s => s.handle === requireAdmin || s.name === 'requireAdmin');
assert.ok(postScheduleHasRequireAdmin, 'POST /schedules must have requireAdmin middleware');
console.log('  PASS: POST /smtp/schedules is strictly protected by requireAdmin.\n');

async function runAll() {
  await testGroupControllerExistence();
  console.log('====================================================');
  console.log('ALL MEDIUM SCOPE RESTRICTION VERIFICATIONS PASSED!');
  console.log('====================================================\n');
}

runAll().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
