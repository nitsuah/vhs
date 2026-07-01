// ── JSON PARSER ───────────────────────────────────────────────────────────────
function parseJsonArray(txt) {
  const m = (txt || '').trim().match(/\[[\s\S]*\]/);
  if (!m) return [];
  try { return JSON.parse(m[0]); } catch { return []; }
}

function parseJsonObject(txt) {
  const m = (txt || '').trim().match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

module.exports = { parseJsonArray, parseJsonObject };