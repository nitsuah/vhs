'use strict';
// Shared test helpers for VHS Box Playwright E2E tests
// App must be running: docker compose --env-file .env up -d
// Then: npm run test:ui

const THUMB = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=';

function makeTape(overrides = {}) {
  return {
    id: `VHS-${String(Math.floor(Math.random() * 9000) + 1000)}`,
    title: 'Test Tape',
    year: '1985',
    label: 'Vestron',
    format: 'VHS',
    condition: 'good',
    status: 'in_collection',
    scanned_at: new Date().toISOString(),
    tags: [],
    photos: [],
    photo_thumbnail: '',
    photo_face: null,
    photo_spine: null,
    photo_crop: null,
    value_low: '',
    value_high: '',
    barcode: '',
    condition_notes: '',
    ...overrides,
  };
}

function makeRevItem(overrides = {}) {
  return {
    id: `rev_${Math.random().toString(36).slice(2, 8)}`,
    job_id: null,
    data: { title: 'Review Tape', year: '1989', label: 'Orion', format: 'VHS', condition: 'good', status: 'in_collection' },
    thumb: null,
    source: 'scan',
    status: 'pending',
    fail_reason: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

async function setupBasicMocks(page, { tapes = [], reviewItems = [] } = {}) {
  await page.route('**/api/tapes', async route => {
    if (route.request().method() === 'GET')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tapes) });
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(tapes[0] || {}) });
  });
  await page.route('**/api/review/pending', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reviewItems) }),
  );
  await page.route('**/api/jobs/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pending: 0, processing: 0, done: 0, failed: 0, review_pending: reviewItems.length }) }),
  );
  await page.route('**/api/jobs/inflight', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/health', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ db: 'ok', ollama: 'ok' }) }),
  );
  await page.route('**/api/logs**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
}

async function gotoCollect(page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.click('#tab-collect');
  await page.waitForTimeout(200);
}

module.exports = { makeTape, makeRevItem, setupBasicMocks, gotoCollect, THUMB };
