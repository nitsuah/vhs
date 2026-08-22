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

exports.default = async (req, context) => {
  await ready;

  const url = new URL(req.url);

  // Bodies must be base64-encoded for serverless-http's Lambda envelope.
  // Use '' (not null) for absent bodies — serverless-http serialises null as "null".
  const bodyBuf = ['GET', 'HEAD'].includes(req.method)
    ? null
    : Buffer.from(await req.arrayBuffer());

  // Build multiValueQueryStringParameters so repeated keys (e.g. tag=a&tag=b) are preserved.
  const multiValueQueryStringParameters = {};
  for (const [key, val] of url.searchParams) {
    if (multiValueQueryStringParameters[key]) {
      multiValueQueryStringParameters[key].push(val);
    } else {
      multiValueQueryStringParameters[key] = [val];
    }
  }

  const event = {
    httpMethod: req.method,
    path: url.pathname,
    queryStringParameters: Object.fromEntries(url.searchParams),
    multiValueQueryStringParameters,
    headers: Object.fromEntries(req.headers),
    body: bodyBuf ? bodyBuf.toString('base64') : '',
    isBase64Encoded: bodyBuf !== null,
    // serverless-http 3.x reads sourceIp from requestContext when event.version is absent.
    requestContext: { identity: { sourceIp: context.ip } },
  };

  const result = await lambdaHandler(event, {});

  const responseBody = result.isBase64Encoded
    ? Buffer.from(result.body, 'base64')
    : result.body;

  // serverless-http (v1 event) puts Set-Cookie arrays only in multiValueHeaders.
  // Merge those for keys absent from result.headers to avoid duplicating others.
  const responseHeaders = new Headers(result.headers ?? {});
  for (const [name, values] of Object.entries(result.multiValueHeaders ?? {})) {
    if (!(name in (result.headers ?? {}))) {
      for (const value of values) responseHeaders.append(name, value);
    }
  }

  return new Response(responseBody, {
    status: result.statusCode,
    headers: responseHeaders,
  });
};
