// ── VHS SHELF SCANNER SERVER ──────────────────────────────────────────────────
'use strict';

const express = require('express');
const { Pool } = require('pg');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const https = require('https');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

// Local modules
const { PORT, HTTPS_PORT, OLLAMA, OMDB_API_KEY } = require('./modules/config');
const { pool, runMigrations } = require('./modules/db');
const { ensureCerts } = require('./modules/certs');
const { logActivity, getActivityLog, getLogClients } = require('./modules/activity-log');
const { healthHandler } = require('./modules/routes/health');
const { jobId, reviewItemId, analyticsId } = require('./modules/ids');
const { enhancedLookup, callOmdb, normalizeTitleForLookup, levenshteinDistance } = require('./modules/omdb');
const { logScanAnalytics } = require('./modules/analytics');
const { processJobs } = require('./modules/worker');
const { callOllamaServer, pingOllama } = require('./modules/ollama');
const { parseJsonArray } = require('./modules/json-parser');
const { withRetry } = require('./modules/retry');
const {
  tapesGetHandler,
  tapesPostHandler,
  tapesPutHandler,
  tapesDeleteHandler
} = require('./modules/routes/tapes');

// ── App setup ──────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '50mb' }));

// ── Activity log SSE endpoint ──────────────────────────────────────────────────
app.get('/api/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send existing log
  getActivityLog().forEach(entry => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  });

  // Register client
  getLogClients().add(res);
  req.on('close', () => getLogClients().delete(res));
});

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/api/health', healthHandler);

// ── System info ────────────────────────────────────────────────────────────────
app.get('/api/system', async (req, res) => {
  try {
    const ollamaOk = await pingOllama();
    const { rows: tapeCount } = await pool.query('SELECT COUNT(*) FROM tapes');
    const { rows: reviewCount } = await pool.query("SELECT COUNT(*) FROM review_items WHERE status='pending'");
    const { rows: jobStats } = await pool.query('SELECT status, COUNT(*) c FROM upload_jobs GROUP BY status');
    const stats = { pending: 0, processing: 0, done: 0, failed: 0 };
    jobStats.forEach(r => { stats[r.status] = parseInt(r.c, 10); });

    res.json({
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      node: process.version,
      ollama: ollamaOk ? 'ok' : 'unreachable',
      db: 'ok',
      tapes: parseInt(tapeCount[0]?.count || '0', 10),
      reviewPending: parseInt(reviewCount[0]?.count || '0', 10),
      jobs: stats,
      ts: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── CA cert download ───────────────────────────────────────────────────────────
app.get('/api/ca-cert', (req, res) => {
  const caCert = path.join('/app/certs', 'ca.crt');
  if (!fs.existsSync(caCert)) return res.status(404).json({ error: 'CA cert not found' });
  res.setHeader('Content-Type', 'application/x-x509-ca-cert');
  res.setHeader('Content-Disposition', 'attachment; filename="vhs-scanner-ca.crt"');
  res.sendFile(caCert);
});

// ── Ollama proxy ───────────────────────────────────────────────────────────────
app.use(
  '/api/ollama',
  createProxyMiddleware({
    target: OLLAMA,
    changeOrigin: true,
    pathRewrite: { '^/api/ollama': '' },
    proxyTimeout: 300000,
    timeout: 300000,
    on: { error: (err, _req, res) => res.status(502).json({ error: 'Ollama unavailable: ' + err.message }) }
  })
);

// Rate limiters for tape endpoints
const tapeLimiter = rateLimit({
  windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false
});
const tapeWriteLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false
});

// ── Tapes CRUD ─────────────────────────────────────────────────────────────────
app.get('/api/tapes', tapeLimiter, tapesGetHandler);
app.post('/api/tapes', tapeLimiter, tapesPostHandler);
app.put('/api/tapes/:id', tapeWriteLimiter, tapesPutHandler);
app.delete('/api/tapes/:id', tapeWriteLimiter, tapesDeleteHandler);

// ── Lookup endpoints ───────────────────────────────────────────────────────────
app.get('/api/lookup/barcode/:code', async (req, res) => {
  const code = req.params.code.trim().replace(/\s/g, '');
  if (!code) return res.status(400).json({ error: 'code required' });
  const omdbKey = (req.headers['x-omdb-key'] || OMDB_API_KEY).trim();

  let found = null;

  // 1. UPC Item DB
  try {
    const r = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`, {
      signal: AbortSignal.timeout(5000)
    });
    if (r.ok) {
      const d = await r.json();
      if (d.items?.length) {
        const item = d.items[0];
        found = {
          title: item.title || '',
          year: (item.publish_date || '').match(/\d{4}/)?.[0] || '',
          label: item.brand || '',
          barcode: code,
          source: 'upcitemdb'
        };
      }
    }
  } catch (e) { console.warn('UPC Item DB lookup:', e.message); }

  // 2. Open Library fallback
  if (!found) {
    try {
      const r = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${code}&format=json&jscmd=data`, {
        signal: AbortSignal.timeout(5000)
      });
      if (r.ok) {
        const d = await r.json();
        const key = `ISBN:${code}`;
        if (d[key]) {
          const b = d[key];
          found = {
            title: b.title || '',
            year: (b.publish_date || '').match(/\d{4}/)?.[0] || '',
            label: b.publishers?.[0]?.name || '',
            barcode: code,
            source: 'openlibrary'
          };
        }
      }
    } catch (e) { console.warn('Open Library lookup:', e.message); }
  }

  if (!found) return res.status(404).json({ error: 'not found' });

  // 3. Enrich with OMDb
  if (omdbKey && found.title) {
    const omdb = await callOmdb({ title: found.title }, omdbKey).catch(() => null);
    if (omdb?.imdb_id) {
      found = { ...found, year: omdb.year || found.year, imdb_id: omdb.imdb_id };
    }
  }

  res.json(found);
});

app.get('/api/lookup', async (req, res) => {
  const title = (req.query.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title required' });
  const omdbKey = (req.headers['x-omdb-key'] || OMDB_API_KEY).trim();
  const noai = req.query.noai === '1';

  const safeTitle = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const prompt = `You are VHS collectibles expert. For title: "${safeTitle}"
Return ONLY JSON object — no other text:
{"year":"1984","label":"Orion Pictures","format":"VHS","value_low":"8","value_high":"25"}
Rules: year=4-digit release year, label=VHS distributor/studio, value_low/value_high=USD resale range in good condition.
Omit fields you're unsure about. Return {} if completely unknown.`;

  const ollamaPromise = noai ? Promise.resolve({}) : fetch(`${OLLAMA}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OLLAMA_MODEL || 'llava:7b', prompt, stream: false, options: { num_predict: 64 } }),
    signal: AbortSignal.timeout(30000)
  }).then(r => r.json()).catch(() => ({}));

  const omdbPromise = omdbKey ? enhancedLookup({ title }, omdbKey).catch(() => null) : Promise.resolve(null);

  const [ollamaRes, omdb] = await Promise.all([ollamaPromise, omdbPromise]);

  let ai = {};
  try { ai = JSON.parse(ollamaRes.response || '{}'); } catch {}

  const result = {
    title,
    year: omdb?.year || ai.year || '',
    label: omdb?.label || ai.label || '',
    format: ai.format || 'VHS',
    value_low: ai.value_low || '',
    value_high: ai.value_high || '',
    imdb_id: omdb?.imdb_id || '',
    source: omdb ? 'omdb_enhanced' : 'ai'
  };

  res.json(result);
});

// ── YouTube trailer search ─────────────────────────────────────────────────────
app.get('/api/trailer', async (req, res) => {
  const title = (req.query.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title required' });
  try {
    const query = encodeURIComponent(`${title} - official trailer`);
    const r = await fetch(`https://www.youtube.com/results?search_query=${query}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return res.json({ videoId: null });
    const html = await r.text();
    const m = html.match(/"videoRenderer"\s*:\s*{"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/);
    const fallback = !m ? html.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/) : null;
    res.json({ videoId: (m || fallback)?.[1] || null });
  } catch {
    res.json({ videoId: null });
  }
});

// ── Job endpoints ──────────────────────────────────────────────────────────────
app.delete('/api/jobs/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM upload_jobs WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/jobs/retry-failed', async (_req, res) => {
  try {
    await pool.query("UPDATE upload_jobs SET status='pending' WHERE status='failed' AND retry_count<3");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Review endpoints ───────────────────────────────────────────────────────────
app.post('/api/review', async (req, res) => {
  const { data, source, thumb } = req.body;
  if (!data) return res.status(400).json({ error: 'data required' });
  const id = reviewItemId();
  const now = new Date().toISOString();
  try {
    await pool.query(
      'INSERT INTO review_items(id,job_id,data,thumb,source,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [id, null, JSON.stringify(data), thumb || null, source || 'manual', 'pending', now]
    );
    logActivity('info', `Review proposal created: ${id} source=${source || 'manual'} title=${data.title || '?'}`);
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/ready', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, data, thumb, created_at FROM review_items WHERE status='pending' ORDER BY created_at DESC LIMIT 50"
    );
    res.json(rows.map(r => ({ id: r.id, data: r.data, thumb: r.thumb, created_at: r.created_at })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/status', async (_req, res) => {
  try {
    const [jobsRes, reviewRes] = await Promise.all([
      pool.query('SELECT status, COUNT(*) c FROM upload_jobs GROUP BY status'),
      pool.query("SELECT COUNT(*) c FROM review_items WHERE status='pending'")
    ]);
    const counts = { pending: 0, processing: 0, done: 0, failed: 0, review_pending: 0 };
    jobsRes.rows.forEach(r => { counts[r.status] = parseInt(r.c, 10); });
    counts.review_pending = parseInt(reviewRes.rows[0]?.c || '0', 10);
    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, status, result, error, retry_count FROM upload_jobs WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Analytics ──────────────────────────────────────────────────────────────────
app.post('/api/analytics/outcome', async (req, res) => {
  const { job_id, action, final_title, final_year, final_label, imdb_id } = req.body;
  if (!job_id || !action) return res.status(400).json({ error: 'job_id & action required' });
  try {
    await pool.query(
      `UPDATE scan_analytics SET action=$1, final_title=$2, final_year=$3, final_label=$4, imdb_id=$5 WHERE job_id=$6`,
      [action, final_title || null, final_year || null, final_label || null, imdb_id || null, job_id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Static & SPA fallback ──────────────────────────────────────────────────────
const publicDir = path.join(__dirname, '..', '..', 'public');
app.use(express.static(publicDir, { index: false }));
app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

// ── Boot ───────────────────────────────────────────────────────────────────────
if (require.main === module) {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL not set. Copy .env.example to .env and add Neon connection string.');
    process.exit(1);
  }

  ensureCerts();

  runMigrations()
    .then(async () => {
      // Backfill: convert pre-migration 'done' upload_jobs into review_items
      const { rows: done } = await pool.query("SELECT id, result, thumb, created_at FROM upload_jobs WHERE status='done'");
      if (done.length) {
        console.log(`⟳ Backfilling ${done.length} done upload_jobs → review_items…`);
        for (const job of done) {
          const items = Array.isArray(job.result) ? job.result : [job.result].filter(Boolean);
          for (const item of items) {
            await pool.query(
              'INSERT INTO review_items(id,job_id,data,thumb,source,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
              [reviewItemId(), job.id, JSON.stringify({ ...item, condition: item.condition || 'good', status: 'in_collection' }), job.thumb, 'scan', 'pending', job.created_at]
            );
          }
        }
      }

      // Start HTTP
      app.listen(PORT, '0.0.0.0', () => console.log(`✓ HTTP server listening on :${PORT}`));

      // Start HTTPS if certs exist
      const caCert = path.join('/app/certs', 'ca.crt');
      const srvCrt = path.join('/app/certs', 'server.crt');
      const srvKey = path.join('/app/certs', 'server.key');
      if (fs.existsSync(caCert) && fs.existsSync(srvCrt) && fs.existsSync(srvKey)) {
        const server = https.createServer({
          cert: fs.readFileSync(srvCrt),
          key: fs.readFileSync(srvKey),
          ca: fs.readFileSync(caCert),
          requestCert: false
        }, app);
        server.listen(HTTPS_PORT, '0.0.0.0', () => console.log(`✓ HTTPS server listening on :${HTTPS_PORT}`));
      }

      // Start worker loop
      setInterval(processJobs, 3000);
    })
    .catch(err => {
      console.error('Fatal startup error:', err);
      process.exit(1);
    });
}

// ── Exports for tests ──────────────────────────────────────────────────────────
module.exports = {
  app, pool, processJobs, ensureCerts, runMigrations, callOllamaServer, callOmdb,
  parseJsonArray, jobId, reviewItemId, analyticsId, logScanAnalytics, logActivity,
  withRetry, normalizeTitleForLookup, levenshteinDistance, enhancedLookup
};