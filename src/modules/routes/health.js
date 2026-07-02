// ── ROUTES: HEALTH ────────────────────────────────────────────────────────────
const { pool } = require('../db');
const { logActivity } = require('../activity-log');
const { OLLAMA } = require('../config');

async function healthHandler(req, res) {
  let dbOk = false;
  let ollamaOk = false;
  let models = [];

  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch (e) {
    dbOk = false;
  }

  try {
    const ollamaRes = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) });
    ollamaOk = ollamaRes.ok;
    if (ollamaOk) {
      const data = await ollamaRes.json();
      models = data?.models?.map(m => m.name) || [];
    }
  } catch (e) {
    ollamaOk = false;
  }

  logActivity('info', `Health check: DB ${dbOk ? 'ok' : 'error'}, Ollama ${ollamaOk ? 'ok' : 'unreachable'}, models: ${models.join(', ') || 'none'}`);

  if (!dbOk) {
    return res.status(503).json({
      status: 'error',
      db: 'error',
      ollama: ollamaOk ? 'ok' : 'error',
      ollamaModels: models,
      ts: new Date().toISOString()
    });
  }

  res.json({
    status: 'ok',
    db: 'ok',
    ollama: ollamaOk ? 'ok' : 'error',
    ollamaModels: models,
    ts: new Date().toISOString()
  });
}

module.exports = { healthHandler };