FROM node:22-alpine
# hadolint ignore=DL3018
RUN apk add --no-cache openssl
WORKDIR /app
COPY --chown=node:node package*.json ./
COPY --chown=node:node .eslintrc.json ./
COPY --chown=node:node jest.config.js ./
RUN npm ci
COPY --chown=node:node src/ src/
COPY --chown=node:node migrations/ ./migrations/
COPY --chown=node:node tests/ ./tests/
COPY --chown=node:node public/ ./public/
RUN mkdir -p /app/certs /app/coverage && chown node:node /app/certs /app/coverage
USER node
EXPOSE 8080 8443
CMD ["node", "src/server.js"]
