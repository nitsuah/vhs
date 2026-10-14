'use strict';
// In-browser API for the journeys and visual-docs screenshots: every /api and
// /auth call is answered from the demo seed (promo/demo-seed.js), so the app
// runs as static files with no Postgres, Ollama, OMDb or Google. Writes land
// in a per-page copy of the seed, so a journey can add, edit and confirm.
const SEED = require('./demo-seed.js');

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mockApi(page, { tapes = SEED.TAPES, review = SEED.REVIEW } = {}) {
  const db = {
    tapes: structuredClone(tapes),
    review: structuredClone(review),
  };

  // Auth off (single-user mode): no sign-in chip, no Google.
  await page.route('**/auth/**', (route) => json(route, { enabled: false, user: null }));

  // Local AI discovery and the Ollama probe: report "no local AI".
  await page.route(/:11434\//, (route) => route.abort());
  await page.route('**/api/ollama/**', (route) => route.abort());

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const body = () => { try { return req.postDataJSON(); } catch { return null; } };

    if (path === '/api/health') return json(route, { db: 'ok', ollama: 'down' });
    if (path === '/api/tapes') {
      if (method === 'GET') return json(route, db.tapes);
      const t = body();
      db.tapes.unshift(t);
      return json(route, t, 201);
    }
    let m = path.match(/^\/api\/tapes\/([^/]+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      const i = db.tapes.findIndex((t) => t.id === id);
      if (method === 'PUT') {
        const t = body();
        if (i >= 0) db.tapes[i] = t; else db.tapes.unshift(t);
        return json(route, t);
      }
      if (method === 'DELETE') {
        if (i >= 0) db.tapes.splice(i, 1);
        return json(route, { ok: true });
      }
      return json(route, db.tapes[i] || {}, i >= 0 ? 200 : 404);
    }
    if (path === '/api/review/pending') return json(route, db.review);
    m = path.match(/^\/api\/review\/([^/]+)$/);
    if (m && method === 'DELETE') {
      db.review = db.review.filter((r) => r.id !== decodeURIComponent(m[1]));
      return json(route, { ok: true });
    }
    if (path === '/api/jobs/status')
      return json(route, { pending: 0, processing: 0, done: 0, failed: 0, review_pending: db.review.length });
    if (path === '/api/jobs/inflight') return json(route, []);
    if (path.startsWith('/api/logs')) return json(route, []);
    if (path.startsWith('/api/lookup')) return json(route, null, 404);
    if (path.startsWith('/api/analytics')) return json(route, { ok: true });
    return json(route, { ok: true });
  });

  return db;
}

module.exports = { mockApi };
