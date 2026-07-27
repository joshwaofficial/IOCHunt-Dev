const User = require('../models/User');
const { verifyPassword } = require('../utils/cryptoHelper');

const crypto = require('crypto');
const db = require('../config/db');
const { verifyTOTP } = require('../utils/totpHelper');

async function login(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = verifyPassword(password, user.password_hash, user.salt);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // MFA logic
    if (user.mfa_enabled) {
      const tempToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 mins
      
      await db.query(
        'INSERT INTO mfa_pending (token, user_id, username, role, expires_at) VALUES ($1, $2, $3, $4, $5)',
        [tempToken, user.id, user.username, user.role, expiresAt]
      );
      
      return res.status(200).json({ 
        message: 'MFA required', 
        mfa_required: true,
        tempToken: tempToken 
      });
    }

    // Generate session
    const token = await User.createSession(user.id, user.username, user.role);
    await User.updateLastLogin(user.id);

    // Set secure cookie
    res.cookie('iochunt_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 3600 * 1000 // 8 hours
    });

    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        force_password_change: user.force_password_change === 1
      }
    });
  } catch (error) {
    console.error('[Auth Error] Login failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function mfaVerify(req, res) {
  try {
    const { tempToken, totpToken } = req.body;
    if (!tempToken || !totpToken) {
      return res.status(400).json({ message: 'Token and code required' });
    }

    const pendingRes = await db.query('SELECT * FROM mfa_pending WHERE token=$1 AND expires_at > $2', [tempToken, Math.floor(Date.now() / 1000)]);
    const pending = pendingRes.rows[0];
    if (!pending) return res.status(401).json({ message: 'Session expired or invalid' });

    const user = await User.findById(pending.user_id);
    if (!user || !user.mfa_enabled || !user.mfa_secret) {
      await db.query('DELETE FROM mfa_pending WHERE token=$1', [tempToken]);
      return res.status(401).json({ message: 'Invalid user state' });
    }

    if (!verifyTOTP(user.mfa_secret, totpToken)) {
      return res.status(401).json({ message: 'Invalid MFA code. Please try again.' });
    }

    await db.query('DELETE FROM mfa_pending WHERE token=$1', [tempToken]);
    
    const token = await User.createSession(user.id, user.username, user.role);
    await User.updateLastLogin(user.id);

    res.cookie('iochunt_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 3600 * 1000
    });

    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        force_password_change: user.force_password_change === 1
      }
    });
  } catch (error) {
    console.error('[Auth Error] MFA verify failed:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Handles user logout
 */
async function logout(req, res) {
  try {
    const token = req.cookies?.iochunt_session || req.session?.token;
    if (token) {
      await User.deleteSession(token);
    }
    
    res.clearCookie('iochunt_session');
    return res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    console.error('[Auth Error] Logout failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Retrieves current authenticated user session data
 */
async function me(req, res) {
  try {
    // If middleware passes, req.session is populated
    return res.status(200).json({
      user: {
        id: req.session.user_id,
        username: req.session.username,
        role: req.session.role,
        force_password_change: req.session.force_password_change === 1
      }
    });
  } catch (error) {
    console.error('[Auth Error] Me query failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function signup(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const existingUser = await User.findByUsername(username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const { hashPassword } = require('../utils/cryptoHelper');
    const { hash: passwordHash, salt } = hashPassword(password);

    await User.createUser({
      username,
      email: '', // Not strictly required for basic aggregator
      passwordHash,
      salt,
      role: 'AGGREGATOR'
    });

    return res.status(201).json({ message: 'Signup successful' });
  } catch (error) {
    console.error('[Signup Error]:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  login,
  mfaVerify,
  logout,
  me,
  signup
};
