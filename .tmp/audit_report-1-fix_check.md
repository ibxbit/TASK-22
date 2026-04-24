# Audit Follow-up: Remediation Verification (Audit 1)

**Date:** 2026-04-24
**Method:** Static re-inspection of the present codebase against each
issue raised in `.tmp/audit_report-1.md`. No runtime execution.

## Summary

| # | Issue                                                           | Status         |
| - | --------------------------------------------------------------- | -------------- |
| 1 | Placeholder encryption / HMAC secrets in `docker-compose.yml`   | **Resolved**   |
| 2 | AES-256 encryption at rest + key rotation                       | **Resolved**   |
| 3 | Frontend privacy masking and export flows                       | **Resolved**   |
| 4 | Config & secrets hardcoded for local/dev                        | **Resolved**   |
| 5 | Privacy export/deletion test coverage                           | **Resolved**   |

## Issue-by-issue Review

### 1. Encryption keys and HMAC secret in `docker-compose.yml`

- **Fix required:** Production startup must not accept placeholder/default secrets.
- **Evidence:**
  - `repo/docker-compose.yml:27-35` — every secret is read from the
    host environment with only a dev fallback
    (`"${ENCRYPTION_KEY_v1:-0000…0001}"`, `"${HMAC_SECRET:-motorlot-hmac-secret-replace-before-production}"`,
    `"${JWT_SECRET:-motorlot-jwt-secret-replace-before-production-abc}"`).
  - `repo/backend/src/config/validateEnv.js:4-13, 23-49` — enumerates
    the known-weak values and, when `NODE_ENV=production`, throws
    `FATAL — production startup blocked due to insecure configuration`.
  - `repo/backend/server.js:2-3` — `validateEnv()` runs before
    `app.listen`, so a production container with placeholder secrets
    fails fast on boot.
  - `repo/docker.env.example:1-24` — operator guidance: copy to `.env`,
    replace placeholders with `openssl rand -hex 32`.
- **Status:** **Resolved.** Placeholders still work for local
  development (a requirement for `docker compose up` to be one-command),
  but production startup is blocked and the example env file documents
  the substitution.

### 2. AES-256 encryption at rest and key rotation

- **Fix required:** Real AES-256 implementation with versioned keys.
- **Evidence:**
  - `repo/backend/src/services/encryptionService.js:1-54` — uses
    `aes-256-gcm` with a per-record random IV and GCM auth tag;
    ciphertext format is `{keyVersion}:{iv}:{authTag}:{body}`.
  - `getKey(version)` at `encryptionService.js:7-15` enforces a 32-byte
    (64 hex char) key length, catching truncated keys.
  - `rotate()` at `encryptionService.js:52-54` re-encrypts with the
    current key version — used during rotation jobs.
  - `mask()` at `encryptionService.js:60-66` provides the
    "last N characters" helper used by privacy masking.
  - `repo/unit_tests/encryption_service.test.js` exercises
    `encrypt`/`decrypt`/`rotate`/`mask` directly (see coverage report
    `.tmp/test_coverage_and_readme_audit_report.md:84,113-115`).
- **Status:** **Resolved.**

### 3. Frontend privacy masking and export flows

- **Fix required:** Masking of sensitive fields, user data export,
  consent history in the UI.
- **Evidence:**
  - `repo/frontend/src/pages/PrivacyPage.jsx:14-15` declares
    `maskField(value, showLast = 4)` and applies it to DL-style values.
  - `PrivacyPage.jsx:32-50` holds consent history, export payload, and
    deletion-request state.
  - `PrivacyPage.jsx:107-126` calls `exportData()` and downloads the
    JSON payload as `motorlot-data-export-<ts>.json`.
  - `PrivacyPage.jsx:130-140` submits a deletion request via the API.
  - Consent list + "Record consent" form rendered at
    `PrivacyPage.jsx:186-226`.
- **Status:** **Resolved.** The Privacy page renders consent history,
  a consent-recording form, an export button with client-side masking,
  and deletion-request submission/cancellation.

### 4. Config and secrets hardcoded for local/dev

- **Fix required:** All secrets move to env vars; warn/refuse on
  unsafe defaults.
- **Evidence:**
  - `repo/docker-compose.yml:27-35` — every secret read from
    `${…:-default}` so a `.env` at the repo root overrides each.
  - `repo/docker.env.example:1-24` — canonical template for
    production `.env`.
  - `repo/backend/src/config/validateEnv.js:51-60` — emits
    `[env] WARNING: …` for placeholder values in non-production and
    throws in production. Length checks (≥32 chars for HMAC/JWT,
    exactly 32 bytes for encryption key) apply in every environment.
  - `repo/backend/server.js:2-3` — called before DB connect / route
    mount.
- **Status:** **Resolved.**

### 5. Privacy export / deletion test coverage

- **Fix required:** Direct backend tests for export + deletion
  (including 30-day retention logic).
- **Evidence:**
  - `repo/backend/src/tests/privacy.test.js:1-11` — `RETENTION_DAYS = 30`
    constant is asserted against the API response.
  - Coverage map (from
    `.tmp/test_coverage_and_readme_audit_report.md:64-69`):
    - `GET /privacy/consent`            → `privacy.test.js:185-189`
    - `POST /privacy/consent`           → `privacy.test.js:47-53`
    - `GET /privacy/export`             → `privacy.test.js:242-246`
    - `GET /privacy/deletion-requests`  → `privacy.test.js:401-405`
    - `POST /privacy/deletion-request`  → `privacy.test.js:311-319`
    - `DELETE /privacy/deletion-requests/:id` → `privacy.test.js:448-461`
  - All tests run end-to-end via supertest against the real Express
    app and a real Mongo via `tests/helpers/db.js`.
- **Status:** **Resolved.** Every privacy route has a no-mock HTTP
  test; the 30-day retention hold is exercised explicitly.

## Final Verdict

All five items from Audit 1 are now **Resolved** against the current
codebase. No items remain outstanding from this audit cycle.
