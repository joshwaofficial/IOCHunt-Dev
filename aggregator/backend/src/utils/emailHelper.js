const nodemailer = require('nodemailer');
const db = require('../config/db');
const { decryptText } = require('./cryptoHelper');

async function getSmtpConfig() {
  const cfgRes = await db.query('SELECT * FROM smtp_config WHERE id=1');
  const cfg = cfgRes.rows[0];
  if (cfg && cfg.password) {
    cfg.password = decryptText(cfg.password);
  }
  return cfg;
}

function createTransporter(cfg) {
  const opts = {
    host: cfg.host,
    port: cfg.port,
    secure: !!cfg.secure,
    tls: { rejectUnauthorized: false }
  };
  if (cfg.username && cfg.password) {
    opts.auth = { user: cfg.username, pass: cfg.password };
  }
  return nodemailer.createTransport(opts);
}

async function sendAssignmentEmail(incident, assignedTo) {
  const cfg = await getSmtpConfig();
  if (!cfg || !cfg.enabled || !cfg.host) return;

  const userRes = await db.query('SELECT * FROM users WHERE username=$1', [assignedTo]);
  const user = userRes.rows[0];
  if (!user) return;

  const toAddr = user.email || (user.username.includes('@') ? user.username : null);
  if (!toAddr) {
    console.log('[EMAIL] Assignment notification skipped — no email for user:', assignedTo);
    return;
  }

  const prioMap = { P1: '[P1-CRITICAL]', P2: '[P2-HIGH]', P3: '[P3-MEDIUM]', P4: '[P4-LOW]' };
  const prio = prioMap[incident.priority] || incident.priority;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
body{font-family:Arial,sans-serif;background:#f0f4fc;padding:20px;color:#1a2540}
.card{background:#fff;border-radius:10px;padding:24px 28px;max-width:560px;margin:0 auto;box-shadow:0 4px 20px rgba(0,0,0,.08)}
.hdr{background:#1e3a5f;color:#fff;border-radius:8px;padding:16px 20px;margin-bottom:20px}
.hdr h1{margin:0;font-size:18px;letter-spacing:1px}
.badge{display:inline-block;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:700}
.p1{background:#fef2f2;color:#ef4444}.p2{background:#fff7ed;color:#f97316}
.p3{background:#fefce8;color:#ca8a04}.p4{background:#f0fdf4;color:#16a34a}
.field{margin-bottom:12px;font-size:13px}
.label{font-weight:700;color:#4a5578;text-transform:uppercase;font-size:10px;letter-spacing:.8px;display:block;margin-bottom:3px}
.btn{display:inline-block;background:#3b82f6;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700;font-size:13px;margin-top:16px}
.footer{text-align:center;font-size:10px;color:#6b82a0;margin-top:20px}
</style></head><body>
<div class="card">
  <div class="hdr"><h1>IOC Hunt — Incident Assigned</h1></div>
  <p style="font-size:13px;margin-bottom:18px">You have been assigned to an incident. Please review and take action.</p>
  <div class="field">
    <span class="label">Incident</span>
    <strong>#${incident.id} — ${incident.title}</strong>
  </div>
  <div class="field">
    <span class="label">Priority</span>
    <span class="badge p${incident.priority.slice(1).toLowerCase()}">${prio}</span>
  </div>
  <div class="field">
    <span class="label">Status</span>
    ${incident.status.toUpperCase()}
  </div>
  ${incident.machine ? `
  <div class="field">
    <span class="label">Affected Machine</span>
    ${incident.machine}
  </div>` : ''}
  ${incident.description ? `
  <div class="field">
    <span class="label">Description</span>
    <div style="background:#f8faff;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;font-size:12px;line-height:1.6">
      ${incident.description.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
    </div>
  </div>` : ''}
  <div style="text-align:center">
    <a class="btn" href="https://localhost:5173/incidents">View in IOC Hunt →</a>
  </div>
  <div class="footer">IOC Hunt Incident Management &nbsp;|&nbsp; ${new Date().toLocaleString()}</div>
</div>
</body></html>`;

  try {
    const t = createTransporter(cfg);
    const info = await t.sendMail({
      from: `"${cfg.from_name}" <${cfg.from_addr}>`,
      to: toAddr,
      subject: `[IOC Hunt] Incident Assigned - #${incident.id} ${prio}: ${incident.title}`,
      text: `IOC Hunt - Incident Assigned\n\nYou have been assigned to incident #${incident.id}.\n\nTitle: ${incident.title}\nPriority: ${prio}\nStatus: ${incident.status}\nMachine: ${incident.machine || 'N/A'}\nDescription: ${incident.description || 'N/A'}\n\nLogin to IOC Hunt to view details.`,
      html,
    });
    console.log(`[EMAIL] Assignment notification sent to ${toAddr}`);
    console.log(`[EMAIL] Message ID: ${info.messageId}`);
  } catch (error) {
    console.error('[EMAIL] Failed to send assignment notification:', error.message);
  }
}

module.exports = {
  getSmtpConfig,
  createTransporter,
  sendAssignmentEmail
};
