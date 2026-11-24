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
  const allow = OLLAMA_ALLOWED.filter(([, path]) => path === p).map(([m]) => m);
  if (allow.length) {
    res.set('Allow', allow.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }
  return res.status(404).json({ error: 'not found' });
}

// Methods registered for `pathname` (excluding the `*` SPA catch-all), so a
// known /api path hit with the wrong verb can answer 405 + Allow, not 404.
function allowedMethods(app, pathname) {
  const methods = new Set();
  for (const layer of (app._router && app._router.stack) || []) {
    if (!layer.route || layer.route.path === '*' || !layer.regexp.test(pathname)) continue;
    for (const [m, on] of Object.entries(layer.route.methods)) if (on) methods.add(m.toUpperCase());
  }
  if (methods.has('GET')) methods.add('HEAD');
  return [...methods].sort();
}

// Anything under /api that no route answered: JSON, never the SPA shell/HTML.
function apiFallback(app) {
  return (req, res) => {
    const allow = allowedMethods(app, req.baseUrl + req.path);
    if (allow.length) {
      res.set('Allow', allow.join(', '));
      return res.status(405).json({ error: 'Method not allowed' });
    }
    return res.status(404).json({ error: 'Not found' });
  };
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
      onProxyRes: (_proxyRes, _req, res) => {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
      onError: (err, _req, res) => res.status(502).json({ error: 'Ollama unavailable: ' + err.message }),
    })
  );

  app.use('/api', apiFallback(app));

  app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html'))); // codeql[js/missing-rate-limiting] app.use('/',limiter) above covers this catch-all
}

module.exports = { registerStaticAndProxy, ollamaAllowlist, allowedMethods };
