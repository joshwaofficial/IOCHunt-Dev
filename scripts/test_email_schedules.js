// ════════════════════════════════════════════════════════════════
// IOC Hunt — Email Schedules & Multi-Tenant Routing Test Suite
// ════════════════════════════════════════════════════════════════

const assert = require('assert');
const { generateAndSendReport } = require('../backend/src/utils/reportBuilder');
const emailController = require('../backend/src/controllers/emailController');
const { startSchedule, stopSchedule } = require('../backend/src/utils/emailScheduler');

async function runTests() {
  console.log('Testing Email Reporting & Scheduling Multi-Tenant Routing...\n');

  // Test 1: generateAndSendReport with duration: 'today' and custom queryFn
  {
    let queriedTables = [];
    const mockQueryFn = async (sql, params) => {
      queriedTables.push(sql);
      if (sql.includes('smtp_config')) {
        return {
          rows: [{
            host: 'smtp.test.com',
            port: 587,
            secure: 0,
            username: 'test@test.com',
            password: '',
            from_addr: 'test@test.com',
            from_name: 'Test',
            enabled: 1
          }]
        };
      }
      if (sql.includes('COUNT(*) AS n FROM events')) {
        return { rows: [{ n: '5' }] };
      }
      if (sql.includes('GROUP BY severity')) {
        return { rows: [{ severity: 'high', n: '2' }] };
      }
      if (sql.includes('GROUP BY category')) {
        return { rows: [{ category: 'DOMAIN', n: '3' }] };
      }
      if (sql.includes("severity IN ('critical','high')")) {
        return { rows: [{ machine: 'M1', ts: '2026-09-28', tag: 'TAG1', category: 'DOMAIN', severity: 'high', message: 'Test high' }] };
      }
      if (sql.includes('SELECT * FROM machines')) {
        return { rows: [{ machine: 'M1', last_seen: 12345 }] };
      }
      if (sql.includes('AD attack indicators') || sql.includes("category='DOMAIN'")) {
        return { rows: [] };
      }
      return { rows: [] };
    };

    const scheduleToday = {
      id: 1,
      name: 'Today Schedule',
      recipients: 'admin@company.com',
      duration: 'today',
      machine: '',
      severity: '',
      category: '',
      aggregator: ''
    };

    // We stub nodemailer createTransporter by letting it attempt or mock
    const nodemailer = require('../backend/node_modules/nodemailer');
    let mailSent = null;
    const origCreateTransport = nodemailer.createTransport;
    nodemailer.createTransport = () => ({
      sendMail: async (opts) => {
        mailSent = opts;
        return { messageId: 'test-123' };
      }
    });

    try {
      await generateAndSendReport(scheduleToday, mockQueryFn, false);
      assert(mailSent, 'Mail should have been sent');
      assert.strictEqual(mailSent.to, 'admin@company.com');
      assert(mailSent.html.includes('Today (Since 00:00)'), 'HTML should contain Today label');
      console.log('✓ generateAndSendReport handles duration="today" without hours ReferenceError');
    } finally {
      nodemailer.createTransport = origCreateTransport;
    }
  }

  // Test 2: generateAndSendReport with duration: 24 (numeric)
  {
    const mockQueryFn = async (sql) => {
      if (sql.includes('smtp_config')) {
        return {
          rows: [{
            host: 'smtp.test.com',
            port: 587,
            secure: 0,
            username: 'test@test.com',
            password: '',
            from_addr: 'test@test.com',
            from_name: 'Test',
            enabled: 1
          }]
        };
      }
      return { rows: [] };
    };

    const schedule24 = {
      id: 2,
      name: '24h Schedule',
      recipients: 'sec@company.com',
      duration: 24,
      machine: '',
      severity: '',
      category: '',
      aggregator: ''
    };

    const nodemailer = require('../backend/node_modules/nodemailer');
    let mailSent = null;
    const origCreateTransport = nodemailer.createTransport;
    nodemailer.createTransport = () => ({
      sendMail: async (opts) => {
        mailSent = opts;
        return { messageId: 'test-456' };
      }
    });

    try {
      await generateAndSendReport(schedule24, mockQueryFn, false);
      assert(mailSent, 'Mail should have been sent');
      assert(mailSent.html.includes('Last 24 hours'), 'HTML should contain Last 24 hours label');
      console.log('✓ generateAndSendReport handles duration=24 successfully');
    } finally {
      nodemailer.createTransport = origCreateTransport;
    }
  }

  // Test 3: manual run (isManual: true) allows run even if cfg.enabled is 0
  {
    const mockQueryFn = async (sql) => {
      if (sql.includes('smtp_config')) {
        return {
          rows: [{
            host: 'smtp.test.com',
            port: 587,
            username: 'test@test.com',
            from_addr: 'test@test.com',
            from_name: 'Test',
            enabled: 0 // engine disabled!
          }]
        };
      }
      return { rows: [] };
    };

    const schedule = {
      id: 3,
      name: 'Manual Run Test',
      recipients: 'user@test.com',
      duration: 1
    };

    const nodemailer = require('../backend/node_modules/nodemailer');
    let mailSent = false;
    const origCreateTransport = nodemailer.createTransport;
    nodemailer.createTransport = () => ({
      sendMail: async () => { mailSent = true; }
    });

    try {
      // With isManual=true, it should send
      await generateAndSendReport(schedule, mockQueryFn, true);
      assert(mailSent, 'Manual run should succeed even when engine toggle is 0');
      console.log('✓ isManual=true allows on-demand run when SMTP host is configured');

      // With isManual=false, it should throw disabled error
      let threw = false;
      try {
        await generateAndSendReport(schedule, mockQueryFn, false);
      } catch (err) {
        threw = true;
        assert(err.message.includes('Scheduled Emails Engine is disabled'));
      }
      assert(threw, 'Automated run should throw when engine is disabled');
      console.log('✓ isManual=false enforces enabled toggle for automated schedules');
    } finally {
      nodemailer.createTransport = origCreateTransport;
    }
  }

  // Test 4: Missing host error
  {
    const mockQueryFn = async (sql) => {
      if (sql.includes('smtp_config')) {
        return { rows: [{ host: '', enabled: 1 }] };
      }
      return { rows: [] };
    };

    let threw = false;
    try {
      await generateAndSendReport({ id: 4, name: 'No Host', recipients: 'a@b.com' }, mockQueryFn, true);
    } catch (err) {
      threw = true;
      assert(err.message.includes('SMTP Host is not configured'));
    }
    assert(threw, 'Should throw if host is missing');
    console.log('✓ Throws clear error when SMTP Host is missing');
  }

  // Test 5: runSchedule passes req.queryTenant
  {
    let updatedStatus = null;
    let mailSent = false;
    const nodemailer = require('../backend/node_modules/nodemailer');
    const origCreateTransport = nodemailer.createTransport;
    nodemailer.createTransport = () => ({
      sendMail: async () => { mailSent = true; }
    });

    try {
      const mockReq = {
        params: { id: '3' },
        tenantId: 'defsecone',
        queryTenant: async (sql, params) => {
          if (sql.includes('SELECT * FROM email_schedules WHERE id=$1')) {
            return {
              rows: [{
                id: 3,
                name: 'Weekly Report',
                recipients: 'boss@corp.com',
                duration: 24,
                enabled: 1
              }]
            };
          }
          if (sql.includes('smtp_config')) {
            return {
              rows: [{
                host: 'smtp.hostinger.com',
                port: 587,
                username: 'demo@iochunt.in',
                from_addr: 'demo@iochunt.in',
                from_name: 'IOC Hunt',
                enabled: 1
              }]
            };
          }
          if (sql.includes('UPDATE email_schedules SET last_run=$1,last_status=$2 WHERE id=$3')) {
            updatedStatus = params[1];
            return { rowCount: 1 };
          }
          return { rows: [] };
        }
      };

      let jsonResp = null;
      let statusCode = 200;
      const mockRes = {
        status: (c) => { statusCode = c; return mockRes; },
        json: (j) => { jsonResp = j; }
      };

      await emailController.runSchedule(mockReq, mockRes);
      assert.strictEqual(statusCode, 200);
      assert.deepStrictEqual(jsonResp, { ok: true });
      assert.strictEqual(updatedStatus, 'OK');
      assert.strictEqual(mailSent, true);
      console.log('✓ runSchedule correctly resolves tenant DB, sends report, and sets status to OK');
    } finally {
      nodemailer.createTransport = origCreateTransport;
    }
  }

  console.log('\nAll 5 email schedule & reporting tests passed successfully!\n');
}

runTests().catch(err => {
  console.error('\nTest failed:', err);
  process.exit(1);
});
