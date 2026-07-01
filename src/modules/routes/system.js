// ── System health ───────────────────────────────────────────────────────────────
const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Rate limit for all routes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limit to all routes
app.use('/', limiter);

const { pool } = require('../db');
const { callOmdb } = require('../omdb');
const { pingOllama } = require('../ollama');
const { OMDB_API_KEY, CERT_DIR, OLLAMA, OLLAMA_MODEL } = require('../config');
const { createProxyMiddleware } = require('http-proxy-middleware');

async function healthHandler(req, res) {
  try {
    const [dbRes, ollamaOk, omdbOk] = await Promise.allSettled([
      pool.query('SELECT 1'),
      pingOllama(),
      (async () => {
        if (!OMDB_API_KEY) return { ok: false, reason: 'no key' };
        const r = await callOmdb({ title: 'test' }, OMDB_API_KEY).catch(() => null);
        return { ok: !!r };
      })()
    ]);

    const caCert = path.join(CERT_DIR, 'ca.crt');
    const httpsCertsOk = fs.existsSync(caCert);

    res.json({
      status: 'ok',
      db: dbRes.status === 'fulfilled' ? 'ok' : 'fail',
      ollama: ollamaOk.status === 'fulfilled' && ollamaOk.value ? 'ok' : 'fail',
      omdb: omdbOk.status === 'fulfilled' && omdbOk.value.ok ? 'ok' : 'fail',
      httpsCerts: httpsCertsOk ? 'ok' : 'missing',
      ts: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function caCertHandler(req, res) {
  const caCert = path.join(CERT_DIR, 'ca.crt');
  if (!fs.existsSync(caCert)) return res.status(404).json({ error: 'CA cert not found' });
  res.setHeader('Content-Type', 'application/x-x509-ca-cert');
  res.setHeader('Content-Disposition', 'attachment; filename="vhs-scanner-ca.crt"');
  res.sendFile(caCert);
}

function registerStaticAndProxy(app) {
  const publicDir = path.join(__dirname, '..', '..', '..', 'public');
  app.use(express.static(publicDir, { index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  // Proxy for Ollama
  app.use(
    '/api/ollama',
    createProxyMiddleware({
      target: OLLAMA,
      changeOrigin: true,
      pathRewrite: { '^/api/ollama': '' },
      proxyTimeout: 300000,
      timeout: 300000,
      rejectUnauthorized: true,
      on: { error: (err, _req, res) => res.status(502).json({ error: 'Ollama unavailable: ' + err.message }) },
    })
  );
}

module.exports = { healthHandler, caCertHandler, registerStaticAndProxy };