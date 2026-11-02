// Proposal review is UI-only: accept/reject/edit state must never write tapes or review rows.
const { test, expect } = require('@playwright/test');
const express = require('express');
const path = require('path');

let server;
let baseUrl;

test.beforeAll(async () => {
  const app = express();
  app.use(express.static(path.resolve(__dirname, '../public')));
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Static test server did not expose a TCP port'));
        return;
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
    server.on('error', reject);
  });
});

test.afterAll(async () => {
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
});

const TAPE = {
  id: 'VHS-0001', title: 'Alien', year: 'Unknown', label: '20th Century Fox',
  format: 'VHS', value_low: '', value_high: '', barcode: '012345678905',
  imdb_id: 'tt0078748', photos: ['data:image/gif;base64,R0lGODlhAQABAAAAACw='],
  photo_thumbnail: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
};
const PROPOSALS = [
  { field: 'year', originalValue: 'Unknown', value: '1979', source: 'OMDb', confidence: 'verified', reasons: ['year suspicious'] },
  { field: 'format', originalValue: 'VHS', value: 'DVD', source: 'ai', confidence: 'low', reasons: ['format suspicious'] },
  { field: 'value_low', originalValue: '', value: '8', source: 'ai', confidence: 'inferred', reasons: ['value_low missing'] },
  { field: 'value_high', originalValue: 0, value: 12, source: 'OMDb', confidence: 'inferred', reasons: ['value_high missing'] },
  { field: 'label', originalValue: 'Alien', value: 'Aliens', source: 'OMDb', confidence: 'low', reasons: ['title suspicious'] },
];

async function openFillReview(page, options = {}) {
  const { patchStatus = 200, patchResults = {} } = options;
  await page.addInitScript(() => {
    localStorage.setItem('vhs-apikey', 'test-only');
    // Collection defaults to Stacks mode (1); this test intentionally uses
    // the table-row selector, so pin the view before app modules initialize.
    localStorage.setItem('vhs-wall-mode', '0');
  });
  const writes = [];
  const patches = [];
  let payload = null;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname === '/api/health') return route.fulfill({ json: { db: 'ok' } });
    if (url.pathname === '/api/tapes' && method === 'GET') return route.fulfill({ json: [TAPE] });
    if (url.pathname === '/api/fill/proposals' && method === 'POST') {
      payload = request.postDataJSON();
      return route.fulfill({ json: { proposals: PROPOSALS, partialFailures: { omdb: 'no_match', ollama: 'skipped', evil: 'raw provider message' } } });
    }
    if (url.pathname === '/api/tapes/VHS-0001/fill-proposals' && method === 'PATCH') {
      patches.push({ path: url.pathname, method, body: request.postDataJSON() });
      return route.fulfill({
        status: patchStatus,
        json: patchStatus >= 400 ? { error: 'internal server error' } : { results: patchResults },
      });
    }
    if (url.pathname === '/api/review/pending') return route.fulfill({ json: [] });
    if (url.pathname === '/api/jobs/inflight') return route.fulfill({ json: [] });
    if (url.pathname === '/api/jobs/status') return route.fulfill({ json: { pending: 0, processing: 0, done: 0, failed: 0, review_pending: 0 } });
    if (['POST', 'PUT', 'PATCH'].includes(method) && (/^\/api\/tapes(?:\/|$)/.test(url.pathname) || /^\/api\/review(?:\/|$)/.test(url.pathname))) {
      writes.push({ path: url.pathname, method });
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(baseUrl);
  await page.locator('#tab-collect').click();
  const row = page.locator('.tape-row[data-id="VHS-0001"]');
  await expect(row).toBeVisible();
  await row.dblclick();
  await expect(row).toHaveClass(/bulk-sel/);
  await page.locator('#bulk-fill').click();
  // Review cards live in the Review tab; Collection intentionally hides it.
  await page.locator('#tab-review').click();
  const card = page.locator('.fill-proposal-card');
  await expect(card).toBeVisible();
  return { card, payload: () => payload, writes, patches };
}

test('Fill proposals show provenance and keep accept/reject/edit decisions per field without writes', async ({ page }) => {
  const { card, payload, writes, patches } = await openFillReview(page);
  expect(payload().tape).toEqual({
    label: 'Alien', year: 'Unknown', format: 'VHS', value_low: '', value_high: '',
    barcode: '012345678905', imdb_id: 'tt0078748',
  });
  expect(payload().tape.title).toBeUndefined();
  await expect(card.locator('.fill-proposal-apply')).toBeDisabled();
  await expect(card.locator('.fill-proposal-status')).toContainText('omdb: no_match');
  await expect(card.locator('.fill-proposal-status')).not.toContainText('raw provider message');
  const year = card.locator('[data-field="year"]');
  await expect(year.locator('.fill-proposal-original')).toContainText('Unknown');
  await expect(year.locator('.fill-proposal-input')).toHaveValue('1979');
  await expect(year.locator('.fill-proposal-meta')).toContainText('OMDb');
  // The API preserves finite numeric originals; the UI must stringify them before rendering.
  await expect(card.locator('[data-field="value_high"] .fill-proposal-original')).toContainText('0');
  await expect(year.locator('.fill-confidence')).toContainText('verified');

  await year.locator('.fill-proposal-reject').click();
  await expect(year.locator('.fill-proposal-state')).toContainText('Rejected');
  await expect(card.locator('[data-field="value_low"] .fill-proposal-state')).toContainText('Pending');

  const format = card.locator('[data-field="format"]');
  const edit = format.locator('.fill-proposal-edit');
  await edit.focus();
  await edit.press('Enter');
  const input = format.locator('.fill-proposal-input');
  await expect(input).not.toHaveAttribute('readonly');
  await input.fill('VHS'); // differs from the proposed DVD value, so this is an actual edit
  await expect(format.locator('.fill-proposal-state')).toContainText('Edited');
  await format.locator('.fill-proposal-edit').click();
  await format.locator('.fill-proposal-accept').click();
  await expect(format.locator('.fill-proposal-state')).toContainText('Accepted');
  await expect(format.locator('.fill-proposal-input')).toHaveValue('VHS');

  await card.locator('.fill-proposal-accept-high').click();
  await expect(card.locator('[data-field="value_low"] .fill-proposal-state')).toContainText('Accepted');
  await expect(card.locator('[data-field="label"] .fill-proposal-state')).toContainText('Pending');
  await expect(card.locator('[data-field="label"] .fill-confidence-low')).toBeVisible();
  expect(writes).toEqual([]);
  expect(patches).toEqual([]);
  await expect(page.locator('#fill-review-status')).toContainText('nothing saved');
});

test('Apply sends only accepted allowlisted fields and reports partial outcomes safely', async ({ page }) => {
  const { card, patches, writes } = await openFillReview(page, {
    patchResults: {
      year: 'applied',
      format: 'invalid_value',
      value_low: 'stale_value_conflict',
      value_high: 'invalid_value_range',
    },
  });
  const year = card.locator('[data-field="year"]');
  const format = card.locator('[data-field="format"]');
  const low = card.locator('[data-field="value_low"]');
  const high = card.locator('[data-field="value_high"]');
  await year.locator('.fill-proposal-accept').click();
  await format.locator('.fill-proposal-accept').click();
  await low.locator('.fill-proposal-accept').click();
  await high.locator('.fill-proposal-accept').click();
  await card.locator('.fill-proposal-apply').click();

  await expect(card.locator('.fill-proposal-apply-status')).toContainText('1 accepted field applied; 3 need review.');
  expect(patches).toHaveLength(1);
  expect(patches[0].body).toEqual({
    expected: { year: 'Unknown', format: 'VHS', value_low: '', value_high: '0' },
    updates: { year: '1979', format: 'DVD', value_low: '8', value_high: '12' },
  });
  expect(patches[0].body).not.toHaveProperty('photos');
  expect(patches[0].body).not.toHaveProperty('tags');
  expect(writes).toEqual([]);
  await expect(year.locator('.fill-proposal-state')).toContainText('Applied');
  await expect(format.locator('.fill-proposal-state')).toContainText('Not applied');
  await expect(low.locator('.fill-proposal-state')).toContainText('Changed since proposal');
  await expect(high.locator('.fill-proposal-state')).toContainText('Not applied');
  await expect(card.locator('[data-field="label"] .fill-proposal-state')).toContainText('Pending');

  await page.locator('#tab-collect').click();
  const row = page.locator('.tape-row[data-id="VHS-0001"]');
  await expect(row.locator('.cell-year')).toHaveText('1979');
  await expect(row.locator('.cell-format')).toHaveText('VHS');
  await expect(row.locator('.cell-val')).toHaveText('');
});

test('failed Apply keeps accepted selections and local inventory unchanged', async ({ page }) => {
  const { card, patches, writes } = await openFillReview(page, { patchStatus: 500 });
  const year = card.locator('[data-field="year"]');
  await year.locator('.fill-proposal-accept').click();
  await card.locator('.fill-proposal-apply').click();

  await expect(card.locator('.fill-proposal-apply-status')).toContainText('Apply failed. No local changes were made');
  await expect(year.locator('.fill-proposal-state')).toContainText('Accepted (UI only)');
  await expect(year.locator('.fill-proposal-input')).toHaveValue('1979');
  expect(patches).toHaveLength(1);
  expect(writes).toEqual([]);

  await page.locator('#tab-collect').click();
  const row = page.locator('.tape-row[data-id="VHS-0001"]');
  await expect(row.locator('.cell-year')).toHaveText('Unknown');
});

test('proposal review controls fit a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { card } = await openFillReview(page);
  await expect(card.locator('.fill-proposal-accept').first()).toBeVisible();
  const dimensions = await card.locator('.fill-proposal-wrap').evaluate(el => ({
    contentScrollWidth: el.scrollWidth,
    contentClientWidth: el.clientWidth,
    viewportScrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(
    dimensions.contentScrollWidth,
    `proposal content overflow: ${JSON.stringify(dimensions)}`,
  ).toBeLessThanOrEqual(dimensions.contentClientWidth);
  expect(
    dimensions.viewportScrollWidth,
    `document horizontal overflow: ${JSON.stringify(dimensions)}`,
  ).toBeLessThanOrEqual(dimensions.viewportWidth);
});
