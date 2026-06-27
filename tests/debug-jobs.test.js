'use strict';

const request = require('supertest');

const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));
jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: () => (_req, _res, next) => next(),
}));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: () => true,
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readdirSync: () => [],
  readFileSync: () => Buffer.from('test'),
}));

// Mock child_process so server.js's execAsync uses the mocked exec
jest.mock('child_process', () => ({
  exec: jest.fn((cmd, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    const child = {
      stdin: {
        write: jest.fn(),
        end: jest.fn(() => {
          cb(null, '{"tapes":[{"title":"Test Tape"}]}', '');
        })
      },
      stdout: { on: jest.fn(), pipe: jest.fn() },
      stderr: { on: jest.fn(), pipe: jest.fn() },
      on: jest.fn()
    };
    return child;
  }),
  execSync: jest.fn()
}));

process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
process.env.OMDB_API_KEY = 'test-key';
const { app } = require('../server');

beforeEach(() => {
  mockQuery.mockReset();
  child_process.exec = jest.fn((cmd, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    const child = {
      stdin: {
        write: jest.fn(),
        end: jest.fn(() => {
          cb(null, '{"tapes":[{"title":"Test Tape"}]}', ''); // Simulate success with sample JSON output
        })
      },
      stdout: { on: jest.fn(), pipe: jest.fn() },
      stderr: { on: jest.fn(), pipe: jest.fn() },
      on: jest.fn()
    };
    return child;
  });
  child_process.execSync = jest.fn();
});

describe('Debug POST /api/jobs', () => {
  it('should return 201 on success', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .post('/api/jobs')
      .send({ image: 'data:image/jpeg;base64,abc' });
    expect(res.status).toBe(201);
  });
});
