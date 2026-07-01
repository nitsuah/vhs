// ── ROUTES: HEALTH ────────────────────────────────────────────────────────────
const { pool } = require('./db');
const { logActivity } = require('./activity-log');
const { OLLAMA } = require('./config');

async function healthHandler(req, res) {
  try {
    await pool.query('SELECT 1');
    const ollamaRes = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const ollamaOk = ollamaRes.ok;
    const data = ollamaOk ? await ollamaRes.json() : null;
    const models = data?.models?.map(m => m.name) || [];
    const hasModel = models.some(m => m.startsWith(process.env.OLLAMA_MODEL?.split(':')[0] || 'llava'));

    logActivity('info', `Health check: DB ok, Ollama ${ollamaOk ? 'ok' : 'unreachable'}, models: ${models.join(', ') || 'none'}`);

    res.json({
      status: 'ok',
      db: 'ok',
      ollama: ollamaOk ? 'ok' : 'unreachable',
      ollamaModel: hasModel ? process.env.OLLAMA_MODEL : 'not pulled',
      models,
      ts: new Date().toISOString()
    });
  } catch (e) {
    logActivity('warn', `Health check failed: ${e.message}`);
    res.status(500).json({ status: 'error', db: 'error', ollama: 'error', error: e.message });
  }
}

module.exports = { healthHandler };