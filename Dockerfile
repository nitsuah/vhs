FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node server.js .
COPY --chown=node:node index.html .
USER node
EXPOSE 8080
CMD ["node", "server.js"]
