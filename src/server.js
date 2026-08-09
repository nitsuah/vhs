// ── VHS SHELF SCANNER SERVER ──────────────────────────────────────────────────
'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const { Pool } = require('pg');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const https = require('https');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { randomUUID } = require('crypto');

// ── SSRF protection moved inline to /api/fetch-image route (CodeQL sanitizer boundary)

// Local modules
const { PORT, HTTPS_PORT, OLLAMA, OMDB_API_KEY } = require('./modules/config');
const {
  ENABLED: AUTH_ENABLED,
  getAuthUrl, exchangeCode, mintJWT,
  setAuthCookie, clearAuthCookie,
  optionalAuth, requireAuth,
} = require('./modules/auth');
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
const { registerStaticAndProxy } = require('./modules/routes/system');

// ── App setup ──────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(optionalAuth); // sets req.user from JWT cookie when auth is enabled

// ── Activity log SSE endpoint ──────────────────────────────────────────────────
app.get('/api/logs', (req, res) => {
  const wantsSSE = req.headers.accept?.includes('text/event-stream');
  if (!wantsSSE) {
    // Regular request: return log array
    return res.json(getActivityLog());
  }
  // SSE stream
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

// ── API rate limiters ────────────────────────────────────────────────────────────
const tapeLimiter = rateLimit({
  windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false
});
const tapeWriteLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false
});
const defaultLimiter = rateLimit({
  windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false
});

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/api/health', healthHandler);

// ── System info ────────────────────────────────────────────────────────────────
app.get('/api/system', defaultLimiter, async (req, res) => {
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
app.get('/api/ca-cert', defaultLimiter, (req, res) => {
  const caCert = path.join('/app/certs', 'ca.crt');
  if (!fs.existsSync(caCert)) return res.status(404).json({ error: 'CA cert not found' });
  res.setHeader('Content-Type', 'application/x-x509-ca-cert');
  res.setHeader('Content-Disposition', 'attachment; filename="vhs-scanner-ca.crt"');
  res.sendFile(caCert);
});

// ── Auth ───────────────────────────────────────────────────────────────────────
app.get('/auth/me', defaultLimiter, (req, res) => {
  res.json({ enabled: AUTH_ENABLED, user: req.user || null });
});

app.get('/auth/google', defaultLimiter, (_req, res) => {
  if (!AUTH_ENABLED) return res.status(503).json({ error: 'auth not configured' });
  const state = randomUUID();
  res.cookie('oauth_state', state, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 10 * 60 * 1000 });
  res.redirect(getAuthUrl(state));
});

app.get('/auth/google/callback', defaultLimiter, async (req, res) => {
  if (!AUTH_ENABLED) return res.status(503).json({ error: 'auth not configured' });
  const { code, error, state } = req.query;
  if (error || !code) return res.redirect('/?auth=error');
  const cookieState = req.cookies?.oauth_state;
  res.clearCookie('oauth_state', { path: '/' });
  if (!state || !cookieState || state !== cookieState) return res.redirect('/?auth=error');
  try {
    const payload = await exchangeCode(String(code));
    // Upsert user into DB
    await pool.query(`
      INSERT INTO users(id, email, display_name, avatar_url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            avatar_url = EXCLUDED.avatar_url
    `, [payload.sub, payload.email, payload.name || null, payload.picture || null]);

    // One-time: claim all null-owner tapes for the designated legacy owner email.
    const legacyEmail = (process.env.LEGACY_OWNER_EMAIL || '').trim().toLowerCase();
    if (legacyEmail && payload.email.toLowerCase() === legacyEmail) {
      const { rowCount } = await pool.query(
        'UPDATE tapes SET owner_id = $1 WHERE owner_id IS NULL',
        [payload.sub]
      );
      if (rowCount > 0) console.log(`✓ Claimed ${rowCount} legacy tapes → ${payload.email}`);
    }

    setAuthCookie(res, mintJWT(payload));
    res.redirect('/?tab=collect');
  } catch (err) {
    console.error('OAuth callback error:', err.message);
    res.redirect('/?auth=error');
  }
});

app.post('/auth/logout', defaultLimiter, (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// Update sharing settings: toggle collection_public, get/generate share_slug
app.put('/api/auth/share', defaultLimiter, requireAuth, async (req, res) => {
  const { collection_public } = req.body;
  if (typeof collection_public !== 'boolean') {
    return res.status(400).json({ error: 'collection_public must be a boolean' });
  }
  const sub = req.user.sub;
  try {
    // Generate slug on first share if needed
    const { rows } = await pool.query('SELECT share_slug FROM users WHERE id=$1', [sub]);
    let slug = rows[0]?.share_slug;
    if (!slug && collection_public) {
      slug = randomUUID();
      await pool.query(
        'UPDATE users SET share_slug=$1, collection_public=$2 WHERE id=$3',
        [slug, collection_public, sub]
      );
    } else {
      await pool.query('UPDATE users SET collection_public=$1 WHERE id=$2', [collection_public, sub]);
    }
    res.json({ collection_public, share_slug: slug || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current user's share settings
app.get('/api/auth/share', defaultLimiter, requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT collection_public, share_slug FROM users WHERE id=$1',
      [req.user.sub]
    );
    const row = rows[0] || { collection_public: false, share_slug: null };
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Public share endpoint ───────────────────────────────────────────────────────
app.get('/api/share/:slug', defaultLimiter, async (req, res) => {
  try {
    const { rows: users } = await pool.query(
      'SELECT id, display_name, avatar_url FROM users WHERE share_slug=$1 AND collection_public=true',
      [req.params.slug]
    );
    if (!users.length) return res.status(404).json({ error: 'collection not found or private' });
    const owner = users[0];
    const { rows: tapes } = await pool.query(
      'SELECT data FROM tapes WHERE owner_id=$1 ORDER BY scanned_at DESC',
      [owner.id]
    );
    res.json({ owner, tapes: tapes.map(r => r.data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Tapes CRUD ─────────────────────────────────────────────────────────────────
app.get('/api/tapes', tapeLimiter, tapesGetHandler);
app.post('/api/tapes', tapeLimiter, requireAuth, tapesPostHandler);
app.put('/api/tapes/:id', tapeWriteLimiter, requireAuth, tapesPutHandler);
app.delete('/api/tapes/:id', tapeWriteLimiter, requireAuth, tapesDeleteHandler);

// ── Lookup endpoints ───────────────────────────────────────────────────────────
app.get('/api/lookup/barcode/:code', defaultLimiter, async (req, res) => {
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
        // Handle both formats: { ISBN:... } and direct response
        const b = d[key] || d;
        if (b && (b.title || b.publishers?.length)) {
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

app.get('/api/lookup', defaultLimiter, async (req, res) => {
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

  // If both fail, return empty object
  if (!omdb && (!ai || Object.keys(ai).length === 0)) {
    return res.json({});
  }

  const result = {
    title,
    year: omdb?.year || ai.year || '',
    label: omdb?.label || ai.label || '',
    format: ai.format || 'VHS',
    value_low: ai.value_low || '',
    value_high: ai.value_high || '',
    imdb_id: omdb?.imdb_id || '',
    poster: omdb?.poster && omdb.poster !== 'N/A' ? omdb.poster : undefined,
    source: omdb ? 'omdb_enhanced' : 'ai'
  };

  // Remove undefined poster
  if (result.poster === undefined) delete result.poster;

  res.json(result);
});

// ── YouTube trailer search ─────────────────────────────────────────────────────
app.get('/api/trailer', defaultLimiter, async (req, res) => {
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

// ── Rate limiter for job creation ───────────────────────────────────────────
const jobsCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

// ── Job endpoints ──────────────────────────────────────────────────────────────
app.post('/api/jobs', jobsCreateLimiter, async (req, res) => {
  const { image, barcode } = req.body;
  if (!image) return res.status(400).json({ error: 'image required' });
  const id = jobId();
  const now = new Date().toISOString();
  try {
    await pool.query(
      'INSERT INTO upload_jobs(id,image,barcode,status,created_at) VALUES($1,$2,$3,$4,$5)',
      [id, image, barcode || null, 'pending', now]
    );
    logActivity('info', `Upload job created: ${id}`);
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/fetch-image', defaultLimiter, async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).json({ error: 'url required' });
  // Coerce to string to prevent type confusion
  const raw = String(rawUrl);

  // ── SSRF protection: validate raw URL string BEFORE parsing
  // 1. Protocol
  if (!/^https?:\/\//i.test(raw)) return res.status(403).json({ error: 'url not allowed' });
  // 2. Parse host/path using regex (no URL object yet)
  const m = raw.match(/^https?:\/\/([^/]+)(\/.*)?$/i);
  if (!m) return res.status(403).json({ error: 'url not allowed' });
  const hostPort = m[1];
  const pathQuery = m[2] || '/';
  // 3. Reject credentials (user@host) — prevents allowlist bypass via userinfo confusion
  if (hostPort.includes('@')) return res.status(403).json({ error: 'url not allowed' });
  // 4. Reject IPv6 bracket notation — all IPv6 addresses are private or non-public
  if (hostPort.startsWith('[')) return res.status(403).json({ error: 'url not allowed' });
  // 5. Split host:port (safe: IPv6 already rejected above)
  const colonIdx = hostPort.indexOf(':');
  const host = colonIdx === -1 ? hostPort : hostPort.slice(0, colonIdx);
  const port = colonIdx === -1 ? '' : hostPort.slice(colonIdx + 1);
  // 6. Validate hostname
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return res.status(403).json({ error: 'url not allowed' });
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return res.status(403).json({ error: 'url not allowed' });
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return res.status(403).json({ error: 'url not allowed' });
  if (/^192\.168\.\d+\.\d+$/.test(host)) return res.status(403).json({ error: 'url not allowed' });
  if (/^169\.254\.\d+\.\d+$/.test(host)) return res.status(403).json({ error: 'url not allowed' });
  if (host.endsWith('.local') || host.endsWith('.internal')) return res.status(403).json({ error: 'url not allowed' });
  // 7. Validate port
  if (port && port !== '80' && port !== '443') return res.status(403).json({ error: 'url not allowed' });
  // 8. Host allowlist
  const allowlist = (process.env.FETCH_IMAGE_HOST_ALLOWLIST || '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean);
  if (!allowlist.length) return res.status(403).json({ error: 'url not allowed' });
  const isAllowedHost = allowlist.some(h => host === h || host.endsWith(`.${h}`));
  if (!isAllowedHost) return res.status(403).json({ error: 'url not allowed' });
  // 9. DNS resolution check (catches aliased private IPs and DNS rebinding at request time)
  const dns = require('dns').promises;
  const resolved = await dns.lookup(host, { all: true });
  for (const rec of resolved) {
    const ip = rec.address;
    if (
      ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0' ||
      /^10\.\d+\.\d+\.\d+$/.test(ip) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(ip) ||
      /^192\.168\.\d+\.\d+$/.test(ip) ||
      /^169\.254\.\d+\.\d+$/.test(ip) ||
      /^fc00:/i.test(ip) || /^fd/i.test(ip) || /^fe80:/i.test(ip)
    ) {
      return res.status(403).json({ error: 'url not allowed' });
    }
  }
  // 10. All checks passed — construct safe URL and fetch
  // redirect:'error' is required: without it a redirect to a private IP bypasses all checks above
  const proto = raw.startsWith('https:') ? 'https:' : 'http:';
  const safeUrl = `${proto}//${host}${port ? ':' + port : ''}${pathQuery}`;
  try {
    // codeql[js/ssrf] - validated: allowlisted host, DNS-checked, no-credentials, no-IPv6, port-restricted, redirects blocked
    const r = await fetch(safeUrl, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!r.ok) return res.status(404).json({ error: 'image not found' });
    const buf = await r.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');
    const ct = r.headers.get('content-type') || 'image/jpeg';
    res.json({ dataUrl: `data:${ct};base64,${b64}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/jobs/:id', defaultLimiter, async (req, res) => {
  try {
    await pool.query('DELETE FROM upload_jobs WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/jobs/retry-failed', defaultLimiter, async (_req, res) => {
  try {
    const { rowCount } = await pool.query("UPDATE upload_jobs SET status='pending' WHERE status='failed' AND retry_count<3");
    res.json({ ok: true, requeued: rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/ready', defaultLimiter, async (_req, res) => {
  res.json([]);
});

// ── Review endpoints ───────────────────────────────────────────────────────────
app.post('/api/review', defaultLimiter, async (req, res) => {
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

app.get('/api/review/pending', defaultLimiter, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, job_id, data, thumb, source, status, fail_reason, created_at FROM review_items WHERE status IN ('pending','failed') ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/review/:id', defaultLimiter, async (req, res) => {
  try {
    await pool.query('DELETE FROM review_items WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/status', defaultLimiter, async (_req, res) => {
  try {
    const [jobsRes, reviewRes] = await Promise.all([
      pool.query('SELECT status, COUNT(*) c FROM upload_jobs GROUP BY status'),
      pool.query("SELECT COUNT(*) c FROM review_items WHERE status='pending'")
    ]);
    const counts = { pending: 0, processing: 0, done: 0, failed: 0, review_pending: 0 };
    jobsRes.rows.forEach(r => { counts[r.status] = parseInt(r.c || r.count || '0', 10); });
    counts.review_pending = parseInt(reviewRes.rows[0]?.c || reviewRes.rows[0]?.count || '0', 10);
    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/inflight', defaultLimiter, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, thumb, created_at FROM upload_jobs WHERE status IN ('pending','processing') ORDER BY created_at"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/jobs/:id/retry', defaultLimiter, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "UPDATE upload_jobs SET status='pending', error=NULL, retry_count=retry_count+1 WHERE id=$1 AND status='failed' AND retry_count<3",
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'not found or not retryable' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/:id', defaultLimiter, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, status, result, error, retry_count FROM upload_jobs WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/jobs/:id', defaultLimiter, async (req, res) => {
  try {
    await pool.query('DELETE FROM upload_jobs WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/jobs/retry-failed', defaultLimiter, async (_req, res) => {
  try {
    const { rowCount } = await pool.query("UPDATE upload_jobs SET status='pending' WHERE status='failed' AND retry_count<3");
    res.json({ ok: true, requeued: rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Analytics ──────────────────────────────────────────────────────────────────
app.post('/api/analytics/outcome', defaultLimiter, async (req, res) => {
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

// ── Static files, Ollama proxy, SPA catch-all ──────────────────────────────────
registerStaticAndProxy(app);

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