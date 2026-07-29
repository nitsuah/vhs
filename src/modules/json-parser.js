// ── JSON PARSER ───────────────────────────────────────────────────────────────
// Extracts the first balanced JSON structure from text (handles leading/trailing noise).
function _extractFirst(txt, open, close) {
  const start = (txt || '').indexOf(open);
  if (start === -1) return null;
  let depth = 0, inStr = false, escaped = false;
  for (let i = start; i < txt.length; i++) {
    const c = txt[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\' && inStr) { escaped = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return txt.slice(start, i + 1); }
  }
  return null;
}

function parseJsonArray(txt) {
  const s = _extractFirst(txt, '[', ']');
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}

function parseJsonObject(txt) {
  const s = _extractFirst(txt, '{', '}');
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

module.exports = { parseJsonArray, parseJsonObject };
