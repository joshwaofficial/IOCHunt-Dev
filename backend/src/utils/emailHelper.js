const nodemailer = require('nodemailer');
const db = require('../config/db');
const { decryptText } = require('./cryptoHelper');

async function getSmtpConfig(queryFn) {
  const q = queryFn || db.query.bind(db);
  const cfgRes = await q('SELECT * FROM smtp_config WHERE id=1');
  const cfg = cfgRes.rows[0];
  if (cfg && cfg.password) {
    cfg.password = decryptText(cfg.password);
  }
  return cfg;
}

function createTransporter(cfg) {
  const opts = {
    host: cfg.host,
    port: Number(cfg.port) || 587,
    secure: !!cfg.secure,
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  };
  if (cfg.username && cfg.password) {
    opts.auth = { user: cfg.username, pass: cfg.password };
  }
  return nodemailer.createTransport(opts);
}

const { DateTime } = require('luxon');

async function sendAssignmentEmail(incident, assignedTo, queryFn = null, tenantId = 'default') {
  if (!assignedTo) return;

  // Clean assignedTo username if formatted like "jos (L1_ANALYST)"
  let cleanUsername = String(assignedTo).trim();
  if (cleanUsername.includes('(')) {
    cleanUsername = cleanUsername.split('(')[0].trim();
  }

  const q = queryFn || db.query.bind(db);

  // Fetch SMTP config with fallback to central control plane DB
  let cfg = await getSmtpConfig(q);
  if ((!cfg || !cfg.enabled || !cfg.host) && tenantId !== 'default') {
    try {
      const cpCfg = await getSmtpConfig(db.query.bind(db));
      if (cpCfg && cpCfg.enabled && cpCfg.host) {
        cfg = cpCfg;
      }
    } catch (_) {}
  }

  if (!cfg || !cfg.enabled || !cfg.host) {
    console.warn(`[EMAIL] Assignment email skipped — SMTP not enabled or configured for tenant "${tenantId}".`);
    return;
  }

  // Fetch user from tenant DB with fallback to control plane DB
  let userRes = await q('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [cleanUsername]);
  let user = userRes.rows[0];

  if (!user) {
    try {
      const cpUserRes = await db.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [cleanUsername]);
      user = cpUserRes.rows[0];
    } catch (_) {}
  }

  if (!user) {
    console.warn('[EMAIL] Assignment notification skipped — user not found:', cleanUsername);
    return;
  }

  const toAddr = (user.email && user.email.trim()) || (user.username && user.username.includes('@') ? user.username.trim() : null);
  if (!toAddr) {
    console.warn('[EMAIL] Assignment notification skipped — no email specified for user:', cleanUsername);
    return;
  }

  const prioMap = { P1: '[P1-CRITICAL]', P2: '[P2-HIGH]', P3: '[P3-MEDIUM]', P4: '[P4-LOW]' };
  const prio = prioMap[incident.priority] || incident.priority;
  const formattedTimeIST = DateTime.now().setZone('Asia/Kolkata').toFormat('dd MMM yyyy, hh:mm:ss a') + ' IST';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Incident Assigned</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f9; color: #1e293b; margin: 0; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
    
    <div style="background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%); padding: 20px 24px; color: #ffffff;">
      <h1 style="margin: 0; font-size: 18px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">
        📌 IOC Hunt — Incident Assigned
      </h1>
      <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">
        You have been assigned to an incident. Please review and investigate.
      </p>
    </div>

    <div style="padding: 24px;">
      <div style="margin-bottom: 16px;">
        <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; display: block; margin-bottom: 2px;">Incident ID & Title</span>
        <strong style="font-size: 15px; color: #0f172a;">#${incident.id} — ${incident.title}</strong>
      </div>

      <div style="display: flex; gap: 16px; margin-bottom: 16px; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
        <div style="flex: 1;">
          <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Priority</span>
          <span style="font-weight: 800; font-size: 12px; color: ${incident.priority === 'P1' ? '#dc2626' : incident.priority === 'P2' ? '#ea580c' : '#ca8a04'}; font-family: monospace;">${prio}</span>
        </div>
        <div style="flex: 1;">
          <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Status</span>
          <span style="font-weight: 700; font-size: 12px; color: #0f172a; font-family: monospace;">${String(incident.status).toUpperCase()}</span>
        </div>
        ${incident.machine ? `
        <div style="flex: 1;">
          <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Affected Machine</span>
          <span style="font-weight: 700; font-size: 12px; color: #0284c7; font-family: monospace;">${incident.machine}</span>
        </div>` : ''}
      </div>

      ${incident.description ? `
      <div style="margin-bottom: 20px;">
        <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px; display: block; margin-bottom: 4px;">Description</span>
        <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; font-size: 12px; color: #334155; line-height: 1.6; font-family: monospace; word-break: break-all;">
          ${(incident.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
        </div>
      </div>` : ''}

      <div style="text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
        <a style="display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 13px;" href="https://72.62.241.39:8082/incidents">Log In to Investigate Incident →</a>
      </div>
    </div>

    <div style="background: #f8fafc; padding: 12px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;">
      IOC Hunt Incident Management System &nbsp;|&nbsp; Assigned At: ${formattedTimeIST}
    </div>
  </div>
</body>
</html>`;

  try {
    const t = createTransporter(cfg);
    const info = await t.sendMail({
      from: `"${cfg.from_name || 'IOC Hunt'}" <${cfg.from_addr}>`,
      to: toAddr,
      subject: `[IOC Hunt] Incident Assigned - #${incident.id} ${prio}: ${incident.title}`,
      text: `IOC Hunt - Incident Assigned\n\nYou have been assigned to incident #${incident.id}.\n\nTitle: ${incident.title}\nPriority: ${prio}\nStatus: ${incident.status}\nMachine: ${incident.machine || 'N/A'}\nDescription: ${incident.description || 'N/A'}\n\nLogin to IOC Hunt to view details.`,
      html,
    });
    console.log(`[EMAIL] Assignment notification sent successfully to ${toAddr}. MessageId: ${info.messageId}`);
  } catch (error) {
    console.error('[EMAIL] Failed to send assignment notification:', error.message);
  }
}

async function sendSecurityAlertEmail({ to, username, ip, userAgent, time }) {
  try {
    const cfg = await getSmtpConfig();
    if (!cfg || !cfg.enabled || !cfg.host || !to) return;

    const formattedTime = time ? new Date(time * 1000).toLocaleString() : new Date().toLocaleString();
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
body{font-family:Arial,sans-serif;background:#0d111d;padding:20px;color:#e2e8f0}
.card{background:#161c2c;border:1px solid #2d3748;border-radius:10px;padding:24px 28px;max-width:540px;margin:0 auto}
.hdr{background:#dc2626;color:#fff;border-radius:8px;padding:14px 18px;margin-bottom:18px}
.hdr h1{margin:0;font-size:16px;letter-spacing:0.5px}
.field{margin-bottom:12px;font-size:13px}
.label{font-weight:700;color:#94a3b8;text-transform:uppercase;font-size:10px;letter-spacing:.8px;display:block;margin-bottom:2px}
.val{color:#f8fafc;font-family:monospace;font-size:13px}
.alert-box{background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);border-radius:6px;padding:12px;color:#fca5a5;font-size:12px;line-height:1.5;margin:16px 0}
.footer{text-align:center;font-size:11px;color:#64748b;margin-top:20px}
</style></head><body>
<div class="card">
  <div class="hdr"><h1>⚠️ IOC Hunt — New Device Login Detected</h1></div>
  <p style="font-size:13px;color:#cbd5e1;margin-bottom:16px">Hello <strong>${username}</strong>,</p>
  <p style="font-size:13px;color:#cbd5e1;line-height:1.5">Your IOC Hunt account was accessed from a new device or browser, and any existing active session was disconnected.</p>
  <div style="background:#0f131f;border:1px solid #1e2538;border-radius:8px;padding:14px;margin:16px 0">
    <div class="field"><span class="label">IP Address</span><span class="val">${ip || 'Unknown'}</span></div>
    <div class="field"><span class="label">Date & Time</span><span class="val">${formattedTime}</span></div>
    <div class="field"><span class="label">Device / Browser</span><span style="font-size:11px;color:#94a3b8;word-break:break-all">${userAgent ? userAgent.slice(0, 150) : 'Unknown'}</span></div>
  </div>
  <div class="alert-box">
    <strong>Did you perform this login?</strong><br>
    If this was you, you can safely ignore this notification. If you did NOT log in, your password may be compromised. Please sign in immediately and reset your password.
  </div>
  <div class="footer">IOC Hunt Security Monitoring &nbsp;|&nbsp; Automated Alert</div>
</div>
</body></html>`;

    const t = createTransporter(cfg);
    await t.sendMail({
      from: `"${cfg.from_name || 'IOC Hunt Security'}" <${cfg.from_addr}>`,
      to,
      subject: `[IOC Hunt Security Alert] New Login Takeover Detected for ${username}`,
      text: `Hello ${username},\n\nA new login was detected for your IOC Hunt account from IP: ${ip || 'Unknown'} at ${formattedTime}.\n\nIf this was not you, please log in and change your password immediately.`,
      html
    });
    console.log(`[EMAIL] Security takeover alert sent to ${to}`);
  } catch (err) {
    console.warn('[EMAIL] Failed to send security takeover email:', err.message);
  }
}

module.exports = {
  getSmtpConfig,
  createTransporter,
  sendAssignmentEmail,
  sendSecurityAlertEmail
};
