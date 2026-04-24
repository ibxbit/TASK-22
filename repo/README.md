# MotorLot DealerOps

**Project type: Fullstack — React 18 + Vite frontend / Express + MongoDB backend**

Offline-first dealership management system — vehicle search, cart, orders, payments, documents, and reconciliation.

---

## Start Command

```bash
docker compose up --build
# docker-compose up --build   ← equivalent (older Docker CLI)
```

All services start automatically. No host-level dependencies required beyond Docker.

---

## Services

| Service  | Address                   | Description                   |
| -------- | ------------------------- | ----------------------------- |
| Frontend | http://localhost:5173     | React 18 + Vite dev server    |
| Backend  | http://localhost:5000     | Express API                   |
| MongoDB  | mongodb://localhost:27017 | Persistent store (`motorlot`) |

---

## Verification Guide

### 1. Confirm services are running

```bash
docker compose ps
```

All three services (`mongo`, `backend`, `frontend`) should show status `running` or `healthy`.

### 2. Check the backend health endpoint

```bash
curl http://localhost:5000/health
# {"status":"ok","system":"MotorLot DealerOps"}
```

### 3. Open the frontend

Navigate to **http://localhost:5173** in a browser. The vehicle search page should load.

### 4. Run the test suite

```bash
bash run_tests.sh
```

This script:

- Starts (or reuses) all Docker services
- Waits for `mongo` and `backend` to pass their health checks
- Runs **unit tests** (`unit_tests/`) inside the backend container
- Runs **API / E2E tests** (`API_tests/`) inside the backend container
- Runs **frontend component tests** (Vitest + RTL) inside the frontend container
- Exits `0` only when every suite passes

You can also run suites individually:

```bash
# Unit tests only (unit_tests/)
docker compose exec backend npm run test:unit

# API / E2E tests only (API_tests/)
docker compose exec backend npm run test:api

# Full backend test suite — includes src/tests/ integration tests in addition to above
docker compose exec backend npm test

# Frontend component tests (Vitest + React Testing Library)
docker compose exec frontend npm test
```

> **Note:** `run_tests.sh` runs `test:unit` + `test:api` + frontend `npm test`,
> but NOT `backend/src/tests/` directly. To run the full backend integration suite
> (auth, RBAC, checkout, privacy, etc.) use `docker compose exec backend npm test`.

### 5. Stop services

```bash
docker compose down          # stops containers, keeps volumes
docker compose down -v       # stops containers AND removes volumes (resets DB)
```

---

## Project Structure

```
repo/
├── backend/                 Express API + services + models
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   └── tests/           Integration tests (auth, authorization, experiments, synonyms,
│   │                                     orders, rollback, RBAC, checkout, privacy)
│   ├── Dockerfile
│   ├── jest.config.js
│   └── jest.setup.js
├── frontend/                React 18 + Vite
│   ├── src/
│   │   ├── api/             vehicles, experiments, synonyms, payments, finance, privacy…
│   │   ├── pages/           Search (trending+presets), Admin (experiments+synonyms), Checkout…
│   │   ├── context/         SessionContext (JWT login/logout)
│   │   └── tests/           Vitest + RTL component tests (SearchPage, CheckoutPage,
│   │                                   DocumentsPage, SessionContext, api/client,
│   │                                   CartContext, VehicleCard, Layout, AdminPage,
│   │                                   CartPage, FinancePage, PrivacyPage)
│   ├── Dockerfile
│   ├── vitest.config.js
│   └── vite.config.js
├── unit_tests/              Pure + DB-backed service-layer tests
│   ├── state_machine.test.js
│   ├── permission_service.test.js
│   ├── payment_service.test.js
│   ├── checkout_service.test.js
│   ├── tax_service.test.js
│   ├── invoice_service.test.js
│   └── reconciliation_service.test.js
├── API_tests/               HTTP-layer tests via supertest (no mocking)
│   ├── experiments.test.js
│   ├── synonyms.test.js
│   ├── vehicles.test.js
│   ├── orders.test.js
│   ├── payments.test.js
│   ├── rbac.test.js
│   ├── health_cart_analytics.test.js
│   ├── reconciliation.test.js
│   ├── finance.test.js
│   ├── documents_extended.test.js
│   └── e2e_workflow.test.js
├── docker-compose.yml
└── run_tests.sh
```

---

## Environment Variables

All variables have working defaults in `docker-compose.yml`. Override by creating a `.env` file at the repo root.

| Variable                 | Default (Docker)                 | Purpose                              |
| ------------------------ | -------------------------------- | ------------------------------------ |
| `MONGO_URI`              | `mongodb://mongo:27017/motorlot` | MongoDB connection string            |
| `PORT`                   | `5000`                           | Backend listen port                  |
| `CORS_ORIGIN`            | `http://localhost:5173`          | Allowed CORS origin                  |
| `ENCRYPTION_KEY_CURRENT` | `v1`                             | Active key version for AES-256       |
| `ENCRYPTION_KEY_v1`      | _(set in compose)_               | 32-byte hex AES-256 key              |
| `JWT_SECRET`             | _(set in compose)_               | HS256 signing secret for JWTs        |
| `HMAC_SECRET`            | _(set in compose)_               | HMAC-SHA256 server-to-server signing |
| `BACKEND_URL`            | `http://backend:5000`            | Vite proxy target (Docker)           |

---

## Authentication

All protected API routes require a signed JWT in the `Authorization` header:

```
Authorization: Bearer <token>
```

**Obtaining a token — POST /auth/token**

```bash
curl -X POST http://localhost:5000/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"userId": "<mongo-objectid>"}'
# {"token":"eyJ...","expiresIn":3600,"user":{...}}
```

Tokens expire after 1 hour (3600 seconds). The browser UI provides a Log in button in the header that handles token acquisition and storage automatically — no manual `X-User-Id` or HMAC headers are required or accepted.

### API path convention

| Caller                             | Path prefix                                         | Notes                                                 |
| ---------------------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| Backend direct (`curl`, supertest) | No prefix — e.g. `GET /finance/tax-rates`           | Express mounts routes at root                         |
| Frontend browser fetch             | `/api/…` prefix — e.g. `GET /api/finance/tax-rates` | Vite proxy strips `/api` before forwarding to backend |

---

## Demo Credentials

Seed one user per role with stable ObjectIds:

```bash
docker compose exec backend node src/seeders/seedDemoUsers.js
```

This prints each user's ObjectId. Use them to get tokens.

Demo login credentials (all roles):

| Role        | Email                  | Password        | userId (for `/auth/token`) |
| ----------- | ---------------------- | --------------- | -------------------------- |
| admin       | admin@demo.local       | `DemoPass!2026` | `000000000000000000000001` |
| manager     | manager@demo.local     | `DemoPass!2026` | `000000000000000000000002` |
| salesperson | salesperson@demo.local | `DemoPass!2026` | `000000000000000000000003` |
| finance     | finance@demo.local     | `DemoPass!2026` | `000000000000000000000004` |
| inspector   | inspector@demo.local   | `DemoPass!2026` | `000000000000000000000005` |

Current backend auth endpoint exchanges `userId` for JWT (`POST /auth/token`).
Email/password are provided as demo credentials for role clarity and operator handoff.

```bash
# Admin token
curl -sX POST http://localhost:5000/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"userId":"000000000000000000000001"}' | jq -r .token
```

All demo users share dealershipId `aaaaaaaaaaaaaaaaaaaaaaaa`.

---

## Admin Features

### A/B Experiment Management

Navigate to **http://localhost:5173** → Admin tab to manage experiments.

**API reference:**

| Method  | Path                        | Role           | Purpose                                                                   |
| ------- | --------------------------- | -------------- | ------------------------------------------------------------------------- |
| `POST`  | `/experiments`              | admin          | Create experiment                                                         |
| `GET`   | `/experiments`              | admin, manager | List (filter by `?scope=` or `?status=`)                                  |
| `GET`   | `/experiments/:id`          | admin, manager | Get single experiment                                                     |
| `PATCH` | `/experiments/:id/status`   | admin          | Set status (draft/active/paused/rolled_back)                              |
| `POST`  | `/experiments/:id/rollback` | admin          | **Immediate rollback** — all users instantly receive the rollback variant |
| `POST`  | `/experiments/assign`       | any auth       | Get variant for a session                                                 |
| `GET`   | `/experiments/:id/results`  | admin, manager | Variant assignment distribution                                           |

**Rollback behaviour:** `POST /experiments/:id/rollback` sets status to `rolled_back`. From that moment, every call to `/experiments/assign` for that experiment returns `rollbackVariantKey` with `forced: true` — no new assignment records are written.

**Test rollback end-to-end:**

```bash
# 1. Create and activate
TOKEN=$(curl -s -X POST localhost:5000/auth/token -H 'Content-Type: application/json' \
  -d '{"userId":"<adminId>"}' | jq -r .token)

EXP=$(curl -s -X POST localhost:5000/experiments \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"test","scope":"listing_layout","variants":[{"key":"control","label":"Control","weight":60},{"key":"v_a","label":"V-A","weight":40}],"rollbackVariantKey":"control"}' \
  | jq -r '.experiment._id')

curl -X PATCH localhost:5000/experiments/$EXP/status \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"active"}'

# 2. Assign a session
curl -X POST localhost:5000/experiments/assign \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"sess-1\",\"experimentId\":\"$EXP\"}"

# 3. Rollback
curl -X POST localhost:5000/experiments/$EXP/rollback \
  -H "Authorization: Bearer $TOKEN"
# {"experiment":{"status":"rolled_back",...},"rolledBack":true}

# 4. Assign after rollback — always returns control + forced:true
curl -X POST localhost:5000/experiments/assign \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"sess-1\",\"experimentId\":\"$EXP\"}"
# {"variantKey":"control","forced":true,...}
```

---

### Synonym Management

Navigate to **Admin → Synonym Management** to manage search synonyms.

**API reference:**

| Method   | Path              | Role     | Purpose                            |
| -------- | ----------------- | -------- | ---------------------------------- |
| `GET`    | `/synonyms`       | any auth | List all synonyms (sorted by term) |
| `PUT`    | `/synonyms`       | admin    | Create or update a synonym         |
| `DELETE` | `/synonyms/:term` | admin    | Delete a synonym                   |

**How synonyms work:**

- `PUT /synonyms` with `{ "term": "benz", "expansions": ["Mercedes-Benz", "Mercedes"] }` causes any vehicle search with `make=benz` to also return vehicles with make "Mercedes-Benz" or "Mercedes".
- If no explicit synonym exists, fuzzy matching (Levenshtein distance) automatically finds near-miss makes/models (e.g. "Toyotaa" → matches "Toyota").
- Fuzzy distance threshold scales with term length: ≤3 chars = exact only; 4–5 chars = distance ≤1; 6+ chars = distance ≤2.
- The in-memory synonym cache (10 min TTL) is **immediately invalidated** on every PUT or DELETE so changes take effect instantly.

**Test synonym expansion:**

```bash
# Add synonym
curl -X PUT localhost:5000/synonyms \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"term":"benz","expansions":["Mercedes-Benz","Mercedes"]}'

# Search uses expansion — returns Mercedes-Benz vehicles
curl 'localhost:5000/vehicles/search?make=benz'
```

---

## Frontend Features

### Search Page

| Feature               | Location           | Notes                                                                |
| --------------------- | ------------------ | -------------------------------------------------------------------- |
| Trending searches     | Top of search page | Click a chip to apply it as the make filter                          |
| Saved filter presets  | Below filter bar   | Per-user (namespaced by userId in localStorage); apply, save, delete |
| Zero-results feedback | Results area       | Contextual hints when 0 results (e.g. "Try raising your max price")  |
| Pagination            | Below results      | Prev/Next with current page display                                  |

### Admin Page

| Feature                 | Tab                | Notes                                                               |
| ----------------------- | ------------------ | ------------------------------------------------------------------- |
| A/B experiment creation | A/B Experiments    | Multi-variant form with weight validation                           |
| Experiment rollback     | A/B Experiments    | Dedicated ⏪ Rollback button per experiment; confirms before acting |
| Experiment results      | A/B Experiments    | Inline variant distribution table                                   |
| Synonym CRUD            | Synonym Management | Add, edit, delete synonyms; expansions shown as chips               |

---

## Test Coverage

### Backend integration tests (`backend/src/tests/` — run via `npm test`)

```
  auth.test.js              — JWT issuance, Bearer enforcement, X-User-Id rejection
  authorization.test.js     — Tenant isolation, RBAC (orders, payments, analytics, experiments)
  checkout_invoice.test.js  — Invoice preview contract, params, auth, tenant
  experiments.test.js       — Full A/B lifecycle, rollback, assign, service unit tests
  order.transitions.test.js — State machine, idempotency, audit log
  privacy.test.js           — Consent CRUD, export, deletion requests, retention hold
  rollback.test.js          — Order state machine rollback (inventory, payment)
  synonyms.test.js          — Synonym CRUD, fuzzy matching, cache invalidation
```

### Unit tests (`unit_tests/` — run via `npm run test:unit`)

```
  state_machine.test.js          — Order FSM transitions, guard logic
  permission_service.test.js     — check(), checkType(), role chain inheritance
  payment_service.test.js        — getWalletSummary, ledger filtering
  checkout_service.test.js       — splitItems() grouping, key normalization, ordering
  tax_service.test.js            — getRates() DB lookups + fallback, calculate() pure math
  invoice_service.test.js        — lineItems, add-on pricing, tax breakdown, total
  reconciliation_service.test.js — All 5 check types, happy path, multi-discrepancy
```

### Backend middleware tests (`backend/src/tests/` — run via `npm test`)

```
  middleware.test.js  — requireRole (RBAC), validate (Joi coercion + errors),
                         errorHandler (all 6 error types), fileValidator
                         (computeHash, validateUpload — MIME, magic bytes, hash check)
```

### API tests (`API_tests/` — run via `npm run test:api`, no mocking of route paths)

```
  experiments.test.js         — Full API lifecycle, rollback controls, RBAC, validation
  synonyms.test.js            — Synonym CRUD API, expansion in search, fuzzy, RBAC
  vehicles.test.js            — Vehicle search, pagination, filters
  orders.test.js              — Order CRUD, transitions, audit
  payments.test.js            — Payment flow, wallet, ledger, refunds
  rbac.test.js                — Document RBAC, role chain, admin protection
  health_cart_analytics.test.js — GET /health, POST /cart/add, POST /cart/checkout,
                                  GET /analytics/trending, POST /analytics/event,
                                  GET /analytics/events
  reconciliation.test.js      — POST /reconciliation/run, GET /reconciliation/logs,
                                  GET /reconciliation/logs/:runId/ledger,
                                  GET /reconciliation/tickets,
                                  PATCH /reconciliation/tickets/:id/resolve
  finance.test.js             — GET /finance/tax-rates, POST /finance/tax-rates
                                  (upsert, state uppercase, Joi validation, RBAC)
  documents_extended.test.js  — POST /documents/upload (real PDF buffer, magic bytes),
                                  GET /documents/:id/download, POST /documents/:id/share,
                                  POST /documents/:id/submit, POST /documents/:id/approve
  e2e_workflow.test.js        — Multi-step HTTP flows: search→cart→checkout→pay,
                                  experiment lifecycle (create/activate/rollback/assign),
                                  privacy lifecycle (consent/export/deletion/cancel),
                                  synonym CRUD with search expansion
```

### Frontend component tests (`frontend/src/tests/` — run via `npm test` in frontend)

```
  SessionContext.test.jsx  — login/logout, sessionStorage persistence, token init
  SearchPage.test.jsx      — heading, zero-results feedback, trending chips, presets
  CheckoutPage.test.jsx    — empty state, order list, invoice preview, Pay Now flow
  DocumentsPage.test.jsx   — auth prompt when unauthenticated, upload form, doc table
  api.client.test.js       — Authorization: Bearer header attachment from sessionStorage
  CartContext.test.jsx     — SET_CART, CLEAR_CART, unknown action, provider isolation
  VehicleCard.test.jsx     — Display, add-on checkboxes, addToCart call, button states
  Layout.test.jsx          — Nav links, logo, cart badge, login form, auth state
  AdminPage.test.jsx       — Tab switching, experiment create/status/rollback/results,
                              synonym CRUD (add, edit, cancel, delete)
  CartPage.test.jsx        — Empty state, item display, checkout call, nav, error
  FinancePage.test.jsx     — Tax rate table, save form, edit-prefill, error handling
  PrivacyPage.test.jsx     — Consent history, record consent, data export + masking,
                              deletion request lifecycle (submit, cancel)
```
