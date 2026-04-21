FROM node:20-alpine

RUN apk add --no-cache curl

WORKDIR /app

# Dependencies first (cached layer)
COPY backend/package*.json ./
RUN npm install

# Backend source
COPY backend/src           ./src
COPY backend/server.js     ./server.js
COPY backend/jest.config.js ./jest.config.js
COPY backend/jest.setup.js  ./jest.setup.js

# Test suites (copied from repo root)
COPY unit_tests ./unit_tests
COPY API_tests  ./API_tests

# Symlink so test imports using '../backend/src/...' resolve correctly
RUN mkdir -p /app/backend && ln -s /app/src /app/backend/src

# Runtime directories
RUN mkdir -p uploads/quarantine

# Startup: seed idempotent data then launch
COPY backend/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 5000
CMD ["./entrypoint.sh"]
