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
const { requireAuth } = require('../auth');
const { resolveOllamaUrl } = require('../ollama');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');

// Only the Ollama endpoints the app uses are forwarded.
const OLLAMA_ALLOWED = [
  ['GET', '/api/tags'],
  ['GET', '/api/version'],
  ['POST', '/api/generate'],
  ['POST', '/api/chat'],
  ['GET', '/v1/models'],
  ['POST', '/v1/chat/completions'],
];
function ollamaAllowlist(req, res, next) {
  const p = req.path.replace(/\/+$/, '');
  if (OLLAMA_ALLOWED.some(([m, path]) => m === req.method && path === p)) return next();
  return res.status(404).json({ error: 'not found' });
}

function registerStaticAndProxy(app) {
  app.use('/api', limiter);

  const publicDir = path.join(__dirname, '..', '..', '..', 'public');
  app.use(express.static(publicDir, { index: false }));

  // Proxy for Ollama — must be before the SPA catch-all. `router` is
  // resolved per-request (and resolveOllamaUrl caches its own result after
  // the first successful probe) so this picks up the auto-detected upstream
  // instead of being pinned to the static config default at startup.
  app.use(
    '/api/ollama',
    requireAuth,
    express.json({ limit: '15mb' }),
    ollamaAllowlist,
    createProxyMiddleware({
      target: OLLAMA,
      router: () => resolveOllamaUrl(),
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

module.exports = { registerStaticAndProxy, ollamaAllowlist };
