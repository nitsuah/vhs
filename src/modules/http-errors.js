// ── HTTP ERROR HELPERS ───────────────────────────────────────────────────────
// Shared 500 response that never echoes upstream error text (raw PostgreSQL
// messages, stack traces, etc.) back to API clients. The real error is still
// logged server-side for debugging — it just never leaves the process.
'use strict';

function serverError(res, err) {
  console.error('Request failed:', err && err.message);
  return res.status(500).json({ error: 'internal server error' });
}

module.exports = { serverError };
