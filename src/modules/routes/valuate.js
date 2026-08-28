// ── ROUTES: VALUATION (eBay active listings) ──────────────────────────────────
// Figures come from the Browse API, i.e. asking prices on active listings — not
// realized sale prices. See src/modules/ebay.js.
'use strict';

const { pool } = require('../db');
const { ENABLED } = require('../auth');
const { valuateTitle, isConfigured } = require('../ebay');

function notConfigured(res) {
  return res.status(503).json({
    error: 'eBay valuation not configured — set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET',
  });
}

// Distinguish "we could not reach eBay" (502) from a bad request (400).
//
// Upstream detail (eBay response bodies, token errors) stays server-side: the
// client gets a fixed message, and the detail never reaches logActivity because
// /api/logs is unauthenticated and would expose it to anyone.
function ebayFailure(res, err) {
  console.warn('eBay valuation failed:', err && err.message);
  return res.status(502).json({ error: 'eBay lookup failed' });
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
 * A zero-comp result never overwrites an existing valuation or estimate.
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

  // Write only the fields this handler owns, via a server-side JSONB merge.
  // A read-modify-write of the whole `data` object would silently revert any
  // edit the user saved during the (up to ~20s) eBay round trip.
  const prior = tape.valuation;
  const priorHasFigures = Boolean(prior && prior.sample_size > 0);
  const patch = {};

  if (valuation.sample_size > 0) {
    patch.valuation = valuation;
    patch.value_low = String(valuation.low);
    patch.value_high = String(valuation.high);
  } else if (!priorHasFigures) {
    // Nothing worth preserving — record the empty result so checked_at advances.
    patch.valuation = valuation;
  }
  // else: zero comps but a real prior valuation exists — leave the stored
  // record untouched. The response still carries the fresh empty result.

  let updated = tape;
  if (Object.keys(patch).length > 0) {
    try {
      const { rows } = scoped
        ? await pool.query(
            'UPDATE tapes SET data = data || $1::jsonb WHERE id=$2 AND owner_id=$3 RETURNING data',
            [JSON.stringify(patch), id, req.user.sub]
          )
        : await pool.query(
            'UPDATE tapes SET data = data || $1::jsonb WHERE id=$2 RETURNING data',
            [JSON.stringify(patch), id]
          );
      if (!rows.length) return res.status(404).json({ error: 'not found' });
      updated = rows[0].data;
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  console.log(
    `Valuation ${id}: ${valuation.sample_size} active-listing comps` +
      (valuation.sample_size ? ` → ${valuation.low}-${valuation.high} (avg ${valuation.average})` : '')
  );

  res.json({ valuation, tape: updated });
}

module.exports = { valuatePreviewHandler, valuateTapeHandler };
