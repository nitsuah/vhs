// ── OLLAMA SERVER-SIDE CALLER ─────────────────────────────────────────────────
const { SCAN_PROMPT, OLLAMA, OLLAMA_MODEL } = require('./config');
const { parseJsonArray } = require('./json-parser');

// This is server-to-server traffic (the Node process reaching Ollama), never
// the browser, so none of the CORS/Private-Network-Access restrictions that
// apply to a hosted page reaching a user's local AI apply here at all.
//
// If OLLAMA_UPSTREAM wasn't explicitly set, the config default only works
// for the bundled docker-compose `ollama` service. Auto-probe the other
// common local setups (native Ollama on the Docker host, or a bare `ollama
// serve` reachable via the container's own localhost) so a Docker user
// running Ollama outside the compose stack doesn't have to configure
// anything by hand. Explicit OLLAMA_UPSTREAM always wins and is never probed
// around — this is a fallback for the unconfigured case only.
const OLLAMA_EXPLICIT = !!(process.env.OLLAMA_UPSTREAM || '').trim();
const OLLAMA_CANDIDATES = ['http://ollama:11434', 'http://host.docker.internal:11434', 'http://localhost:11434'];
let _resolvedOllama = null; // cached after the first successful probe

async function resolveOllamaUrl() {
  if (OLLAMA_EXPLICIT) return OLLAMA;
  if (_resolvedOllama) return _resolvedOllama;
  for (const candidate of OLLAMA_CANDIDATES) {
    try {
      const r = await fetch(`${candidate}/api/tags`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) { _resolvedOllama = candidate; return candidate; }
    } catch { /* try the next candidate */ }
  }
  return OLLAMA; // nothing responded yet — fall back to the configured default
}

async function callOllamaServer(base64) {
  const upstream = await resolveOllamaUrl();
  const res = await fetch(`${upstream}/api/generate`, {
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
    const upstream = await resolveOllamaUrl();
    const r = await fetch(`${upstream}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

module.exports = { callOllamaServer, pingOllama, resolveOllamaUrl };