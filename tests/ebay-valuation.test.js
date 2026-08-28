'use strict';

// Env must be set before config.js is required (it snapshots process.env at load).
process.env.EBAY_CLIENT_ID = 'test-client-id';
process.env.EBAY_CLIENT_SECRET = 'test-client-secret';
process.env.EBAY_ENVIRONMENT = 'sandbox';
process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
process.env.FETCH_IMAGE_HOST_ALLOWLIST = 'example.com';

const request = require('supertest');

const mockQuery = jest.fn();
jest.mock('pg', () => ({ Pool: jest.fn(() => ({ query: mockQuery })) }));
jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: () => (_req, _res, next) => next(),
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

const ebay = require('../src/modules/ebay');
const { app } = require('../src/server.js');

// ── fetch stubs ───────────────────────────────────────────────────────────────
function tokenRes(token = 'tok-1', expiresIn = 7200) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ access_token: token, expires_in: expiresIn }),
    text: async () => '',
  };
}
function searchRes(itemSummaries, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => ({ itemSummaries, total: (itemSummaries || []).length }),
    text: async () => '',
  };
}
const usd = v => ({ price: { value: String(v), currency: 'USD' } });

let fetchMock;
beforeEach(() => {
  mockQuery.mockReset();
  ebay._resetTokenCache();
  fetchMock = jest.fn();
  global.fetch = fetchMock;
});

// ── Aggregation ───────────────────────────────────────────────────────────────

describe('aggregatePrices', () => {
  it('returns null for empty, null, or non-array input', () => {
    expect(ebay.aggregatePrices([])).toBeNull();
    expect(ebay.aggregatePrices(null)).toBeNull();
    expect(ebay.aggregatePrices(undefined)).toBeNull();
    expect(ebay.aggregatePrices('nope')).toBeNull();
  });

  it('handles a single price (low === high === average)', () => {
    expect(ebay.aggregatePrices([12.5])).toEqual({
      low: 12.5, high: 12.5, average: 12.5, sample_size: 1,
    });
  });

  it('computes min, max and mean across several prices', () => {
    expect(ebay.aggregatePrices([10, 20, 30, 40])).toEqual({
      low: 10, high: 40, average: 25, sample_size: 4,
    });
  });

  it('rounds the average to 2 decimal places', () => {
    // 10 + 20 + 25 = 55 / 3 = 18.333...
    expect(ebay.aggregatePrices([10, 20, 25]).average).toBe(18.33);
  });

  it('drops non-finite and non-positive values from the sample', () => {
    const agg = ebay.aggregatePrices([0, -5, NaN, Infinity, 8, 12]);
    expect(agg).toEqual({ low: 8, high: 12, average: 10, sample_size: 2 });
  });

  it('returns null when every value is filtered out', () => {
    expect(ebay.aggregatePrices([0, -1, NaN])).toBeNull();
  });
});

describe('extractPrices', () => {
  it('pulls numeric price.value out of item summaries', () => {
    expect(ebay.extractPrices([usd('9.99'), usd('24.50')])).toEqual([9.99, 24.5]);
  });

  it('skips items with no price object', () => {
    expect(ebay.extractPrices([{ title: 'no price' }, usd('5')])).toEqual([5]);
  });

  it('skips prices quoted in a different currency', () => {
    const items = [usd('10'), { price: { value: '99', currency: 'GBP' } }];
    expect(ebay.extractPrices(items, 'USD')).toEqual([10]);
  });

  it('skips non-numeric and non-positive prices', () => {
    const items = [{ price: { value: 'free', currency: 'USD' } }, usd('0'), usd('7')];
    expect(ebay.extractPrices(items)).toEqual([7]);
  });

  it('returns an empty array for a missing itemSummaries field', () => {
    expect(ebay.extractPrices(undefined)).toEqual([]);
  });
});

describe('buildQuery', () => {
  it('joins title, year and format', () => {
    expect(ebay.buildQuery({ title: 'Jaws', year: '1984', format: 'VHS' })).toBe('Jaws 1984 VHS');
  });

  it('omits blank and missing parts', () => {
    expect(ebay.buildQuery({ title: 'Alien', year: '', format: undefined })).toBe('Alien');
  });
});

// ── OAuth token caching ───────────────────────────────────────────────────────

describe('getAppToken', () => {
  it('requests a client-credentials token and caches it', async () => {
    fetchMock.mockResolvedValue(tokenRes('tok-abc'));

    expect(await ebay.getAppToken()).toBe('tok-abc');
    expect(await ebay.getAppToken()).toBe('tok-abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.sandbox.ebay.com/identity/v1/oauth2/token');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe(
      'Basic ' + Buffer.from('test-client-id:test-client-secret').toString('base64')
    );
    expect(opts.body).toContain('grant_type=client_credentials');
  });

  it('expires the cached token slightly before eBay does', async () => {
    fetchMock.mockResolvedValue(tokenRes('tok-short', 90));
    await ebay.getAppToken();
    const cached = ebay._peekTokenCache();
    // 90s TTL minus the 60s safety window ≈ 30s of usable life.
    expect(cached.expiresAt - Date.now()).toBeLessThanOrEqual(30 * 1000);
    expect(cached.expiresAt).toBeGreaterThan(Date.now());
  });

  it('re-fetches when forced', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenRes('tok-1'))
      .mockResolvedValueOnce(tokenRes('tok-2'));
    expect(await ebay.getAppToken()).toBe('tok-1');
    expect(await ebay.getAppToken({ force: true })).toBe('tok-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws when the token endpoint rejects the credentials', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'invalid_client' });
    await expect(ebay.getAppToken()).rejects.toThrow(/401/);
  });

  it('throws when the response carries no access_token', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}), text: async () => '' });
    await expect(ebay.getAppToken()).rejects.toThrow(/access_token/);
  });
});

// ── Search + valuation ────────────────────────────────────────────────────────

describe('searchActiveListings', () => {
  it('hits the Browse API with a bearer token and no body headers', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenRes('tok-xyz'))
      .mockResolvedValueOnce(searchRes([usd('10')]));

    await ebay.searchActiveListings({ title: 'The Thing', year: '1982', format: 'VHS' });

    const [url, opts] = fetchMock.mock.calls[1];
    expect(url).toContain('https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search?');
    expect(url).toContain('q=The+Thing+1982+VHS');
    expect(opts.headers.Authorization).toBe('Bearer tok-xyz');
    expect(opts.headers['X-EBAY-C-MARKETPLACE-ID']).toBe('EBAY_US');
    // GET carries no body, so no Content-Type.
    expect(opts.headers['Content-Type']).toBeUndefined();
  });

  it('does not send the unsupported soldItemsOnly filter', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenRes())
      .mockResolvedValueOnce(searchRes([usd('10')]));

    await ebay.searchActiveListings({ title: 'The Thing' });

    // Browse API has no sold-item filter; sending one would be a false claim
    // of sold-price provenance (and eBay may reject it outright).
    expect(fetchMock.mock.calls[1][0]).not.toContain('soldItemsOnly');
    expect(fetchMock.mock.calls[1][0]).not.toContain('filter=');
  });

  it('rejects an empty title', async () => {
    await expect(ebay.searchActiveListings({ title: '  ' })).rejects.toThrow(/title required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes the token once and retries on a 401 from search', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenRes('stale'))
      .mockResolvedValueOnce(searchRes([], { ok: false, status: 401 }))
      .mockResolvedValueOnce(tokenRes('fresh'))
      .mockResolvedValueOnce(searchRes([usd('15')]));

    const { data } = await ebay.searchActiveListings({ title: 'Tron' });
    expect(data.itemSummaries).toHaveLength(1);
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe('Bearer fresh');
  });

  it('throws on a non-ok search response', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenRes())
      .mockResolvedValueOnce(searchRes([], { ok: false, status: 500 }));
    await expect(ebay.searchActiveListings({ title: 'Tron' })).rejects.toThrow(/500/);
  });
});

describe('valuateTitle', () => {
  it('returns an ebay-browse valuation aggregated from the listing prices', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenRes())
      .mockResolvedValueOnce(searchRes([usd('8'), usd('25'), usd('12')]));

    const v = await ebay.valuateTitle({ title: 'Jaws', year: '1984', format: 'VHS' });
    expect(v).toMatchObject({
      source: 'ebay-browse',
      basis: 'active-asking',
      query: 'Jaws 1984 VHS',
      currency: 'USD',
      low: 8,
      high: 25,
      average: 15,
      sample_size: 3,
    });
    expect(typeof v.checked_at).toBe('string');
  });

  it('never labels the result as sold data', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenRes())
      .mockResolvedValueOnce(searchRes([usd('8')]));

    const v = await ebay.valuateTitle({ title: 'Jaws' });
    expect(v.source).not.toMatch(/sold/i);
    expect(v.basis).toBe('active-asking');
  });

  it('reports sample_size 0 with null prices when there are no comps', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenRes())
      .mockResolvedValueOnce(searchRes([]));

    const v = await ebay.valuateTitle({ title: 'Nonexistent Tape' });
    expect(v).toMatchObject({
      source: 'ebay-browse', low: null, high: null, average: null, sample_size: 0,
    });
  });
});

// ── Routes ────────────────────────────────────────────────────────────────────

describe('GET /api/valuate', () => {
  it('400s without a title', async () => {
    const res = await request(app).get('/api/valuate');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title required/);
  });

  it('returns a preview valuation without touching the database', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenRes())
      .mockResolvedValueOnce(searchRes([usd('20'), usd('30')]));

    const res = await request(app).get('/api/valuate').query({ title: 'Akira', format: 'VHS' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: 'ebay-browse', low: 20, high: 30, average: 25, sample_size: 2 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('502s when the eBay call fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
    const res = await request(app).get('/api/valuate').query({ title: 'Akira' });
    expect(res.status).toBe(502);
  });
});

describe('POST /api/tapes/:id/valuate', () => {
  it('404s when the tape does not exist', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(app).post('/api/tapes/VHS-9999/valuate').send({});
    expect(res.status).toBe(404);
  });

  it('400s when neither the tape nor the body carries a title', async () => {
    mockQuery.mockResolvedValue({ rows: [{ data: { id: 'VHS-0001' } }] });
    const res = await request(app).post('/api/tapes/VHS-0001/valuate').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title required/);
  });

  it('stores the valuation via a JSONB merge and mirrors value_low/high', async () => {
    const merged = { id: 'VHS-0001', title: 'Jaws', value_low: '8', value_high: '25' };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ data: { id: 'VHS-0001', title: 'Jaws', year: '1984', format: 'VHS' } }] })
      .mockResolvedValueOnce({ rows: [{ data: merged }] });
    fetchMock
      .mockResolvedValueOnce(tokenRes())
      .mockResolvedValueOnce(searchRes([usd('8'), usd('25'), usd('12')]));

    const res = await request(app).post('/api/tapes/VHS-0001/valuate').send({});
    expect(res.status).toBe(200);
    expect(res.body.valuation).toMatchObject({
      source: 'ebay-browse', basis: 'active-asking', low: 8, high: 25, average: 15, sample_size: 3,
    });

    const [sql, params] = mockQuery.mock.calls[1];
    // Server-side merge, not a read-modify-write of the whole row.
    expect(sql).toMatch(/UPDATE tapes SET data = data \|\| \$1::jsonb/);
    expect(sql).toMatch(/RETURNING data/);

    const patch = JSON.parse(params[0]);
    expect(patch.valuation.source).toBe('ebay-browse');
    expect(patch.value_low).toBe('8');
    expect(patch.value_high).toBe('25');
    // The patch carries ONLY the fields this handler owns, so a concurrent
    // edit to any other field survives.
    expect(Object.keys(patch).sort()).toEqual(['valuation', 'value_high', 'value_low']);

    // Response reports the committed state returned by the database.
    expect(res.body.tape).toEqual(merged);
  });

  it('prefers a title supplied in the body over the stored one', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ data: { id: 'VHS-0001', title: 'Old Title' } }] })
      .mockResolvedValueOnce({ rows: [{ data: { id: 'VHS-0001' } }] });
    fetchMock
      .mockResolvedValueOnce(tokenRes())
      .mockResolvedValueOnce(searchRes([usd('11')]));

    const res = await request(app)
      .post('/api/tapes/VHS-0001/valuate')
      .send({ title: 'Edited Title', year: '1990', format: 'VHS' });

    expect(res.status).toBe(200);
    expect(res.body.valuation.query).toBe('Edited Title 1990 VHS');
  });

  it('records a zero-comp result when there is no prior valuation', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ data: { id: 'VHS-0001', title: 'Obscure' } }] })
      .mockResolvedValueOnce({ rows: [{ data: { id: 'VHS-0001' } }] });
    fetchMock
      .mockResolvedValueOnce(tokenRes())
      .mockResolvedValueOnce(searchRes([]));

    const res = await request(app).post('/api/tapes/VHS-0001/valuate').send({});
    expect(res.status).toBe(200);
    const patch = JSON.parse(mockQuery.mock.calls[1][1][0]);
    // Empty result is recorded, but no bogus value_low/high are written.
    expect(patch.valuation.sample_size).toBe(0);
    expect(patch.value_low).toBeUndefined();
    expect(patch.value_high).toBeUndefined();
  });

  it('preserves a prior valuation and estimate when a re-check finds no comps', async () => {
    const prior = {
      source: 'ebay-browse', low: 3, high: 9, average: 6,
      sample_size: 4, checked_at: '2026-01-01T00:00:00.000Z',
    };
    mockQuery.mockResolvedValueOnce({
      rows: [{ data: { id: 'VHS-0001', title: 'Obscure', value_low: '3', value_high: '9', valuation: prior } }],
    });
    fetchMock
      .mockResolvedValueOnce(tokenRes())
      .mockResolvedValueOnce(searchRes([]));

    const res = await request(app).post('/api/tapes/VHS-0001/valuate').send({});
    expect(res.status).toBe(200);

    // No UPDATE at all — the stored valuation, its figures and its checked_at
    // timestamp all survive.
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(res.body.tape.valuation).toEqual(prior);
    expect(res.body.tape.value_low).toBe('3');

    // The UI still gets the fresh empty result so it can report "no comps".
    expect(res.body.valuation.sample_size).toBe(0);
  });

  it('502s when the eBay lookup fails, leaving the tape untouched', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ data: { id: 'VHS-0001', title: 'Jaws' } }] });
    fetchMock.mockResolvedValue({ ok: false, status: 503, text: async () => 'upstream-secret-detail' });

    const res = await request(app).post('/api/tapes/VHS-0001/valuate').send({});
    expect(res.status).toBe(502);
    expect(mockQuery).toHaveBeenCalledTimes(1); // no UPDATE issued

    // Upstream detail stays server-side.
    expect(res.body.error).toBe('eBay lookup failed');
    expect(JSON.stringify(res.body)).not.toContain('upstream-secret-detail');
  });

  it('500s when the tape read fails', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));
    const res = await request(app).post('/api/tapes/VHS-0001/valuate').send({});
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/connection refused/);
  });
});
