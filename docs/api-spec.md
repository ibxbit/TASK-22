# API Specification (Extended)

## Authentication & Security
- JWT-based authentication for all endpoints
- HMAC signing for API requests (5-min anti-replay)
- Role-based access control (RBAC) for all resources
- Audit logging for all sensitive actions
- AES-256 encryption for sensitive data at rest
- File upload validation (type, size, hash, quarantine)

## Core Endpoints

### Vehicles
- `GET /api/vehicles` — List vehicles with filters (make, model, price, mileage, region, registration date, fuzzy/synonym search, pagination, sort)
- `GET /api/vehicles/:id` — Get vehicle details
- `POST /api/vehicles` — Add new vehicle (admin only)
- `PUT /api/vehicles/:id` — Update vehicle (admin only)
- `DELETE /api/vehicles/:id` — Delete vehicle (admin only)
- `GET /api/vehicles/trending` — Get trending vehicles/searches
- `GET /api/vehicles/saved-filters` — Get user’s saved filter presets
- `POST /api/vehicles/saved-filters` — Save a new filter preset

### Cart & Orders
- `GET /api/cart` — Get current user’s cart
- `POST /api/cart/add` — Add vehicle/service to cart
- `POST /api/cart/remove` — Remove item from cart
- `POST /api/orders/checkout` — Checkout cart (splits/merges orders as needed)
- `GET /api/orders` — List user’s orders
- `GET /api/orders/:id` — Get order details
- `POST /api/orders/:id/cancel` — Cancel order
- `GET /api/orders/:id/audit` — Get order audit log
- `GET /api/orders/:id/state` — Get order state machine history

### Documents
- `POST /api/documents/upload` — Upload document (PDF/JPG/PNG, <10MB, validated)
- `GET /api/documents/:id` — Download/view document (RBAC enforced)
- `PUT /api/documents/:id` — Update document metadata
- `DELETE /api/documents/:id` — Delete document
- `POST /api/documents/:id/share` — Share document with another user/role
- `POST /api/documents/:id/approve` — Approve document (with audit log)
- `POST /api/documents/:id/quarantine` — Quarantine document (admin only)

### Synonyms & Trending
- `GET /api/synonyms` — List synonyms
- `POST /api/synonyms` — Add/modify synonym (admin only)
- `DELETE /api/synonyms/:id` — Remove synonym (admin only)
- `GET /api/trending` — Get trending searches
- `POST /api/trending` — Update trending keywords (admin only)

### Analytics & Experiments
- `POST /api/analytics/event` — Log analytics event
- `GET /api/analytics/events` — List analytics events (admin only)
- `GET /api/experiments` — List active A/B tests
- `POST /api/experiments/assign` — Assign user to experiment group
- `POST /api/experiments/rollback` — Rollback experiment (admin only)

### Privacy & Consent
- `GET /api/privacy/consent` — Get user consent history
- `POST /api/privacy/consent` — Record new consent
- `POST /api/privacy/export` — Export user data
- `POST /api/privacy/delete` — Request account deletion
- `GET /api/privacy/masked-fields` — Get list of masked fields

### Admin & Reconciliation
- `GET /api/reconciliation` — List reconciliation ledgers
- `POST /api/reconciliation/run` — Trigger reconciliation job (admin only)
- `GET /api/discrepancies` — List discrepancy tickets
- `POST /api/discrepancies/:id/resolve` — Resolve discrepancy ticket
- `GET /api/audit-logs` — List all audit logs (admin only)

## Error Handling
- All endpoints return standard error codes and messages
- Validation errors include field-level details
- Rate limiting and anti-replay errors
- Detailed audit logs for all failed actions
