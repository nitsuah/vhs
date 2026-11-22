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

  const ollamaConfigured = !!String(process.env.OLLAMA_UPSTREAM || '').trim();
  const ollamaSkipped = !ollamaConfigured && !!getAiBinding(); // same rule as getOllamaStatus()

  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch (e) {
    dbOk = false;
  }

  if (!ollamaSkipped) {
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
  }

  const ollamaState = ollamaSkipped ? 'not configured' : (ollamaOk ? 'ok' : 'error');

  logActivity('info', `Health check: DB ${dbOk ? 'ok' : 'error'}, Ollama ${ollamaSkipped ? 'not configured' : (ollamaOk ? 'ok' : 'unreachable')}, models: ${models.join(', ') || 'none'}`);

  const backend = resolveBackend();
  const usage = await getUsageToday();
  const workersAi = getAiBinding()
    ? (usage.atCap ? 'capped' : 'ok')
    : 'unavailable';
  const vision = {
    backend,
    model: backend === 'workers-ai' ? WORKERS_AI_MODEL : OLLAMA_MODEL,
    workersAi,
    ollama: ollamaState,
    scansToday: usage.scansToday,
    scanCap: usage.scanCap || VISION_DAILY_CAP,
  };
  if (!ollamaSkipped) {
    vision.ollamaModels = models;
  }

  const topLevel = {
    status: dbOk ? 'ok' : 'error',
    db: dbOk ? 'ok' : 'error',
    ollama: ollamaState,
    vision,
    ts: new Date().toISOString()
  };
  if (!ollamaSkipped) {
    topLevel.ollamaModels = models;
  }

  if (!dbOk) {
    return res.status(503).json(topLevel);
  }

  res.json(topLevel);
}

module.exports = { healthHandler };
