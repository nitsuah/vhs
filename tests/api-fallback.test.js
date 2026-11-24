'use strict';
// Unknown /api paths answer JSON 404, known paths with the wrong verb answer
// JSON 405 + Allow, and non-API paths keep their old behavior (vhs#202).
const request = require('supertest');

const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery, connect: jest.fn() })) }));
jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: () => (_req, _res, next) => next(),
  fixRequestBody: jest.fn(),
}));
jest.mock('child_process', () => ({ execSync: jest.fn() }));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: () => true,
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readdirSync: () => [],
  readFileSync: () => Buffer.from('test'),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
const { app } = require('../src/server.js');

describe('/api fallback', () => {
  it('unknown /api path -> JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('wrong method on a POST-only route -> JSON 405 with Allow', async () => {
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(405);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers.allow).toBe('POST');
    expect(res.body).toEqual({ error: 'Method not allowed' });
  });

  it('Allow lists every registered method for the path', async () => {
    const res = await request(app).post('/api/tapes/abc');
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('DELETE, PUT');
  });

  it('a real route is untouched (share handler answers, not the fallback)', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(app).get('/api/share/bogus');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'collection not found or private' });
  });
});
