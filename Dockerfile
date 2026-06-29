FROM node:22-alpine
# hadolint ignore=DL3018
RUN apk add --no-cache openssl
WORKDIR /app
COPY --chown=node:node package*.json ./
RUN npm ci
COPY --chown=node:node server.js .
COPY --chown=node:node lib/ ./lib/
COPY --chown=node:node migrations/ ./migrations/
COPY --chown=node:node tests/ ./tests/
COPY --chown=node:node public/ ./public/
RUN mkdir -p /app/certs /app/coverage && chown node:node /app/certs /app/coverage
USER node
EXPOSE 8080 8443
CMD ["node", "server.js"]
