'use strict';
const request = require('supertest');
const path = require('path');
const fs = jest.requireActual('fs');

// Must mock pg and http-proxy-middleware before requiring server.js
const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockClient = { query: mockClientQuery, release: jest.fn() };
const mockConnect = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery, connect: mockConnect })) }));
jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: () => (_req, _res, next) => next(),
}));
// Prevent openssl/fs calls during test load
jest.mock('child_process', () => ({ execSync: jest.fn() }));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: () => true,
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readdirSync: () => [],        // no migrations to run in tests
  readFileSync: () => Buffer.from('test'),
}));

// Keep the real lookup functions as defaults for existing GET tests; proposal
// route tests override these module-level references without live providers.
jest.mock('../src/modules/omdb', () => {
  const actual = jest.requireActual('../src/modules/omdb');
  return { ...actual, enhancedLookup: jest.fn(actual.enhancedLookup) };
});
jest.mock('../src/modules/tmdb', () => {
  const actual = jest.requireActual('../src/modules/tmdb');
  return { ...actual, tmdbLookup: jest.fn(actual.tmdbLookup) };
});
jest.mock('../src/modules/ollama', () => {
  const actual = jest.requireActual('../src/modules/ollama');
  return { ...actual, resolveOllamaUrl: jest.fn(actual.resolveOllamaUrl) };
});

process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
process.env.OMDB_API_KEY = '';
process.env.TMDB_KEY = '';
process.env.FETCH_IMAGE_HOST_ALLOWLIST = 'example.com';
const { app } = require('../src/server.js');

beforeEach(() => {
  mockQuery.mockReset();
  mockClientQuery.mockReset();
  mockConnect.mockReset().mockResolvedValue(mockClient);
  mockClient.release.mockReset();
});

describe('Security headers on API responses', () => {
  it('GET /api/health returns HSTS and X-Content-Type-Options', async () => {
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed'));

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('Security headers on HTML responses', () => {
  it('GET / (SPA catch-all) returns HSTS and X-Content-Type-Options', async () => {
    // The middleware runs first; headers should be present regardless of downstream status
    // Mock the DB query that the SPA catch-all might trigger via activity log
    mockQuery.mockResolvedValue({ rows: [] });
    // Mock express.static to just pass through to next middleware (the catch-all)
    const express = require('express');
    const origStatic = express.static;
    express.static = () => (_req, _res, next) => next();

    const res = await request(app).get('/').timeout(10000);

    // Restore
    express.static = origStatic;

    // Headers should be set by middleware even if downstream returns 500
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('public/_headers file', () => {
  it('contains /* block with both header lines', () => {
    const headersPath = path.join(__dirname, '..', 'public', '_headers');
    const content = fs.readFileSync(headersPath, 'utf8');

    expect(content).toContain('/*');
    expect(content).toContain('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    expect(content).toContain('X-Content-Type-Options: nosniff');
    expect(content.endsWith('\n')).toBe(true);
  });
});
