require('dotenv').config();
const { hashPassword } = require('./src/utils/cryptoHelper');
const db = require('./src/config/db');

async function resetAdmin() {
  try {
    const password = 'iochunt';
    const { hash, salt } = hashPassword(password);

    const res = await db.query(
      `UPDATE users SET password_hash = $1, salt = $2 WHERE username = $3`,
      [hash, salt, 'iochunt']
    );

    if (res.rowCount > 0) {
      console.log('Admin password successfully reset to "iochunt"');
    } else {
      console.log('User iochunt not found in database!');
    }
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}

resetAdmin();
