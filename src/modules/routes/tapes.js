// ── ROUTES: TAPES ─────────────────────────────────────────────────────────────
const { pool } = require('../db');

async function tapesGetHandler(req, res) {
  try {
    const { rows } = await pool.query('SELECT data FROM tapes ORDER BY scanned_at DESC');
    res.json(rows.map(r => r.data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function tapesPostHandler(req, res) {
  const tape = req.body;
  try {
    await pool.query(
      'INSERT INTO tapes(id, data, scanned_at) VALUES($1, $2, $3)',
      [tape.id, tape, tape.scanned_at || new Date().toISOString()]
    );
    res.status(201).json(tape);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function tapesPutHandler(req, res) {
  const tape = req.body;
  try {
    const { rowCount } = await pool.query(
      'UPDATE tapes SET data=$1, scanned_at=$2 WHERE id=$3',
      [tape, tape.scanned_at || new Date().toISOString(), req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'not found' });
    res.json(tape);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function tapesDeleteHandler(req, res) {
  try {
    await pool.query('DELETE FROM tapes WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { tapesGetHandler, tapesPostHandler, tapesPutHandler, tapesDeleteHandler };