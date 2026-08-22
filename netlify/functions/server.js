'use strict';

// Wraps the Express app as a Netlify (Lambda) serverless function.
// Migrations run once per cold start — idempotent, safe to repeat.

const serverless = require('serverless-http');
const { app, runMigrations } = require('../../src/server.js');

const handle = serverless(app);

const ready = runMigrations().catch(err =>
  console.error('[netlify] Migration warning (non-fatal):', err.message)
);

exports.handler = async (event, context) => {
  // On cold start: wait for migrations. On warm start: resolves instantly.
  context.callbackWaitsForEmptyEventLoop = false;
  await ready;
  return handle(event, context);
};
