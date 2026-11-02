// ── ROUTES: TAPES ─────────────────────────────────────────────────────────────
'use strict';

const { pool } = require('../db');
const { ENABLED } = require('../auth');
const { serverError } = require('../http-errors');

// When auth is enabled: scope reads to this user's tapes only.
// When auth is disabled: return everything (existing behaviour).
async function tapesGetHandler(req, res) {
  try {
    let rows;
    if (ENABLED && req.user) {
      ({ rows } = await pool.query(
        'SELECT data FROM tapes WHERE owner_id = $1 ORDER BY scanned_at DESC',
        [req.user.sub]
      ));
    } else {
      ({ rows } = await pool.query('SELECT data FROM tapes ORDER BY scanned_at DESC'));
    }
    res.json(rows.map(r => r.data));
  } catch (err) {
    serverError(res, err);
  }
}

async function tapesPostHandler(req, res) {
  const tape = req.body;
  const ownerId = ENABLED && req.user ? req.user.sub : null;
  try {
    await pool.query(
      'INSERT INTO tapes(id, data, scanned_at, owner_id) VALUES($1, $2, $3, $4)',
      [tape.id, tape, tape.scanned_at || new Date().toISOString(), ownerId]
    );
    res.status(201).json(tape);
  } catch (err) {
    serverError(res, err);
  }
}

async function tapesPutHandler(req, res) {
  const tape = req.body;
  try {
    let rowCount;
    if (ENABLED && req.user) {
      ({ rowCount } = await pool.query(
        'UPDATE tapes SET data=$1, scanned_at=COALESCE($2, scanned_at) WHERE id=$3 AND owner_id=$4',
        [tape, tape.scanned_at ?? null, req.params.id, req.user.sub]
      ));
    } else {
      ({ rowCount } = await pool.query(
        'UPDATE tapes SET data=$1, scanned_at=COALESCE($2, scanned_at) WHERE id=$3',
        [tape, tape.scanned_at ?? null, req.params.id]
      ));
    }
    if (rowCount === 0) return res.status(404).json({ error: 'not found' });
    res.json(tape);
  } catch (err) {
    serverError(res, err);
  }
}


const FILL_PROPOSAL_FIELDS = new Set(['label', 'year', 'format', 'value_low', 'value_high']);
const NUMERIC_FILL_FIELDS = new Set(['value_low', 'value_high']);

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeExpectedValue(value) {
  if (value === null) return '';
  if (typeof value === 'string' && value.length <= 240) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function parseNonNegativeFinite(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const numeric = Number(value);
  const parsed = Number.parseFloat(value);
  return Number.isFinite(numeric) && numeric >= 0 && parsed === numeric ? numeric : null;
}

function normalizeUpdateValue(field, value) {
  if (typeof value === 'string') {
    if (value.length > 240) return { valid: false };
    if (NUMERIC_FILL_FIELDS.has(field)) {
      const numeric = parseNonNegativeFinite(value);
      return numeric === null ? { valid: false } : { valid: true, stored: value, numeric };
    }
    return { valid: true, stored: value };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (NUMERIC_FILL_FIELDS.has(field) && value < 0) return { valid: false };
    return { valid: true, stored: String(value), numeric: value };
  }
  return { valid: false };
}

function parseStoredRangeBound(value) {
  if (value === null || value === undefined || value === '') return { empty: true };
  const numeric = parseNonNegativeFinite(value);
  return numeric === null ? { invalid: true } : { value: numeric };
}

async function tapesFillProposalsHandler(req, res) {
  const body = req.body;
  if (!isPlainObject(body) || !isPlainObject(body.expected) || !isPlainObject(body.updates)) {
    return res.status(400).json({ error: 'invalid request' });
  }

  const expectedKeys = Object.keys(body.expected);
  const updateKeys = Object.keys(body.updates);
  if (
    expectedKeys.length === 0 ||
    expectedKeys.length !== updateKeys.length ||
    expectedKeys.some((key) => !FILL_PROPOSAL_FIELDS.has(key) || !Object.prototype.hasOwnProperty.call(body.updates, key)) ||
    updateKeys.some((key) => !FILL_PROPOSAL_FIELDS.has(key) || !Object.prototype.hasOwnProperty.call(body.expected, key))
  ) {
    return res.status(400).json({ error: 'invalid request' });
  }

  const expected = {};
  for (const field of expectedKeys) {
    const value = body.expected[field];
    if (value !== null && typeof value === 'object') {
      return res.status(400).json({ error: 'invalid request' });
    }
    const normalized = normalizeExpectedValue(value);
    if (normalized === null) return res.status(400).json({ error: 'invalid request' });
    expected[field] = normalized;

    const updateValue = body.updates[field];
    if (updateValue !== null && typeof updateValue === 'object') {
      return res.status(400).json({ error: 'invalid request' });
    }
  }

  const ownerScoped = ENABLED && req.user;
  let client;
  let inTransaction = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    inTransaction = true;

    const selectQuery = ownerScoped
      ? 'SELECT data FROM tapes WHERE id=$1 AND owner_id=$2 FOR UPDATE'
      : 'SELECT data FROM tapes WHERE id=$1 FOR UPDATE';
    const selectValues = ownerScoped ? [req.params.id, req.user.sub] : [req.params.id];
    const { rows } = await client.query(selectQuery, selectValues);
    if (!rows.length) {
      await client.query('ROLLBACK');
      inTransaction = false;
      return res.status(404).json({ error: 'not found' });
    }

    const current = rows[0].data;
    if (!isPlainObject(current)) throw new Error('Invalid stored tape data');
    const updated = { ...current };
    const results = {};
    const candidates = {};

    for (const field of updateKeys) {
      const currentValue = normalizeExpectedValue(
        Object.prototype.hasOwnProperty.call(current, field) ? current[field] : null
      );
      if (currentValue === null || currentValue !== expected[field]) {
        results[field] = 'stale_value_conflict';
        continue;
      }

      const normalizedUpdate = normalizeUpdateValue(field, body.updates[field]);
      if (!normalizedUpdate.valid) {
        results[field] = 'invalid_value';
        continue;
      }
      candidates[field] = normalizedUpdate;
    }

    const numericCandidates = [...NUMERIC_FILL_FIELDS].filter((field) => candidates[field]);
    if (numericCandidates.length > 0) {
      const low = candidates.value_low
        ? { value: candidates.value_low.numeric }
        : parseStoredRangeBound(current.value_low);
      const high = candidates.value_high
        ? { value: candidates.value_high.numeric }
        : parseStoredRangeBound(current.value_high);
      const invalidRange = low.invalid || high.invalid ||
        (low.value !== undefined && high.value !== undefined && low.value > high.value);
      if (invalidRange) {
        for (const field of numericCandidates) {
          results[field] = 'invalid_value_range';
          delete candidates[field];
        }
      }
    }

    const appliedFields = Object.keys(candidates);
    for (const field of appliedFields) {
      updated[field] = candidates[field].stored;
      results[field] = 'applied';
    }

    if (appliedFields.length > 0) {
      const updateQuery = ownerScoped
        ? 'UPDATE tapes SET data=$1 WHERE id=$2 AND owner_id=$3'
        : 'UPDATE tapes SET data=$1 WHERE id=$2';
      const updateValues = ownerScoped
        ? [updated, req.params.id, req.user.sub]
        : [updated, req.params.id];
      const result = await client.query(updateQuery, updateValues);
      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        inTransaction = false;
        return res.status(404).json({ error: 'not found' });
      }
    }

    await client.query('COMMIT');
    inTransaction = false;
    return res.json({ results });
  } catch {
    if (client && inTransaction) {
      try {
        await client.query('ROLLBACK');
      } catch {
        console.error('Fill proposal apply rollback failed');
      }
    }
    console.error('Fill proposal apply failed');
    return res.status(500).json({ error: 'internal server error' });
  } finally {
    if (client) client.release();
  }
}

async function tapesDeleteHandler(req, res) {
  try {
    let rowCount;
    if (ENABLED && req.user) {
      ({ rowCount } = await pool.query(
        'DELETE FROM tapes WHERE id=$1 AND owner_id=$2',
        [req.params.id, req.user.sub]
      ));
    } else {
      ({ rowCount } = await pool.query('DELETE FROM tapes WHERE id=$1', [req.params.id]));
    }
    if (rowCount === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err);
  }
}

module.exports = { tapesGetHandler, tapesPostHandler, tapesPutHandler, tapesFillProposalsHandler, tapesDeleteHandler };
