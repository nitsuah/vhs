// ── ROUTES: HEALTH ────────────────────────────────────────────────────────────
const { pool } = require('../db');
const { logActivity } = require('../activity-log');
const { resolveOllamaUrl } = require('../ollama');
const { resolveBackend, getAiBinding, getUsageToday } = require('../vision');
const { WORKERS_AI_MODEL, OLLAMA_MODEL, VISION_DAILY_CAP } = require('../config');

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
    const upstream = await resolveOllamaUrl();
    const ollamaRes = await fetch(`${upstream}/api/tags`, { signal: AbortSignal.timeout(3000) });
    ollamaOk = ollamaRes.ok;
    if (ollamaOk) {
      const data = await ollamaRes.json();
      models = data?.models?.map(m => m.name) || [];
    }
  } catch (e) {
    ollamaOk = false;
  }

  logActivity('info', `Health check: DB ${dbOk ? 'ok' : 'error'}, Ollama ${ollamaOk ? 'ok' : 'unreachable'}, models: ${models.join(', ') || 'none'}`);

  const backend = resolveBackend();
  const usage = await getUsageToday();
  const workersAi = getAiBinding()
    ? (usage.atCap ? 'capped' : 'ok')
    : 'unavailable';
  const vision = {
    backend,
    model: backend === 'workers-ai' ? WORKERS_AI_MODEL : OLLAMA_MODEL,
    workersAi,
    ollama: ollamaOk ? 'ok' : 'error',
    ollamaModels: models,
    scansToday: usage.scansToday,
    scanCap: usage.scanCap || VISION_DAILY_CAP,
  };

  if (!dbOk) {
    return res.status(503).json({
      status: 'error',
      db: 'error',
      ollama: ollamaOk ? 'ok' : 'error',
      ollamaModels: models,
      vision,
      ts: new Date().toISOString()
    });
  }

  res.json({
    status: 'ok',
    db: 'ok',
    ollama: ollamaOk ? 'ok' : 'error',
    ollamaModels: models,
    vision,
    ts: new Date().toISOString()
  });
}

module.exports = { healthHandler };
