'use strict';
const request = require('supertest');

jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: () => (_req, _res, next) => next(),
}));
jest.mock('child_process', () => ({ execSync: jest.fn(), exec: jest.fn() }));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: () => true,
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readdirSync: () => [],
  readFileSync: () => Buffer.from('test'),
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
process.env.OMDB_API_KEY = 'test-key';

const { app, db } = require('../server');

beforeEach(() => {
  db.query = jest.fn().mockImplementation(() => Promise.resolve({}));
});

describe('Debug POST /api/jobs', () => {
  it('should return 201 on success', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .post('/api/jobs')
      .send({ image: 'data:image/jpeg;base64,abc' });
    expect(res.status).toBe(201);
  });
});