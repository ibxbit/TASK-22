const crypto = require('crypto');

const ALGORITHM  = 'aes-256-gcm';
const IV_BYTES   = 16;
const KEY_BYTES  = 32; // AES-256

function getKey(version) {
  const hex = process.env[`ENCRYPTION_KEY_${version}`];
  if (!hex) throw new Error(`Encryption key '${version}' not found in environment`);
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== KEY_BYTES) {
    throw new Error(`Encryption key '${version}' must be ${KEY_BYTES * 2} hex chars (${KEY_BYTES} bytes)`);
  }
  return buf;
}

function currentVersion() {
  return process.env.ENCRYPTION_KEY_CURRENT || 'v1';
}

/**
 * Returns: `{keyVersion}:{ivHex}:{authTagHex}:{ciphertextHex}`
 */
function encrypt(plaintext) {
  if (plaintext == null) return plaintext;
  const version = currentVersion();
  const key     = getKey(version);
  const iv      = crypto.randomBytes(IV_BYTES);
  const cipher  = crypto.createCipheriv(ALGORITHM, key, iv);
  const body    = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag     = cipher.getAuthTag();
  return `${version}:${iv.toString('hex')}:${tag.toString('hex')}:${body.toString('hex')}`;
}

function decrypt(ciphertext) {
  if (!ciphertext) return ciphertext;
  const parts = String(ciphertext).split(':');
  if (parts.length !== 4) throw new Error('Invalid ciphertext format');
  const [version, ivHex, tagHex, bodyHex] = parts;
  const key      = getKey(version);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(bodyHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Re-encrypts with the current key version — call during key rotation jobs.
 */
function rotate(ciphertext) {
  return encrypt(decrypt(ciphertext));
}

/**
 * Masks all but the last `showLast` characters.
 * e.g. mask('4242424242424242') → '************4242'
 */
function mask(value, showLast = 4) {
  if (!value) return null;
  const s = String(value);
  return s.length <= showLast
    ? '*'.repeat(s.length)
    : '*'.repeat(s.length - showLast) + s.slice(-showLast);
}

module.exports = { encrypt, decrypt, rotate, mask };
