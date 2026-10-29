'use strict';
// Pure checks for the metadata Fill workflow (#85): which fields are missing
// and which present values look wrong. No I/O, so it is easy to test.

const REQUIRED_FIELDS = ['year', 'label', 'format', 'value_low', 'value_high'];
const PLACEHOLDER = /^(unknown|n\/a|na|none|\?|-+|tbd)$/i;

function blank(v) {
  return v === undefined || v === null || String(v).trim() === '' || PLACEHOLDER.test(String(v).trim());
}

/** Fields Fill should try to complete, including cover and spine art. */
function missingFields(tape = {}) {
  const missing = REQUIRED_FIELDS.filter((f) => blank(tape[f]));
  if (blank(tape.photo_face) && blank(tape.photo_thumbnail)) missing.push('cover');
  if (blank(tape.photo_spine)) missing.push('spine');
  return missing;
}

/** Present values that look wrong and should be reviewed, not trusted. */
function suspiciousFields(tape = {}, currentYear = new Date().getFullYear()) {
  const out = [];
  if (!blank(tape.year)) {
    const y = parseInt(tape.year, 10);
    if (!/^\d{4}$/.test(String(tape.year).trim()) || y < 1890 || y > currentYear + 1) out.push('year');
  }
  const lo = parseFloat(tape.value_low);
  const hi = parseFloat(tape.value_high);
  if (!Number.isNaN(lo) && !Number.isNaN(hi) && lo > hi) out.push('value');
  if (!blank(tape.imdb_id) && !/^tt\d{7,9}$/.test(String(tape.imdb_id).trim())) out.push('imdb_id');
  if (!blank(tape.barcode) && !/^(\d{8}|\d{12,14})$/.test(String(tape.barcode).trim())) out.push('barcode');
  return out;
}

module.exports = { REQUIRED_FIELDS, missingFields, suspiciousFields };