'use strict';

// Netlify Functions v2 handler (Web API format).
// serverless-http expects a Lambda-style event, so we bridge formats:
// Web API Request → Lambda event → serverless-http → Lambda result → Web API Response.
// Migrations run once per cold start — idempotent, safe to repeat.

const serverless = require('serverless-http');
const { app, runMigrations } = require('../../src/server.js');

const lambdaHandler = serverless(app);

const ready = runMigrations().catch(err =>
  console.error('[netlify] Migration warning (non-fatal):', err.message)
);

exports.default = async (req, _context) => {
  await ready;

  const url = new URL(req.url);

  // Bodies must be base64-encoded for serverless-http's Lambda envelope.
  const bodyBuf = ['GET', 'HEAD'].includes(req.method)
    ? null
    : Buffer.from(await req.arrayBuffer());

  const event = {
    httpMethod: req.method,
    path: url.pathname,
    queryStringParameters: Object.fromEntries(url.searchParams),
    headers: Object.fromEntries(req.headers),
    body: bodyBuf ? bodyBuf.toString('base64') : null,
    isBase64Encoded: bodyBuf !== null,
  };

  const result = await lambdaHandler(event, {});

  const responseBody = result.isBase64Encoded
    ? Buffer.from(result.body, 'base64')
    : result.body;

  return new Response(responseBody, {
    status: result.statusCode,
    headers: result.headers ?? {},
  });
};
