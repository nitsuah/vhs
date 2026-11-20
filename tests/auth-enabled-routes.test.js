'use strict';

jest.mock('../src/modules/db', () => ({ pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } }));

describe('routes with auth enabled and no session', () => {
  let server, base;
  beforeAll(async () => {
    jest.resetModules();
    delete process.env.AUTH_DISABLED;
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.JWT_SECRET = 'test-jwt-secret';
    const { app } = require('../src/server');
    await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    await new Promise(r => server.close(r));
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.JWT_SECRET;
    process.env.AUTH_DISABLED = '1';
  });

  const big = path => fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: 'x'.repeat(20 * 1024 * 1024) }),
  });

  it('answers 401 (not 413) for an oversized POST /api/jobs', async () => {
    expect((await big('/api/jobs')).status).toBe(401);
  });

  it('answers 401 (not 413) for an oversized POST /api/review', async () => {
    expect((await big('/api/review')).status).toBe(401);
  });

  it('answers 401 for the mounted Ollama proxy path', async () => {
    expect((await fetch(base + '/api/ollama/api/tags')).status).toBe(401);
  });

  it('answers 401 for an oversized POST /api/ollama/api/generate', async () => {
    expect((await big('/api/ollama/api/generate')).status).toBe(401);
  });
});
