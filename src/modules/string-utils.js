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
  const tagsToRemove = ['vhs', 'dvd', 'bluray', 'blu-ray', 'digital', 'other', 'collection', 'special',
    'edition', "director's cut", 'extended', 'unrated', '3d', 'imax', 'collectible', 'sde',
    'movie', 'film', 'title', 'video', 'tape'];

  // Remove years and media tags in any order, more comprehensively
  let s = title
    .toLowerCase()
    .trim()
    // First remove years in parentheses and standalone years
    .replace(/\(\s*\d{4}\s*\)/g, '')
    .replace(/\b\d{4}\b/g, '')
    // Remove media tags with brackets and standard media formats
    .replace(new RegExp(`\\(\\s*(?:${tagsToRemove.join('|')})\\s*\\)`, 'gi'), '')
    .replace(new RegExp(`\\b(?:${tagsToRemove.join('|')})\\b`, 'gi'), '')
    // Convert ampersand to 'and'
    .replace(/&/g, ' and ')
    // Preserve E.T. style dots and hyphens in compound words
    .replace(/\.{2,}/g, ' ')
    // Handle general punctuation but preserve dots in abbreviations and hyphens in compound words
    .replace(/[!?:'"“”‘’\[\]{}()]+/g, ' ')
    .replace(/[^\w\s'.&-]|_/g, ' ')
    // Clean up remaining text
    .replace(/^the\s+/i, '')
    .replace(/^(an?)\s+/i, '')
    // Remove em/en dashes and other separators (but keep regular hyphens in words)
    .replace(/[–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Clean up leading/trailing 'and'
  s = s.replace(/^and\s+/, '').replace(/\s+and$/, '').trim();

  // If result is empty but original had a generic media term, default to "movie"
  if (!s && ['movie', 'film', 'title', 'video', 'tape'].some(t => new RegExp(`\\b${t}\\b`, 'i').test(title))) {
    return 'movie';
  }

  // If result has no letter characters (only numbers/symbols), return empty
  if (!/[a-z]/.test(s)) return '';

  return s;
}

module.exports = { levenshteinDistance, normalizeTitleForLookup };