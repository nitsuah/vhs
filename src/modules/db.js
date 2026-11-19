// ── DATABASE ──────────────────────────────────────────────────────────────────
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const { withRetry } = require('./retry');
const { LOG_LIMIT } = require('./config');

const { AsyncLocalStorage } = require('async_hooks');

function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: (() => {
      const url = process.env.DATABASE_URL || '';
      const host = url.replace(/^.*@/, '').replace(/[:/].*$/, '');
      return host.includes('neon')
        ? { rejectUnauthorized: true }
        : false;
    })(),
  });
}

// Cloudflare Workers can't reuse a socket opened by one request in another, so
// worker/index.js runs each request inside requestPool.run(createPool(), ...).
// Everywhere else (Node server, Netlify function, tests) the shared pool is used.
const sharedPool = createPool();
const requestPool = new AsyncLocalStorage();
const currentPool = () => requestPool.getStore() || sharedPool;

const pool = {
  query: (...args) => currentPool().query(...args),
  connect: (...args) => currentPool().connect(...args),
  end: (...args) => currentPool().end(...args),
  on: (...args) => currentPool().on(...args),
};

// bundled: optional [{ name, sql }] list (Workers have no readable migrations dir).
async function runMigrations(bundled) {
  await withRetry(() => pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `));
  const migrationsDir = path.join(__dirname, '..', '..', 'migrations');
  const sources = bundled
    ? new Map(bundled.map(m => [m.name, m.sql]))
    : null;
  const files = sources
    ? [...sources.keys()].sort()
    : fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  const { rows } = await pool.query('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map(r => r.version));
  for (const file of files) {
    if (applied.has(file)) { console.log(`  ↷ ${file}`); continue; }
    const sql = sources ? sources.get(file) : fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations(version,applied_at) VALUES($1,$2)', [file, new Date().toISOString()]);
    console.log(`  ✓ ${file}`);
  }
  console.log('✓ Migrations complete');
}

module.exports = { pool, runMigrations, createPool, requestPool };