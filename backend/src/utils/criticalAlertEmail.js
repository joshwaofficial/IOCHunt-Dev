// ════════════════════════════════════════════════════════════════
// IOC Hunt — Critical Log Email Notification Helper
// ════════════════════════════════════════════════════════════════

const { getSmtpConfig, createTransporter } = require('./emailHelper');

/**
 * Constructs and sends a consolidated HTML email alert for critical severity logs to SOC team users.
 * 
 * @param {Object} options
 * @param {Array<Object>} options.events - Array of critical event objects
 * @param {Array<string>} options.recipients - List of email addresses (Admin, L1, L2, L3)
 * @param {Function} options.queryFn - Database query function for the tenant
 * @param {string} options.tenantId - Tenant identifier
 */
async function sendCriticalAlertEmail({ events, recipients, queryFn, tenantId = 'default' }) {
  if (!events || events.length === 0) return;
  if (!recipients || recipients.length === 0) {
    console.warn(`[CriticalAlertEmail] No valid SOC recipient emails found for tenant "${tenantId}". Alert email skipped.`);
    return;
  }

  // Fetch tenant SMTP configuration with fallback to central control plane
  let cfg = await getSmtpConfig(queryFn);
  if ((!cfg || !cfg.enabled || !cfg.host) && tenantId !== 'default') {
    try {
      const db = require('../config/db');
      const cpCfg = await getSmtpConfig(db.query.bind(db));
      if (cpCfg && cpCfg.enabled && cpCfg.host) {
        cfg = cpCfg;
      }
    } catch (_) {}
  }

  if (!cfg || !cfg.enabled || !cfg.host) {
    console.warn(`[CriticalAlertEmail] SMTP not enabled or configured for tenant "${tenantId}". Critical log alert email skipped.`);
    return;
  }

  const cleanRecipients = Array.isArray(recipients) 
    ? recipients.map(r => r.trim()).filter(Boolean) 
    : String(recipients).split(',').map(r => r.trim()).filter(Boolean);

  if (cleanRecipients.length === 0) return;

  // Group events by machine for structured display
  const machineMap = {};
  for (const ev of events) {
    const machineName = ev.machine || ev.label || 'Unknown Machine';
    if (!machineMap[machineName]) {
      machineMap[machineName] = [];
    }
    machineMap[machineName].push(ev);
  }

  const totalEvents = events.length;
  const uniqueMachines = Object.keys(machineMap);
  const machineCount = uniqueMachines.length;
  const timestampStr = new Date().toUTCString();

  const machineListStr = uniqueMachines.slice(0, 3).join(', ') + (uniqueMachines.length > 3 ? ` +${uniqueMachines.length - 3} more` : '');
  const subject = `🚨 [IOC Hunt Critical Alert] ${totalEvents} Critical Log${totalEvents > 1 ? 's' : ''} Detected (${machineListStr})`;

  // Build Machine HTML Blocks
  let machineBlocksHtml = '';
  for (const [mName, mEvents] of Object.entries(machineMap)) {
    let rowsHtml = '';
    for (const e of mEvents) {
      const formattedTs = e.ts ? new Date(e.ts).toISOString().replace('T', ' ').slice(0, 19) : 'N/A';
      const tagStr = (e.tag || 'CRITICAL').toUpperCase();
      const catStr = (e.category || 'SECURITY').toUpperCase();
      const safeMsg = (e.message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      rowsHtml += `
        <tr style="border-bottom: 1px solid #1e293b;">
          <td style="padding: 10px; font-family: monospace; font-size: 11px; color: #94a3b8; white-space: nowrap; vertical-align: top;">${formattedTs}</td>
          <td style="padding: 10px; vertical-align: top;">
            <span style="display: inline-block; background: #450a0a; color: #fca5a5; border: 1px solid #991b1b; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; font-family: monospace;">${tagStr}</span>
            <span style="display: inline-block; background: #1e293b; color: #cbd5e1; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-family: monospace; margin-left: 4px;">${catStr}</span>
          </td>
          <td style="padding: 10px; font-size: 12px; color: #e2e8f0; font-family: monospace; line-height: 1.5; word-break: break-all; vertical-align: top;">${safeMsg}</td>
        </tr>
      `;
    }

    machineBlocksHtml += `
      <div style="margin-bottom: 20px; background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; overflow: hidden;">
        <div style="background: #1e293b; padding: 10px 14px; font-size: 13px; font-weight: bold; color: #f8fafc; display: flex; align-items: center; border-bottom: 1px solid #334155;">
          💻 Machine: <span style="color: #38bdf8; margin-left: 6px;">${mName}</span>
          <span style="margin-left: auto; background: #dc2626; color: #ffffff; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">${mEvents.length} alert${mEvents.length > 1 ? 's' : ''}</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="background: #090d16; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px;">
              <th style="padding: 8px 10px; width: 150px;">Timestamp (UTC)</th>
              <th style="padding: 8px 10px; width: 160px;">Tag / Category</th>
              <th style="padding: 8px 10px;">Event Details / Message</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>IOC Hunt Critical Security Alert</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #e2e8f0; margin: 0; padding: 24px;">
  <div style="max-width: 720px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
    
    <!-- Header Banner -->
    <div style="background: linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%); padding: 20px 24px; color: #ffffff;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div>
          <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">
            🚨 Critical Log Alert
          </h1>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #fca5a5; opacity: 0.9;">
            Immediate SOC Security Notification — ${totalEvents} critical event${totalEvents > 1 ? 's' : ''} received across ${machineCount} machine${machineCount > 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>

    <!-- Alert Overview Metadata -->
    <div style="background: #1e293b; padding: 14px 24px; border-bottom: 1px solid #334155; display: flex; flex-wrap: wrap; gap: 16px; font-size: 12px;">
      <div>
        <span style="color: #94a3b8; text-transform: uppercase; font-size: 10px; font-weight: 700; display: block;">Tenant ID</span>
        <span style="color: #f8fafc; font-family: monospace; font-weight: 600;">${tenantId}</span>
      </div>
      <div style="margin-left: 20px;">
        <span style="color: #94a3b8; text-transform: uppercase; font-size: 10px; font-weight: 700; display: block;">Total Critical Logs</span>
        <span style="color: #ef4444; font-family: monospace; font-weight: 700;">${totalEvents}</span>
      </div>
      <div style="margin-left: 20px;">
        <span style="color: #94a3b8; text-transform: uppercase; font-size: 10px; font-weight: 700; display: block;">Affected Machines</span>
        <span style="color: #38bdf8; font-family: monospace; font-weight: 600;">${machineCount}</span>
      </div>
      <div style="margin-left: auto;">
        <span style="color: #94a3b8; text-transform: uppercase; font-size: 10px; font-weight: 700; display: block;">Notification Time</span>
        <span style="color: #cbd5e1; font-family: monospace;">${timestampStr}</span>
      </div>
    </div>

    <!-- Body Content -->
    <div style="padding: 24px;">
      <p style="font-size: 13px; color: #cbd5e1; margin-top: 0; margin-bottom: 20px; line-height: 1.6;">
        The following critical security logs were received during ingestion and require immediate attention from the SOC Team (Admin / L1 / L2 / L3).
      </p>

      ${machineBlocksHtml}

      <!-- Call to Action -->
      <div style="text-align: center; margin-top: 28px; padding-top: 20px; border-top: 1px solid #1f2937;">
        <p style="font-size: 12px; color: #94a3b8; margin-bottom: 14px;">
          Log into IOC Hunt Platform to investigate full process telemetry and take isolation actions.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background: #090d16; padding: 14px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #1e293b;">
      IOC Hunt Automated SOC Alert System &nbsp;|&nbsp; Tenant: <strong style="color: #94a3b8;">${tenantId}</strong>
    </div>

  </div>
</body>
</html>`;

  try {
    const transporter = createTransporter(cfg);
    const info = await transporter.sendMail({
      from: `"${cfg.from_name || 'IOC Hunt Alert'}" <${cfg.from_addr}>`,
      to: cleanRecipients.join(', '),
      subject,
      text: `[IOC Hunt Critical Alert] ${totalEvents} critical logs received on ${machineCount} machines.\n\nPlease log in to the IOC Hunt console to investigate.`,
      html
    });
    console.log(`[CriticalAlertEmail] Alert email sent successfully to ${cleanRecipients.length} recipients for tenant "${tenantId}". MessageId: ${info.messageId}`);
  } catch (err) {
    console.error(`[CriticalAlertEmail] Failed to send critical log alert email for tenant "${tenantId}":`, err.message);
  }
}

module.exports = {
  sendCriticalAlertEmail
};
