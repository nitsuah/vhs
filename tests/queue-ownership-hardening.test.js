'use strict';
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
const mockLookup = jest.fn();
jest.mock('dns', () => ({ promises: { lookup: (...a) => mockLookup(...a) } }));
const mockExchange = jest.fn();

function load() {
  jest.resetModules();
  process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
  process.env.GOOGLE_CLIENT_ID = 'x'; process.env.GOOGLE_CLIENT_SECRET = 'x'; process.env.JWT_SECRET = 'x';
  process.env.LEGACY_OWNER_EMAIL = 'Owner@Example.com';
  process.env.FETCH_IMAGE_HOST_ALLOWLIST = 'example.com';
  jest.doMock('../src/modules/auth', () => ({ ...jest.requireActual('../src/modules/auth'), exchangeCode: (...a) => mockExchange(...a) }));
  const { app } = require('../src/server.js');
  const cookie = (sub) => `vhs_token=${require('../src/modules/auth').mintJWT({ sub, email: `${sub}@example.com` })}`;
  return { app, cookie };
}

let app, cookie;
beforeAll(() => { ({ app, cookie } = load()); });
beforeEach(() => { mockQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 }); mockLookup.mockReset(); mockExchange.mockReset(); });
afterAll(() => ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'JWT_SECRET', 'LEGACY_OWNER_EMAIL', 'FETCH_IMAGE_HOST_ALLOWLIST'].forEach(k => delete process.env[k]));

describe('cross-user access returns 404', () => {
  // Rows exist for u1 only: any query carrying another owner matches nothing.
  beforeEach(() => {
    mockQuery.mockImplementation(async (_sql, params) => (params && params.includes('u1') ? { rows: [{ id: 'J1' }], rowCount: 1 } : { rows: [], rowCount: 0 }));
  });
  it.each([['get', '/api/jobs/J1'], ['delete', '/api/jobs/J1'], ['post', '/api/jobs/J1/retry'], ['delete', '/api/review/R1']])('u2 %s %s', async (m, url) => {
    expect((await request(app)[m](url).set('Cookie', cookie('u1'))).status).not.toBe(404);
    const res = await request(app)[m](url).set('Cookie', cookie('u2'));
    expect(res.status).toBe(404);
    expect(mockQuery.mock.calls.at(-1)[1]).toContain('u2');
  });
});

describe('legacy claim on sign-in', () => {
  async function callback(payload) {
    mockExchange.mockResolvedValue(payload);
    await request(app).get('/auth/google/callback?code=c&state=s').set('Cookie', 'oauth_state=s');
    return mockQuery.mock.calls.map(c => c[0]).filter(sql => /^UPDATE (tapes|upload_jobs|review_items|scan_analytics) SET owner_id/.test(sql));
  }
  it('claims for a verified, matching email (case-insensitive)', async () => {
    expect(await callback({ sub: 'o1', email: 'OWNER@example.com', email_verified: true })).toHaveLength(4);
  });
  it('does not claim when the email is unverified', async () => {
    expect(await callback({ sub: 'o1', email: 'owner@example.com', email_verified: false })).toHaveLength(0);
    expect(await callback({ sub: 'o1', email: 'owner@example.com' })).toHaveLength(0);
  });
  it('does not claim for a different email', async () => {
    expect(await callback({ sub: 'x1', email: 'other@example.com', email_verified: true })).toHaveLength(0);
  });
});

describe('external-API routes require sign-in', () => {
  it.each(['/api/lookup?title=Jaws', '/api/lookup/barcode/0123456789012', '/api/artwork/search?title=Jaws', '/api/fetch-image?url=https://example.com/a.jpg'])('%s -> 401', async (url) => {
    expect((await request(app).get(url)).status).toBe(401);
  });
});

describe('fetch-image private address checks', () => {
  it.each([
    '::ffff:127.0.0.1', '::ffff:10.1.2.3', '::ffff:7f00:1', '100.64.0.1', '100.127.255.254', '0.1.2.3', '0.0.0.0',
    '169.254.169.254', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'febf::1', '::1', '::', 'not-an-ip', '1.2.3', '',
  ])('rejects resolved address %p', async (addr) => {
    mockLookup.mockResolvedValue([{ address: addr }]);
    const res = await request(app).get('/api/fetch-image?url=https://example.com/a.jpg').set('Cookie', cookie('u1'));
    expect(res.status).toBe(403);
  });
  it('rejects a literal private IPv4 host', async () => {
    const res = await request(app).get('/api/fetch-image?url=http://100.64.0.1/a.jpg').set('Cookie', cookie('u1'));
    expect(res.status).toBe(403);
  });
  it.each(['93.184.216.34', '100.63.0.1', '100.128.0.1', '2606:4700::1', '::ffff:93.184.216.34'])('allows public %p', async (addr) => {
    const { isPrivateAddress } = require('../src/modules/ip-guard');
    expect(isPrivateAddress(addr)).toBe(false);
  });
});
