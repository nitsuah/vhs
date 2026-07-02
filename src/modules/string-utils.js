// ── STRING UTILITIES ──────────────────────────────────────────────────────────
const MAX_LEVENSHTEIN_INPUT = 512;

function levenshteinDistance(s1, s2) {
  // Sanitize input lengths to avoid ReDoS / CPU exhaustion
  s1 = String(s1).slice(0, MAX_LEVENSHTEIN_INPUT);
  s2 = String(s2).slice(0, MAX_LEVENSHTEIN_INPUT);
  if (s1.length < s2.length) [s1, s2] = [s2, s1];
  const lenS2 = s2.length;
  let costRow = Array.from({ length: lenS2 + 1 }, (_, i) => i);
  for (let i = 1; i <= s1.length; i++) {
    let costCol = i;
    let row = [costCol];
    for (let j = 1; j <= lenS2; j++) {
      const deleteCost = row[j - 1] + 1;
      const insertCost = costRow[j] + 1;
      const s1Char = s1[i - 1];
      const s2Char = s2[j - 1];
      const subCost = s1Char === s2Char ? costRow[j - 1] : costRow[j - 1] + 1;
      row.push(Math.min(deleteCost, insertCost, subCost));
    }
    costRow = row;
  }
  return costRow[lenS2];
}

// Enhanced title normalization for OMDb lookup
function normalizeTitleForLookup(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^the\s+/i, '')
    .replace(/an?\s+/i, '')
    .trim();
}

module.exports = { levenshteinDistance, normalizeTitleForLookup };