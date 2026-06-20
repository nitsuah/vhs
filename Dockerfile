FROM node:22-alpine
# hadolint ignore=DL3018
RUN apk add --no-cache openssl
WORKDIR /app
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node server.js .
COPY --chown=node:node public/ ./public/
RUN mkdir -p /app/certs && chown node:node /app/certs
USER node
EXPOSE 8080 8443
CMD ["node", "server.js"]
