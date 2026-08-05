// ════════════════════════════════════════════════════════════════
// IOC Hunt — User Model
// ════════════════════════════════════════════════════════════════

const db = require('../config/db');
const crypto = require('crypto');

class User {
  static async findByUsername(username) {
    if (!username) return null;
    const res = await db.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username.trim()]);
    return res.rows[0];
  }

  static async findById(id) {
    const res = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0];
  }

  static async updateLastLogin(id) {
    const now = Math.floor(Date.now() / 1000);
    await db.query('UPDATE users SET last_login = $1 WHERE id = $2', [now, id]);
  }

  static async createSession(userId, username, role) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + 7 * 86400; // 7 days
    
    await db.query(
      'INSERT INTO sessions (token, user_id, username, role, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [token, userId, username, role, expiresAt]
    );
    return token;
  }

  static async deleteSession(token) {
    await db.query('DELETE FROM sessions WHERE token = $1', [token]);
  }

  static async getAllUsers() {
    const res = await db.query(`
      SELECT id, username, email, role, force_password_change, mfa_enabled, created_at, last_login 
      FROM users 
      ORDER BY id ASC
    `);
    return res.rows;
  }

  static async createUser({ username, email, passwordHash, salt, role, forcePasswordChange = 1 }) {
    const now = Math.floor(Date.now() / 1000);
    const res = await db.query(
      'INSERT INTO users (username, email, password_hash, salt, role, force_password_change, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [username.trim().toLowerCase(), email || '', passwordHash, salt, role || 'ADMIN', forcePasswordChange ? 1 : 0, now]
    );
    return res.rows[0];
  }

  static async updatePassword(id, passwordHash, salt) {
    await db.query(
      'UPDATE users SET password_hash = $1, salt = $2, force_password_change = 0 WHERE id = $3',
      [passwordHash, salt, id]
    );
  }

  static async setForcePasswordChange(id, value) {
    await db.query('UPDATE users SET force_password_change = $1 WHERE id = $2', [value ? 1 : 0, id]);
  }

  static async updateUser(id, { username, email, role, passwordHash, salt, forcePasswordChange }) {
    if (passwordHash && salt) {
      await db.query(
        'UPDATE users SET username = $1, email = $2, role = $3, password_hash = $4, salt = $5, force_password_change = $6 WHERE id = $7',
        [username.trim().toLowerCase(), email || '', role, passwordHash, salt, forcePasswordChange !== undefined ? (forcePasswordChange ? 1 : 0) : 0, id]
      );
    } else {
      await db.query(
        'UPDATE users SET username = $1, email = $2, role = $3 WHERE id = $4',
        [username.trim().toLowerCase(), email || '', role, id]
      );
    }
  }

  static async deleteUser(id) {
    await db.query('DELETE FROM users WHERE id = $1', [id]);
  }

  static async disableMfa(id) {
    await db.query('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL WHERE id = $1', [id]);
  }
}

module.exports = User;
