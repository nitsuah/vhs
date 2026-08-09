// ── ROUTES: TAPES ─────────────────────────────────────────────────────────────
'use strict';

const { pool } = require('../db');
const { ENABLED } = require('../auth');

// When auth is enabled: scope reads to this user's tapes + legacy null-owner tapes.
// When auth is disabled: return everything (existing behaviour).
async function tapesGetHandler(req, res) {
  try {
    let rows;
    if (ENABLED && req.user) {
      ({ rows } = await pool.query(
        'SELECT data FROM tapes WHERE owner_id = $1 OR owner_id IS NULL ORDER BY scanned_at DESC',
        [req.user.sub]
      ));
    } else {
      ({ rows } = await pool.query('SELECT data FROM tapes ORDER BY scanned_at DESC'));
    }
    res.json(rows.map(r => r.data));
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
}

async function tapesPutHandler(req, res) {
  const tape = req.body;
  try {
    let rowCount;
    if (ENABLED && req.user) {
      ({ rowCount } = await pool.query(
        'UPDATE tapes SET data=$1, scanned_at=COALESCE($2, scanned_at) WHERE id=$3 AND (owner_id=$4 OR owner_id IS NULL)',
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
    res.status(500).json({ error: err.message });
  }
}

async function tapesDeleteHandler(req, res) {
  try {
    let rowCount;
    if (ENABLED && req.user) {
      ({ rowCount } = await pool.query(
        'DELETE FROM tapes WHERE id=$1 AND (owner_id=$2 OR owner_id IS NULL)',
        [req.params.id, req.user.sub]
      ));
    } else {
      ({ rowCount } = await pool.query('DELETE FROM tapes WHERE id=$1', [req.params.id]));
    }
    if (rowCount === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { tapesGetHandler, tapesPostHandler, tapesPutHandler, tapesDeleteHandler };
