// ── BACKGROUND WORKER ─────────────────────────────────────────────────────────
const { pool } = require('./db');
const { recognizeTapes } = require('./vision');
const { enhancedLookup, callOmdb } = require('./omdb');
const { logScanAnalytics } = require('./analytics');
const { reviewItemId } = require('./ids');
const { logActivity } = require('./activity-log');
const { OMDB_API_KEY, MAX_RETRIES } = require('./config');

let workerBusy = false;

async function processJobs() {
  if (workerBusy) return;
  workerBusy = true;

  try {
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();

    // 1. Reset stuck jobs that were "processing" for >10 min
    const stuckCutoff = new Date(nowMs - 10 * 60 * 1000).toISOString();
    await pool.query(
      "UPDATE upload_jobs SET status='pending', updated_at=$1 WHERE status='processing' AND updated_at<$2",
      [now, stuckCutoff]
    );

    // 2. Reset failed jobs for retry (if < MAX_RETRIES and older than 5 min)
    const retryCutoff = new Date(nowMs - 5 * 60 * 1000).toISOString();
    await pool.query(
      "UPDATE upload_jobs SET status='pending', updated_at=$1 WHERE status='failed' AND retry_count<$2 AND updated_at<$3",
      [now, MAX_RETRIES, retryCutoff]
    );

    // 3. Convert permanently-failed jobs into review_items so they surface cross-session
    const { rows: permFailed } = await pool.query(
      "SELECT id, thumb, error, owner_id FROM upload_jobs WHERE status='failed' AND retry_count>=$1",
      [MAX_RETRIES]
    );
    for (const pf of permFailed) {
      await pool.query(
        'INSERT INTO review_items(id,job_id,data,thumb,source,status,fail_reason,created_at,owner_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [reviewItemId(), pf.id, '{}', pf.thumb, 'scan', 'failed', pf.error || 'Analysis failed max retries', now, pf.owner_id || null]
      );
      await pool.query('DELETE FROM upload_jobs WHERE id=$1', [pf.id]);
      console.warn(`✗ Job ${pf.id} permanently failed → review_items`);
    }

    // 4. Pick next pending job
    const { rows } = await pool.query(
      "SELECT id, image_data, thumb, owner_id, vision_backend, vision_model FROM upload_jobs WHERE status='pending' ORDER BY created_at ASC LIMIT 1"
    );
    if (!rows.length) return;

    const job = rows[0];
    // Claim atomically: on Cloudflare several isolates can run processJobs at
    // once, so only the one whose UPDATE matched a still-pending row proceeds.
    const claim = await pool.query(
      "UPDATE upload_jobs SET status='processing', updated_at=$1 WHERE id=$2 AND status='pending'",
      [now, job.id]
    );
    if (claim && claim.rowCount === 0) return;
    console.log(`⟳ Vision: sending job ${job.id}`);

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

      const result = await recognizeTapes(job.image_data, {
        backend: job.vision_backend,
        model: job.vision_model,
      });
      if (result.deferred) {
        const ts = new Date().toISOString();
        await pool.query(
          'INSERT INTO review_items(id,job_id,data,thumb,source,status,fail_reason,created_at,owner_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [
            reviewItemId(),
            job.id,
            JSON.stringify({
              title: '',
              format: 'VHS',
              confidence: 'low',
              condition: 'good',
              status: 'in_collection',
              notes: result.message,
              needs_manual_review: true,
            }),
            job.thumb,
            'scan',
            'pending',
            result.message,
            ts,
            job.owner_id || null,
          ]
        );
        await pool.query('DELETE FROM upload_jobs WHERE id=$1', [job.id]);
        console.warn(`⚠ Job ${job.id} deferred (${result.deferred}): ${result.message}`);
        return;
      }

      const raw = result.items || [];

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
      await logScanAnalytics({ jobId: job.id, aiModel: result.model, suggestions: enriched, omdbVerified, ownerId: job.owner_id || null });

      const ts = new Date().toISOString();
      for (const item of enriched) {
        await pool.query(
          'INSERT INTO review_items(id,job_id,data,thumb,source,status,created_at,owner_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [reviewItemId(), job.id, JSON.stringify({ ...item, condition: item.condition || 'good', status: 'in_collection' }), job.thumb, 'scan', 'pending', ts, job.owner_id || null]
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
