FROM node:22-alpine AS base
# hadolint ignore=DL3018
RUN apk add --no-cache openssl
WORKDIR /app
COPY --chown=node:node package*.json ./

# Test image (dev dependencies + tests): docker build --target test -t vhs-test .
FROM base AS test
COPY --chown=node:node .eslintrc.json ./
COPY --chown=node:node jest.config.js ./
RUN npm ci
COPY --chown=node:node src/ src/
COPY --chown=node:node migrations/ ./migrations/
COPY --chown=node:node tests/ ./tests/
COPY --chown=node:node public/ ./public/
COPY --chown=node:node scripts/ ./scripts/
RUN mkdir -p /app/certs /app/coverage && chown node:node /app/certs /app/coverage
USER node
CMD ["npx", "jest"]

# Production image (default target): runtime dependencies only, no tests.
FROM base AS prod
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node src/ src/
COPY --chown=node:node migrations/ ./migrations/
COPY --chown=node:node public/ ./public/
COPY --chown=node:node scripts/ ./scripts/
RUN mkdir -p /app/certs && chown node:node /app/certs
USER node
EXPOSE 8080 8443
CMD ["node", "src/server.js"]
