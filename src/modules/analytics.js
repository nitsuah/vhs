// ── SCAN ANALYTICS ────────────────────────────────────────────────────────────
const { pool } = require('./db');
const { analyticsId } = require('./ids');

async function logScanAnalytics({ jobId: jid, aiModel, suggestions, omdbVerified = false, ownerId = null }) {
  try {
    await pool.query(
      'INSERT INTO scan_analytics(id,captured_at,job_id,ai_model,suggestions,omdb_verified,action,owner_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [analyticsId(), new Date().toISOString(), jid, aiModel, JSON.stringify(suggestions), omdbVerified, 'pending', ownerId]
    );
  } catch (e) {
    console.warn('Analytics log error:', e.message);
  }
}

module.exports = { logScanAnalytics };