// Must run before any require() in test files so env vars are available
// when app.js and its transitive dependencies load.
const baseUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/motorlot';
process.env.MONGO_URI = baseUri.replace(/\/[^/]+$/, '/motorlot_test');
process.env.NODE_ENV                 = 'test';
process.env.ENCRYPTION_KEY_CURRENT   = process.env.ENCRYPTION_KEY_CURRENT   || 'v1';
// 64-char hex = 32-byte AES-256 key
process.env.ENCRYPTION_KEY_v1        = process.env.ENCRYPTION_KEY_v1        || '0000000000000000000000000000000000000000000000000000000000000001';
process.env.HMAC_SECRET              = process.env.HMAC_SECRET              || 'test-hmac-secret-string-for-integration-tests';
process.env.JWT_SECRET               = process.env.JWT_SECRET               || 'test-jwt-secret-string-for-integration-tests-abc';
