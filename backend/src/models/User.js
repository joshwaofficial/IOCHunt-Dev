const db = require('../config/db');

class User {
  static async findByUsername(username) {
    const res = await db.query('SELECT * FROM users WHERE username = $1', [username.toLowerCase()]);
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
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + 8 * 3600; // 8 hours
    
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
    const res = await db.query('SELECT id, username, email, role, mfa_enabled, created_at, last_login FROM users ORDER BY id');
    return res.rows;
  }

  static async createUser({ username, email, passwordHash, salt, role }) {
    const now = Math.floor(Date.now() / 1000);
    await db.query(
      'INSERT INTO users (username, email, password_hash, salt, role, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [username, email, passwordHash, salt, role, now]
    );
  }

  static async updateUser(id, { username, email, role, passwordHash, salt }) {
    if (passwordHash && salt) {
      await db.query(
        'UPDATE users SET username = $1, email = $2, role = $3, password_hash = $4, salt = $5 WHERE id = $6',
        [username, email, role, passwordHash, salt, id]
      );
    } else {
      await db.query(
        'UPDATE users SET username = $1, email = $2, role = $3 WHERE id = $4',
        [username, email, role, id]
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
