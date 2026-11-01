'use strict';
// Pure field-level Fill proposals. No provider/network or persistence side effects.
const { scoreCandidate } = require('./fill-match');
const { missingFields, suspiciousFields } = require('./fill-audit');

const PROPOSABLE_FIELDS = ['year', 'label', 'format', 'value_low', 'value_high'];
const CANDIDATE_FIELD = { label: 'title' };
const PLACEHOLDER = /^(unknown|n\/a|na|none|\?|-+|tbd)$/i;
const MAX_VALUE_LENGTH = 240;
const MAX_SOURCE_LENGTH = 48;

function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

function safeText(value, maxLength = MAX_VALUE_LENGTH) {
  return cleanText(value).slice(0, maxLength);
}

function candidateValue(field, candidate) {
  const key = CANDIDATE_FIELD[field] || field;
  const raw = candidate[key];

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    if (field === 'year') {
      if (!Number.isInteger(raw) || suspiciousFields({ year: String(raw) }).includes('year')) return null;
    } else if (field !== 'value_low' && field !== 'value_high') {
      return null;
    }
    return raw;
  }

  if (typeof raw !== 'string') return null;
  const value = cleanText(raw);
  if (!value || value.length > MAX_VALUE_LENGTH || PLACEHOLDER.test(value)) return null;

  if (field === 'year' && suspiciousFields({ year: value }).includes('year')) return null;
  if (field === 'value_low' || field === 'value_high') {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || parseFloat(value) !== numericValue) return null;
  }
  return value;
}

function safeOriginalValue(value) {
  if (typeof value === 'string') return safeText(value);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safeSource(candidate) {
  const raw = typeof candidate.source === 'string'
    ? candidate.source
    : (typeof candidate.provider === 'string' ? candidate.provider : '');
  const source = safeText(raw, MAX_SOURCE_LENGTH).replace(/[^a-zA-Z0-9_.-]/g, '');
  return source || 'unknown';
}

function sameValue(field, current, proposed) {
  if (current === undefined || current === null) return false;
  if (typeof current === 'string' && current.trim() === '') return false;
  if (field === 'year' || field === 'value_low' || field === 'value_high') {
    const a = Number(current);
    const b = Number(proposed);
    if (Number.isFinite(a) && Number.isFinite(b)) return a === b;
  }
  if (field === 'format') return String(current).trim().toLowerCase() === String(proposed).trim().toLowerCase();
  return String(current).trim() === String(proposed).trim();
}

function numericBound(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resultingRangeIsValid(tape, candidateProposals) {
  const lowProposal = candidateProposals.find((proposal) => proposal.field === 'value_low');
  const highProposal = candidateProposals.find((proposal) => proposal.field === 'value_high');
  const low = numericBound(lowProposal ? lowProposal.value : tape.value_low);
  const high = numericBound(highProposal ? highProposal.value : tape.value_high);
  return low === null || high === null || low <= high;
}
function confidenceFor(tape, candidate, score) {
  const invalidIdentifier = [tape, candidate].some((item) => {
    const suspicious = suspiciousFields(item);
    return suspicious.includes('barcode') || suspicious.includes('imdb_id');
  });
  return invalidIdentifier && score.level !== 'low' ? 'low' : score.level;
}

/**
 * Build non-mutating proposals for missing or suspicious Fill fields.
 * Only the existing metadata fields are eligible; photo and identifier fields
 * are intentionally excluded.
 */
function buildFieldProposals(tape = {}, candidates = []) {
  if (!tape || typeof tape !== 'object' || Array.isArray(tape) || !Array.isArray(candidates)) return [];

  const missing = new Set(missingFields(tape));
  const suspicious = new Set(suspiciousFields(tape));
  const proposals = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const score = scoreCandidate(tape, candidate);
    const confidence = confidenceFor(tape, candidate, score);
    let candidateProposals = [];

    for (const field of PROPOSABLE_FIELDS) {
      const valueSuspicious = (field === 'value_low' || field === 'value_high') && suspicious.has('value');
      if (!missing.has(field) && !suspicious.has(field) && !valueSuspicious) continue;

      const value = candidateValue(field, candidate);
      if (value === null || sameValue(field, tape[field], value)) continue;

      const fieldReason = missing.has(field) ? `${field} missing` : (valueSuspicious ? 'value range suspicious' : `${field} suspicious`);
      const reasons = [fieldReason, ...(Array.isArray(score.reasons) ? score.reasons.filter((reason) => typeof reason === 'string').slice(0, 6) : [])];

      candidateProposals.push({
        field,
        originalValue: safeOriginalValue(tape[field]),
        value,
        source: safeSource(candidate),
        confidence,
        reasons,
      });
    }

    if (!resultingRangeIsValid(tape, candidateProposals)) {
      const hasLow = candidateProposals.some((proposal) => proposal.field === 'value_low');
      const hasHigh = candidateProposals.some((proposal) => proposal.field === 'value_high');
      if (hasLow && hasHigh) {
        candidateProposals = candidateProposals.filter(
          (proposal) => proposal.field !== 'value_low' && proposal.field !== 'value_high',
        );
      } else if (hasLow) {
        candidateProposals = candidateProposals.filter((proposal) => proposal.field !== 'value_low');
      } else if (hasHigh) {
        candidateProposals = candidateProposals.filter((proposal) => proposal.field !== 'value_high');
      }
    }

    proposals.push(...candidateProposals);
  }

  return proposals;
}

module.exports = { buildFieldProposals };
