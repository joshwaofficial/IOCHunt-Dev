const db = require('../config/db');
const cron = require('node-cron');
const { getSmtpConfig, createTransporter } = require('../utils/emailHelper');
const { startSchedule, stopSchedule } = require('../utils/emailScheduler');
const { generateAndSendReport } = require('../utils/reportBuilder');
const { encryptText } = require('../utils/cryptoHelper');

// ── GET /api/smtp/config ─────────────────────────────────────────────────────
// Returns SMTP settings (password stripped for security)
exports.getSmtpConfig = async (req, res) => {
  try {
    const cfg = await getSmtpConfig();
    if (cfg) delete cfg.password;  // Never send password to frontend
    res.json(cfg || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
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

    const existingRes = await db.query('SELECT password FROM smtp_config WHERE id=1');
    const existing = existingRes.rows[0];

    // If user provided a new password → encrypt it.
    // If blank → keep the existing encrypted password.
    const finalPw = password
      ? encryptText(password)
      : (existing ? existing.password : '');

    await db.query(
      `UPDATE smtp_config
       SET host=$1, port=$2, secure=$3, username=$4, password=$5,
           from_addr=$6, from_name=$7, enabled=$8
       WHERE id=1`,
      [host, port, secure ? 1 : 0, username, finalPw,
       from_addr, from_name, enabled ? 1 : 0]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/smtp/test ──────────────────────────────────────────────────────
// Sends a test email to verify SMTP connectivity
exports.testSmtp = async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'to address required' });
  try {
    const cfg = await getSmtpConfig();
    if (!cfg || !cfg.host) throw new Error('SMTP not configured');
    const t = createTransporter(cfg);
    await t.sendMail({
      from: `"${cfg.from_name}" <${cfg.from_addr}>`,
      to,
      subject: 'IOC Hunt — SMTP Test',
      html: '<p>SMTP is configured correctly for <b>IOC Hunt</b>.</p>',
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// ── GET /api/smtp/schedules ──────────────────────────────────────────────────
exports.getSchedules = async (req, res) => {
  try {
    const rowsRes = await db.query('SELECT * FROM email_schedules ORDER BY id DESC');
    res.json(rowsRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/smtp/schedules ─────────────────────────────────────────────────
// Creates a new schedule and starts its cron job if enabled
exports.createSchedule = async (req, res) => {
  try {
    const {
      name, recipients, cron_expr = '0 8 * * 1', duration = 24,
      aggregator = '', machine = '', severity = '', category = '',
      include_fw = 1, enabled = 1
    } = req.body;

    if (!name || !recipients)
      return res.status(400).json({ error: 'name and recipients required' });
    if (!cron.validate(cron_expr))
      return res.status(400).json({ error: 'Invalid cron expression' });

    const infoRes = await db.query(
      `INSERT INTO email_schedules
       (name,recipients,cron_expr,duration,aggregator,machine,severity,category,include_fw,enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [name, recipients, cron_expr, duration, aggregator, machine, severity,
       category, include_fw ? 1 : 0, enabled ? 1 : 0]
    );

    const sRes = await db.query(
      'SELECT * FROM email_schedules WHERE id=$1', [infoRes.rows[0].id]
    );
    const s = sRes.rows[0];
    if (s.enabled) startSchedule(s);  // Register cron immediately
    res.json({ ok: true, id: s.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── PATCH /api/smtp/schedules/:id ────────────────────────────────────────────
// Updates an existing schedule, restarts its cron job
exports.updateSchedule = async (req, res) => {
  try {
    const {
      name, recipients, cron_expr, duration, aggregator, machine,
      severity, category, include_fw, enabled
    } = req.body;

    const existingRes = await db.query(
      'SELECT * FROM email_schedules WHERE id=$1', [req.params.id]
    );
    const existing = existingRes.rows[0];
    if (!existing) return res.status(404).json({ error: 'Not found' });

    if (cron_expr && !cron.validate(cron_expr))
      return res.status(400).json({ error: 'Invalid cron expression' });

    const updated = {
      name: name ?? existing.name,
      recipients: recipients ?? existing.recipients,
      cron_expr: cron_expr ?? existing.cron_expr,
      duration: duration ?? existing.duration,
      aggregator: aggregator ?? existing.aggregator,
      machine: machine ?? existing.machine,
      severity: severity ?? existing.severity,
      category: category ?? existing.category,
      include_fw: include_fw ?? existing.include_fw,
      enabled: enabled ?? existing.enabled,
    };

    await db.query(
      `UPDATE email_schedules
       SET name=$1,recipients=$2,cron_expr=$3,duration=$4,
           aggregator=$5,machine=$6,severity=$7,category=$8,include_fw=$9,enabled=$10
       WHERE id=$11`,
      [updated.name, updated.recipients, updated.cron_expr, updated.duration,
       updated.aggregator, updated.machine, updated.severity, updated.category,
       updated.include_fw ? 1 : 0, updated.enabled ? 1 : 0, req.params.id]
    );

    const sRes = await db.query(
      'SELECT * FROM email_schedules WHERE id=$1', [req.params.id]
    );
    const s = sRes.rows[0];

    // Restart cron: stop old → start new (if enabled)
    stopSchedule(s.id);
    if (s.enabled) startSchedule(s);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── DELETE /api/smtp/schedules/:id ───────────────────────────────────────────
exports.deleteSchedule = async (req, res) => {
  try {
    stopSchedule(Number(req.params.id));
    await db.query('DELETE FROM email_schedules WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/smtp/schedules/:id/run ─────────────────────────────────────────
// Manually triggers a schedule to send a report immediately
exports.runSchedule = async (req, res) => {
  try {
    const sRes = await db.query(
      'SELECT * FROM email_schedules WHERE id=$1', [req.params.id]
    );
    const s = sRes.rows[0];
    if (!s) return res.status(404).json({ error: 'Not found' });

    try {
      await generateAndSendReport(s);
      await db.query(
        'UPDATE email_schedules SET last_run=$1,last_status=$2 WHERE id=$3',
        [Math.floor(Date.now() / 1000), 'OK', s.id]
      );
      res.json({ ok: true });
    } catch (e) {
      await db.query(
        'UPDATE email_schedules SET last_run=$1,last_status=$2 WHERE id=$3',
        [Math.floor(Date.now() / 1000), 'ERROR: ' + e.message.slice(0, 120), s.id]
      );
      res.status(500).json({ error: e.message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
