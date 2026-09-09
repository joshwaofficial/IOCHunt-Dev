
const cron = require('node-cron');
const { getSmtpConfig, createTransporter } = require('../utils/emailHelper');
const { startSchedule, stopSchedule } = require('../utils/emailScheduler');
const { generateAndSendReport } = require('../utils/reportBuilder');
const { encryptText } = require('../utils/cryptoHelper');
const { isString, isEmail, isInteger, parseSafeInt, isPositiveInteger, sanitizeText } = require('../utils/inputValidator');

// ── GET /api/smtp/config ─────────────────────────────────────────────────────
// Returns SMTP settings (password stripped for security)
exports.getSmtpConfig = async (req, res) => {
  try {
    const cfg = await getSmtpConfig();
    if (cfg) delete cfg.password;  // Never send password to frontend
    res.json(cfg || {});
  } catch (err) {
    console.error('[SMTP Config] Get error:', err);
    res.status(500).json({ error: 'Failed to retrieve SMTP configuration' });
  }
};

// ── POST /api/smtp/config ────────────────────────────────────────────────────
// Saves SMTP settings. Password is AES-encrypted before storage.
exports.updateSmtpConfig = async (req, res) => {
  try {
    const {
      host = '', port = 587, secure = 0, username = '',
      password = '', from_addr = '', from_name = 'IOC Hunt', enabled = 0
    } = req.body;

    if (host && typeof host !== 'string') {
      return res.status(400).json({ error: 'Invalid host format' });
    }
    const safePort = parseSafeInt(port, 587, 1, 65535);
    if (from_addr && !isEmail(from_addr)) {
      return res.status(400).json({ error: 'Invalid from_addr email address' });
    }

    const safeHost = typeof host === 'string' ? host.trim().slice(0, 255) : '';
    const safeUsername = typeof username === 'string' ? username.trim().slice(0, 255) : '';
    const safeFromName = typeof from_name === 'string' ? sanitizeText(from_name).slice(0, 100) : 'IOC Hunt';

    const existingRes = await req.queryTenant('SELECT password FROM smtp_config WHERE id=1');
    const existing = existingRes.rows[0];

    // If user provided a new password → encrypt it.
    // If blank → keep the existing encrypted password.
    const finalPw = (password && typeof password === 'string')
      ? encryptText(password)
      : (existing ? existing.password : '');

    await req.queryTenant(
      `UPDATE smtp_config
       SET host=$1, port=$2, secure=$3, username=$4, password=$5,
           from_addr=$6, from_name=$7, enabled=$8
       WHERE id=1`,
      [safeHost, safePort, secure ? 1 : 0, safeUsername, finalPw,
       typeof from_addr === 'string' ? from_addr.trim().slice(0, 254) : '', safeFromName, enabled ? 1 : 0]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[SMTP Config] Update error:', err);
    res.status(500).json({ error: 'Failed to update SMTP configuration' });
  }
};

// ── POST /api/smtp/test ──────────────────────────────────────────────────────
// Sends a test email to verify SMTP connectivity
exports.testSmtp = async (req, res) => {
  const { to } = req.body;
  if (!isEmail(to)) {
    return res.status(400).json({ error: 'Valid destination email address required' });
  }

  try {
    const cfg = await getSmtpConfig();
    if (!cfg || !cfg.host) throw new Error('SMTP not configured');
    const t = createTransporter(cfg);
    await t.sendMail({
      from: `"${cfg.from_name}" <${cfg.from_addr}>`,
      to: to.trim(),
      subject: 'IOC Hunt — SMTP Test',
      html: '<p>SMTP is configured correctly for <b>IOC Hunt</b>.</p>',
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[SMTP Test] Error:', e.message);
    res.status(400).json({ error: 'Failed to send test email. Please check your SMTP settings.' });
  }
};

// ── GET /api/smtp/schedules ──────────────────────────────────────────────────
exports.getSchedules = async (req, res) => {
  try {
    const rowsRes = await req.queryTenant('SELECT * FROM email_schedules ORDER BY id DESC');
    res.json(rowsRes.rows);
  } catch (err) {
    console.error('[Schedules] Get error:', err);
    res.status(500).json({ error: 'Failed to retrieve schedules' });
  }
};

// Helper to validate comma-separated list of emails
function validateRecipients(recipientsStr) {
  if (typeof recipientsStr !== 'string' || !recipientsStr.trim()) return false;
  const emails = recipientsStr.split(',').map(e => e.trim()).filter(Boolean);
  if (emails.length === 0 || emails.length > 50) return false;
  return emails.every(e => isEmail(e));
}

// ── POST /api/smtp/schedules ─────────────────────────────────────────────────
// Creates a new schedule and starts its cron job if enabled
exports.createSchedule = async (req, res) => {
  try {
    const {
      name, recipients, cron_expr = '0 8 * * 1', duration = 24,
      aggregator = '', machine = '', severity = '', category = '',
      include_fw = 1, enabled = 1
    } = req.body;

    if (!isString(name, 1, 100)) {
      return res.status(400).json({ error: 'Schedule name is required (1-100 characters)' });
    }
    if (!validateRecipients(recipients)) {
      return res.status(400).json({ error: 'Recipients must be a valid comma-separated list of email addresses' });
    }
    if (typeof cron_expr !== 'string' || !cron.validate(cron_expr.trim())) {
      return res.status(400).json({ error: 'Invalid cron expression' });
    }

    const safeDuration = parseSafeInt(duration, 24, 1, 8760);
    const safeName = sanitizeText(name).slice(0, 100);
    const safeRecipients = recipients.split(',').map(e => e.trim()).filter(Boolean).join(',');
    const safeCronExpr = cron_expr.trim();

    const infoRes = await req.queryTenant(
      `INSERT INTO email_schedules
       (name,recipients,cron_expr,duration,aggregator,machine,severity,category,include_fw,enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [safeName, safeRecipients, safeCronExpr, safeDuration,
       typeof aggregator === 'string' ? sanitizeText(aggregator).slice(0, 64) : '',
       typeof machine === 'string' ? sanitizeText(machine).slice(0, 64) : '',
       typeof severity === 'string' ? sanitizeText(severity).slice(0, 32) : '',
       typeof category === 'string' ? sanitizeText(category).slice(0, 64) : '',
       include_fw ? 1 : 0, enabled ? 1 : 0]
    );

    const sRes = await req.queryTenant(
      'SELECT * FROM email_schedules WHERE id=$1', [infoRes.rows[0].id]
    );
    const s = sRes.rows[0];
    if (s.enabled) startSchedule(s);  // Register cron immediately
    res.json({ ok: true, id: s.id });
  } catch (err) {
    console.error('[Schedules] Create error:', err);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
};

// ── PATCH /api/smtp/schedules/:id ────────────────────────────────────────────
// Updates an existing schedule, restarts its cron job
exports.updateSchedule = async (req, res) => {
  try {
    if (!isPositiveInteger(req.params.id)) {
      return res.status(400).json({ error: 'Invalid schedule ID' });
    }
    const scheduleId = parseInt(req.params.id, 10);

    const {
      name, recipients, cron_expr, duration, aggregator, machine,
      severity, category, include_fw, enabled
    } = req.body;

    const existingRes = await req.queryTenant(
      'SELECT * FROM email_schedules WHERE id=$1', [scheduleId]
    );
    const existing = existingRes.rows[0];
    if (!existing) return res.status(404).json({ error: 'Schedule not found' });

    if (recipients !== undefined && !validateRecipients(recipients)) {
      return res.status(400).json({ error: 'Invalid recipient email addresses' });
    }
    if (cron_expr !== undefined && (typeof cron_expr !== 'string' || !cron.validate(cron_expr.trim()))) {
      return res.status(400).json({ error: 'Invalid cron expression' });
    }

    const updated = {
      name: name !== undefined ? sanitizeText(String(name)).slice(0, 100) : existing.name,
      recipients: recipients !== undefined ? recipients.split(',').map(e => e.trim()).filter(Boolean).join(',') : existing.recipients,
      cron_expr: cron_expr !== undefined ? cron_expr.trim() : existing.cron_expr,
      duration: duration !== undefined ? parseSafeInt(duration, existing.duration, 1, 8760) : existing.duration,
      aggregator: aggregator !== undefined ? sanitizeText(String(aggregator)).slice(0, 64) : existing.aggregator,
      machine: machine !== undefined ? sanitizeText(String(machine)).slice(0, 64) : existing.machine,
      severity: severity !== undefined ? sanitizeText(String(severity)).slice(0, 32) : existing.severity,
      category: category !== undefined ? sanitizeText(String(category)).slice(0, 64) : existing.category,
      include_fw: include_fw !== undefined ? (include_fw ? 1 : 0) : existing.include_fw,
      enabled: enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
    };

    await req.queryTenant(
      `UPDATE email_schedules
       SET name=$1,recipients=$2,cron_expr=$3,duration=$4,
           aggregator=$5,machine=$6,severity=$7,category=$8,include_fw=$9,enabled=$10
       WHERE id=$11`,
      [updated.name, updated.recipients, updated.cron_expr, updated.duration,
       updated.aggregator, updated.machine, updated.severity, updated.category,
       updated.include_fw, updated.enabled, scheduleId]
    );

    const sRes = await req.queryTenant(
      'SELECT * FROM email_schedules WHERE id=$1', [scheduleId]
    );
    const s = sRes.rows[0];

    // Restart cron: stop old → start new (if enabled)
    stopSchedule(s.id);
    if (s.enabled) startSchedule(s);

    res.json({ ok: true });
  } catch (err) {
    console.error('[Schedules] Update error:', err);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
};

// ── DELETE /api/smtp/schedules/:id ───────────────────────────────────────────
exports.deleteSchedule = async (req, res) => {
  try {
    if (!isPositiveInteger(req.params.id)) {
      return res.status(400).json({ error: 'Invalid schedule ID' });
    }
    const scheduleId = parseInt(req.params.id, 10);

    const existingRes = await req.queryTenant(
      'SELECT id FROM email_schedules WHERE id=$1', [scheduleId]
    );
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    stopSchedule(scheduleId);
    await req.queryTenant('DELETE FROM email_schedules WHERE id=$1', [scheduleId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Schedules] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
};

// ── POST /api/smtp/schedules/:id/run ─────────────────────────────────────────
// Manually triggers a schedule to send a report immediately
exports.runSchedule = async (req, res) => {
  try {
    if (!isPositiveInteger(req.params.id)) {
      return res.status(400).json({ error: 'Invalid schedule ID' });
    }
    const scheduleId = parseInt(req.params.id, 10);

    const sRes = await req.queryTenant(
      'SELECT * FROM email_schedules WHERE id=$1', [scheduleId]
    );
    const s = sRes.rows[0];
    if (!s) return res.status(404).json({ error: 'Schedule not found' });

    try {
      await generateAndSendReport(s);
      await req.queryTenant(
        'UPDATE email_schedules SET last_run=$1,last_status=$2 WHERE id=$3',
        [Math.floor(Date.now() / 1000), 'OK', s.id]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error('[Schedules] Manual run report send failed:', e.message);
      await req.queryTenant(
        'UPDATE email_schedules SET last_run=$1,last_status=$2 WHERE id=$3',
        [Math.floor(Date.now() / 1000), 'ERROR: ' + e.message.slice(0, 120), s.id]
      );
      res.status(500).json({ error: 'Failed to generate or send report' });
    }
  } catch (err) {
    console.error('[Schedules] Run error:', err);
    res.status(500).json({ error: 'Failed to trigger schedule run' });
  }
};
