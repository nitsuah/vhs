'use strict';
// Pure match scoring for the Fill workflow (#85): how sure are we that a
// candidate is this tape? No I/O, so it is easy to test.
const { levenshteinDistance, normalizeTitleForLookup } = require('./string-utils');

const TITLE_THRESHOLD = 0.85;
const IDENTIFIERS = ['barcode', 'imdb_id'];

function clean(v) {
  return v === undefined || v === null ? '' : String(v).trim();
}

function titleSimilarity(a, b) {
  const na = normalizeTitleForLookup(clean(a));
  const nb = normalizeTitleForLookup(clean(b));
  const maxLen = Math.max(na.length, nb.length);
  return maxLen > 0 ? 1 - levenshteinDistance(na, nb) / maxLen : 0;
}

function extractEdition(title) {
  const t = clean(title);
  const match = t.match(/\(([^)]*(?:special|director'?s cut|extended|unrated|collector'?s?|anniversary|limited|deluxe|remastered|edition)[^)]*)\)/i);
  return match ? match[1].toLowerCase() : '';
}

/** Returns { score, level, reasons }; level is verified, inferred or low. */
function scoreCandidate(tape = {}, candidate = {}) {
  for (const f of IDENTIFIERS) {
    if (clean(tape[f]) && clean(tape[f]) === clean(candidate[f])) {
      return { score: 1, level: 'verified', reasons: [`${f} match`] };
    }
  }
  for (const f of IDENTIFIERS) {
    if (clean(tape[f]) && clean(candidate[f])) {
      return { score: 0, level: 'low', reasons: [`${f} mismatch`] };
    }
  }
  const sim = titleSimilarity(tape.label, candidate.title);
  const titleOk = sim >= TITLE_THRESHOLD;

  const tEdition = extractEdition(tape.label);
  const cEdition = extractEdition(candidate.title);
  const editionOk = tEdition === cEdition;

  const tYear = clean(tape.year);
  const cYear = clean(candidate.year);
  const yearOk = tYear !== '' && cYear !== '' && tYear === cYear;
  const yearReason = tYear === '' || cYear === '' ? 'year missing' : (yearOk ? 'year match' : 'year mismatch');

  const tFmt = clean(tape.format).toLowerCase();
  const cFmt = clean(candidate.format).toLowerCase();
  const formatOk = tFmt !== '' && cFmt !== '' && tFmt === cFmt;
  const formatReason = tFmt === '' || cFmt === '' ? 'format missing' : (formatOk ? 'format match' : 'format mismatch');

  const reasons = [
    titleOk ? `title similar (${sim.toFixed(2)})` : 'title differs',
    editionOk ? 'edition match' : 'edition mismatch',
    yearReason,
    formatReason
  ];
  const level = titleOk && yearOk && formatOk && editionOk ? 'inferred' : 'low';
  return { score: sim, level, reasons };
}

module.exports = { scoreCandidate, TITLE_THRESHOLD };