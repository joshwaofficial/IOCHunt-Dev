// ════════════════════════════════════════════════════════════════
// IOC Hunt — User Model
// ════════════════════════════════════════════════════════════════

const db = require('../config/db');
const crypto = require('crypto');

class User {
  static async findByUsername(username, queryFn) {
    if (!username) return null;
    const q = queryFn || db.query.bind(db);
    const res = await q('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username.trim()]);
    return res.rows[0];
  }

  static async findById(id, queryFn) {
    const q = queryFn || db.query.bind(db);
    const res = await q('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0];
  }

  static async updateLastLogin(id, queryFn) {
    const now = Math.floor(Date.now() / 1000);
    const q = queryFn || db.query.bind(db);
    await q('UPDATE users SET last_login = $1 WHERE id = $2', [now, id]);
  }

  static async createSession(userId, username, role, tenantId = 'default', ipAddress = '', userAgent = '', forcePasswordChange = 0, sessionDurationHours = 8, idleTimeoutMins = 0) {
    const token = crypto.randomBytes(32).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    const durationHours = Math.max(1, Number(sessionDurationHours) || 8);
    const expiresAt = now + (durationHours * 3600);
    const idleMins = Math.max(0, Number(idleTimeoutMins) || 0);
    
    await db.query(
      `INSERT INTO sessions (token, user_id, username, role, tenant_id, ip_address, user_agent, force_password_change, expires_at, last_activity_at, idle_timeout_mins)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [token, userId, username, role, tenantId, ipAddress, userAgent, forcePasswordChange ? 1 : 0, expiresAt, now, idleMins]
    );
    return token;
  }

  static async deleteSession(token) {
    await db.query('DELETE FROM sessions WHERE token = $1', [token]);
  }

  static async deleteSessionsByUserId(userId, tenantId = null) {
    if (tenantId) {
      await db.query('DELETE FROM sessions WHERE user_id = $1 AND tenant_id = $2', [userId, tenantId]);
    } else {
      await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    }
  }

  static async deleteSessionsByTenant(tenantId) {
    await db.query('DELETE FROM sessions WHERE tenant_id = $1', [tenantId]);
  }

  static async getAllUsers(queryFn) {
    const q = queryFn || db.query.bind(db);
    const res = await q(`
      SELECT id, username, email, role, force_password_change, mfa_enabled, session_policy, custom_session_hours, custom_idle_mins, created_at, last_login 
      FROM users 
      ORDER BY id ASC
    `);
    return res.rows;
  }

  static async createUser({ username, email, passwordHash, salt, role, forcePasswordChange = 1, sessionPolicy = 'inherit', customSessionHours = null, customIdleMins = null }, queryFn) {
    const now = Math.floor(Date.now() / 1000);
    const q = queryFn || db.query.bind(db);
    const res = await q(
      `INSERT INTO users (username, email, password_hash, salt, role, force_password_change, session_policy, custom_session_hours, custom_idle_mins, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [username.trim().toLowerCase(), email || '', passwordHash, salt, role || 'ADMIN', forcePasswordChange ? 1 : 0, sessionPolicy || 'inherit', customSessionHours || null, customIdleMins || null, now]
    );
    return res.rows[0];
  }

  static async updatePassword(id, passwordHash, salt, queryFn) {
    const q = queryFn || db.query.bind(db);
    await q(
      'UPDATE users SET password_hash = $1, salt = $2, force_password_change = 0 WHERE id = $3',
      [passwordHash, salt, id]
    );
  }

  static async updateCredentials(id, username, passwordHash, salt, queryFn) {
    const q = queryFn || db.query.bind(db);
    await q(
      'UPDATE users SET username = $1, password_hash = $2, salt = $3, force_password_change = 0 WHERE id = $4',
      [username.trim().toLowerCase(), passwordHash, salt, id]
    );
  }

  static async setForcePasswordChange(id, value) {
    await db.query('UPDATE users SET force_password_change = $1 WHERE id = $2', [value ? 1 : 0, id]);
  }

  static async updateUser(id, { username, email, role, passwordHash, salt, forcePasswordChange, sessionPolicy, customSessionHours, customIdleMins }, queryFn) {
    const q = queryFn || db.query.bind(db);
    const fields = [];
    const vals = [];
    let idx = 1;

    if (username) {
      fields.push(`username = $${idx++}`);
      vals.push(username.trim().toLowerCase());
    }
    if (email !== undefined) {
      fields.push(`email = $${idx++}`);
      vals.push(email || '');
    }
    if (role) {
      fields.push(`role = $${idx++}`);
      vals.push(role);
    }
    if (passwordHash && salt) {
      fields.push(`password_hash = $${idx++}`);
      vals.push(passwordHash);
      fields.push(`salt = $${idx++}`);
      vals.push(salt);
    }
    if (forcePasswordChange !== undefined) {
      fields.push(`force_password_change = $${idx++}`);
      vals.push(forcePasswordChange ? 1 : 0);
    }
    if (sessionPolicy !== undefined) {
      fields.push(`session_policy = $${idx++}`);
      vals.push(sessionPolicy || 'inherit');
    }
    if (customSessionHours !== undefined) {
      fields.push(`custom_session_hours = $${idx++}`);
      vals.push(customSessionHours);
    }
    if (customIdleMins !== undefined) {
      fields.push(`custom_idle_mins = $${idx++}`);
      vals.push(customIdleMins);
    }

    if (fields.length === 0) return;

    vals.push(id);
    await q(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`, vals);
  }

  static async deleteUser(id, queryFn) {
    const q = queryFn || db.query.bind(db);
    await q('DELETE FROM users WHERE id = $1', [id]);
  }

  static async disableMfa(id, queryFn) {
    const q = queryFn || db.query.bind(db);
    await q('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL WHERE id = $1', [id]);
  }
}

module.exports = User;
