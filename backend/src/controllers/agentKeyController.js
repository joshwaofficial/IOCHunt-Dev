// ════════════════════════════════════════════════════════════════
// IOC Hunt — Agent Key Management Controller
// ════════════════════════════════════════════════════════════════

const agentKeyService = require('../services/agentKeyService');
const { logSecurityEvent, EVENTS, SEVERITY } = require('../utils/securityLogger');
const { isInteger, isString, sanitizeText } = require('../utils/inputValidator');

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

module.exports = {
  generateKeys,
  listKeys,
  revokeKey,
  resetKey,
  deleteKey
};
