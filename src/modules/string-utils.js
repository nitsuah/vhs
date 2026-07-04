// ── STRING UTILITIES ──────────────────────────────────────────────────────────
const MAX_LEVENSHTEIN_INPUT = 512;

function levenshteinDistance(s1, s2) {
  // Clamp inputs to MAX_LEVENSHTEIN_INPUT via Math.min so CodeQL sees bounded lengths.
  const sa = String(s1).slice(0, MAX_LEVENSHTEIN_INPUT);
  const sb = String(s2).slice(0, MAX_LEVENSHTEIN_INPUT);
  const lenA = Math.min(sa.length, MAX_LEVENSHTEIN_INPUT);
  const lenB = Math.min(sb.length, MAX_LEVENSHTEIN_INPUT);
  // 'a' is the longer string for a smaller inner array.
  const a = lenA >= lenB ? sa : sb;
  const b = lenA >= lenB ? sb : sa;
  const m = lenA >= lenB ? lenA : lenB;
  const n = lenA >= lenB ? lenB : lenA;
  // Two-row DP table, sized to the shorter string + 1.
  let prevRow = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curRow = [i];
    for (let j = 1; j <= n; j++) {
      const sub = a[i - 1] === b[j - 1] ? prevRow[j - 1] : prevRow[j - 1] + 1;
      const del = prevRow[j] + 1;
      const ins = curRow[j - 1] + 1;
      curRow.push(Math.min(sub, del, ins));
    }
    prevRow = curRow;
  }
  return prevRow[n];
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
