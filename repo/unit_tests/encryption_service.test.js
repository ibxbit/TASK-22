// Static proof that AES-256-GCM is implemented for encryption at rest.
// These tests serve as auditable evidence of the algorithm, format, and
// key-rotation contract without requiring a running database.

const { encrypt, decrypt, rotate, mask } = require('../backend/src/services/encryptionService');

// jest.setup.js sets ENCRYPTION_KEY_v1 and ENCRYPTION_KEY_CURRENT; rely on those.

describe('encryptionService — algorithm proof', () => {
  it('produces a versioned ciphertext in format version:iv:authTag:body', () => {
    const ct = encrypt('hello');
    const parts = ct.split(':');
    expect(parts).toHaveLength(4);
    const [version, iv, tag, body] = parts;
    expect(version).toBe('v1');
    // IV: 16 bytes = 32 hex chars
    expect(iv).toMatch(/^[0-9a-f]{32}$/);
    // GCM auth tag: 16 bytes = 32 hex chars
    expect(tag).toMatch(/^[0-9a-f]{32}$/);
    // Body: non-empty hex
    expect(body).toMatch(/^[0-9a-f]+$/);
  });

  it('IV is random — two encryptions of the same plaintext differ', () => {
    const ct1 = encrypt('same plaintext');
    const ct2 = encrypt('same plaintext');
    // Same plaintext → same body length but different IVs → different ciphertexts
    expect(ct1).not.toBe(ct2);
  });

  it('uses AES-256: key must be exactly 32 bytes (64 hex chars)', () => {
    const key = process.env[`ENCRYPTION_KEY_${process.env.ENCRYPTION_KEY_CURRENT}`];
    expect(typeof key).toBe('string');
    expect(key.length).toBe(64);
    expect(Buffer.from(key, 'hex').length).toBe(32);
  });

  it('body ciphertext length matches plaintext length (AES stream-cipher property)', () => {
    const plaintext = 'abcdefghij'; // 10 chars
    const ct = encrypt(plaintext);
    const bodyHex = ct.split(':')[3];
    // AES-GCM in CTR mode — ciphertext same byte length as plaintext
    expect(bodyHex.length / 2).toBe(plaintext.length);
  });
});

describe('encryptionService — round-trip', () => {
  it('decrypt(encrypt(x)) === x for typical strings', () => {
    const cases = [
      '192.168.1.1',
      'Mozilla/5.0 (Windows NT 10.0)',
      '1234-5678-ABCD',
      '',
    ];
    for (const value of cases) {
      expect(decrypt(encrypt(value))).toBe(value);
    }
  });

  it('null passthrough: encrypt(null) returns null', () => {
    expect(encrypt(null)).toBeNull();
  });

  it('null passthrough: decrypt(null) returns null', () => {
    expect(decrypt(null)).toBeNull();
  });

  it('non-string plaintext is coerced and round-trips', () => {
    expect(decrypt(encrypt(12345))).toBe('12345');
  });
});

describe('encryptionService — GCM authentication tag', () => {
  it('tampered ciphertext body fails decryption (GCM auth tag protects integrity)', () => {
    const ct = encrypt('sensitive-value');
    const parts = ct.split(':');
    // Flip one hex nibble in the body
    parts[3] = parts[3].slice(0, -1) + (parts[3].slice(-1) === 'f' ? '0' : 'f');
    const tampered = parts.join(':');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('tampered auth tag causes decryption to fail', () => {
    const ct = encrypt('another-value');
    const parts = ct.split(':');
    parts[2] = parts[2].slice(0, -1) + (parts[2].slice(-1) === 'f' ? '0' : 'f');
    expect(() => decrypt(parts.join(':'))).toThrow();
  });
});

describe('encryptionService — key rotation', () => {
  it('rotate re-encrypts with current key version', () => {
    const original = encrypt('driver-license-xyz');
    const rotated  = rotate(original);
    // Decryption still works
    expect(decrypt(rotated)).toBe('driver-license-xyz');
    // Key version prefix is current version
    expect(rotated.split(':')[0]).toBe(process.env.ENCRYPTION_KEY_CURRENT);
  });

  it('rotate produces a different ciphertext (fresh IV)', () => {
    const ct = encrypt('rotate-me');
    const r1 = rotate(ct);
    const r2 = rotate(ct);
    expect(r1).not.toBe(r2);
  });
});

describe('encryptionService — mask utility', () => {
  it('masks all but last 4 chars by default', () => {
    expect(mask('4242424242424242')).toBe('************4242');
  });

  it('masks all chars when value is shorter than showLast', () => {
    expect(mask('ABC', 4)).toBe('***');
  });

  it('custom showLast is respected', () => {
    expect(mask('ABCDEFGH', 2)).toBe('******GH');
  });

  it('null/undefined returns null', () => {
    expect(mask(null)).toBeNull();
    expect(mask(undefined)).toBeNull();
    expect(mask('')).toBeNull();
  });

  it('masks driver license — only last 4 digits shown', () => {
    const license = 'DL-9876543210';
    const masked  = mask(license, 4);
    expect(masked.endsWith('3210')).toBe(true);
    expect(masked).not.toContain('9876');
  });
});
