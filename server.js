'use strict';
const express = require('express');
const { Pool } = require('pg');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

// ── Activity log ring buffer ──────────────────────────────────────────────────
const LOG_LIMIT = 200;
const activityLog = [];
const logClients = new Set();

function logActivity(level, msg) {
  const entry = { ts: new Date().toISOString(), level, msg };
  activityLog.push(entry);
  if (activityLog.length > LOG_LIMIT) activityLog.shift();
  const line = `data: ${JSON.stringify(entry)}\n\n`;
  logClients.forEach(res => { try { res.write(line); } catch {} });
}

// Intercept console so all server output also feeds the activity log
const _origLog  = console.log.bind(console);
const _origWarn = console.warn.bind(console);
console.log  = (...a) => { _origLog(...a);  logActivity('info', a.join(' ')); };
console.warn = (...a) => { _origWarn(...a); logActivity('warn', a.join(' ')); };

const app = express();
const PORT       = parseInt(process.env.PORT       || '8080', 10);
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '8443', 10);
const OLLAMA     = process.env.OLLAMA_UPSTREAM || 'http://ollama:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llava:7b';
const HOST_IP    = (process.env.HOST_IP || '').trim();
const CERT_DIR   = '/app/certs';

app.use(express.json({ limit: '50mb' }));

// ── Database ─────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.DATABASE_URL || '').includes('neon')
    ? { rejectUnauthorized: false }
    : false,
});

async function withRetry(fn, maxAttempts = 5, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); }
    catch (err) {
      if (attempt === maxAttempts) throw err;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.warn(`Attempt ${attempt}/${maxAttempts} failed: ${err.message} — retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function runMigrations() {
  await withRetry(() => pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `));
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  const { rows } = await pool.query('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map(r => r.version));
  for (const file of files) {
    if (applied.has(file)) { console.log(`  ↷ ${file}`); continue; }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations(version,applied_at) VALUES($1,$2)', [file, new Date().toISOString()]);
    console.log(`  ✓ ${file}`);
  }
  console.log('✓ Migrations complete');
}

// ── TLS cert generation ───────────────────────────────────────────────────────
function ensureCerts() {
  const caKey  = path.join(CERT_DIR, 'ca.key');
  const caCert = path.join(CERT_DIR, 'ca.crt');
  const srvKey = path.join(CERT_DIR, 'server.key');
  const srvCrt = path.join(CERT_DIR, 'server.crt');

  if (fs.existsSync(srvCrt) && fs.existsSync(srvKey) && fs.existsSync(caCert)) {
    console.log('✓ TLS certs loaded from', CERT_DIR);
    return;
  }

  console.log('⟳ Generating self-signed CA + server cert…');
  fs.mkdirSync(CERT_DIR, { recursive: true });

  const sanParts = ['DNS:localhost', 'IP:127.0.0.1'];
  if (HOST_IP) sanParts.push(`IP:${HOST_IP}`);
  const san = sanParts.join(',');

  const extFile = path.join(CERT_DIR, 'ext.cnf');
  fs.writeFileSync(extFile, `[SAN]\nsubjectAltName=${san}\n`);

  execSync(`openssl genrsa -out "${caKey}" 2048`);
  execSync(`openssl req -new -x509 -days 3650 -key "${caKey}" -out "${caCert}" -subj "/CN=VHS Scanner Local CA/O=VHS Scanner"`);
  execSync(`openssl genrsa -out "${srvKey}" 2048`);
  execSync(`openssl req -new -key "${srvKey}" -out "${CERT_DIR}/server.csr" -subj "/CN=VHS Scanner/O=VHS Scanner"`);
  execSync(`openssl x509 -req -days 3650 -in "${CERT_DIR}/server.csr" -CA "${caCert}" -CAkey "${caKey}" -CAcreateserial -out "${srvCrt}" -extensions SAN -extfile "${extFile}"`);

  console.log(`✓ TLS certs generated (SAN: ${san})`);
}

// ── Ollama server-side caller ─────────────────────────────────────────────────
const SCAN_PROMPT = `You are cataloging VHS tapes from a photo for a collection database.

First, determine what the image shows:
- SPINE view: narrow vertical tape edge, text printed sideways/rotated 90° along the edge
- COVER view: full box face with artwork and prominently placed title text

For each tape visible, extract:
- title: the main title text (REQUIRED — your best reading even if partially obscured)
- year: 4-digit release year only if clearly visible (omit if uncertain)
- label: studio or distributor name only if clearly readable (omit if uncertain)
- format: almost always "VHS"
- confidence: "high" if clearly readable, "medium" if partially legible, "low" if a best guess

Output ONLY a JSON array — no other text:
[{"title":"Title Here","year":"1984","label":"Orion","format":"VHS","confidence":"high"}]

Rules: SPINE = mentally rotate 90° to read vertical text. COVER = largest/most prominent text is the title.
Do NOT hallucinate titles — only output text you can actually see in the image.
A "low" confidence entry is better than omitting it. Return [] only if truly unreadable.`;

function parseJsonArray(txt) {
  const m = (txt || '').trim().match(/\[[\s\S]*\]/);
  if (!m) return [];
  try { return JSON.parse(m[0]); } catch { return []; }
}

async function callOllamaServer(base64) {
  const res = await fetch(`${OLLAMA}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt: SCAN_PROMPT, images: [base64], stream: false }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  return parseJsonArray(data.response || '');
}

// ── OMDb lookup ───────────────────────────────────────────────────────────────
const OMDB_API_KEY = (process.env.OMDB_API_KEY || '').trim();

async function callOmdb({ title, imdbId }, apiKey) {
  if (!apiKey) return null;
  const params = new URLSearchParams({ apikey: apiKey });
  if (imdbId) { params.set('i', imdbId); }
  else { params.set('t', title); params.set('type', 'movie'); }
  const r = await fetch(`https://www.omdbapi.com/?${params}`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) return null;
  const d = await r.json();
  if (d.Response === 'False' || !d.Title) return null;
  return {
    title:   d.Title,
    year:    (d.Year || '').match(/\d{4}/)?.[0] || '',
    label:   d.Production || '',
    imdb_id: d.imdbID || '',
  };
}

// ── Job / review helpers ──────────────────────────────────────────────────────
function jobId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function reviewItemId() {
  return `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function analyticsId() {
  return `anl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function logScanAnalytics(pool, { jobId: jid, aiModel, suggestions, omdbVerified = false }) {
  try {
    await pool.query(
      'INSERT INTO scan_analytics(id,captured_at,job_id,ai_model,suggestions,omdb_verified,action) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [analyticsId(), new Date().toISOString(), jid, aiModel, JSON.stringify(suggestions), omdbVerified, 'pending']
    );
  } catch (e) {
    console.warn('Analytics log error:', e.message);
  }
}

app.post('/api/jobs', async (req, res) => {
  const { image, thumb } = req.body;
  if (!image) return res.status(400).json({ error: 'image required' });
  const id = jobId();
  const now = new Date().toISOString();
  try {
    await pool.query(
      'INSERT INTO upload_jobs(id,image_data,thumb,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6)',
      [id, image, thumb || null, 'pending', now, now]
    );
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Review items (cross-session queue) ───────────────────────────────────────
app.get('/api/review/pending', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, job_id, data, thumb, source, status, fail_reason, created_at FROM review_items WHERE status IN ('pending','failed') ORDER BY created_at ASC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/review/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM review_items WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Record final outcome (accepted/corrected/discarded) for scan analytics
app.post('/api/analytics/outcome', async (req, res) => {
  const { job_id, action, final_title, final_year, final_label, imdb_id } = req.body;
  if (!job_id || !action) return res.status(400).json({ error: 'job_id and action required' });
  try {
    await pool.query(
      `UPDATE scan_analytics SET action=$1, final_title=$2, final_year=$3, final_label=$4, imdb_id=$5
       WHERE job_id=$6`,
      [action, final_title || null, final_year || null, final_label || null, imdb_id || null, job_id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// Keep /api/jobs/ready for legacy compatibility (returns empty now — review_items replaced it)
app.get('/api/jobs/ready', async (_req, res) => {
  res.json([]);
});

app.post('/api/jobs/:id/retry', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "UPDATE upload_jobs SET status='pending', retry_count=0, error=NULL, updated_at=$1 WHERE id=$2",
      [new Date().toISOString(), req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Jobs that are in-flight (pending/processing) or transiently failed (will be retried)
app.get('/api/jobs/inflight', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, thumb, created_at, status, retry_count FROM upload_jobs
       WHERE status IN ('pending','processing')
          OR (status='failed' AND retry_count<$1)
       ORDER BY created_at ASC`,
      [MAX_RETRIES]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/status', async (_req, res) => {
  try {
    const [jobsRes, reviewRes] = await Promise.all([
      pool.query('SELECT status, COUNT(*) as count FROM upload_jobs GROUP BY status'),
      pool.query("SELECT COUNT(*) as count FROM review_items WHERE status='pending'"),
    ]);
    const counts = { pending: 0, processing: 0, done: 0, failed: 0, review_pending: 0 };
    jobsRes.rows.forEach(r => { counts[r.status] = parseInt(r.count, 10); });
    counts.review_pending = parseInt(reviewRes.rows[0]?.count || '0', 10);
    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, status, result, error, retry_count FROM upload_jobs WHERE id=$1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/lookup/barcode/:code', async (req, res) => {
  const code = req.params.code.trim().replace(/\s/g, '');
  if (!code) return res.status(400).json({ error: 'code required' });
  const omdbKey = (req.headers['x-omdb-key'] || OMDB_API_KEY).trim();

  let found = null;

  // 1. UPC Item DB — covers most North American retail product codes
  try {
    const r = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`,
      { signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json' } }
    );
    if (r.ok) {
      const d = await r.json();
      const item = d.items?.[0];
      if (item?.title?.trim()) {
        found = { title: item.title.trim(), label: item.brand || '', year: '', source: 'upcitemdb' };
      }
    }
  } catch (e) { console.warn('UPC lookup:', e.message); }

  // 2. Open Library — for ISBN-13 codes (978/979 prefix, 13 digits)
  if (!found && /^97[89]\d{10}$/.test(code)) {
    try {
      const r = await fetch(
        `https://openlibrary.org/isbn/${code}.json`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (r.ok) {
        const d = await r.json();
        if (d.title) {
          found = {
            title: d.title,
            label: Array.isArray(d.publishers) ? (d.publishers[0] || '') : '',
            year:  (d.publish_date || '').match(/\d{4}/)?.[0] || '',
            source: 'openlibrary',
          };
        }
      }
    } catch (e) { console.warn('Open Library lookup:', e.message); }
  }

  if (!found) return res.status(404).json({ error: 'not found' });

  // 3. Enrich with OMDb for authoritative year + IMDB id
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

  const prompt = `You are a VHS collectibles expert. For the title: "${title.replace(/"/g, '\\"')}"
Return ONLY a JSON object — no other text:
{"year":"1984","label":"Orion Pictures","format":"VHS","value_low":"8","value_high":"25"}
Rules: year=4-digit release year, label=VHS distributor/studio, value_low/value_high=USD resale range in good condition.
Omit fields you are unsure about. Return {} if completely unknown.`;

  const [ollamaRes, omdbRes] = await Promise.allSettled([
    fetch(`${OLLAMA}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, options: { num_predict: 200 } }),
      signal: AbortSignal.timeout(30000),
    }).then(async r => {
      if (!r.ok) throw new Error(`Ollama ${r.status}`);
      const data = await r.json();
      const m = (data.response || '').match(/\{[\s\S]*?\}/);
      try { return m ? JSON.parse(m[0]) : {}; } catch { return {}; }
    }),
    callOmdb({ title }, omdbKey),
  ]);

  const base = ollamaRes.status === 'fulfilled' ? (ollamaRes.value || {}) : {};
  const omdb  = omdbRes.status  === 'fulfilled' ? omdbRes.value  : null;

  const merged = { ...base };
  if (omdb?.year)    merged.year    = omdb.year;
  if (omdb?.imdb_id) merged.imdb_id = omdb.imdb_id;
  if (omdb?.label && !merged.label) merged.label = omdb.label;

  res.json(merged);
});

app.delete('/api/jobs/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM upload_jobs WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Permanently-failed jobs are now auto-converted to review_items by the worker

// Reset failed jobs so they get re-queued on next worker tick
app.post('/api/jobs/retry-failed', async (_req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE upload_jobs SET status='pending', retry_count=0, updated_at=$1 WHERE status='failed'`,
      [new Date().toISOString()]
    );
    res.json({ requeued: rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Background worker — picks pending jobs, calls Ollama, creates review_items; retries up to 3×
const MAX_RETRIES = 3;
let workerBusy = false;
async function processJobs() {
  if (workerBusy) return;
  workerBusy = true;
  try {
    const now = new Date().toISOString();
    const stuckCutoff    = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const retryCutoff    = new Date(Date.now() -      60 * 1000).toISOString();

    await pool.query(
      "UPDATE upload_jobs SET status='pending', updated_at=$1 WHERE status='processing' AND updated_at<$2",
      [now, stuckCutoff]
    );
    await pool.query(
      "UPDATE upload_jobs SET status='pending', updated_at=$1 WHERE status='failed' AND retry_count<$2 AND updated_at<$3",
      [now, MAX_RETRIES, retryCutoff]
    );

    // Convert permanently-failed jobs into review_items so they surface cross-session
    const { rows: permFailed } = await pool.query(
      "SELECT id, thumb, error FROM upload_jobs WHERE status='failed' AND retry_count>=$1",
      [MAX_RETRIES]
    );
    for (const pf of permFailed) {
      await pool.query(
        'INSERT INTO review_items(id,job_id,data,thumb,source,status,fail_reason,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [reviewItemId(), pf.id, '{}', pf.thumb, 'scan', 'failed', pf.error || 'Analysis failed after max retries', now]
      );
      await pool.query('DELETE FROM upload_jobs WHERE id=$1', [pf.id]);
      console.warn(`✗ Job ${pf.id} permanently failed → review_items`);
    }

    const { rows } = await pool.query(
      "SELECT id, image_data, thumb FROM upload_jobs WHERE status='pending' ORDER BY created_at ASC LIMIT 1"
    );
    if (!rows.length) return;
    const job = rows[0];
    await pool.query("UPDATE upload_jobs SET status='processing', updated_at=$1 WHERE id=$2", [now, job.id]);
    console.log(`⟳ Ollama: sending job ${job.id} to ${OLLAMA} (model: ${OLLAMA_MODEL})`);

    try {
      // Guard against duplicate review_items if a stuck-job reset caused double-processing
      const { rows: existingItems } = await pool.query(
        'SELECT id FROM review_items WHERE job_id=$1 LIMIT 1', [job.id]
      );
      if (existingItems.length) {
        await pool.query('DELETE FROM upload_jobs WHERE id=$1', [job.id]);
        console.log(`↷ Job ${job.id}: review_item already exists — skipping duplicate`);
        return;
      }

      const result = await callOllamaServer(job.image_data);
      const ts = new Date().toISOString();
      console.log(`✓ Ollama: job ${job.id} → ${result.length} tape(s): ${result.map(r=>r.title||'?').join(', ')}`);

      if (!result.length) {
        // Honest no-detection — do NOT retry, surface immediately so user can re-scan
        await pool.query(
          'INSERT INTO review_items(id,job_id,data,thumb,source,status,fail_reason,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [reviewItemId(), job.id, '{}', job.thumb, 'scan', 'failed', 'No tapes detected — try better lighting or adjust the crop box', ts]
        );
        await logScanAnalytics(pool, { jobId: job.id, aiModel: OLLAMA_MODEL, suggestions: [] });
      } else {
        // Enrich each detected tape with OMDb if available (verifies title + gets imdb_id)
        const enriched = await Promise.all(result.map(async item => {
          if (!item.title || !OMDB_API_KEY) return item;
          const omdb = await callOmdb({ title: item.title }, OMDB_API_KEY).catch(() => null);
          if (omdb?.imdb_id) {
            console.log(`  OMDb verified "${item.title}" → "${omdb.title}" (${omdb.imdb_id})`);
            return { ...item, title: omdb.title || item.title, year: omdb.year || item.year, imdb_id: omdb.imdb_id };
          }
          return item;
        }));

        const omdbVerified = enriched.some(i => i.imdb_id);
        await logScanAnalytics(pool, { jobId: job.id, aiModel: OLLAMA_MODEL, suggestions: enriched, omdbVerified });

        for (const item of enriched) {
          await pool.query(
            'INSERT INTO review_items(id,job_id,data,thumb,source,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
            [reviewItemId(), job.id, JSON.stringify({ ...item, condition: item.condition || 'good', status: 'in_collection' }), job.thumb, 'scan', 'pending', ts]
          );
        }
      }
      await pool.query('DELETE FROM upload_jobs WHERE id=$1', [job.id]);
      console.log(`✓ Job ${job.id}: ${result.length} tape(s) → review_items`);
    } catch (err) {
      await pool.query(
        "UPDATE upload_jobs SET status='failed', error=$1, updated_at=$2, retry_count=retry_count+1 WHERE id=$3",
        [err.message, new Date().toISOString(), job.id]
      );
      console.warn(`✗ Job ${job.id} failed (will retry):`, err.message);
    }
  } catch (err) {
    console.warn('Worker error:', err.message);
  } finally {
    workerBusy = false;
  }
}

// ── System health ─────────────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  const result = { db: 'unknown', ollama: 'unknown', ts: new Date().toISOString() };
  try {
    await pool.query('SELECT 1');
    result.db = 'ok';
  } catch (err) {
    result.db = 'error';
    result.dbError = err.message;
  }
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const d = await r.json();
      result.ollama = 'ok';
      result.ollamaModels = (d.models || []).map(m => m.name);
    } else {
      result.ollama = 'error';
      result.ollamaError = `HTTP ${r.status}`;
    }
  } catch (err) {
    result.ollama = 'error';
    result.ollamaError = err.message;
  }
  res.status(result.db === 'ok' ? 200 : 503).json(result);
});

// ── Activity log ─────────────────────────────────────────────────────────────
app.get('/api/logs', (_req, res) => res.json(activityLog));

app.get('/api/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  // Send recent history so the UI catches up immediately
  activityLog.forEach(e => res.write(`data: ${JSON.stringify(e)}\n\n`));
  logClients.add(res);
  req.on('close', () => logClients.delete(res));
});

// ── REST API ──────────────────────────────────────────────────────────────────
app.get('/api/tapes', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT data FROM tapes ORDER BY scanned_at DESC');
    res.json(rows.map(r => r.data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tapes', async (req, res) => {
  const tape = req.body;
  try {
    await pool.query(
      'INSERT INTO tapes(id, data, scanned_at) VALUES($1, $2, $3)',
      [tape.id, tape, tape.scanned_at || new Date().toISOString()]
    );
    res.status(201).json(tape);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tapes/:id', async (req, res) => {
  const tape = req.body;
  try {
    const { rowCount } = await pool.query(
      'UPDATE tapes SET data=$1, scanned_at=$2 WHERE id=$3',
      [tape, tape.scanned_at || new Date().toISOString(), req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'not found' });
    res.json(tape);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tapes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM tapes WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CA cert download ──────────────────────────────────────────────────────────
app.get('/ca.crt', (_req, res) => {
  const caCert = path.join(CERT_DIR, 'ca.crt');
  if (!fs.existsSync(caCert)) return res.status(404).send('Cert not yet generated — restart the container.');
  res.setHeader('Content-Type', 'application/x-x509-ca-cert');
  res.setHeader('Content-Disposition', 'attachment; filename="vhs-scanner-ca.crt"');
  res.sendFile(caCert);
});

// ── Ollama proxy ──────────────────────────────────────────────────────────────
app.use(
  '/api/ollama',
  createProxyMiddleware({
    target: OLLAMA,
    changeOrigin: true,
    pathRewrite: { '^/api/ollama': '' },
    proxyTimeout: 300000,
    timeout: 300000,
    on: {
      error: (err, _req, res) => {
        res.status(502).json({ error: 'Ollama unavailable: ' + err.message });
      },
    },
  })
);

// ── Static ────────────────────────────────────────────────────────────────────
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, { index: false }));
app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

// ── Boot ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set. Copy .env.example to .env and add your Neon connection string.');
    process.exit(1);
  }

  ensureCerts();

  runMigrations()
    .then(async () => {
      // One-time backfill: convert any pre-migration 'done' upload_jobs into review_items
      const { rows: done } = await pool.query("SELECT id, result, thumb, created_at FROM upload_jobs WHERE status='done'");
      if (done.length) {
        console.log(`⟳ Backfilling ${done.length} done upload_jobs → review_items…`);
        for (const job of done) {
          const items = Array.isArray(job.result) ? job.result : [];
          for (const item of items) {
            await pool.query(
              'INSERT INTO review_items(id,job_id,data,thumb,source,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
              [reviewItemId(), job.id, JSON.stringify({ ...item, condition: item.condition || 'good', status: 'in_collection' }), job.thumb, 'scan', 'pending', job.created_at]
            );
          }
          await pool.query('DELETE FROM upload_jobs WHERE id=$1', [job.id]);
        }
        console.log(`✓ Backfill complete`);
      }
    })
    .then(() => {
      setInterval(processJobs, 5000);
      processJobs();

      app.listen(PORT, () => console.log(`✓ VHS Scanner HTTP  on :${PORT}`));

      const tlsOpts = {
        key:  fs.readFileSync(path.join(CERT_DIR, 'server.key')),
        cert: fs.readFileSync(path.join(CERT_DIR, 'server.crt')),
      };
      https.createServer(tlsOpts, app).listen(HTTPS_PORT, () => {
        console.log(`✓ VHS Scanner HTTPS on :${HTTPS_PORT}`);
        if (HOST_IP) {
          console.log(`  → Install CA : http://${HOST_IP}:${PORT}/ca.crt`);
          console.log(`  → App (HTTPS): https://${HOST_IP}:${HTTPS_PORT}`);
        }
      });
    })
    .catch(err => { console.error('DB init failed:', err.message); process.exit(1); });
}

module.exports = { app, pool };
