'use strict';

const request = require('supertest');

const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));
jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: () => (_req, _res, next) => next(),
}));
jest.mock('child_process', () => {
  return {
    exec: jest.fn((cmd, ...args) => {
      console.log('DEBUG: exec called with args length:', args.length);
      const cb = args.length === 1 ? args[0] : args[1];
      console.log('DEBUG: Calling callback with [null, "[]", ""]');
      cb(null, '[]', '');
    }),
    execSync: jest.fn()
  };
});
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
const { app } = require('../server');

beforeEach(() => mockQuery.mockReset());

describe('Debug POST /api/jobs', () => {
  it('should return 201 on success', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .post('/api/jobs')
      .send({ image: 'data:image/jpeg;base64,abc' });
    console.log('Status:', res.status);
    console.log('Body:', res.body);
    console.log('Mock calls:', mockQuery.mock.calls);
    expect(res.status).toBe(201);
  });
});