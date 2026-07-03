// ── STRING UTILITIES ──────────────────────────────────────────────────────────
const MAX_LEVENSHTEIN_INPUT = 512;

function levenshteinDistance(s1, s2) {
  // Sanitize input lengths to avoid ReDoS / CPU exhaustion
  s1 = String(s1).slice(0, MAX_LEVENSHTEIN_INPUT);
  s2 = String(s2).slice(0, MAX_LEVENSHTEIN_INPUT);
  const lenS1 = s1.length;
  const lenS2 = s2.length;
  if (lenS1 < lenS2) {
    [s1, s2] = [s2, s1];
    // swap lengths too since they were captured before swap
  }
  // Re-capture after potential swap
  const aLen = s1.length;
  const bLen = s2.length;
  let costRow = Array.from({ length: bLen + 1 }, (_, i) => i);
  for (let i = 1; i <= aLen; i++) {
    let costCol = i;
    let row = [costCol];
    for (let j = 1; j <= bLen; j++) {
      const deleteCost = row[j - 1] + 1;
      const insertCost = costRow[j] + 1;
      const s1Char = s1[i - 1];
      const s2Char = s2[j - 1];
      const subCost = s1Char === s2Char ? costRow[j - 1] : costRow[j - 1] + 1;
      row.push(Math.min(deleteCost, insertCost, subCost));
    }
    costRow = row;
  }
  return costRow[bLen];
}

// Enhanced title normalization for OMDb lookup
function normalizeTitleForLookup(title) {
  if (!title) return '';
  const tagsToRemove = ['vhs', 'dvd', 'bluray', 'blu-ray', 'digital', 'other', 'collection', 'special',
    'edition', "director's cut", 'extended', 'unrated', '3d', 'imax', 'collectible', 'sde',
    'movie', 'film', 'title', 'video', 'tape'];
  // Keep 'movie' out of standalone stripping — it's a legitimate title word
  const tagsStandalone = tagsToRemove.filter(t => t !== 'movie');

  // Remove years and media tags in any order, more comprehensively
  let s = title
    .toLowerCase()
    .trim()
    // First remove years in parentheses and standalone years
    .replace(/\(\s*\d{4}\s*\)/g, '')
    .replace(/\b\d{4}\b/g, '')
    // Convert ampersand to 'and'
    .replace(/&/g, ' and ')
    // Convert ellipsis (3+ dots) to space before punctuation handling
    .replace(/\.{3,}/g, ' ')
    // Remove media tags with brackets and standard media formats
    .replace(new RegExp(`\\(\\s*(?:${tagsToRemove.join('|')})\\s*\\)`, 'gi'), '')
    // Standalone tags (excludes 'movie' to keep legitimate title words)
    .replace(new RegExp(`\\b(?:${tagsStandalone.join('|')})\\b`, 'gi'), '')
    // Remove parentheses and brackets but preserve dots for abbreviations and hyphens in compound words
    .replace(/[!?'"“”‘’\[\]{}()]/g, ' ')
    // Remove punctuation that separates words but preserve hyphens in compound words
    .replace(/[,:]/g, ' ')
    .replace(/[^\w\s'.&-]/g, ' ')
    // Remove em/en dashes (convert to spaces)
    .replace(/[–—]+/g, ' ')
    // Remove articles at start of sentence
    .replace(/^the\s+/i, '')
    .replace(/^an?\s+/i, '')
    // Clean up extra spaces
    .replace(/\s+/g, ' ')
    .trim();

  // Remove standalone 'and' from result and trailing dashes
  s = s.replace(/^and\s+/i, '').replace(/\s+and$/i, '').trim();
  // Strip trailing punctuation/dashes that may remain (e.g. "pulp fiction -")
  s = s.replace(/[\s-]+$/, '').trim();

  // Strip version markers like vg2.0 remaining after other cleanup
  // Uses \d+v(?:g|...) pattern (no \b) to catch digit-adjacent versions like "1234567890vg2.0"
  s = s.replace(/\d+\s*v(?:g|er|ersion)?[\s\d.]*/gi, '').trim();

  // If result is empty but original had a generic media term, default to "movie"
  if (!s && ['movie', 'film', 'title', 'video', 'tape'].some(t => new RegExp(`\\b${t}\\b`, 'i').test(title))) {
    return 'movie';
  }

  // If result has no letter characters (only numbers/symbols), return empty
  if (!/[a-z]/.test(s)) return '';

  return s;
}

module.exports = { levenshteinDistance, normalizeTitleForLookup };