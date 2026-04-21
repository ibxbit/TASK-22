// Detects placeholder/default secrets and blocks production startup.
// Known-weak values are the dev defaults shipped in docker-compose.yml and .env.

const KNOWN_WEAK_ENCRYPTION_KEYS = new Set([
  '0000000000000000000000000000000000000000000000000000000000000001',
  '0000000000000000000000000000000000000000000000000000000000000000',
]);

const KNOWN_WEAK_HMAC_SECRETS = new Set([
  'motorlot-hmac-secret-replace-before-production',
  'changeme-replace-with-64-char-random-hex-string-before-production',
  'changeme',
]);

function validateEnv() {
  const isProduction = process.env.NODE_ENV === 'production';
  const errors   = [];
  const warnings = [];

  const currentVersion = process.env.ENCRYPTION_KEY_CURRENT || 'v1';
  const currentKeyHex  = process.env[`ENCRYPTION_KEY_${currentVersion}`];

  if (!currentKeyHex) {
    errors.push(`ENCRYPTION_KEY_${currentVersion} is not set`);
  } else if (KNOWN_WEAK_ENCRYPTION_KEYS.has(currentKeyHex)) {
    const msg = `ENCRYPTION_KEY_${currentVersion} is a placeholder — replace with a 64-char random hex string`;
    (isProduction ? errors : warnings).push(msg);
  } else if (Buffer.from(currentKeyHex, 'hex').length !== 32) {
    errors.push(`ENCRYPTION_KEY_${currentVersion} must be exactly 64 hex characters (32 bytes for AES-256)`);
  }

  const hmacSecret = process.env.HMAC_SECRET;
  if (!hmacSecret) {
    errors.push('HMAC_SECRET is not set');
  } else if (KNOWN_WEAK_HMAC_SECRETS.has(hmacSecret)) {
    const msg = 'HMAC_SECRET is a placeholder — replace with a strong random secret (min 32 chars)';
    (isProduction ? errors : warnings).push(msg);
  } else if (hmacSecret.length < 32) {
    const msg = 'HMAC_SECRET is too short — use at least 32 characters';
    (isProduction ? errors : warnings).push(msg);
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    errors.push('JWT_SECRET is not set');
  } else if (jwtSecret.length < 32) {
    const msg = 'JWT_SECRET is too short — use at least 32 characters (openssl rand -hex 32)';
    (isProduction ? errors : warnings).push(msg);
  }

  for (const w of warnings) {
    console.warn(`[env] WARNING: ${w}`);
  }

  if (errors.length > 0) {
    const header = isProduction
      ? '[env] FATAL — production startup blocked due to insecure configuration:'
      : '[env] ERROR — insecure configuration detected:';
    throw new Error([header, ...errors.map(e => `  • ${e}`)].join('\n'));
  }
}

module.exports = validateEnv;
