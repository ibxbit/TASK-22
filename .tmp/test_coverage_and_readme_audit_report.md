# 1. Test Coverage Audit

## Project Type Detection

- README declares project type at top: **Fullstack** (`repo/README.md:3`).

## Backend Endpoint Inventory

- `GET /health` (`backend/src/app.js:30`)
- `POST /auth/token` (`backend/src/app.js:34`, `backend/src/routes/auth.js:6`)
- `GET /vehicles/search` (`backend/src/app.js:35`, `backend/src/routes/vehicles.js:7`)
- `POST /cart/add`, `POST /cart/checkout` (`backend/src/app.js:36`, `backend/src/routes/cart.js:10-11`)
- `GET /orders/:id`, `PATCH /orders/:id/transition`, `GET /orders/:id/audit` (`backend/src/app.js:37`, `backend/src/routes/orders.js:11-13`)
- `POST /payments`, `GET /payments/wallet`, `GET /payments/ledger/:orderId`, `POST /payments/:id/refund` (`backend/src/app.js:38`, `backend/src/routes/payments.js:11-14`)
- `POST /reconciliation/run`, `GET /reconciliation/logs`, `GET /reconciliation/logs/:runId/ledger`, `GET /reconciliation/tickets`, `PATCH /reconciliation/tickets/:id/resolve` (`backend/src/app.js:39`, `backend/src/routes/reconciliation.js:16-20`)
- `GET /documents`, `GET /documents/:id`, `GET /documents/:id/download`, `POST /documents/upload`, `PUT /documents/:id`, `DELETE /documents/:id`, `POST /documents/:id/share`, `POST /documents/:id/submit`, `POST /documents/:id/approve`, `POST /documents/:id/permissions` (`backend/src/app.js:40`, `backend/src/routes/documents.js:36-47`)
- `GET /finance/invoice-preview/:orderId`, `GET /finance/tax-rates`, `POST /finance/tax-rates` (`backend/src/app.js:41`, `backend/src/routes/finance.js:11-13`)
- `POST /experiments`, `GET /experiments`, `GET /experiments/:id`, `PATCH /experiments/:id/status`, `POST /experiments/:id/rollback`, `POST /experiments/assign`, `GET /experiments/:id/results` (`backend/src/app.js:42`, `backend/src/routes/experiments.js:19-25`)
- `GET /privacy/consent`, `POST /privacy/consent`, `GET /privacy/export`, `GET /privacy/deletion-requests`, `POST /privacy/deletion-request`, `DELETE /privacy/deletion-requests/:id` (`backend/src/app.js:43`, `backend/src/routes/privacy.js:17-22`)
- `GET /analytics/trending`, `POST /analytics/event`, `GET /analytics/events` (`backend/src/app.js:44`, `backend/src/routes/analytics.js:10,15-16`)
- `GET /synonyms`, `PUT /synonyms`, `DELETE /synonyms/:term` (`backend/src/app.js:45`, `backend/src/routes/synonyms.js:9-11`)

## API Test Mapping Table

| Endpoint                                  | Covered | Test type         | Test files                                                                                                      | Evidence                                           |
| ----------------------------------------- | ------- | ----------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| GET /health                               | yes     | true no-mock HTTP | `API_tests/health_cart_analytics.test.js`                                                                       | `API_tests/health_cart_analytics.test.js:22-25`    |
| POST /auth/token                          | yes     | true no-mock HTTP | `backend/src/tests/auth.test.js`                                                                                | `backend/src/tests/auth.test.js:14-21`             |
| GET /vehicles/search                      | yes     | true no-mock HTTP | `API_tests/vehicles.test.js`, `backend/src/tests/search.pagination.test.js`, `API_tests/synonyms.test.js`       | `API_tests/vehicles.test.js:18-21`                 |
| POST /cart/add                            | yes     | true no-mock HTTP | `API_tests/health_cart_analytics.test.js`                                                                       | `API_tests/health_cart_analytics.test.js:38-46`    |
| POST /cart/checkout                       | yes     | true no-mock HTTP | `API_tests/health_cart_analytics.test.js`                                                                       | `API_tests/health_cart_analytics.test.js:180-190`  |
| GET /orders/:id                           | yes     | true no-mock HTTP | `API_tests/orders.test.js`, `backend/src/tests/order.transitions.test.js`                                       | `API_tests/orders.test.js:29-33`                   |
| PATCH /orders/:id/transition              | yes     | true no-mock HTTP | `API_tests/orders.test.js`, `backend/src/tests/order.transitions.test.js`, `backend/src/tests/rollback.test.js` | `API_tests/orders.test.js:77-81`                   |
| GET /orders/:id/audit                     | yes     | true no-mock HTTP | `API_tests/orders.test.js`, `backend/src/tests/order.transitions.test.js`                                       | `API_tests/orders.test.js:185-191`                 |
| POST /payments                            | yes     | true no-mock HTTP | `API_tests/payments.test.js`, `backend/src/tests/authorization.test.js`                                         | `API_tests/payments.test.js:29-33`                 |
| GET /payments/wallet                      | yes     | true no-mock HTTP | `API_tests/payments.test.js`                                                                                    | `API_tests/payments.test.js:111-114`               |
| GET /payments/ledger/:orderId             | yes     | true no-mock HTTP | `API_tests/payments.test.js`                                                                                    | `API_tests/payments.test.js:136-141`               |
| POST /payments/:id/refund                 | yes     | true no-mock HTTP | `API_tests/payments.test.js`                                                                                    | `API_tests/payments.test.js:169-176`               |
| POST /reconciliation/run                  | yes     | true no-mock HTTP | `API_tests/reconciliation.test.js`                                                                              | `API_tests/reconciliation.test.js:62-67`           |
| GET /reconciliation/logs                  | yes     | true no-mock HTTP | `API_tests/reconciliation.test.js`, `backend/src/tests/authorization.test.js`                                   | `API_tests/reconciliation.test.js:120-124`         |
| GET /reconciliation/logs/:runId/ledger    | yes     | true no-mock HTTP | `API_tests/reconciliation.test.js`                                                                              | `API_tests/reconciliation.test.js:188-196`         |
| GET /reconciliation/tickets               | yes     | true no-mock HTTP | `API_tests/reconciliation.test.js`                                                                              | `API_tests/reconciliation.test.js:269-277`         |
| PATCH /reconciliation/tickets/:id/resolve | yes     | true no-mock HTTP | `API_tests/reconciliation.test.js`                                                                              | `API_tests/reconciliation.test.js:385-393`         |
| GET /documents                            | yes     | true no-mock HTTP | `API_tests/rbac.test.js`, `backend/src/tests/rbac.test.js`                                                      | `API_tests/rbac.test.js:61-68`                     |
| GET /documents/:id                        | yes     | true no-mock HTTP | `API_tests/rbac.test.js`, `backend/src/tests/rbac.test.js`                                                      | `API_tests/rbac.test.js:117-123`                   |
| GET /documents/:id/download               | yes     | true no-mock HTTP | `API_tests/documents_extended.test.js`                                                                          | `API_tests/documents_extended.test.js:151-158`     |
| POST /documents/upload                    | yes     | true no-mock HTTP | `API_tests/documents_extended.test.js`                                                                          | `API_tests/documents_extended.test.js:66-74`       |
| PUT /documents/:id                        | yes     | true no-mock HTTP | `API_tests/rbac.test.js`, `backend/src/tests/rbac.test.js`                                                      | `API_tests/rbac.test.js:167-174`                   |
| DELETE /documents/:id                     | yes     | true no-mock HTTP | `backend/src/tests/rbac.test.js`                                                                                | `backend/src/tests/rbac.test.js:90-96`             |
| POST /documents/:id/share                 | yes     | true no-mock HTTP | `API_tests/documents_extended.test.js`                                                                          | `API_tests/documents_extended.test.js:197-204`     |
| POST /documents/:id/submit                | yes     | true no-mock HTTP | `API_tests/documents_extended.test.js`                                                                          | `API_tests/documents_extended.test.js:246-253`     |
| POST /documents/:id/approve               | yes     | true no-mock HTTP | `API_tests/documents_extended.test.js`                                                                          | `API_tests/documents_extended.test.js:292-299`     |
| POST /documents/:id/permissions           | yes     | true no-mock HTTP | `API_tests/rbac.test.js`                                                                                        | `API_tests/rbac.test.js:31-33`                     |
| GET /finance/invoice-preview/:orderId     | yes     | true no-mock HTTP | `backend/src/tests/checkout_invoice.test.js`, `backend/src/tests/authorization.test.js`                         | `backend/src/tests/checkout_invoice.test.js:33-39` |
| GET /finance/tax-rates                    | yes     | true no-mock HTTP | `API_tests/finance.test.js`                                                                                     | `API_tests/finance.test.js:37-43`                  |
| POST /finance/tax-rates                   | yes     | true no-mock HTTP | `API_tests/finance.test.js`                                                                                     | `API_tests/finance.test.js:118-123`                |
| POST /experiments                         | yes     | true no-mock HTTP | `API_tests/experiments.test.js`, `backend/src/tests/experiments.test.js`                                        | `API_tests/experiments.test.js:55-59`              |
| GET /experiments                          | yes     | true no-mock HTTP | `API_tests/experiments.test.js`, `backend/src/tests/experiments.test.js`                                        | `API_tests/experiments.test.js:102-103`            |
| GET /experiments/:id                      | yes     | true no-mock HTTP | `API_tests/experiments.test.js`                                                                                 | `API_tests/experiments.test.js:119-120`            |
| PATCH /experiments/:id/status             | yes     | true no-mock HTTP | `API_tests/experiments.test.js`                                                                                 | `API_tests/experiments.test.js:63-67`              |
| POST /experiments/:id/rollback            | yes     | true no-mock HTTP | `API_tests/experiments.test.js`                                                                                 | `API_tests/experiments.test.js:79-83`              |
| POST /experiments/assign                  | yes     | true no-mock HTTP | `API_tests/experiments.test.js`                                                                                 | `API_tests/experiments.test.js:71-75`              |
| GET /experiments/:id/results              | yes     | true no-mock HTTP | `API_tests/experiments.test.js`                                                                                 | `API_tests/experiments.test.js:122-124`            |
| GET /privacy/consent                      | yes     | true no-mock HTTP | `backend/src/tests/privacy.test.js`                                                                             | `backend/src/tests/privacy.test.js:185-189`        |
| POST /privacy/consent                     | yes     | true no-mock HTTP | `backend/src/tests/privacy.test.js`                                                                             | `backend/src/tests/privacy.test.js:47-53`          |
| GET /privacy/export                       | yes     | true no-mock HTTP | `backend/src/tests/privacy.test.js`                                                                             | `backend/src/tests/privacy.test.js:242-246`        |
| GET /privacy/deletion-requests            | yes     | true no-mock HTTP | `backend/src/tests/privacy.test.js`                                                                             | `backend/src/tests/privacy.test.js:401-405`        |
| POST /privacy/deletion-request            | yes     | true no-mock HTTP | `backend/src/tests/privacy.test.js`                                                                             | `backend/src/tests/privacy.test.js:311-319`        |
| DELETE /privacy/deletion-requests/:id     | yes     | true no-mock HTTP | `backend/src/tests/privacy.test.js`                                                                             | `backend/src/tests/privacy.test.js:448-461`        |
| GET /analytics/trending                   | yes     | true no-mock HTTP | `API_tests/health_cart_analytics.test.js`, `backend/src/tests/authorization.test.js`                            | `API_tests/health_cart_analytics.test.js:277-283`  |
| POST /analytics/event                     | yes     | true no-mock HTTP | `API_tests/health_cart_analytics.test.js`                                                                       | `API_tests/health_cart_analytics.test.js:304-311`  |
| GET /analytics/events                     | yes     | true no-mock HTTP | `API_tests/health_cart_analytics.test.js`, `backend/src/tests/auth.test.js`                                     | `API_tests/health_cart_analytics.test.js:384-390`  |
| GET /synonyms                             | yes     | true no-mock HTTP | `API_tests/synonyms.test.js`, `backend/src/tests/synonyms.test.js`                                              | `API_tests/synonyms.test.js:55-56`                 |
| PUT /synonyms                             | yes     | true no-mock HTTP | `API_tests/synonyms.test.js`, `backend/src/tests/synonyms.test.js`                                              | `API_tests/synonyms.test.js:47-51`                 |
| DELETE /synonyms/:term                    | yes     | true no-mock HTTP | `API_tests/synonyms.test.js`, `backend/src/tests/synonyms.test.js`                                              | `API_tests/synonyms.test.js:72-73`                 |

## API Test Classification

1. **True No-Mock HTTP**
   - `API_tests/*.js`, `backend/src/tests/*.test.js` (e.g., `supertest(app)` in `API_tests/orders.test.js:8`, `backend/src/tests/auth.test.js:18`).
2. **HTTP with Mocking**
   - None detected in backend API suites.
3. **Non-HTTP (unit/integration without HTTP)**
   - `unit_tests/state_machine.test.js`, `unit_tests/permission_service.test.js`, `unit_tests/payment_service.test.js`, `unit_tests/encryption_service.test.js`.

## Mock Detection Rules

- Backend API suites: no `jest.mock`, `vi.mock`, `sinon.stub`, `mockImplementation`, `spyOn` detected.
- Frontend unit tests do use mocking (not API path):
  - `frontend/src/tests/SearchPage.test.jsx:5-17` (`vi.mock` API/context/component modules)
  - `frontend/src/tests/CheckoutPage.test.jsx:5-12` (`vi.mock` router + APIs)
  - `frontend/src/tests/SessionContext.test.jsx:6-11` (`vi.mock('axios')`)
  - `frontend/src/tests/api.client.test.js:4-15` (`vi.mock('axios')`)

## Coverage Summary

- Total endpoints: **49**
- Endpoints with HTTP tests: **49**
- Endpoints with TRUE no-mock tests: **49**
- HTTP coverage %: **100.00%**
- True API coverage %: **100.00%**

## Unit Test Summary

### Backend Unit Tests

- Test files:
  - `unit_tests/state_machine.test.js`
  - `unit_tests/permission_service.test.js`
  - `unit_tests/payment_service.test.js`
  - `unit_tests/encryption_service.test.js`
- Modules covered:
  - **Services:** `orderStateMachine`, `permissionService`, `paymentService`, `encryptionService` (`unit_tests/state_machine.test.js:3-8`, `unit_tests/permission_service.test.js:4`, `unit_tests/payment_service.test.js:4`, `unit_tests/encryption_service.test.js:5`)
  - **Repositories/models (DB-backed assertions):** `Order`, `OrderAuditLog`, `LedgerEntry`, `Invoice` (`unit_tests/state_machine.test.js:9-10`, `unit_tests/payment_service.test.js:5-7`)
  - **Auth/guards/middleware:** no dedicated unit tests for middleware files; covered mostly via HTTP integration suites.
  - **Controllers:** no direct controller unit tests (tested via API/integration).
- Important backend modules NOT unit-tested directly:
  - `backend/src/middleware/auth.js`
  - `backend/src/middleware/hmacAuth.js`
  - `backend/src/middleware/fileValidator.js`
  - `backend/src/controllers/reconciliationController.js`
  - `backend/src/controllers/analyticsController.js`

### Frontend Unit Tests (STRICT REQUIREMENT)

- Frontend test files:
  - `frontend/src/tests/SearchPage.test.jsx`
  - `frontend/src/tests/CheckoutPage.test.jsx`
  - `frontend/src/tests/DocumentsPage.test.jsx`
  - `frontend/src/tests/SessionContext.test.jsx`
  - `frontend/src/tests/api.client.test.js`
- Frameworks/tools detected:
  - Vitest + React Testing Library + user-event (`frontend/package.json:9-10`, `frontend/package.json:19-25`)
- Components/modules covered:
  - `SearchPage` (`frontend/src/tests/SearchPage.test.jsx:24`)
  - `CheckoutPage` (`frontend/src/tests/CheckoutPage.test.jsx:17`)
  - `DocumentsPage` (`frontend/src/tests/DocumentsPage.test.jsx:1`)
  - `SessionContext` (`frontend/src/tests/SessionContext.test.jsx:4`)
  - `api/client` interceptor (`frontend/src/tests/api.client.test.js:25`)
- Important frontend components/modules NOT tested:
  - `frontend/src/pages/AdminPage.jsx`
  - `frontend/src/pages/FinancePage.jsx`
  - `frontend/src/pages/PrivacyPage.jsx`
  - `frontend/src/components/Layout.jsx`

**Frontend unit tests: PRESENT**

### Cross-Layer Observation

- Testing is now more balanced than earlier: strong backend HTTP coverage + backend unit tests + targeted frontend component/unit tests.
- Dedicated browser E2E tests (full FE↔BE user flow) are still not present.

## API Observability Check

- **Clear/strong overall**: tests specify method+path, explicit request payload/query, and response assertions (e.g., `API_tests/finance.test.js:120-132`, `API_tests/reconciliation.test.js:390-399`, `API_tests/health_cart_analytics.test.js:309-319`).
- Minor weak instances exist with coarse assertions (e.g., broad status list patterns in some tests), but not dominant.

## Tests Check

- Success paths: covered across all route groups.
- Failure/validation: broad 400/401/403/404 coverage across suites (examples: `API_tests/documents_extended.test.js:99-110`, `API_tests/finance.test.js:191-207`, `API_tests/reconciliation.test.js:438-447`).
- Edge cases: present in many areas (idempotency, repeated runs, optional fields, null/empty handling).
- Auth/permissions: strong route-level checks across domains (e.g., `API_tests/reconciliation.test.js:92-115`, `API_tests/health_cart_analytics.test.js:407-430`).
- Integration boundaries: true HTTP path through Express app and DB-backed helpers (`backend/src/tests/helpers/db.js:3-6`).
- `run_tests.sh`: Docker-based flow is present (`run_tests.sh:27`, `run_tests.sh:35`, `run_tests.sh:41`) = OK; local dependency usage (`python3`, `grep`) still exists (`run_tests.sh:15-16`) = FLAG.

## Test Coverage Score (0–100)

- **97/100**

## Score Rationale

- - Full endpoint HTTP coverage (49/49)
- - Full true no-mock API coverage (49/49)
- - Strong auth/validation/failure-path depth
- - Frontend unit/component tests now present with direct component imports
- - Small deduction for missing browser-level FE↔BE E2E tests and minor run script local-tool dependency

## Key Gaps

- No dedicated browser E2E test suite covering full UI-to-API critical journeys.
- `run_tests.sh` depends on host tools (`python3`, `grep`) despite Docker-centric intent.

## Confidence & Assumptions

- Confidence: **High**.
- Assumptions: endpoint inventory derived from current `backend/src/app.js` and route files only; no hidden dynamic route registration outside inspected files.
- Static-only boundary respected: no runtime execution claims.

---

# 2. README Audit

## High Priority Issues

- None.

## Medium Priority Issues

- None.

## Low Priority Issues

- None.

## Hard Gate Failures

- None.

## README Verdict (PASS / PARTIAL PASS / FAIL)

- **PASS**

## Additional Hard-Gate Checks (Evidence)

- README location exists: `repo/README.md`.
- Formatting/readability: pass (`repo/README.md` structured sections/tables).
- Startup command includes required string: `docker-compose up` appears explicitly (`repo/README.md:13`).
- Access method present (URLs/ports): (`repo/README.md:22-26`).
- Verification method present (health check, UI, tests): (`repo/README.md:30-55`).
- Environment rules: Docker-contained instructions; no `npm install`/`pip install`/manual DB setup commands found.
- Project type declared at top (`repo/README.md:3`).
- Demo credentials now include email + password + all roles (`repo/README.md:195-209`).
- API path convention is explicitly documented and examples are aligned with direct backend routes (`repo/README.md:176-182`, `repo/README.md:165-172`, `backend/src/app.js:34-45`).
