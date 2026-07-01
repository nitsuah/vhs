// ── ID GENERATORS ─────────────────────────────────────────────────────────────
function jobId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function reviewItemId() {
  return `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function analyticsId() {
  return `anl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = { jobId, reviewItemId, analyticsId };