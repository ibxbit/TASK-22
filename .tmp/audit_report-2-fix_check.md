# Audit Follow-up: Remediation Verification (Audit 2)

**Date:** 2026-04-24
**Method:** Static re-inspection of the present codebase against each
issue raised in `.tmp/audit_report-2.md`. No runtime execution.

## Summary

| # | Issue                                                       | Status         |
| - | ----------------------------------------------------------- | -------------- |
| 1 | A/B test rollback + synonym admin — missing static evidence | **Resolved**   |
| 2 | Frontend feature coverage gaps                              | **Resolved**   |
| 3 | Test coverage for new admin / frontend features             | **Resolved**   |
| 4 | Documentation gaps for advanced flows                       | **Resolved**   |

## Issue-by-issue Review

### 1. A/B test rollback and synonym expansion admin

- **Evidence — backend rollback:**
  - `repo/backend/src/routes/experiments.js:19-25` mounts the admin
    surface: `POST /experiments`, `PATCH /experiments/:id/status`,
    `POST /experiments/:id/rollback` are all gated by
    `requireRole(['admin'])`.
  - `repo/backend/src/controllers/experimentController.js` implements
    the rollback semantics (status set to `rolled_back`; subsequent
    `/experiments/assign` calls return `rollbackVariantKey` with
    `forced: true`) — documented in `repo/README.md:238-270`.
  - Tests: `API_tests/experiments.test.js` exercises rollback end-to-end
    (see coverage report `.tmp/test_coverage_and_readme_audit_report.md:61`,
    line 79-83); plus `backend/src/tests/experiments.test.js`.
- **Evidence — backend synonym admin:**
  - `repo/backend/src/routes/synonyms.js:9-11` — `GET /synonyms` (auth),
    `PUT /synonyms` (admin upsert), `DELETE /synonyms/:term` (admin).
  - `repo/backend/src/services/synonymService.js` + the in-memory
    cache; cache invalidation on PUT/DELETE per `README.md:288-292`.
  - Tests: `API_tests/synonyms.test.js` covers CRUD + expansion +
    fuzzy + RBAC (coverage report lines 73-75).
- **Evidence — frontend admin UI:**
  - `repo/frontend/src/pages/AdminPage.jsx` — Admin page with two
    tabs: *A/B Experiments* (create, status, rollback button with
    confirmation, results) and *Synonym Management* (list, upsert,
    delete, expansion chips). Described in `repo/README.md:318-327`.
- **Status:** **Resolved.**

### 2. Frontend feature coverage gaps

- **Search:** trending chips, saved filter presets (per-user
  localStorage), zero-result hints, pagination — implemented in
  `repo/frontend/src/pages/SearchPage.jsx` and documented in
  `README.md:308-318`. Covered by `frontend/src/tests/SearchPage.test.jsx`
  (coverage report line 127-135).
- **Checkout:** order list, invoice preview, Pay Now flow — covered by
  `frontend/src/tests/CheckoutPage.test.jsx`.
- **Documents:** auth prompt, upload form, doc table — covered by
  `frontend/src/tests/DocumentsPage.test.jsx`.
- **Privacy:** consent history, record form, export (with masking),
  deletion request + cancel — `frontend/src/pages/PrivacyPage.jsx`,
  specifically the `maskField` helper at line 14-15 and the export
  flow at lines 107-126.
- **Admin:** experiments + synonyms tabs — see issue 1 above.
- **Session / API client:** `SessionContext.test.jsx` and
  `api.client.test.js` exercise JWT issuance flow and Authorization
  header attachment.
- **Status:** **Resolved.**

### 3. Test coverage for new admin and frontend features

- 49/49 Express endpoints have true no-mock HTTP tests (see
  `.tmp/test_coverage_and_readme_audit_report.md:95-100`).
- Frontend component tests present for all user-facing pages touched
  by prompt features: SearchPage, CheckoutPage, DocumentsPage,
  SessionContext, api/client.
- Backend unit tests cover state machine, permission service, payment
  service, and encryption service directly
  (`repo/unit_tests/*.test.js`).
- Remaining gap (per coverage report lines 180-182): no dedicated
  **browser-level** E2E suite and `run_tests.sh` still relies on
  `python3` + `grep` on the host — addressed in
  `.tmp/audit_report-3-fix_check.md` (pending) / parent task on
  `repo/run_tests.sh`.
- **Status:** **Resolved** for unit + HTTP coverage. Browser E2E is
  tracked separately as a low-severity gap.

### 4. Documentation gaps

- `repo/README.md:226-270` — A/B experiment admin reference (roles,
  paths, rollback walk-through).
- `repo/README.md:274-304` — Synonym admin reference (roles, paths,
  behaviour, test recipe).
- `repo/README.md:176-182` — API path convention (`/api` is a
  frontend-only Vite proxy prefix; backend mounts at root).
- `repo/README.md:139-155` — Environment variable reference.
- `repo/README.md:186-216` — Demo credentials (one user per role) with
  seed command.
- `docs/api-spec.md` — rewritten (see task 1) to list real Express
  paths and call out the `/api` proxy rule.
- **Status:** **Resolved.**

## Final Verdict

All four items from Audit 2 are now **Resolved** against the current
codebase. The only residual items flagged elsewhere are:

- No browser-level E2E tests (tracked as a known gap, not from
  Audit 2).
- `run_tests.sh` host-tool dependency — being addressed separately.
