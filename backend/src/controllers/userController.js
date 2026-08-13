// ════════════════════════════════════════════════════════════════
// IOC Hunt — User Management Controller
// ════════════════════════════════════════════════════════════════

const User = require('../models/User');
const { hashPassword } = require('../utils/cryptoHelper');
const totpHelper = require('../utils/totpHelper');
const QRCodeLib = require('qrcode');
const db = require('../config/db');
const { getValidRoles } = require('../config/roles');

async function getUsers(req, res) {
  try {
    if (!req.session || !req.session.user_id) return res.status(401).json({ error: 'Unauthenticated' });
    const users = await User.getAllUsers(req.queryTenant);
    const safeUsers = users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      force_password_change: u.force_password_change === 1 || u.force_password_change === true,
      created_at: u.created_at,
      last_login: u.last_login,
      mfa_enabled: u.mfa_enabled
    }));
    return res.status(200).json({ users: safeUsers });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function createUser(req, res) {
  try {
    const { username, email, password, role, force_password_change = true } = req.body;
    if (!username || !password || !role) return res.status(400).json({ error: 'Missing required fields' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    
    const validRoles = getValidRoles();
    const upperRole = role.toUpperCase();
    if (!validRoles.includes(upperRole)) {
      return res.status(400).json({ error: `Invalid role. Allowed roles: ${validRoles.join(', ')}` });
    }

    const existing = await User.findByUsername(username, req.queryTenant);
    if (existing) return res.status(400).json({ error: 'Username already exists' });

    const { hash: passwordHash, salt } = hashPassword(password);
    await User.createUser({
      username,
      email: email || '',
      passwordHash,
      salt,
      role: upperRole,
      forcePasswordChange: force_password_change !== false
    }, req.queryTenant);
    
    return res.status(201).json({ success: true, message: 'User created successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function updateUser(req, res) {
  try {
    const id = req.params.id;
    const { username, email, role, password, force_password_change } = req.body;
    const existing = await User.findById(id, req.queryTenant);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    
    const isAdmin = req.session.role === 'ADMIN';
    if (!isAdmin && parseInt(id) !== req.session.user_id) return res.status(403).json({ error: 'Forbidden' });
    if (role && role !== existing.role && !isAdmin) return res.status(403).json({ error: 'Forbidden' });

    let passwordHash = undefined, salt = undefined;
    if (password) {
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      const hashed = hashPassword(password);
      passwordHash = hashed.hash;
      salt = hashed.salt;
    }

    const upperRole = role ? role.toUpperCase() : existing.role;

    await User.updateUser(id, {
      username: username || existing.username,
      email: email !== undefined ? email : existing.email,
      role: upperRole,
      passwordHash,
      salt,
      forcePasswordChange: force_password_change !== undefined ? force_password_change : (password ? 0 : undefined)
    }, req.queryTenant);

    if (username && username !== existing.username) {
      await req.queryControlPlane('UPDATE sessions SET username = $1 WHERE user_id = $2 AND tenant_id = $3', [username, id, req.tenantId]);
    }

    return res.status(200).json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function deleteUser(req, res) {
  try {
    const id = req.params.id;
    const existing = await User.findById(id, req.queryTenant);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    if (existing.role === 'ADMIN') {
      const allUsers = await User.getAllUsers(req.queryTenant);
      if (allUsers.filter(u => u.role === 'ADMIN').length <= 1) {
        return res.status(400).json({ error: 'Cannot delete the only remaining admin account' });
      }
    }
    await User.deleteUser(id, req.queryTenant);
    return res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function disableMfa(req, res) {
  try {
    const id = req.params.id;
    const isAdmin = req.session.role === 'ADMIN';
    if (!isAdmin && parseInt(id) !== req.session.user_id) return res.status(403).json({ error: 'Forbidden' });
    await User.disableMfa(id, req.queryTenant);
    return res.status(200).json({ success: true, message: 'MFA disabled' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function generateMfa(req, res) {
  try {
    const user = await User.findById(req.session.user_id, req.queryTenant);
    const newSecret = totpHelper.generateMFASecret();
    const otpAuth = totpHelper.otpauthURL(user.username, newSecret);
    const qrDataUrl = await QRCodeLib.toDataURL(otpAuth);
    return res.status(200).json({ secret: newSecret, qrDataUrl });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function verifyMfa(req, res) {
  try {
    const { secret, totp } = req.body;
    if (!totpHelper.verifyTOTP(secret, totp)) return res.status(400).json({ error: 'Invalid verification code' });
    await req.queryTenant('UPDATE users SET mfa_enabled=1, mfa_secret=$1 WHERE id=$2', [secret, req.session.user_id]);
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  disableMfa,
  generateMfa,
  verifyMfa
};
