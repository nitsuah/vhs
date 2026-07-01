// ── DATABASE ──────────────────────────────────────────────────────────────────
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const { withRetry } = require('./retry');
const { LOG_LIMIT } = require('./config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.DATABASE_URL || '').includes('neon')
    ? { rejectUnauthorized: false }
    : false,
});

async function runMigrations() {
  await withRetry(() => pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `));
  const migrationsDir = path.join(__dirname, '..', '..', 'migrations');
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

module.exports = { pool, runMigrations };