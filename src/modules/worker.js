// ── BACKGROUND WORKER ─────────────────────────────────────────────────────────
const { pool } = require('../db');
const { callOllamaServer } = require('../ollama');
const { enhancedLookup, callOmdb } = require('../omdb');
const { logScanAnalytics } = require('../analytics');
const { reviewItemId } = require('../ids');
const { logActivity } = require('../activity-log');
const { OMDB_API_KEY, MAX_RETRIES, OLLAMA_MODEL } = require('../config');
const { parseJsonArray } = require('../json-parser');

let workerBusy = false;

async function processJobs() {
  if (workerBusy) return;
  workerBusy = true;

  try {
    const now = new Date().toISOString();

    // 1. Reset stuck jobs that were "processing" for >10 min
    const stuckCutoff = new Date(now - 10 * 60 * 1000).toISOString();
    await pool.query(
      "UPDATE upload_jobs SET status='pending', updated_at=$1 WHERE status='processing' AND updated_at<$2",
      [now, stuckCutoff]
    );

    // 2. Reset failed jobs for retry (if < MAX_RETRIES and older than 5 min)
    const retryCutoff = new Date(now - 5 * 60 * 1000).toISOString();
    await pool.query(
      "UPDATE upload_jobs SET status='pending', updated_at=$1 WHERE status='failed' AND retry_count<$2 AND updated_at<$3",
      [now, MAX_RETRIES, retryCutoff]
    );

    // 3. Convert permanently-failed jobs into review_items so they surface cross-session
    const { rows: permFailed } = await pool.query(
      "SELECT id, thumb, error FROM upload_jobs WHERE status='failed' AND retry_count>=$1",
      [MAX_RETRIES]
    );
    for (const pf of permFailed) {
      await pool.query(
        'INSERT INTO review_items(id,job_id,data,thumb,source,status,fail_reason,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [reviewItemId(), pf.id, '{}', pf.thumb, 'scan', 'failed', pf.error || 'Analysis failed max retries', now]
      );
      await pool.query('DELETE FROM upload_jobs WHERE id=$1', [pf.id]);
      console.warn(`✗ Job ${pf.id} permanently failed → review_items`);
    }

    // 4. Pick next pending job
    const { rows } = await pool.query(
      "SELECT id, image_data, thumb FROM upload_jobs WHERE status='pending' ORDER BY created_at ASC LIMIT 1"
    );
    if (!rows.length) return;

    const job = rows[0];
    await pool.query("UPDATE upload_jobs SET status='processing', updated_at=$1 WHERE id=$2", [now, job.id]);
    console.log(`⟳ Ollama: sending job ${job.id} to ${OLLAMA} (model: ${OLLAMA_MODEL})`);

    try {
      // Guard duplicate review_items if stuck-job reset caused double-processing
      const { rows: existingItems } = await pool.query(
        'SELECT id FROM review_items WHERE job_id=$1 LIMIT 1', [job.id]
      );
      if (existingItems.length) {
        await pool.query('DELETE FROM upload_jobs WHERE id=$1', [job.id]);
        console.log(`⚠ Job ${job.id} already has review_items — skipping`);
        return;
      }

      const raw = await callOllamaServer(job.image_data);

      // Enrich each detected tape with OMDb
      const enriched = await Promise.all(raw.map(async (item) => {
        const omdb = await enhancedLookup({ title: item.title, imdbId: item.imdb_id }, OMDB_API_KEY).catch(() => null);
        if (omdb?.imdb_id) {
          console.log(` OMDb verified "${item.title}" → "${omdb.title}" (${omdb.imdb_id})`);
          return { ...item, title: omdb.title || item.title, year: omdb.year || item.year, imdb_id: omdb.imdb_id };
        }
        return item;
      }));

      const omdbVerified = enriched.some(i => i.imdb_id);
      await logScanAnalytics({ jobId: job.id, aiModel: OLLAMA_MODEL, suggestions: enriched, omdbVerified });

      const ts = new Date().toISOString();
      for (const item of enriched) {
        await pool.query(
          'INSERT INTO review_items(id,job_id,data,thumb,source,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [reviewItemId(), job.id, JSON.stringify({ ...item, condition: item.condition || 'good', status: 'in_collection' }), job.thumb, 'scan', 'pending', ts]
        );
      }

      await pool.query('DELETE FROM upload_jobs WHERE id=$1', [job.id]);
      console.log(`✓ Job ${job.id}: ${enriched.length} tape(s) → review_items`);
    } catch (err) {
      await pool.query(
        "UPDATE upload_jobs SET status='failed', error=$1, updated_at=$2, retry_count=retry_count+1 WHERE id=$3",
        [err.message, new Date().toISOString(), job.id]
      );
      console.warn(`✗ Job ${job.id} failed (will retry):`, err.message);
    }
  } catch (err) {
    console.warn('Worker error:', err.message);
  } finally {
    workerBusy = false;
  }
}

function isWorkerBusy() {
  return workerBusy;
}

module.exports = { processJobs, isWorkerBusy };