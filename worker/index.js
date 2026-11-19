// Cloudflare Worker entry for vhs.nitsuah.io.
// Static SPA comes from the assets binding (public/); only /api/*, /auth/* and
// /health reach this Worker (assets.run_worker_first in wrangler.jsonc).
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
  const { app } = server.default;
  app.set('env', 'production'); // no stack traces in Express' default error page
  return { app, db: db.default };
}));

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

// Capture the Worker env (AI binding, secrets) for CommonJS modules that
// cannot receive env from httpServerHandler themselves.
const api = httpServerHandler({ port: PORT });
export default {
  fetch(req, env, ctx) {
    globalThis.__CF_ENV = env;
    return api.fetch(req, env, ctx);
  },
};
