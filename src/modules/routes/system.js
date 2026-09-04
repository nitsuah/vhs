// ── Static files, Ollama proxy, SPA catch-all ─────────────────────────────────
const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Rate limit for all routes - 100 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});

const { OLLAMA } = require('../config');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');

function registerStaticAndProxy(app) {
  app.use('/', limiter);

  const publicDir = path.join(__dirname, '..', '..', '..', 'public');
  app.use(express.static(publicDir, { index: false }));

  // Proxy for Ollama — must be before the SPA catch-all
  app.use(
    '/api/ollama',
    createProxyMiddleware({
      target: OLLAMA,
      changeOrigin: true,
      pathRewrite: { '^/api/ollama': '' },
      proxyTimeout: 300000,
      timeout: 300000,
      rejectUnauthorized: true,
      onProxyReq: fixRequestBody,
      onError: (err, _req, res) => res.status(502).json({ error: 'Ollama unavailable: ' + err.message }),
    })
  );

  app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html'))); // codeql[js/missing-rate-limiting] app.use('/',limiter) above covers this catch-all
}

module.exports = { registerStaticAndProxy };
