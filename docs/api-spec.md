# API Specification

All paths below are the **real Express mount paths** as registered in
`repo/backend/src/app.js`. The backend mounts every router at the root
(`/auth`, `/vehicles`, `/cart`, …), not under `/api`.

## Path Prefix Convention

| Caller                                       | Path used                                | Reason                                                                                               |
| -------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Backend direct (`curl`, supertest, `API_tests/`) | No prefix — e.g. `GET /finance/tax-rates` | Express routers are mounted at root in `repo/backend/src/app.js:34-45`.                              |
| Frontend browser fetch (Vite dev server)     | `/api/…` prefix — e.g. `GET /api/finance/tax-rates` | `repo/frontend/vite.config.js:10-15` proxies `/api/*` to the backend and strips the `/api` prefix.  |

The `/api` prefix is therefore a **frontend-only proxy prefix** — it is
never part of an Express route. Do not send `/api/...` requests directly
to the backend port; they will 404.

## Authentication & Security

- JWT (HS256) Bearer auth on all non-public routes (`repo/backend/src/middleware/auth.js`)
- Role-based access control via `requireRole` / `requirePermission`
  middleware (`repo/backend/src/middleware/`)
- Object-level permission checks for documents
  (`repo/backend/src/services/permissionService.js`)
- AES-256 field encryption for sensitive values with versioned keys
  (`repo/backend/src/services/encryptionService.js`)
- File-upload validation (MIME + magic-byte check, 10 MB hard limit,
  quarantine on mismatch) — see `repo/backend/src/middleware/fileValidator.js`
- Centralized request logging + redaction
  (`repo/backend/src/middleware/requestLogger.js`)

## Public Endpoints

| Method | Path                  | Purpose                                              |
| ------ | --------------------- | ---------------------------------------------------- |
| GET    | `/health`             | Liveness probe — returns `{status:"ok", system:"MotorLot DealerOps"}` |
| GET    | `/analytics/trending` | Trending search keywords (no auth required — used by search page) |

## Auth

| Method | Path           | Purpose                                    |
| ------ | -------------- | ------------------------------------------ |
| POST   | `/auth/token`  | Exchange `{userId}` for a signed JWT       |

## Vehicles

| Method | Path                | Auth  | Purpose                                                 |
| ------ | ------------------- | ----- | ------------------------------------------------------- |
| GET    | `/vehicles/search`  | none  | Search with filters, pagination, fuzzy + synonym expansion |

> There are no CRUD endpoints for vehicles. Inventory is seeded via
> `repo/backend/src/seeders/`. Trending keywords live under
> `/analytics/trending`; saved-filter presets are a frontend-only
> feature stored in `localStorage` (namespaced by userId).

## Cart

All routes require auth.

| Method | Path              | Purpose                              |
| ------ | ----------------- | ------------------------------------ |
| POST   | `/cart/add`       | Add a vehicle/service to the cart    |
| POST   | `/cart/checkout`  | Checkout cart (splits/merges orders) |

## Orders

All routes require auth.

| Method | Path                          | Role                             | Purpose                                         |
| ------ | ----------------------------- | -------------------------------- | ----------------------------------------------- |
| GET    | `/orders/:id`                 | any authenticated                | Get order details                               |
| PATCH  | `/orders/:id/transition`      | admin, manager, finance          | Advance order state (state machine transition) |
| GET    | `/orders/:id/audit`           | any authenticated                | Retrieve the order's audit log                  |

## Payments

All routes require auth.

| Method | Path                          | Role                                      | Purpose                         |
| ------ | ----------------------------- | ----------------------------------------- | ------------------------------- |
| POST   | `/payments`                   | admin, manager, finance                   | Record a payment                |
| GET    | `/payments/wallet`            | admin, manager, finance                   | Wallet summary by dealership    |
| GET    | `/payments/ledger/:orderId`   | admin, manager, finance, salesperson      | Ledger entries for an order     |
| POST   | `/payments/:id/refund`        | admin, finance                            | Refund an existing payment      |

## Reconciliation

All routes require auth **and** the `admin` role (cross-dealership data).

| Method | Path                                       | Purpose                                   |
| ------ | ------------------------------------------ | ----------------------------------------- |
| POST   | `/reconciliation/run`                      | Trigger a reconciliation run              |
| GET    | `/reconciliation/logs`                     | List reconciliation runs                  |
| GET    | `/reconciliation/logs/:runId/ledger`       | Get ledger snapshot for a run             |
| GET    | `/reconciliation/tickets`                  | List discrepancy tickets                  |
| PATCH  | `/reconciliation/tickets/:id/resolve`      | Resolve a discrepancy ticket              |

## Documents

All routes require auth. Write operations additionally require the
named object-level permission via `requirePermission`.

| Method | Path                            | Permission / Role            | Purpose                         |
| ------ | ------------------------------- | ---------------------------- | ------------------------------- |
| GET    | `/documents`                    | any authenticated            | List documents                  |
| GET    | `/documents/:id`                | `read`                       | Document metadata               |
| GET    | `/documents/:id/download`       | `download`                   | Download file bytes             |
| POST   | `/documents/upload`             | any authenticated            | Upload (multer, 10 MB, validated) |
| PUT    | `/documents/:id`                | `edit`                       | Update document metadata        |
| DELETE | `/documents/:id`                | `delete`                     | Delete document                 |
| POST   | `/documents/:id/share`          | `share`                      | Share with another user/role    |
| POST   | `/documents/:id/submit`         | `submit`                     | Submit for approval             |
| POST   | `/documents/:id/approve`        | `approve`                    | Approve document                |
| POST   | `/documents/:id/permissions`    | role: admin/manager + `edit` | Set object-level permissions    |

## Finance

All routes require auth.

| Method | Path                                   | Role     | Purpose                                    |
| ------ | -------------------------------------- | -------- | ------------------------------------------ |
| GET    | `/finance/invoice-preview/:orderId`    | any auth | Preview computed invoice for an order      |
| GET    | `/finance/tax-rates`                   | any auth | List tax rates                             |
| POST   | `/finance/tax-rates`                   | admin    | Upsert a tax rate                          |

## Experiments (A/B)

All routes require auth.

| Method | Path                          | Role            | Purpose                              |
| ------ | ----------------------------- | --------------- | ------------------------------------ |
| POST   | `/experiments`                | admin           | Create an experiment                 |
| GET    | `/experiments`                | admin, manager  | List experiments                     |
| GET    | `/experiments/:id`            | admin, manager  | Get experiment detail                |
| PATCH  | `/experiments/:id/status`     | admin           | Set status (draft/active/paused/rolled_back) |
| POST   | `/experiments/:id/rollback`   | admin           | Immediate rollback to rollback variant |
| POST   | `/experiments/assign`         | any auth        | Assign a session to a variant        |
| GET    | `/experiments/:id/results`    | admin, manager  | Variant assignment distribution      |

## Privacy

All routes require auth.

| Method | Path                                    | Purpose                                 |
| ------ | --------------------------------------- | --------------------------------------- |
| GET    | `/privacy/consent`                      | Consent history for the current user    |
| POST   | `/privacy/consent`                      | Record new consent                      |
| GET    | `/privacy/export`                       | Export the user's data                  |
| GET    | `/privacy/deletion-requests`            | List deletion requests                  |
| POST   | `/privacy/deletion-request`             | Request account deletion (30-day hold)  |
| DELETE | `/privacy/deletion-requests/:id`        | Cancel a pending deletion request       |

## Analytics

| Method | Path                   | Auth                      | Purpose                                   |
| ------ | ---------------------- | ------------------------- | ----------------------------------------- |
| GET    | `/analytics/trending`  | none (public)             | Trending search keywords                  |
| POST   | `/analytics/event`     | any authenticated         | Log an analytics event                    |
| GET    | `/analytics/events`    | admin, manager            | List analytics events                     |

## Synonyms

All routes require auth.

| Method | Path                 | Role     | Purpose                                    |
| ------ | -------------------- | -------- | ------------------------------------------ |
| GET    | `/synonyms`          | any auth | List all synonyms (sorted by term)         |
| PUT    | `/synonyms`          | admin    | Create or update a synonym (upsert)        |
| DELETE | `/synonyms/:term`    | admin    | Delete a synonym (keyed by term, not id)   |

## Error Handling

- Central error handler (`repo/backend/src/middleware/errorHandler.js`)
  returns `{ success: false, error: { code, message } }`.
- Unknown routes return a 404 with `code: "NOT_FOUND"` from
  `repo/backend/src/app.js:48-50`.
- Joi validation errors include field-level details.
- RBAC denials return 403; missing/invalid JWTs return 401.
- All sensitive failures are logged through the central request
  logger with sensitive fields redacted.
