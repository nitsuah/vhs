'use strict';
const express = require('express');
const { Pool } = require('pg');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

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

async function initDb() {
  await withRetry(() => pool.query(`
    CREATE TABLE IF NOT EXISTS tapes (
      id         TEXT PRIMARY KEY,
      data       JSONB NOT NULL,
      scanned_at TEXT NOT NULL
    )
  `));
  await pool.query(`
    CREATE TABLE IF NOT EXISTS upload_jobs (
      id          TEXT PRIMARY KEY,
      image_data  TEXT NOT NULL,
      thumb       TEXT,
      status      TEXT NOT NULL DEFAULT 'pending',
      result      JSONB,
      error       TEXT,
      retry_count INT NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    )
  `);
  await pool.query(`ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0`).catch(() => {});
  console.log('✓ Database ready');
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
const SCAN_PROMPT = `You are reading VHS tape labels from a photo. The photo may show one or more tapes.
VHS spines are the narrow edges of cassettes — title text is often printed sideways (rotated 90°).
For each tape, read: title (required), year (4 digits if visible), label (studio name if visible), format (almost always "VHS").
Output ONLY a JSON array: [{"title":"Title Here","year":"1984","label":"Orion","format":"VHS"}]
Include every tape you can make out, even partial readings. Return [] if truly unreadable.`;

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

// ── Job queue ─────────────────────────────────────────────────────────────────
function jobId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

app.get('/api/jobs/ready', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, thumb, result, created_at FROM upload_jobs WHERE status='done' ORDER BY created_at ASC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/status', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT status, COUNT(*) as count FROM upload_jobs GROUP BY status`);
    const counts = { pending: 0, processing: 0, done: 0, failed: 0 };
    rows.forEach(r => { counts[r.status] = parseInt(r.count, 10); });
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
        return res.json({ title: item.title.trim(), label: item.brand || '', year: '', source: 'upcitemdb' });
      }
    }
  } catch (e) { console.warn('UPC lookup:', e.message); }

  // 2. Open Library — for ISBN-13 codes (978/979 prefix, 13 digits)
  if (/^97[89]\d{10}$/.test(code)) {
    try {
      const r = await fetch(
        `https://openlibrary.org/isbn/${code}.json`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (r.ok) {
        const d = await r.json();
        if (d.title) {
          const year = (d.publish_date || '').match(/\d{4}/)?.[0] || '';
          const label = Array.isArray(d.publishers) ? (d.publishers[0] || '') : '';
          return res.json({ title: d.title, label, year, source: 'openlibrary' });
        }
      }
    } catch (e) { console.warn('Open Library lookup:', e.message); }
  }

  res.status(404).json({ error: 'not found' });
});

app.get('/api/lookup', async (req, res) => {
  const title = (req.query.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title required' });
  const prompt = `You are a VHS collectibles expert. For the title: "${title.replace(/"/g, '\\"')}"
Return ONLY a JSON object — no other text:
{"year":"1984","label":"Orion Pictures","format":"VHS","value_low":"8","value_high":"25"}
Rules: year=4-digit release year, label=VHS distributor/studio, value_low/value_high=USD resale range in good condition.
Omit fields you are unsure about. Return {} if completely unknown.`;
  try {
    const r = await fetch(`${OLLAMA}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, options: { num_predict: 200 } }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return res.status(502).json({ error: `Ollama ${r.status}` });
    const data = await r.json();
    const m = (data.response || '').match(/\{[\s\S]*?\}/);
    try { res.json(m ? JSON.parse(m[0]) : {}); } catch { res.json({}); }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/jobs/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM upload_jobs WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all permanently-failed jobs (retry_count >= MAX_RETRIES)
app.delete('/api/jobs/failed/all', async (_req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM upload_jobs WHERE status='failed' AND retry_count>=$1`, [MAX_RETRIES]
    );
    res.json({ deleted: rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// Background worker — picks pending jobs, calls Ollama, saves results; retries failures up to 3×
const MAX_RETRIES = 3;
let workerBusy = false;
async function processJobs() {
  if (workerBusy) return;
  workerBusy = true;
  try {
    const now = new Date().toISOString();
    // Reset jobs stuck in 'processing' for >10 min (server restart or crash)
    const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await pool.query(
      "UPDATE upload_jobs SET status='pending', updated_at=$1 WHERE status='processing' AND updated_at<$2",
      [now, stuckCutoff]
    );
    // Re-queue failed jobs with retries remaining (wait at least 60s between attempts)
    const retryCutoff = new Date(Date.now() - 60 * 1000).toISOString();
    await pool.query(
      "UPDATE upload_jobs SET status='pending', updated_at=$1 WHERE status='failed' AND retry_count<$2 AND updated_at<$3",
      [now, MAX_RETRIES, retryCutoff]
    );

    const { rows } = await pool.query(
      "SELECT id, image_data, thumb FROM upload_jobs WHERE status='pending' ORDER BY created_at ASC LIMIT 1"
    );
    if (!rows.length) return;
    const job = rows[0];
    await pool.query("UPDATE upload_jobs SET status='processing', updated_at=$1 WHERE id=$2", [new Date().toISOString(), job.id]);
    try {
      const result = await callOllamaServer(job.image_data);
      await pool.query(
        "UPDATE upload_jobs SET status='done', result=$1, updated_at=$2 WHERE id=$3",
        [JSON.stringify(result), new Date().toISOString(), job.id]
      );
      console.log(`✓ Job ${job.id}: ${result.length} tape(s) found`);
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
const indexHtml = path.join(__dirname, 'index.html');
app.get('*', (_req, res) => res.sendFile(indexHtml));

// ── Boot ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set. Copy .env.example to .env and add your Neon connection string.');
    process.exit(1);
  }

  ensureCerts();

  initDb()
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
