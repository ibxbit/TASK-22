#!/bin/sh
set -e

# Install dependencies at startup so the Docker build needs no network access.
# node_modules is a named volume — install runs once; subsequent restarts skip it.
if [ ! -d node_modules ] || [ ! -f node_modules/.install-done ]; then
  echo "[entrypoint] Installing npm dependencies (first run)..."
  npm install
  touch node_modules/.install-done
  echo "[entrypoint] npm install complete."
fi

echo "[entrypoint] Seeding initial data..."
node src/seeders/seedTaxRates.js || echo "[entrypoint] Seed skipped (already exists or non-fatal)"

echo "[entrypoint] Starting server..."
exec node server.js
