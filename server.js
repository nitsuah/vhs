'use strict';
const express = require('express');
const { Pool } = require('pg');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

const app = express();
const PORT      = parseInt(process.env.PORT       || '8080', 10);
const HTTPS_PORT= parseInt(process.env.HTTPS_PORT || '8443', 10);
const OLLAMA    = process.env.OLLAMA_UPSTREAM || 'http://ollama:11434';
const HOST_IP   = (process.env.HOST_IP || '').trim();
const CERT_DIR  = '/app/certs';

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

  // Build SAN list — always include localhost; add HOST_IP if provided
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

// ── CA cert download (Android/iOS trust install) ──────────────────────────────
// Open http://<host>:8082/ca.crt on your phone → tap Install → trust it
// Then use https://<host>:8443 for camera access
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
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set. Copy .env.example to .env and add your Neon connection string.');
  process.exit(1);
}

ensureCerts();

initDb()
  .then(() => {
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
