// ── VISION BACKENDS ───────────────────────────────────────────────────────────
// Tape/cover recognition: Workers AI (default on Cloudflare) or local Ollama.
// Workers AI stays inside the free 10,000 neurons/day allocation via a UTC
// daily cap. Cap hits and Workers AI errors fall back to Ollama when it is
// reachable, otherwise the photo is queued for manual review — never a hard fail.

const { pool } = require('./db');
const { callOllamaServer, pingOllama } = require('./ollama');
const { parseJsonArray, parseJsonObject } = require('./json-parser');
const {
  SCAN_PROMPT,
  OLLAMA_MODEL,
  WORKERS_AI_MODEL,
  VISION_DAILY_CAP,
  NEURONS_PER_SCAN_EST,
} = require('./config');

const META_LICENSE_PROMPT = 'agree';

function getAiBinding() {
  return (typeof globalThis !== 'undefined' && globalThis.__CF_ENV && globalThis.__CF_ENV.AI) || null;
}

function resolveBackend() {
  const explicit = String(process.env.VISION_BACKEND || '').trim().toLowerCase();
  if (explicit === 'ollama' || explicit === 'workers-ai') return explicit;
  // Default: Workers AI on Cloudflare (AI binding present), Ollama elsewhere.
  return getAiBinding() ? 'workers-ai' : 'ollama';
}

function utcDay(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function stripDataUrl(base64) {
  return String(base64 || '').replace(/^data:[^;]+;base64,/i, '');
}

function toImageBytes(base64) {
  const buf = Buffer.from(stripDataUrl(base64), 'base64');
  return Array.from(buf);
}

function unwrapAiResult(result) {
  if (result && result.result && (result.result.response !== undefined || result.result.usage)) {
    return result.result;
  }
  return result;
}

function textFromAiResult(result) {
  if (result == null) return '';
  if (typeof result === 'string') return result;
  const body = unwrapAiResult(result);
  const response = body && body.response !== undefined ? body.response : body;
  if (typeof response === 'string') return response;
  if (Array.isArray(response) || (response && typeof response === 'object')) {
    try { return JSON.stringify(response); } catch { return ''; }
  }
  return '';
}

function itemsFromAiText(text) {
  const arr = parseJsonArray(text).filter((item) => item && item.title);
  if (arr.length) return arr;
  const obj = parseJsonObject(text);
  if (obj && obj.title) return [obj];
  return [];
}

function usageFromAiResult(result) {
  const body = unwrapAiResult(result) || {};
  const u = (result && (result.usage || body.usage)) || null;
  if (!u) return null;
  return {
    input_tokens: u.prompt_tokens || u.input_tokens || u.promptTokens || 0,
    output_tokens: u.completion_tokens || u.output_tokens || u.completionTokens || 0,
    neurons: u.neurons || u.neuron || null,
  };
}

function neuronsFromUsage(usage) {
  // @cf/meta/llama-3.2-11b-vision-instruct: 4410 neu/M input, 61493 neu/M output
  if (!usage) return NEURONS_PER_SCAN_EST;
  if (Number.isFinite(Number(usage.neurons)) && Number(usage.neurons) > 0) {
    return Number(usage.neurons);
  }
  const input = Number(usage.input_tokens) || 0;
  const output = Number(usage.output_tokens) || 0;
  return (input * 4410 + output * 61493) / 1e6;
}

function isLicenseAccepted(err) {
  const msg = String(err && (err.message || err) || '').toLowerCase();
  // Workers AI returns HTTP 403 with this message after a successful "agree".
  return /thank you for agreeing|you may now use the model/.test(msg);
}

function isLicenseError(err) {
  if (isLicenseAccepted(err)) return false;
  const msg = String(err && (err.message || err) || '').toLowerCase();
  return /agree|license|acceptable use|aup|meta license/.test(msg);
}

let licenseAgreed = false;

function resetVisionStateForTests() {
  licenseAgreed = false;
}

async function runWorkersAi(payload) {
  const ai = getAiBinding();
  if (!ai || typeof ai.run !== 'function') {
    throw new Error('Workers AI binding is not available');
  }
  return ai.run(WORKERS_AI_MODEL, payload);
}

async function ensureMetaLicense() {
  if (licenseAgreed) return;
  try {
    await runWorkersAi({ prompt: META_LICENSE_PROMPT });
    licenseAgreed = true;
  } catch (err) {
    // The official agree call is documented to return a 403 whose message is
    // "Thank you for agreeing... You may now use the model." Treat that as
    // success. Already-accepted accounts may also error; only keep trying
    // when the message still looks like a pending license prompt.
    if (isLicenseAccepted(err) || !isLicenseError(err)) licenseAgreed = true;
  }
}

async function callWorkersAiVision(base64) {
  await ensureMetaLicense();
  const image = toImageBytes(base64);
  if (!image.length) throw new Error('Image data was empty');
  const payload = {
    prompt: SCAN_PROMPT,
    image,
    max_tokens: 512,
    temperature: 0.2,
  };
  let result;
  try {
    result = await runWorkersAi(payload);
  } catch (err) {
    if (isLicenseError(err)) {
      licenseAgreed = false;
      await ensureMetaLicense();
      result = await runWorkersAi(payload);
    } else {
      throw err;
    }
  }
  const text = textFromAiResult(result);
  const items = itemsFromAiText(text);
  const usage = usageFromAiResult(result);
  return { items, usage, raw: text };
}

async function reserveScan() {
  const day = utcDay();
  const now = new Date().toISOString();
  try {
    const { rows } = await pool.query(
      `INSERT INTO vision_daily_usage (day, scans, neurons_est, updated_at)
       VALUES ($1, 1, 0, $2)
       ON CONFLICT (day) DO UPDATE
         SET scans = vision_daily_usage.scans + 1,
             updated_at = EXCLUDED.updated_at
         WHERE vision_daily_usage.scans < $3
       RETURNING scans`,
      [day, now, VISION_DAILY_CAP]
    );
    if (rows && rows.length) return { allowed: true, day, scans: rows[0].scans };
    return { allowed: false, day, reason: 'cap' };
  } catch (err) {
    // Don't block scans if the counter table isn't ready; fail open once,
    // but log so a missed migration is visible.
    console.warn('vision cap reserve failed:', err.message);
    return { allowed: true, day, scans: null, reserveError: err.message };
  }
}

async function releaseScan(day) {
  if (!day) return;
  try {
    await pool.query(
      `UPDATE vision_daily_usage
          SET scans = GREATEST(scans - 1, 0),
              updated_at = $2
        WHERE day = $1`,
      [day, new Date().toISOString()]
    );
  } catch (err) {
    console.warn('vision cap release failed:', err.message);
  }
}

async function recordNeurons(day, neurons) {
  if (!day || !Number.isFinite(neurons)) return;
  try {
    await pool.query(
      `UPDATE vision_daily_usage
          SET neurons_est = neurons_est + $2,
              updated_at = $3
        WHERE day = $1`,
      [day, neurons, new Date().toISOString()]
    );
  } catch (err) {
    console.warn('vision neuron record failed:', err.message);
  }
}

async function getUsageToday() {
  try {
    const { rows } = await pool.query(
      'SELECT scans, neurons_est FROM vision_daily_usage WHERE day = $1',
      [utcDay()]
    );
    const scans = rows[0] ? Number(rows[0].scans) || 0 : 0;
    const neurons = rows[0] ? Number(rows[0].neurons_est) || 0 : 0;
    return {
      scansToday: scans,
      neuronsEst: neurons,
      scanCap: VISION_DAILY_CAP,
      atCap: scans >= VISION_DAILY_CAP,
    };
  } catch {
    return { scansToday: null, neuronsEst: null, scanCap: VISION_DAILY_CAP, atCap: false };
  }
}

const CAP_MESSAGE = 'Daily free Workers AI scan cap reached. This photo was saved for manual review — add the title from the picture.';
const AI_ERROR_PREFIX = 'Workers AI could not read this photo';

async function recognizeTapes(base64) {
  const backend = resolveBackend();

  if (backend === 'ollama') {
    const items = await callOllamaServer(base64);
    return { items, model: OLLAMA_MODEL, backend: 'ollama', deferred: null, message: null, fallback: null };
  }

  const reserved = await reserveScan();
  if (!reserved.allowed) {
    if (await pingOllama()) {
      try {
        const items = await callOllamaServer(base64);
        return {
          items,
          model: OLLAMA_MODEL,
          backend: 'ollama',
          fallback: 'cap',
          deferred: null,
          message: null,
        };
      } catch (err) {
        return {
          items: [],
          model: WORKERS_AI_MODEL,
          backend: 'workers-ai',
          deferred: 'cap',
          message: `${CAP_MESSAGE} (Ollama fallback failed: ${err.message})`,
          fallback: null,
        };
      }
    }
    return {
      items: [],
      model: WORKERS_AI_MODEL,
      backend: 'workers-ai',
      deferred: 'cap',
      message: CAP_MESSAGE,
      fallback: null,
    };
  }

  try {
    const { items, usage } = await callWorkersAiVision(base64);
    await recordNeurons(reserved.day, neuronsFromUsage(usage));
    return {
      items,
      model: WORKERS_AI_MODEL,
      backend: 'workers-ai',
      deferred: null,
      message: null,
      fallback: null,
      usage,
    };
  } catch (err) {
    await releaseScan(reserved.day);
    if (await pingOllama()) {
      try {
        const items = await callOllamaServer(base64);
        return {
          items,
          model: OLLAMA_MODEL,
          backend: 'ollama',
          fallback: 'error',
          deferred: null,
          message: null,
        };
      } catch (ollamaErr) {
        return {
          items: [],
          model: WORKERS_AI_MODEL,
          backend: 'workers-ai',
          deferred: 'error',
          message: `${AI_ERROR_PREFIX} (${err.message}). Ollama fallback failed: ${ollamaErr.message}. Saved for manual review.`,
          fallback: null,
        };
      }
    }
    return {
      items: [],
      model: WORKERS_AI_MODEL,
      backend: 'workers-ai',
      deferred: 'error',
      message: `${AI_ERROR_PREFIX} (${err.message}). Saved for manual review.`,
      fallback: null,
    };
  }
}

module.exports = {
  recognizeTapes,
  resolveBackend,
  getAiBinding,
  getUsageToday,
  utcDay,
  toImageBytes,
  textFromAiResult,
  itemsFromAiText,
  neuronsFromUsage,
  isLicenseError,
  isLicenseAccepted,
  reserveScan,
  releaseScan,
  recordNeurons,
  callWorkersAiVision,
  ensureMetaLicense,
  CAP_MESSAGE,
  resetVisionStateForTests,
};
