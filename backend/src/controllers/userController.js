// ════════════════════════════════════════════════════════════════
// IOC Hunt — User Management Controller
// ════════════════════════════════════════════════════════════════

const User = require('../models/User');
const { hashPassword } = require('../utils/cryptoHelper');
const totpHelper = require('../utils/totpHelper');
const QRCodeLib = require('qrcode');
const db = require('../config/db');
const { getValidRoles } = require('../config/roles');
const {
  isString,
  isPositiveInteger,
  isEmail,
  isIdentifier,
  validatePasswordComplexity,
  TOTP_REGEX
} = require('../utils/inputValidator');

async function getUsers(req, res) {
  try {
    if (!req.session || !req.session.user_id) return res.status(401).json({ error: 'Unauthenticated' });
    let users;
    if (req.session.role === 'ADMIN' || req.session.role === 'AGGREGATOR_ADMIN') {
      users = await User.getAllUsers(req.queryTenant);
    } else {
      const u = await User.findById(req.session.user_id, req.queryTenant);
      users = u ? [u] : [];
    }
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

async function getAssignableUsers(req, res) {
  try {
    if (!req.session || !req.session.user_id) return res.status(401).json({ error: 'Unauthenticated' });
    const users = await User.getAllUsers(req.queryTenant);
    
    const role = req.session.role;
    const allowedAssignees = users.filter(u => {
      if (role === 'ADMIN' || role === 'AGGREGATOR_ADMIN') return ['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST'].includes(u.role);
      if (role === 'L3_ANALYST') return ['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST'].includes(u.role);
      if (role === 'L2_ANALYST') return ['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST'].includes(u.role);
      if (role === 'L1_ANALYST') return u.role === 'L2_ANALYST';
      return false;
    });

    const safeUsers = allowedAssignees.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role
    }));
    return res.status(200).json({ users: safeUsers });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function createUser(req, res) {
  try {
    const { username, email, password, role, force_password_change = true } = req.body || {};
    if (!username || !password || !role || typeof username !== 'string' || typeof password !== 'string' || typeof role !== 'string') {
      return res.status(400).json({ error: 'Username, password, and role are required and must be strings' });
    }

    const trimmedUser = username.trim().toLowerCase();
    if (!isIdentifier(trimmedUser, 3, 32)) {
      return res.status(400).json({ error: 'Username must be 3-32 characters long and contain only letters, numbers, hyphens, and underscores' });
    }

    if (email && (typeof email !== 'string' || !isEmail(email))) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }

    const pwdError = validatePasswordComplexity(password);
    if (pwdError) {
      return res.status(400).json({ error: pwdError });
    }
    
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
    if (!isPositiveInteger(id)) {
      return res.status(400).json({ error: 'Invalid user ID parameter' });
    }

    const { username, email, role, password, force_password_change } = req.body || {};
    const existing = await User.findById(id, req.queryTenant);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    
    const isAdmin = req.session.role === 'ADMIN';
    const isOwnAccount = parseInt(id, 10) === req.session.user_id;

    if (!isAdmin && !isOwnAccount) return res.status(403).json({ error: 'Forbidden' });
    if (role && role !== existing.role && !isAdmin) return res.status(403).json({ error: 'Forbidden' });

    if (email && (typeof email !== 'string' || !isEmail(email))) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }

    // Restrict username modification
    if (username && username.trim().toLowerCase() !== existing.username.toLowerCase()) {
      if (existing.role === 'ADMIN') {
        return res.status(403).json({
          error: 'Central server administrator username cannot be changed. The admin username can only be set by the Super Admin.'
        });
      }
      const existingUser = await User.findByUsername(username.trim().toLowerCase(), req.queryTenant);
      if (existingUser && parseInt(existingUser.id) !== parseInt(id)) {
        return res.status(400).json({ error: 'Username is already taken' });
      }
    }

    let passwordHash = undefined, salt = undefined;
    let enforcedForcePasswordChange = force_password_change;

    if (password) {
      if (typeof password !== 'string') {
        return res.status(400).json({ error: 'Password must be a string' });
      }
      if (isOwnAccount) {
        return res.status(400).json({
          error: 'To change your own password, please use the Change Password setting with your current password verification.'
        });
      }
      if (!isAdmin) {
        return res.status(403).json({ error: 'Forbidden: Only administrators can reset user passwords.' });
      }
      const pwdError = validatePasswordComplexity(password);
      if (pwdError) {
        return res.status(400).json({ error: pwdError });
      }
      const hashed = hashPassword(password);
      passwordHash = hashed.hash;
      salt = hashed.salt;
      // Admin reset always forces the employee to set their own password on next login
      enforcedForcePasswordChange = 1;
    }

    const upperRole = role ? role.toUpperCase() : existing.role;
    const targetUsername = existing.role === 'ADMIN' ? existing.username : (username ? username.trim().toLowerCase() : existing.username);

    await User.updateUser(id, {
      username: targetUsername,
      email: email !== undefined ? email : existing.email,
      role: upperRole,
      passwordHash,
      salt,
      forcePasswordChange: enforcedForcePasswordChange
    }, req.queryTenant);

    if (targetUsername !== existing.username) {
      await req.queryControlPlane('UPDATE sessions SET username = $1 WHERE user_id = $2 AND tenant_id = $3', [targetUsername, id, req.tenantId]);
    }

    if (password) {
      await req.queryControlPlane('DELETE FROM sessions WHERE user_id = $1 AND tenant_id = $2', [id, req.tenantId]);
    }

    return res.status(200).json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function deleteUser(req, res) {
  try {
    const id = req.params.id;
    if (!isPositiveInteger(id)) {
      return res.status(400).json({ error: 'Invalid user ID parameter' });
    }
    const existing = await User.findById(id, req.queryTenant);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    if (existing.role === 'ADMIN') {
      const allUsers = await User.getAllUsers(req.queryTenant);
      if (allUsers.filter(u => u.role === 'ADMIN').length <= 1) {
        return res.status(400).json({ error: 'Cannot delete the only remaining admin account' });
      }
    }
    await User.deleteUser(id, req.queryTenant);
    await req.queryControlPlane('DELETE FROM sessions WHERE user_id = $1 AND tenant_id = $2', [id, req.tenantId]);
    return res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function disableMfa(req, res) {
  try {
    const id = req.params.id;
    if (!isPositiveInteger(id)) {
      return res.status(400).json({ error: 'Invalid user ID parameter' });
    }
    const isAdmin = req.session.role === 'ADMIN';
    if (!isAdmin && parseInt(id, 10) !== req.session.user_id) return res.status(403).json({ error: 'Forbidden' });
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
    const { secret, totp } = req.body || {};
    if (!secret || !totp || typeof secret !== 'string' || typeof totp !== 'string') {
      return res.status(400).json({ error: 'Secret and TOTP code are required and must be strings' });
    }
    if (!TOTP_REGEX.test(totp.trim())) {
      return res.status(400).json({ error: 'TOTP code must be a 6-digit number' });
    }
    if (!totpHelper.verifyTOTP(secret, totp.trim())) return res.status(400).json({ error: 'Invalid verification code' });
    await req.queryTenant('UPDATE users SET mfa_enabled=1, mfa_secret=$1 WHERE id=$2', [secret, req.session.user_id]);
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  getUsers,
  getAssignableUsers,
  createUser,
  updateUser,
  deleteUser,
  disableMfa,
  generateMfa,
  verifyMfa
};
