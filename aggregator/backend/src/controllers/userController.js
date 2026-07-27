const User = require('../models/User');
const { hashPassword } = require('../utils/cryptoHelper');
const totpHelper = require('../utils/totpHelper');
const QRCodeLib = require('qrcode');
const db = require('../config/db');

async function getUsers(req, res) {
  try {
    if (!req.session || !req.session.user_id) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }
    const users = await User.getAllUsers();
    // Strip sensitive fields just in case
    let safeUsers = users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      created_at: u.created_at,
      last_login: u.last_login,
      mfa_enabled: u.mfa_enabled,
      displayName: u.displayName || u.username
    }));

    if (req.session.role === 'AGGREGATOR') {
      safeUsers = safeUsers.filter(u => u.id === req.session.user_id);
    }

    return res.status(200).json({ users: safeUsers });
  } catch (error) {
    console.error('[User API] Failed to get users:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function createUser(req, res) {
  try {
    const { username, email, password, role } = req.body;
    
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password min 8 characters' });
    }

    if (!['ADMIN', 'L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const existing = await User.findByUsername(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const { hash: passwordHash, salt } = hashPassword(password);
    await User.createUser({ username, email: email || '', passwordHash, salt, role });
    
    return res.status(201).json({ success: true, message: 'User created' });
  } catch (error) {
    console.error('[User API] Failed to create user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function updateUser(req, res) {
  try {
    const id = req.params.id;
    const { username, email, role, password } = req.body;
    
    const existing = await User.findById(id);
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (req.session.role !== 'ADMIN' && parseInt(id) !== req.session.user_id) {
      return res.status(403).json({ error: 'Forbidden: Cannot modify other users' });
    }

    if (role && role !== existing.role && req.session.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Cannot change roles' });
    }

    // Check if new username conflicts
    if (username && username.toLowerCase() !== existing.username.toLowerCase()) {
      const conflict = await User.findByUsername(username);
      if (conflict) {
        return res.status(400).json({ error: 'Username already in use' });
      }
    }

    let passwordHash = undefined;
    let salt = undefined;
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password min 8 characters' });
      }
      const hashed = hashPassword(password);
      passwordHash = hashed.hash;
      salt = hashed.salt;
    }

    if (role && !['ADMIN', 'L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    await User.updateUser(id, {
      username: username || existing.username,
      email: email !== undefined ? email : existing.email,
      role: role || existing.role,
      passwordHash,
      salt
    });

    if (username && username !== existing.username) {
      await db.query('UPDATE sessions SET username = $1 WHERE user_id = $2', [username, id]);
    }

    return res.status(200).json({ success: true, message: 'User updated' });
  } catch (error) {
    console.error('[User API] Failed to update user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function deleteUser(req, res) {
  try {
    const id = req.params.id;
    const existing = await User.findById(id);
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (existing.role === 'ADMIN') {
      const allUsers = await User.getAllUsers();
      const adminCount = allUsers.filter(u => u.role === 'ADMIN').length;
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin' });
      }
    }

    await User.deleteUser(id);
    return res.status(200).json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('[User API] Failed to delete user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function disableMfa(req, res) {
  try {
    const id = req.params.id;
    const existing = await User.findById(id);
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (req.session.role !== 'ADMIN' && parseInt(id) !== req.session.user_id) {
      return res.status(403).json({ error: 'Forbidden: Cannot modify other users' });
    }

    await User.disableMfa(id);
    return res.status(200).json({ success: true, message: 'MFA disabled' });
  } catch (error) {
    console.error('[User API] Failed to disable MFA:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function generateMfa(req, res) {
  try {
    const user = await User.findById(req.session.user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const newSecret = totpHelper.generateMFASecret();
    const otpAuth = totpHelper.otpauthURL(user.username, newSecret);
    const qrDataUrl = await QRCodeLib.toDataURL(otpAuth);

    return res.status(200).json({ secret: newSecret, qrDataUrl });
  } catch (error) {
    console.error('[User API] Failed to generate MFA:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function verifyMfa(req, res) {
  try {
    const { secret, totp } = req.body;
    if (!secret || !totp) return res.status(400).json({ error: 'Missing secret or totp' });

    if (!totpHelper.verifyTOTP(secret, totp)) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    await db.query('UPDATE users SET mfa_enabled=1, mfa_secret=$1 WHERE id=$2', [secret, req.session.user_id]);
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[User API] Failed to verify MFA:', error);
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
