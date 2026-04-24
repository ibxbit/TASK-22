#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# run_tests.sh — Docker-self-contained test runner for MotorLot DealerOps.
#
# Host requirements (everything else runs inside Docker):
#   • bash (for this script itself)
#   • Docker Engine
#   • Docker Compose v2.1.1+  (required for the `--wait` flag used below;
#                              run `docker compose version` to confirm)
#
# Node, npm, Jest, supertest, MongoDB — all inside the backend/mongo
# containers. No `python3`, `grep`, `jq`, `curl`, or `node` on the host.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

log() { echo "[run_tests] $*"; }

# ── Bring services up and wait for healthchecks ──────────────────────────────
# `--wait` blocks until every service with a healthcheck is healthy, so we
# don't need a custom polling loop (which previously relied on host `python3`
# + `grep` to parse `docker compose ps --format json`). Healthchecks are
# defined in docker-compose.yml for both `mongo` and `backend`.

log "Starting services (will wait for healthchecks)..."
docker compose up -d --build --wait

# ── Run test suites inside the backend container ─────────────────────────────
# Capture exit codes without aborting on the first failure so both suites run.

UNIT_EXIT=0
API_EXIT=0

log "Running unit tests (unit_tests/)..."
docker compose exec -T backend npm run test:unit || UNIT_EXIT=$?

log "Running API tests (API_tests/)..."
docker compose exec -T backend npm run test:api || API_EXIT=$?

# ── Report ───────────────────────────────────────────────────────────────────

echo ""
if [ "$UNIT_EXIT" -eq 0 ] && [ "$API_EXIT" -eq 0 ]; then
  log "All tests passed."
  exit 0
else
  [ "$UNIT_EXIT" -ne 0 ] && log "Unit tests FAILED (exit $UNIT_EXIT)."
  [ "$API_EXIT"  -ne 0 ] && log "API tests FAILED (exit $API_EXIT)."
  exit 1
fi
