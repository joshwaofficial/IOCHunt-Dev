// ════════════════════════════════════════════════════════════════
// IOC Hunt — Agent Key Management Controller
// ════════════════════════════════════════════════════════════════

const agentKeyService = require('../services/agentKeyService');
const { logSecurityEvent, EVENTS, SEVERITY } = require('../utils/securityLogger');
const { isInteger, isString, sanitizeText, isEmail } = require('../utils/inputValidator');
const { getSmtpConfig, createTransporter } = require('../utils/emailHelper');

/**
 * Bulk generate unique agent keys
 */
async function generateKeys(req, res) {
  try {
    const { count, label } = req.body;
    const numKeys = Math.max(1, Math.min(parseInt(count, 10) || 10, 1000));
    const safeLabel = typeof label === 'string' ? sanitizeText(label).slice(0, 128) : '';
    const tenantId = req.tenantId || 'default';
    const username = req.session?.username || 'admin';

    const keys = await agentKeyService.generateBulkKeys({
      tenantId,
      count: numKeys,
      label: safeLabel,
      createdBy: username
    });

    logSecurityEvent({
      event: 'AGENT_KEYS_GENERATED',
      severity: SEVERITY.INFO,
      tenantId,
      user: username,
      ip: req.ip,
      detail: { count: keys.length, label: safeLabel }
    });

    return res.status(201).json({
      message: `Successfully generated ${keys.length} agent keys`,
      count: keys.length,
      keys
    });
  } catch (error) {
    console.error('[AgentKeyController] generateKeys error:', error);
    return res.status(500).json({ error: 'Failed to generate agent keys: ' + error.message });
  }
}

/**
 * List agent keys with status, search, and fleet statistics
 */
async function listKeys(req, res) {
  try {
    const { status, search, limit, offset } = req.query;
    const tenantId = req.tenantId || 'default';

    const result = await agentKeyService.listKeys({
      tenantId,
      status: status || 'all',
      search: search || '',
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('[AgentKeyController] listKeys error:', error);
    return res.status(500).json({ error: 'Failed to fetch agent keys: ' + error.message });
  }
}

/**
 * Revoke an active or pending key immediately
 */
async function revokeKey(req, res) {
  try {
    const keyId = parseInt(req.params.id, 10);
    if (!keyId) {
      return res.status(400).json({ error: 'Valid key ID is required' });
    }

    const tenantId = req.tenantId || 'default';
    const success = await agentKeyService.revokeKey(keyId, tenantId);

    if (!success) {
      return res.status(404).json({ error: 'Agent key not found' });
    }

    logSecurityEvent({
      event: 'AGENT_KEY_REVOKED',
      severity: SEVERITY.WARN,
      tenantId,
      user: req.session?.username || 'admin',
      ip: req.ip,
      detail: { keyId }
    });

    return res.status(200).json({ success: true, message: 'Agent key revoked successfully' });
  } catch (error) {
    console.error('[AgentKeyController] revokeKey error:', error);
    return res.status(500).json({ error: 'Failed to revoke key: ' + error.message });
  }
}

/**
 * Reset a key's machine binding back to pending
 */
async function resetKey(req, res) {
  try {
    const keyId = parseInt(req.params.id, 10);
    if (!keyId) {
      return res.status(400).json({ error: 'Valid key ID is required' });
    }

    const tenantId = req.tenantId || 'default';
    const success = await agentKeyService.resetKey(keyId, tenantId);

    if (!success) {
      return res.status(404).json({ error: 'Agent key not found' });
    }

    logSecurityEvent({
      event: 'AGENT_KEY_RESET',
      severity: SEVERITY.INFO,
      tenantId,
      user: req.session?.username || 'admin',
      ip: req.ip,
      detail: { keyId }
    });

    return res.status(200).json({ success: true, message: 'Agent key reset to pending status' });
  } catch (error) {
    console.error('[AgentKeyController] resetKey error:', error);
    return res.status(500).json({ error: 'Failed to reset key: ' + error.message });
  }
}

/**
 * Delete a key permanently
 */
async function deleteKey(req, res) {
  try {
    const keyId = parseInt(req.params.id, 10);
    if (!keyId) {
      return res.status(400).json({ error: 'Valid key ID is required' });
    }

    const tenantId = req.tenantId || 'default';
    const success = await agentKeyService.deleteKey(keyId, tenantId);

    if (!success) {
      return res.status(404).json({ error: 'Agent key not found' });
    }

    logSecurityEvent({
      event: 'AGENT_KEY_DELETED',
      severity: SEVERITY.WARN,
      tenantId,
      user: req.session?.username || 'admin',
      ip: req.ip,
      detail: { keyId }
    });

    return res.status(200).json({ success: true, message: 'Agent key deleted permanently' });
  } catch (error) {
    console.error('[AgentKeyController] deleteKey error:', error);
    return res.status(500).json({ error: 'Failed to delete key: ' + error.message });
  }
}

/**
 * Perform bulk operations (revoke, reset, delete) on multiple keys
 */
async function bulkAction(req, res) {
  try {
    const { action, keyIds } = req.body;
    if (!action || !Array.isArray(keyIds) || keyIds.length === 0) {
      return res.status(400).json({ error: 'Action and a non-empty array of keyIds are required' });
    }

    const tenantId = req.tenantId || 'default';
    let affected = 0;

    if (action === 'revoke') {
      affected = await agentKeyService.bulkRevokeKeys(keyIds, tenantId);
    } else if (action === 'reset') {
      affected = await agentKeyService.bulkResetKeys(keyIds, tenantId);
    } else if (action === 'delete') {
      affected = await agentKeyService.bulkDeleteKeys(keyIds, tenantId);
    } else {
      return res.status(400).json({ error: `Unsupported bulk action: ${action}` });
    }

    logSecurityEvent({
      event: `AGENT_KEYS_BULK_${action.toUpperCase()}`,
      severity: action === 'delete' || action === 'revoke' ? SEVERITY.WARN : SEVERITY.INFO,
      tenantId,
      user: req.session?.username || 'admin',
      ip: req.ip,
      detail: { action, count: affected, keyIds }
    });

    return res.status(200).json({
      success: true,
      message: `Successfully executed ${action} on ${affected} key(s)`,
      count: affected
    });
  } catch (error) {
    console.error('[AgentKeyController] bulkAction error:', error);
    return res.status(500).json({ error: 'Bulk action failed: ' + error.message });
  }
}

/**
 * Send newly generated agent keys CSV securely via SMTP email
 */
async function emailKeys(req, res) {
  try {
    const { recipients, keys, label } = req.body;
    const tenantId = req.tenantId || 'default';
    const username = req.session?.username || 'admin';

    if (!Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({ error: 'No keys provided to email.' });
    }

    // Parse and validate recipient emails (comma/semicolon/newline separated or array)
    let emailList = [];
    if (Array.isArray(recipients)) {
      emailList = recipients;
    } else if (typeof recipients === 'string') {
      emailList = recipients.split(/[,;\n\s]+/).filter(Boolean);
    }

    const validEmails = emailList.map(e => e.trim().toLowerCase()).filter(e => isEmail(e));
    if (validEmails.length === 0) {
      return res.status(400).json({ error: 'Please provide at least one valid recipient email address.' });
    }

    const q = req.queryTenant || req.queryControlPlane;
    const cfg = await getSmtpConfig(q);
    if (!cfg || !cfg.enabled || !cfg.host) {
      return res.status(400).json({
        error: 'SMTP server is not configured or is disabled. Please verify SMTP settings in Email Reports / Settings.'
      });
    }

    // Build the CSV Keyfile content with ONE single key column
    const csvHeader = 'Agent_API_Key,Status,Label,CreatedAt\n';
    const csvRows = keys.map(k => {
      const safeKey = typeof k.key === 'string' ? k.key : '';
      const safeStatus = typeof k.status === 'string' ? k.status : 'pending';
      const safeLabel = typeof k.label === 'string' ? k.label.replace(/"/g, '""') : (typeof label === 'string' ? label.replace(/"/g, '""') : '');
      const safeCreated = k.createdAt || new Date().toISOString();
      return `"${safeKey}","${safeStatus}","${safeLabel}","${safeCreated}"`;
    }).join('\n');
    const csvContent = csvHeader + csvRows;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `iochunt_agent_keys_${timestamp}.csv`;

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; margin: 0; padding: 24px; color: #e2e8f0; }
  .container { max-width: 620px; margin: 0 auto; background: #131b2e; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
  .header { background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%); padding: 24px 30px; border-bottom: 1px solid rgba(37,99,235,0.2); }
  .logo { font-size: 20px; font-weight: 800; color: #60a5fa; letter-spacing: 0.5px; text-transform: uppercase; margin: 0; }
  .title { font-size: 15px; color: #94a3b8; margin: 6px 0 0 0; }
  .content { padding: 28px 30px; }
  .badge-row { display: flex; gap: 10px; margin-bottom: 20px; }
  .badge { display: inline-block; padding: 5px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; font-family: monospace; }
  .badge-secure { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
  .badge-count { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
  .alert-box { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; }
  .alert-box strong { color: #f87171; font-size: 12px; display: block; margin-bottom: 4px; }
  .alert-box p { margin: 0; font-size: 12px; color: #fca5a5; line-height: 1.5; }
  .info-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
  .info-table td { padding: 10px 0; border-bottom: 1px solid #1e293b; }
  .info-table .label { color: #64748b; font-weight: 600; width: 38%; }
  .info-table .value { color: #f1f5f9; font-weight: 500; font-family: monospace; }
  .instructions { background: #0b1120; border: 1px solid #1e293b; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; }
  .instructions h4 { margin: 0 0 10px 0; font-size: 13px; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px; }
  .instructions ol { margin: 0; padding-left: 20px; font-size: 12px; color: #cbd5e1; line-height: 1.7; }
  .footer { background: #0f172a; padding: 16px 30px; border-top: 1px solid #1e293b; text-align: center; font-size: 11px; color: #64748b; line-height: 1.5; }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">IOC Hunt &bull; Fleet Security</div>
      <div class="title">Cryptographic Agent Provisioning Package</div>
    </div>
    <div class="content">
      <div class="badge-row">
        <span class="badge badge-secure">&#128274; One-Time Delivery</span>
        <span class="badge badge-count">${keys.length} API Keys Attached</span>
      </div>

      <p style="font-size: 13px; color: #cbd5e1; line-height: 1.6; margin-top: 0;">
        Hello, this is an automated dispatch from the <strong>IOC Hunt Central Server</strong>.
        A batch of <strong>${keys.length} cryptographic agent authentication keys</strong> has been provisioned by administrator <strong>${username}</strong>.
      </p>

      <div class="alert-box">
        <strong>SECURITY PROTOCOL &bull; CONFIDENTIAL</strong>
        <p>
          The attached CSV file contains raw, plaintext API keys. The Central Server computes and stores only one-way SHA-256 hashes—these keys <strong>cannot be viewed or regenerated again</strong> from the server dashboard. Save the attached keyfile securely.
        </p>
      </div>

      <table class="info-table">
        <tr>
          <td class="label">BATCH SIZE:</td>
          <td class="value">${keys.length} Endpoint Keys</td>
        </tr>
        <tr>
          <td class="label">PROVISIONED BY:</td>
          <td class="value">${username}</td>
        </tr>
        <tr>
          <td class="label">DATE & TIME:</td>
          <td class="value">${new Date().toUTCString()}</td>
        </tr>
        ${label ? `<tr><td class="label">LABEL / FLEET:</td><td class="value">${label}</td></tr>` : ''}
        <tr>
          <td class="label">ATTACHED FILE:</td>
          <td class="value">${filename}</td>
        </tr>
      </table>

      <div class="instructions">
        <h4>Deployment Steps:</h4>
        <ol>
          <li>Download and store the attached keyfile <code>${filename}</code> in a secure, encrypted secrets vault.</li>
          <li>Assign one unique key from the CSV to each target endpoint machine.</li>
          <li>Set the key in the endpoint agent configuration: <code>central_server_key: "&lt;AGENT_KEY&gt;"</code>.</li>
          <li>Upon the agent's first secure handshake, the Central Server will permanently lock the key to that machine's unique hostname.</li>
        </ol>
      </div>
    </div>
    <div class="footer">
      IOC Hunt Enterprise Zero-Trust Endpoint Protection &nbsp;&bull;&nbsp; Strictly Confidential<br>
      This message was sent to authorized personnel: ${validEmails.join(', ')}
    </div>
  </div>
</body>
</html>`;

    const transporter = createTransporter(cfg);
    await transporter.sendMail({
      from: `"${cfg.from_name || 'IOC Hunt Security'}" <${cfg.from_addr}>`,
      to: validEmails.join(', '),
      subject: `[IOC Hunt Enterprise] Secure Agent API Keys Provisioned (${keys.length} Keys)`,
      text: `IOC Hunt Enterprise - Agent API Keys Provisioned\n\n${keys.length} agent keys have been provisioned by ${username}.\nPlease find the attached keyfile: ${filename}.\n\nConfidential - Do not forward.`,
      html: htmlContent,
      attachments: [
        {
          filename,
          content: csvContent,
          contentType: 'text/csv; charset=utf-8'
        }
      ]
    });

    logSecurityEvent({
      event: 'AGENT_KEYS_EMAILED',
      severity: SEVERITY.INFO,
      tenantId,
      user: username,
      ip: req.ip,
      detail: { count: keys.length, recipients: validEmails }
    });

    return res.status(200).json({
      success: true,
      message: `Keyfile CSV successfully sent to ${validEmails.length} recipient(s): ${validEmails.join(', ')}`,
      recipients: validEmails
    });
  } catch (error) {
    console.error('[AgentKeyController] emailKeys error:', error);
    return res.status(500).json({ error: 'Failed to send keys via email: ' + error.message });
  }
}

module.exports = {
  generateKeys,
  listKeys,
  revokeKey,
  resetKey,
  deleteKey,
  bulkAction,
  emailKeys
};
