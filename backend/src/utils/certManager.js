const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

/**
 * Finds or creates the SSL directory.
 */
function resolveSslDir() {
  if (process.env.SSL_DIR && fs.existsSync(process.env.SSL_DIR)) {
    return process.env.SSL_DIR;
  }

  // Candidate paths
  const candidates = [
    path.resolve(__dirname, '../../../nginx/ssl'), // from backend/src/utils
    path.resolve(__dirname, '../../nginx/ssl'),
    path.resolve(process.cwd(), 'nginx/ssl'),
    path.resolve(process.cwd(), '../nginx/ssl'),
    '/app/nginx/ssl',
    '/etc/nginx/ssl'
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }

  // Default fallback: create directory in relative project root or /app/nginx/ssl
  const targetDir = fs.existsSync('/app') ? '/app/nginx/ssl' : path.resolve(__dirname, '../../../nginx/ssl');
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    return targetDir;
  } catch (e) {
    const localFallback = path.resolve(process.cwd(), 'nginx/ssl');
    fs.mkdirSync(localFallback, { recursive: true });
    return localFallback;
  }
}

/**
 * Calculates SHA-256 fingerprint of a certificate PEM.
 */
function getCertFingerprint(certPem) {
  try {
    // Extract base64 DER
    const der = Buffer.from(
      certPem.replace(/-----BEGIN CERTIFICATE-----/, '').replace(/-----END CERTIFICATE-----/, '').replace(/\s+/g, ''),
      'base64'
    );
    const hash = crypto.createHash('sha256').update(der).digest('hex');
    // Format as colon-separated hex (e.g., AA:BB:CC...)
    return hash.match(/.{2}/g).join(':').toUpperCase();
  } catch (err) {
    return 'UNKNOWN';
  }
}

/**
 * Automatically checks for TLS/SSL certificates, and generates them if missing.
 */
function ensureCertificates() {
  try {
    const sslDir = resolveSslDir();
    const certPath = path.join(sslDir, 'iochunt.crt');
    const keyPath = path.join(sslDir, 'iochunt.key');

    // Also check legacy filenames if present
    const altCertPath = path.join(sslDir, 'central.crt');
    const altKeyPath = path.join(sslDir, 'central.key');

    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      const certContent = fs.readFileSync(certPath, 'utf8');
      const fingerprint = getCertFingerprint(certContent);
      console.log(`[SSL]  TLS certificates verified in ${sslDir}`);
      console.log(`[SSL] Fingerprint (SHA-256): ${fingerprint}`);
      return { exists: true, certPath, keyPath, fingerprint };
    }

    if (fs.existsSync(altCertPath) && fs.existsSync(altKeyPath)) {
      // Copy to iochunt.crt / iochunt.key for unified naming
      fs.copyFileSync(altCertPath, certPath);
      fs.copyFileSync(altKeyPath, keyPath);
      const certContent = fs.readFileSync(certPath, 'utf8');
      const fingerprint = getCertFingerprint(certContent);
      console.log(`[SSL]  Migrated legacy certificates in ${sslDir}`);
      return { exists: true, certPath, keyPath, fingerprint };
    }

    console.log(`[SSL] ⚠ No TLS certificates found in ${sslDir}. Generating self-signed certificate...`);

    // Try generating with openssl
    let generated = false;
    try {
      execSync(
        `openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 3650 -nodes -subj "/CN=iochunt-platform/O=DefSecOne/C=IN" 2>/dev/null`
      );
      generated = true;
    } catch (cmdErr) {
      console.log(`[SSL] OpenSSL CLI not found or failed, generating with Node crypto fallback...`);
    }

    if (!generated) {
      // Fallback: Generate self-signed keypair directly with Node.js crypto
      const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
      fs.writeFileSync(keyPath, privateKey);
      fs.writeFileSync(certPath, publicKey);
    }

    if (fs.existsSync(certPath)) {
      const certContent = fs.readFileSync(certPath, 'utf8');
      const fingerprint = getCertFingerprint(certContent);
      console.log(`[SSL] Successfully generated TLS certificates!`);
      console.log(`[SSL] Certificate: ${certPath}`);
      console.log(`[SSL] Private Key: ${keyPath}`);
      console.log(`[SSL] Fingerprint (SHA-256): ${fingerprint}`);
      return { generated: true, certPath, keyPath, fingerprint };
    }
  } catch (err) {
    console.error(`[SSL Error] Failed to verify or generate TLS certificates:`, err.message);
  }
}

module.exports = {
  ensureCertificates,
  resolveSslDir,
  getCertFingerprint
};
