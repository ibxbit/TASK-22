# System Design Overview (Extended)

## Architecture
- **Frontend:** React SPA (Vite) for buyers, staff, and admins
- **Backend:** Express.js REST API
- **Database:** MongoDB for all persistent data
- **Cache:** In-memory (Node.js) for query results, trending keywords
- **Security:** JWT, HMAC, AES-256, RBAC, file validation/quarantine
- **Job Scheduler:** Node.js cron for background jobs (cleanup, reconciliation)

## Key Components

### 1. Vehicle Search & Discovery
- Multi-criteria filtering, fuzzy/synonym search, trending keywords
- Pagination with stable sort keys and cached results
- Saved filter presets per user
- Immediate feedback for zero matches
- Trending search suggestions

### 2. Cart & Order Processing
- Cart supports vehicles and add-on services
- Checkout splits/merges orders by supplier/location/turnaround
- Order state machine: Created → Reserved → Invoiced → Settled → Fulfilled/Cancelled
- Idempotent actions, rollback on failure (within 5 seconds)
- Exception handling and audit logging
- Order audit trail and state history

### 3. Document Management
- Upload, download, edit, delete, share, submit, approve
- RBAC with dealership inheritance and overrides
- Audit logging for all actions
- File validation (type/size/hash), quarantine on mismatch
- Document approval workflow
- Document sharing with explicit permissions

### 4. Payments & Settlement
- Offline methods: cash, cashier’s check, in-house financing
- Internal wallet ledger, nightly reconciliation
- Pluggable adapters (disabled by default)
- Discrepancy ticketing for manual review

### 5. Privacy & Compliance
- Data classification, masking, AES-256 encryption
- Consent history, export, deletion with retention
- HMAC signing, anti-replay, audit logs
- Masking of sensitive fields (e.g., last 4 of driver’s license)
- 30-day retention for deletion requests

### 6. Analytics & Experiments
- Log events, A/B test assignments, rollback controls
- Analytics event logging for all user actions
- Experiment assignment and rollback

### 7. Background Jobs
- Nightly reconciliation job
- Expired match cleanup (auto-cancel after 3 mins)
- Trending keyword update (hourly)
- Key rotation for encryption

## Data Model Highlights
- **Vehicle:** make, model, price, mileage, region, registration date, images, status
- **Order:** items, state, user, supplier, warehouse, timestamps, audit log, state history
- **Document:** file, type, owner, permissions, audit log, approval status, quarantine flag
- **User:** roles, permissions, consent, saved filters, audit log
- **Ledger:** wallet entries, settlements, discrepancies, reconciliation logs
- **Experiment:** name, variants, assignments, status, rollback info

## Security & Compliance
- Masking, encryption, RBAC, audit logs, file validation, HMAC
- 30-day retention for deletion requests
- All sensitive actions logged
- Anti-replay and rate limiting
- Rotated encryption keys
