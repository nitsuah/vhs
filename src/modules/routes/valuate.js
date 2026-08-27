// ── ROUTES: VALUATION (eBay sold listings) ────────────────────────────────────
'use strict';

const { pool } = require('../db');
const { ENABLED } = require('../auth');
const { valuateTitle, isConfigured } = require('../ebay');
const { logActivity } = require('../activity-log');

function notConfigured(res) {
  return res.status(503).json({
    error: 'eBay valuation not configured — set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET',
  });
}

// Distinguish "we could not reach eBay" (502) from a bad request (400).
function ebayFailure(res, err) {
  const msg = err && err.message ? err.message : 'eBay lookup failed';
  return res.status(502).json({ error: msg });
}

/**
 * GET /api/valuate?title=&year=&format=
 * Preview a valuation without persisting it (used for tapes not yet saved).
 */
async function valuatePreviewHandler(req, res) {
  if (!isConfigured()) return notConfigured(res);
  const title = (req.query.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title required' });
  const year = (req.query.year || '').trim();
  const format = (req.query.format || '').trim();
  try {
    const valuation = await valuateTitle({ title, year, format });
    res.json(valuation);
  } catch (err) {
    ebayFailure(res, err);
  }
}

/**
 * POST /api/tapes/:id/valuate
 * Body (all optional): { title, year, format } — overrides the stored values,
 * so an edited-but-unsaved title in the detail modal still valuates correctly.
 *
 * Persists the result into the tape's JSONB `data` under `valuation`, and
 * mirrors low/high into the existing value_low / value_high fields the UI reads.
 */
async function valuateTapeHandler(req, res) {
  if (!isConfigured()) return notConfigured(res);

  const id = req.params.id;
  const scoped = ENABLED && req.user;

  let tape;
  try {
    const { rows } = scoped
      ? await pool.query('SELECT data FROM tapes WHERE id=$1 AND owner_id=$2', [id, req.user.sub])
      : await pool.query('SELECT data FROM tapes WHERE id=$1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    tape = rows[0].data || {};
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const body = req.body || {};
  const title = String(body.title ?? tape.title ?? '').trim();
  if (!title) return res.status(400).json({ error: 'title required' });
  const year = String(body.year ?? tape.year ?? '').trim();
  const format = String(body.format ?? tape.format ?? '').trim();

  let valuation;
  try {
    valuation = await valuateTitle({ title, year, format });
  } catch (err) {
    return ebayFailure(res, err);
  }

  const updated = { ...tape, valuation };
  if (valuation.sample_size > 0) {
    updated.value_low = String(valuation.low);
    updated.value_high = String(valuation.high);
  }

  try {
    const { rowCount } = scoped
      ? await pool.query('UPDATE tapes SET data=$1 WHERE id=$2 AND owner_id=$3', [updated, id, req.user.sub])
      : await pool.query('UPDATE tapes SET data=$1 WHERE id=$2', [updated, id]);
    if (rowCount === 0) return res.status(404).json({ error: 'not found' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  logActivity(
    'info',
    `Valuation ${id}: ${valuation.sample_size} sold comps for "${valuation.query}"` +
      (valuation.sample_size ? ` → $${valuation.low}–$${valuation.high} (avg $${valuation.average})` : '')
  );

  res.json({ valuation, tape: updated });
}

module.exports = { valuatePreviewHandler, valuateTapeHandler };
