// ════════════════════════════════════════════════════════════════
// IOC Hunt — Security Configuration & Secrets Validator
// ════════════════════════════════════════════════════════════════
// Audits environment secrets and configurations on startup.
// Emits clear [SECURITY-WARNING] diagnostics without crashing the
// process, ensuring production stability while keeping operators informed.
// ════════════════════════════════════════════════════════════════

const KNOWN_DEFAULT_ENCRYPTION_KEY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // sha256("")
const KNOWN_DEFAULT_API_KEY = 'iochunt-change-me';
const KNOWN_DEFAULT_DB_PASSWORDS = ['iochunt_password', 'postgres', 'password', 'root', 'admin'];

function validateSecurityConfig() {
  const warnings = [];
  const isProduction = process.env.NODE_ENV === 'production';

  // 1. Encryption Key Audit
  const encKey = process.env.ENCRYPTION_KEY;
  if (!encKey) {
    warnings.push('ENCRYPTION_KEY is not defined. Using fallback values will make encrypted credentials insecure.');
  } else if (encKey === KNOWN_DEFAULT_ENCRYPTION_KEY) {
    warnings.push('ENCRYPTION_KEY matches the SHA-256 hash of an empty string. Replace with: openssl rand -hex 32');
  } else if (encKey.length < 32) {
    warnings.push('ENCRYPTION_KEY length is less than 32 characters. A 256-bit key (64 hex characters) is strongly recommended.');
  }

  // 2. Ingestion API Key Audit
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === KNOWN_DEFAULT_API_KEY) {
    warnings.push('API_KEY is using the default "iochunt-change-me". Generate a secure key before deploying to production.');
  }

  // 3. Database Password Audit
  const dbPassword = process.env.POSTGRES_PASSWORD;
  if (dbPassword && KNOWN_DEFAULT_DB_PASSWORDS.includes(dbPassword)) {
    warnings.push(`POSTGRES_PASSWORD is set to a common default ("${dbPassword}"). Update with a strong random secret.`);
  }

  // 4. CORS Wildcard in Production
  const frontendUrl = process.env.CENTRAL_FRONTEND_URL || process.env.FRONTEND_URL;
  if (isProduction && (!frontendUrl || frontendUrl === '*')) {
    warnings.push('CORS allows wildcard origins in production. Set FRONTEND_URL to your specific domain.');
  }

  // Output all warnings cleanly
  if (warnings.length > 0) {
    console.warn('\n' + '─'.repeat(72));
    console.warn('  ⚠️  [SECURITY CONFIGURATION NOTICE]');
    console.warn('─'.repeat(72));
    warnings.forEach((warn, index) => {
      console.warn(`  ${index + 1}. [SECURITY-WARNING] ${warn}`);
    });
    console.warn('─'.repeat(72) + '\n');
  } else {
    console.log('[Security] Environment configuration validated successfully. No default secrets detected.');
  }

  return { valid: warnings.length === 0, warnings };
}

module.exports = {
  validateSecurityConfig
};
