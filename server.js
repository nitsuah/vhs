'use strict';
const express = require('express');
const { Pool } = require('pg');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);
const OLLAMA = process.env.OLLAMA_UPSTREAM || 'http://ollama:11434';

app.use(express.json({ limit: '50mb' }));

// ── Database ─────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.DATABASE_URL || '').includes('neon')
    ? { rejectUnauthorized: false }
    : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tapes (
      id         TEXT PRIMARY KEY,
      data       JSONB NOT NULL,
      scanned_at TEXT NOT NULL
    )
  `);
  console.log('✓ Database ready');
}

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
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set. Copy .env.example to .env and add your Neon connection string.');
  process.exit(1);
}

initDb()
  .then(() => app.listen(PORT, () => console.log(`✓ VHS Scanner on :${PORT}`)))
  .catch(err => { console.error('DB init failed:', err.message); process.exit(1); });
