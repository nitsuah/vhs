// ── EBAY SOLD-LISTING VALUATION ───────────────────────────────────────────────
// Queries the eBay Browse API for sold comparables and aggregates low/high/avg.
//
// Auth: OAuth 2.0 client-credentials flow yields an *application* token, which is
// cached in module memory until shortly before it expires.
'use strict';

const {
  EBAY_CLIENT_ID,
  EBAY_CLIENT_SECRET,
  EBAY_ENVIRONMENT,
  EBAY_MARKETPLACE_ID,
} = require('./config');

const HOSTS = {
  production: 'https://api.ebay.com',
  sandbox: 'https://api.sandbox.ebay.com',
};

const OAUTH_SCOPE = 'https://api.ebay.com/oauth/api_scope';
const VALUATION_SOURCE = 'ebay-sold';

// Refresh the token this many ms before eBay's stated expiry.
const TOKEN_SAFETY_WINDOW_MS = 60 * 1000;

function baseUrl(env = EBAY_ENVIRONMENT) {
  return HOSTS[env] || HOSTS.production;
}

function isConfigured() {
  return Boolean(EBAY_CLIENT_ID && EBAY_CLIENT_SECRET);
}

// ── Token cache ───────────────────────────────────────────────────────────────
let _token = null;       // { value, expiresAt }
let _inFlight = null;    // de-dupes concurrent refreshes

function _resetTokenCache() {
  _token = null;
  _inFlight = null;
}

function _peekTokenCache() {
  return _token;
}

async function getAppToken({ force = false } = {}) {
  if (!isConfigured()) throw new Error('eBay credentials not configured');
  const now = Date.now();
  if (!force && _token && _token.expiresAt > now) return _token.value;
  if (!force && _inFlight) return _inFlight;

  const basic = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'client_credentials', scope: OAUTH_SCOPE });

  _inFlight = (async () => {
    const r = await fetch(`${baseUrl()}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      const suffix = detail ? ': ' + detail.slice(0, 200) : '';
      throw new Error(`eBay token request failed (${r.status})${suffix}`);
    }
    const d = await r.json();
    if (!d.access_token) throw new Error('eBay token response missing access_token');
    const ttlMs = (Number(d.expires_in) || 7200) * 1000;
    _token = {
      value: d.access_token,
      expiresAt: Date.now() + Math.max(ttlMs - TOKEN_SAFETY_WINDOW_MS, 0),
    };
    return _token.value;
  })().finally(() => { _inFlight = null; });

  return _inFlight;
}

// ── Price aggregation ─────────────────────────────────────────────────────────

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Pull usable numeric prices out of Browse API itemSummaries.
 * Ignores entries with a missing/non-numeric/non-positive price, and — when a
 * currency is requested — entries quoted in a different currency (averaging
 * mixed currencies would be meaningless).
 */
function extractPrices(itemSummaries, currency = 'USD') {
  if (!Array.isArray(itemSummaries)) return [];
  const out = [];
  for (const item of itemSummaries) {
    const price = item && item.price;
    if (!price) continue;
    if (currency && price.currency && price.currency !== currency) continue;
    const value = Number(price.value);
    if (!Number.isFinite(value) || value <= 0) continue;
    out.push(value);
  }
  return out;
}

/**
 * Aggregate a list of sold prices into low / high / average.
 * Returns null when there is nothing to aggregate, so callers can distinguish
 * "no comparables" from "$0".
 */
function aggregatePrices(prices) {
  if (!Array.isArray(prices) || prices.length === 0) return null;
  const clean = prices.map(Number).filter(n => Number.isFinite(n) && n > 0);
  if (clean.length === 0) return null;
  const sum = clean.reduce((a, b) => a + b, 0);
  return {
    low: round2(Math.min(...clean)),
    high: round2(Math.max(...clean)),
    average: round2(sum / clean.length),
    sample_size: clean.length,
  };
}

/** Build the search query string sent to eBay. */
function buildQuery({ title, year, format }) {
  return [title, year, format].map(p => String(p ?? '').trim()).filter(Boolean).join(' ');
}

// ── Browse API search ─────────────────────────────────────────────────────────

async function searchSoldListings({ title, year, format, limit = 50 }) {
  const q = buildQuery({ title, year, format });
  if (!q) throw new Error('title required');

  const token = await getAppToken();
  const params = new URLSearchParams({
    q,
    filter: 'soldItemsOnly:true',
    limit: String(Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)),
  });

  const r = await fetch(`${baseUrl()}/buy/browse/v1/item_summary/search?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACE_ID,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (r.status === 401) {
    // Cached token went stale early — refresh once and retry.
    const fresh = await getAppToken({ force: true });
    const retry = await fetch(`${baseUrl()}/buy/browse/v1/item_summary/search?${params}`, {
      headers: {
        Authorization: `Bearer ${fresh}`,
        'X-EBAY-C-MARKETPLACE-ID': EBAY_MARKETPLACE_ID,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!retry.ok) throw new Error(`eBay search failed (${retry.status})`);
    return { query: q, data: await retry.json() };
  }

  if (!r.ok) throw new Error(`eBay search failed (${r.status})`);
  return { query: q, data: await r.json() };
}

/**
 * Full valuation: search sold listings, aggregate, and shape the record that
 * gets persisted onto the tape.
 */
async function valuateTitle({ title, year, format, currency = 'USD', limit }) {
  const { query, data } = await searchSoldListings({ title, year, format, limit });
  const prices = extractPrices(data && data.itemSummaries, currency);
  const agg = aggregatePrices(prices);
  const checkedAt = new Date().toISOString();

  if (!agg) {
    return {
      source: VALUATION_SOURCE,
      query,
      currency,
      low: null,
      high: null,
      average: null,
      sample_size: 0,
      checked_at: checkedAt,
    };
  }

  return { source: VALUATION_SOURCE, query, currency, ...agg, checked_at: checkedAt };
}

module.exports = {
  getAppToken,
  searchSoldListings,
  valuateTitle,
  aggregatePrices,
  extractPrices,
  buildQuery,
  isConfigured,
  baseUrl,
  VALUATION_SOURCE,
  _resetTokenCache,
  _peekTokenCache,
};
