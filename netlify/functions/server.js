'use strict';

// Wraps the Express app as a Netlify Functions v2 handler (Web API format).
// Migrations run once per cold start — idempotent, safe to repeat.

const serverless = require('serverless-http');
const { app, runMigrations } = require('../../src/server.js');

const handler = serverless(app);

const ready = runMigrations().catch(err =>
  console.error('[netlify] Migration warning (non-fatal):', err.message)
);

exports.default = async (req, context) => {
  await ready;
  return handler(req, context);
};
