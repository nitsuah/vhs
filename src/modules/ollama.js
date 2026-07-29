// ── OLLAMA SERVER-SIDE CALLER ─────────────────────────────────────────────────
const { SCAN_PROMPT, OLLAMA, OLLAMA_MODEL } = require('./config');
const { parseJsonArray } = require('./json-parser');

async function callOllamaServer(base64) {
  const res = await fetch(`${OLLAMA}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt: SCAN_PROMPT, images: [base64], stream: false }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  return parseJsonArray(data.response || '');
}

async function pingOllama() {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

module.exports = { callOllamaServer, pingOllama };