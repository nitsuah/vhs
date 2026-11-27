// Cloudflare Worker entry for vhs.nitsuah.io.
// Static SPA comes from the assets binding (public/); only /api/*, /auth/*,
// /health and /c/* reach this Worker (assets.run_worker_first in wrangler.jsonc).
// Unknown paths get public/404.html; public share links get the app shell.
// The Express app is served via Workers' node:http server support.
// Never import src/modules/certs.js here (child_process + openssl).
import http from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import { migrations } from './migrations.js';

// CommonJS modules in src/ use __dirname for paths (only for local fs/static
// serving, which the Worker never hits); give them a harmless value.
globalThis.__dirname ??= '/bundle';
globalThis.__filename ??= '/bundle/index.js';

// src/server.js is loaded on the first request, not at global scope: its
// rate limiters start timers on import, which Workers only allow in a handler.
let loaded = null;
const load = () => (loaded ??= Promise.all([
  import('../src/server.js'),
  import('../src/modules/db.js'),
]).then(([server, db]) => {
  const { app, processJobs } = server.default;
  app.set('env', 'production'); // no stack traces in Express' default error page
  return { app, db: db.default, processJobs };
}));

const isSharePath = pathname => /^\/c\/[^/]+\/?$/.test(pathname);

const PORT = 8080;
let migrated = null;

const server = http.createServer(async (req, res) => {
  const { app, db } = await load();
  // One pg Pool per request: Workers forbid sharing sockets across requests.
  const pool = db.createPool();
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    pool.end().catch(() => {});
  };
  res.on('finish', close);
  res.on('close', close);

  db.requestPool.run(pool, async () => {
    if (!migrated) {
      migrated = db.runMigrations(migrations).catch(err => {
        migrated = null; // retry on a later request
        console.error('[worker] Migration warning (non-fatal):', err.message);
      });
    }
    await migrated;
    app(req, res);
  });
});

server.listen(PORT);

// Workers have no long-lived process, so the Node server's setInterval job
// loop (src/server.js start()) never runs here. Instead, every successful
// /api/jobs* request (create, status poll, inflight, retry) kicks one pass of
// processJobs() in ctx.waitUntil with its own pg Pool, so queued scans are
// actually sent to the vision backend while the UI polls.
function shouldKickJobs(req, res) {
  if (!res || res.status >= 400) return false;
  try {
    return new URL(req.url).pathname.startsWith('/api/jobs');
  } catch {
    return false;
  }
}

async function runJobsInBackground() {
  const { db, processJobs } = await load();
  if (typeof processJobs !== 'function') return;
  const pool = db.createPool();
  try {
    await db.requestPool.run(pool, async () => {
      if (migrated) await migrated;
      await processJobs();
    });
  } catch (err) {
    console.warn('[worker] background job pass failed:', err.message);
  } finally {
    await pool.end().catch(() => {});
  }
}

// Capture the Worker env (AI binding, secrets) for CommonJS modules that
// cannot receive env from httpServerHandler themselves.
const api = httpServerHandler({ port: PORT });
export default {
  async fetch(req, env, ctx) {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith('/c/')) {
      const target = isSharePath(pathname) ? new Request(new URL('/', req.url), req) : req;
      return env.ASSETS.fetch(target);
    }
    globalThis.__CF_ENV = env;
    const res = await api.fetch(req, env, ctx);
    if (ctx && typeof ctx.waitUntil === 'function' && shouldKickJobs(req, res)) {
      ctx.waitUntil(runJobsInBackground());
    }
    return res;
  },
};
