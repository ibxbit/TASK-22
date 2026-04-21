#!/bin/sh
set -e

echo "[entrypoint] Seeding initial data..."
node src/seeders/seedTaxRates.js || echo "[entrypoint] Seed skipped (already exists or non-fatal)"

echo "[entrypoint] Starting server..."
exec node server.js
