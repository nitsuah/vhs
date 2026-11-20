'use strict';

jest.mock('../src/modules/db', () => ({ pool: { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } }));

describe('JSON body limits', () => {
  let server, base;
  beforeAll(async () => {
    jest.resetModules();
    const { app } = require('../src/server');
    await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise(r => server.close(r)));

  const post = (path, bytes) => fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: 'x'.repeat(bytes) }),
  });

  it('rejects a 2 MB body on a general route with 413', async () => {
    expect((await post('/api/fill/proposals', 2 * 1024 * 1024)).status).toBe(413);
  });

  it('accepts a 2 MB photo body on the job route', async () => {
    expect((await post('/api/jobs', 2 * 1024 * 1024)).status).toBe(201);
  });

  it('rejects a 20 MB photo body with 413', async () => {
    expect((await post('/api/jobs', 20 * 1024 * 1024)).status).toBe(413);
  });
});
