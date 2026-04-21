#!/usr/bin/env bash
set -euo pipefail

# ── Helpers ────────────────────────────────────────────────────────────────────

log()  { echo "[run_tests] $*"; }
fail() { echo "[run_tests] ERROR: $*" >&2; exit 1; }

wait_healthy() {
  local service="$1"
  local max=60
  local i=0
  log "Waiting for $service to become healthy..."
  until [ "$(docker compose ps --format json "$service" 2>/dev/null \
             | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Health',''))" 2>/dev/null)" = "healthy" ] \
     || docker compose ps "$service" 2>/dev/null | grep -q "healthy"; do
    i=$((i+1))
    [ "$i" -ge "$max" ] && fail "$service did not become healthy within ${max}s"
    sleep 1
  done
  log "$service is healthy."
}

# ── Bring services up ──────────────────────────────────────────────────────────

log "Starting services..."
docker compose up -d --build

wait_healthy mongo
wait_healthy backend

# ── Run unit tests ─────────────────────────────────────────────────────────────

log "Running unit tests (unit_tests/)..."
docker compose exec -T backend npm run test:unit
UNIT_EXIT=$?

# ── Run API tests ──────────────────────────────────────────────────────────────

log "Running API tests (API_tests/)..."
docker compose exec -T backend npm run test:api
API_EXIT=$?

# ── Report ─────────────────────────────────────────────────────────────────────

echo ""
if [ "$UNIT_EXIT" -eq 0 ] && [ "$API_EXIT" -eq 0 ]; then
  log "All tests passed."
  exit 0
else
  [ "$UNIT_EXIT" -ne 0 ] && log "Unit tests FAILED (exit $UNIT_EXIT)."
  [ "$API_EXIT"  -ne 0 ] && log "API tests FAILED (exit $API_EXIT)."
  exit 1
fi
