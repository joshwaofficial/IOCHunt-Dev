const crypto = require('crypto');

function base32Encode(buf) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, val = 0, out = '';
  for (const byte of buf) {
    val = (val << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alpha[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alpha[(val << (5 - bits)) & 31];
  return out;
}

function base32Decode(encoded) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  encoded = encoded.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, val = 0;
  const out = [];
  for (const ch of encoded) {
    const idx = alpha.indexOf(ch);
    if (idx === -1) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateMFASecret() {
  return base32Encode(crypto.randomBytes(20));
}

function totpCode(secret, windowOffset = 0) {
  const key = base32Decode(secret);
  const time = BigInt(Math.floor(Date.now() / 1000 / 30) + windowOffset);
  const tb = Buffer.alloc(8);
  tb.writeBigInt64BE(time);
  
  const hmac = crypto.createHmac('sha1', key).update(tb).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % 1000000;
  
  return String(code).padStart(6, '0');
}

function verifyTOTP(secret, token) {
  if (!secret || !token) return false;
  const clean = String(token).replace(/\s/g, '');
  
  // Accept current window ±1 step to handle clock drift
  return [-1, 0, 1].some(w => {
    const validCode = totpCode(secret, w);
    // Use timing-safe comparison to prevent side-channel timing attacks
    if (validCode.length !== clean.length) return false;
    return crypto.timingSafeEqual(Buffer.from(validCode), Buffer.from(clean));
  });
}

function otpauthURL(username, secret) {
  const issuer = 'IOCHunt';
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = {
  generateMFASecret,
  verifyTOTP,
  otpauthURL
};
