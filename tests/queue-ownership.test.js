'use strict';
// Queue routes: per-user scoping when sign-in is enabled, unchanged when disabled.
const request = require('supertest');

const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));
jest.mock('http-proxy-middleware', () => ({ createProxyMiddleware: () => (_q, _s, next) => next() }));
jest.mock('child_process', () => ({ execSync: jest.fn() }));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: () => true, mkdirSync: jest.fn(), writeFileSync: jest.fn(),
  readdirSync: () => [], readFileSync: () => Buffer.from('test'),
}));
jest.mock('../src/modules/ollama', () => ({
  ...jest.requireActual('../src/modules/ollama'),
  pingOllama: jest.fn().mockResolvedValue(true),
}));

const AUTH_ENV = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'JWT_SECRET'];

function load(enabled) {
  jest.resetModules();
  process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
  AUTH_ENV.forEach(k => { if (enabled) process.env[k] = 'x-test'; else delete process.env[k]; });
  const { app } = require('../src/server.js');
  const cookie = enabled ? `vhs_token=${require('../src/modules/auth').mintJWT({ sub: 'u1', email: 'u1@example.com' })}` : '';
  return { app, cookie };
}

const ROUTES = [
  ['post', '/api/jobs', { image: 'data:x' }],
  ['get', '/api/jobs/ready', {}],
  ['get', '/api/jobs/status', {}],
  ['get', '/api/jobs/inflight', {}],
  ['post', '/api/jobs/retry-failed', {}],
  ['post', '/api/jobs/J1/retry', {}],
  ['get', '/api/jobs/J1', {}],
  ['delete', '/api/jobs/J1', {}],
  ['post', '/api/review', { data: { title: 'T' } }],
  ['get', '/api/review/pending', {}],
  ['delete', '/api/review/R1', {}],
  ['post', '/api/fill/proposals', { tape: { label: 'Jaws' } }],
  ['post', '/api/analytics/outcome', { job_id: 'J1', action: 'accepted' }],
  ['get', '/api/system', {}],
];

beforeEach(() => mockQuery.mockReset());
afterAll(() => AUTH_ENV.forEach(k => delete process.env[k]));

describe('queue routes with auth enabled', () => {
  let app, cookie;
  beforeAll(() => { ({ app, cookie } = load(true)); });

  it.each(ROUTES)('%s %s -> 401 without a session, no queries', async (method, url, body) => {
    const res = await request(app)[method](url).send(body);
    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('POST /api/jobs sets owner_id', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(app).post('/api/jobs').set('Cookie', cookie).send({ image: 'data:x' });
    expect(res.status).toBe(201);
    expect(mockQuery.mock.calls[0][0]).toMatch(/INSERT INTO upload_jobs\(.*owner_id/);
    expect(mockQuery.mock.calls[0][1].at(-1)).toBe('u1');
  });

  it('POST /api/review sets owner_id', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(app).post('/api/review').set('Cookie', cookie).send({ data: { title: 'T' } });
    expect(res.status).toBe(201);
    expect(mockQuery.mock.calls[0][0]).toMatch(/INSERT INTO review_items\(.*owner_id/);
    expect(mockQuery.mock.calls[0][1].at(-1)).toBe('u1');
  });

  it.each([
    ['/api/jobs/status', 2],
    ['/api/jobs/inflight', 1],
    ['/api/review/pending', 1],
    ['/api/system', 3],
  ])('GET %s scopes every query to the caller', async (url, nQueries) => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(app).get(url).set('Cookie', cookie);
    expect(res.status).toBe(200);
    const queueCalls = mockQuery.mock.calls.filter(([sql]) => /upload_jobs|review_items|tapes/.test(sql));
    expect(queueCalls).toHaveLength(nQueries);
    for (const [sql, params] of queueCalls) {
      expect(sql).toContain('owner_id = $1');
      expect(params).toEqual(['u1']);
    }
  });

  it('POST /api/jobs/retry-failed only retries the callers jobs', async () => {
    mockQuery.mockResolvedValue({ rowCount: 2 });
    const res = await request(app).post('/api/jobs/retry-failed').set('Cookie', cookie);
    expect(res.body).toEqual({ ok: true, requeued: 2 });
    expect(mockQuery.mock.calls[0][0]).toContain('owner_id = $1');
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1']);
  });

  it('analytics outcome update is scoped to the caller', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    await request(app).post('/api/analytics/outcome').set('Cookie', cookie).send({ job_id: 'J1', action: 'accepted' });
    expect(mockQuery.mock.calls[0][0]).toContain('owner_id = $7');
    expect(mockQuery.mock.calls[0][1].at(-1)).toBe('u1');
  });

  it.each([
    ['get', '/api/jobs/J1', { rows: [] }],
    ['delete', '/api/jobs/J1', { rowCount: 0 }],
    ['delete', '/api/review/R1', { rowCount: 0 }],
    ['post', '/api/jobs/J1/retry', { rowCount: 0 }],
  ])("%s %s on another user's id -> 404", async (method, url, result) => {
    mockQuery.mockResolvedValue(result);
    const res = await request(app)[method](url).set('Cookie', cookie);
    expect(res.status).toBe(404);
    expect(mockQuery.mock.calls[0][0]).toContain('owner_id = $2');
    expect(mockQuery.mock.calls[0][1]).toEqual([url.split('/')[3], 'u1']);
  });

  it('own job is returned and deleted', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'J1', status: 'pending' }] }).mockResolvedValueOnce({ rowCount: 1 });
    expect((await request(app).get('/api/jobs/J1').set('Cookie', cookie)).status).toBe(200);
    expect((await request(app).delete('/api/jobs/J1').set('Cookie', cookie)).status).toBe(200);
  });
});

describe('queue routes with auth disabled', () => {
  let app;
  beforeAll(() => { ({ app } = load(false)); });

  it('GET /api/jobs/inflight is unscoped and needs no session', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'J1' }] });
    const res = await request(app).get('/api/jobs/inflight');
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][0]).not.toContain('owner_id');
    expect(mockQuery.mock.calls[0][1]).toEqual([]);
  });

  it('DELETE /api/jobs/:id is unscoped and returns ok for any id', async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });
    const res = await request(app).delete('/api/jobs/J1');
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][0]).not.toContain('owner_id');
  });

  it('POST /api/jobs stores a null owner', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(app).post('/api/jobs').send({ image: 'data:x' });
    expect(res.status).toBe(201);
    expect(mockQuery.mock.calls[0][1].at(-1)).toBeNull();
  });
});
