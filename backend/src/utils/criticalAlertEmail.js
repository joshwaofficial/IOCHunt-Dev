// ════════════════════════════════════════════════════════════════
// IOC Hunt — Critical Log Email Notification Helper (Light Theme)
// ════════════════════════════════════════════════════════════════

const { DateTime } = require('luxon');
const { getSmtpConfig, createTransporter } = require('./emailHelper');

/**
 * Formats event log timestamps cleanly in local IST (Asia/Kolkata) to match the dashboard table.
 */
function formatLogTimestamp(ts) {
  if (!ts) return 'N/A';
  if (ts instanceof Date) {
    return DateTime.fromJSDate(ts).setZone('Asia/Kolkata').toFormat('yyyy-MM-dd HH:mm:ss');
  }
  const str = String(ts).trim();
  let dt = DateTime.fromISO(str.replace(' ', 'T'), { setZone: true });
  if (!dt.isValid) {
    dt = DateTime.fromSQL(str, { zone: 'system' });
  }
  if (dt.isValid) {
    return dt.setZone('Asia/Kolkata').toFormat('yyyy-MM-dd HH:mm:ss');
  }
  return str.slice(0, 19);
}

/**
 * Constructs and sends a consolidated Light-Themed HTML email alert for critical severity logs to SOC team users.
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

  // Notification time strictly in Indian Standard Time (IST)
  const notificationTimeIST = DateTime.now().setZone('Asia/Kolkata').toFormat('dd MMM yyyy, hh:mm:ss a') + ' IST';

  const machineListStr = uniqueMachines.slice(0, 3).join(', ') + (uniqueMachines.length > 3 ? ` +${uniqueMachines.length - 3} more` : '');
  const subject = `🚨 [IOC Hunt Critical Alert] ${totalEvents} Critical Log${totalEvents > 1 ? 's' : ''} Detected (${machineListStr})`;

  // Build Light-Themed Machine HTML Blocks
  let machineBlocksHtml = '';
  for (const [mName, mEvents] of Object.entries(machineMap)) {
    let rowsHtml = '';
    for (const e of mEvents) {
      const formattedTs = formatLogTimestamp(e.ts);
      const tagStr = (e.tag || 'CRITICAL').toUpperCase();
      const catStr = (e.category || 'SECURITY').toUpperCase();
      const safeMsg = (e.message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      rowsHtml += `
        <tr style="border-bottom: 1px solid #e2e8f0; background-color: #ffffff;">
          <td style="padding: 10px 12px; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 11px; color: #475569; white-space: nowrap; vertical-align: top; font-weight: 500;">${formattedTs}</td>
          <td style="padding: 10px 12px; vertical-align: top; white-space: nowrap;">
            <span style="display: inline-block; background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; font-family: monospace;">${tagStr}</span>
            <span style="display: inline-block; background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-family: monospace; margin-left: 4px;">${catStr}</span>
          </td>
          <td style="padding: 10px 12px; font-size: 12px; color: #0f172a; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; line-height: 1.5; word-break: break-all; vertical-align: top;">${safeMsg}</td>
        </tr>
      `;
    }

    machineBlocksHtml += `
      <div style="margin-bottom: 24px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="background: #f8fafc; padding: 12px 16px; font-size: 13px; font-weight: 700; color: #0f172a; display: flex; align-items: center; border-bottom: 1px solid #e2e8f0;">
          💻 Machine: <span style="color: #0284c7; margin-left: 6px; font-family: monospace; font-size: 14px;">${mName}</span>
          <span style="margin-left: auto; background: #dc2626; color: #ffffff; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700;">${mEvents.length} alert${mEvents.length > 1 ? 's' : ''}</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="background: #f1f5f9; color: #475569; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 1px solid #cbd5e1;">
              <th style="padding: 10px 12px; width: 160px; font-weight: 700;">Log Timestamp</th>
              <th style="padding: 10px 12px; width: 170px; font-weight: 700;">Tag / Category</th>
              <th style="padding: 10px 12px; font-weight: 700;">Event Details / Message</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  // Pure Clean Light-Theme Template
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>IOC Hunt Critical Security Alert</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f9; color: #1e293b; margin: 0; padding: 24px;">
  <div style="max-width: 760px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
    
    <!-- Red Header Alert Banner -->
    <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 22px 28px; color: #ffffff;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">
        🚨 Critical Log Alert
      </h1>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #fee2e2; font-weight: 500;">
        Immediate SOC Security Notification — ${totalEvents} critical event${totalEvents > 1 ? 's' : ''} received across ${machineCount} machine${machineCount > 1 ? 's' : ''}
      </p>
    </div>

    <!-- Alert Overview Metadata Bar (Light Theme) -->
    <div style="background: #f8fafc; padding: 14px 28px; border-bottom: 1px solid #e2e8f0; display: flex; flex-wrap: wrap; gap: 20px; font-size: 12px;">
      <div>
        <span style="color: #64748b; text-transform: uppercase; font-size: 10px; font-weight: 700; display: block;">Tenant ID</span>
        <span style="color: #0f172a; font-family: monospace; font-weight: 700; font-size: 13px;">${tenantId}</span>
      </div>
      <div style="margin-left: 16px;">
        <span style="color: #64748b; text-transform: uppercase; font-size: 10px; font-weight: 700; display: block;">Total Critical Logs</span>
        <span style="color: #dc2626; font-family: monospace; font-weight: 800; font-size: 13px;">${totalEvents}</span>
      </div>
      <div style="margin-left: 16px;">
        <span style="color: #64748b; text-transform: uppercase; font-size: 10px; font-weight: 700; display: block;">Affected Machines</span>
        <span style="color: #0284c7; font-family: monospace; font-weight: 700; font-size: 13px;">${machineCount}</span>
      </div>
      <div style="margin-left: auto;">
        <span style="color: #64748b; text-transform: uppercase; font-size: 10px; font-weight: 700; display: block;">Notification Time (IST)</span>
        <span style="color: #334155; font-family: monospace; font-weight: 600;">${notificationTimeIST}</span>
      </div>
    </div>

    <!-- Main Content Container -->
    <div style="padding: 28px;">
      <p style="font-size: 13px; color: #334155; margin-top: 0; margin-bottom: 22px; line-height: 1.6;">
        The following critical security logs were received during ingestion and require immediate review by the SOC Team (Admin / L1 / L2 / L3).
      </p>

      ${machineBlocksHtml}

      <!-- Call to Action Button -->
      <div style="text-align: center; margin-top: 28px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
        <p style="font-size: 12px; color: #64748b; margin-bottom: 14px;">
          Log into IOC Hunt Command Center to investigate full process telemetry and take isolation actions.
        </p>
      </div>
    </div>

    <!-- Light Footer -->
    <div style="background: #f8fafc; padding: 14px 28px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;">
      IOC Hunt Automated SOC Alert System &nbsp;|&nbsp; Tenant: <strong style="color: #334155;">${tenantId}</strong>
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
