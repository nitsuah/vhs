// ── ROUTES: JOBS ──────────────────────────────────────────────────────────────
const { pool } = require('./db');
const { logActivity } = require('./activity-log');
const { jobId, reviewItemId } = require('./ids');

async function jobsReadyHandler(req, res) {
  try {
    const { rows } = await pool.query(
      "SELECT id, thumb, result, thumb upload_jobs WHERE status='done' ORDER BY created_at ASC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function jobsStatusHandler(req, res) {
  try {
    const [jobsRes, reviewRes] = await Promise.all([
      pool.query("SELECT status, COUNT(*) count FROM upload_jobs GROUP BY status"),
      pool.query("SELECT COUNT(*) count FROM review_items WHERE status='pending'")
    ]);
    const counts = { pending: 0, processing: 0, done: 0, failed: 0, review_pending: 0 };
    jobsRes.rows.forEach(r => { counts[r.status] = parseInt(r.count, 10); });
    counts.review_pending = parseInt(reviewRes.rows[0]?.count || '0', 10);
    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function jobsGetHandler(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT id, status, result, error, retry_count FROM upload_jobs WHERE id=$1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function jobsDeleteHandler(req, res) {
  try {
    await pool.query('DELETE FROM upload_jobs WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function jobsRetryFailedHandler(req, res) {
  try {
    const now = new Date().toISOString();
    await pool.query(
      "UPDATE upload_jobs SET status='pending', updated_at=$1 WHERE status='failed' AND retry_count<$2 AND updated_at<$3",
      [now, 3, new Date(now - 5 * 60 * 1000).toISOString()]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function analyticsOutcomeHandler(req, res) {
  const { job_id, action, final_title, final_year, final_label, imdb_id } = req.body;
  if (!job_id || !action) return res.status(400).json({ error: 'job_id & action required' });
  try {
    await pool.query(
      `UPDATE scan_analytics SET action=$1, final_title=$2, final_year=$3, final_label=$4, imdb_id=$5 WHERE job_id=$6`,
      [action, final_title || null, final_year || null, final_label || null, imdb_id || null, job_id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function reviewCreateHandler(req, res) {
  const { data, source, thumb } = req.body;
  if (!data) return res.status(400).json({ error: 'data required' });
  const id = reviewItemId();
  const now = new Date().toISOString();
  try {
    await pool.query(
      'INSERT INTO review_items(id,job_id,data,thumb,source,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [id, null, JSON.stringify(data), thumb || null, source || 'manual', 'pending', now]
    );
    logActivity('info', `Review proposal created: ${id} source=${source || 'manual'} title=${data.title || '?'}`);
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  jobsReadyHandler,
  jobsStatusHandler,
  jobsGetHandler,
  jobsDeleteHandler,
  jobsRetryFailedHandler,
  analyticsOutcomeHandler,
  reviewCreateHandler
};