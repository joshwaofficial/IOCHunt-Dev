require('dotenv').config();
const { hashPassword } = require('./src/utils/cryptoHelper');
const db = require('./src/config/db');

async function createAdmin() {
  const password = 'iochunt';
  const { hash, salt } = hashPassword(password);

  await db.query(
    `INSERT INTO users
    (username, email, password_hash, salt, role, created_at)
    VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      'iochunt',
      'admin@localhost',
      hash,
      salt,
      'admin',
      Math.floor(Date.now() / 1000)
    ]
  );

  console.log('Admin created');
  process.exit(0);
}

createAdmin().catch(console.error);
