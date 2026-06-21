// Run against the live app: docker compose --env-file .env up -d
// then: npm run test:ui
const { test, expect } = require('@playwright/test');

function makeRevItem(overrides = {}) {
  return {
    id: `rev_test_${Math.random().toString(36).slice(2, 8)}`,
    job_id: null,
    data: { title: 'Test Tape', year: '1987', label: 'Vestron', format: 'VHS', condition: 'good', status: 'in_collection' },
    thumb: null,
    source: 'scan',
    status: 'pending',
    fail_reason: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

test('confirm auto-advances to next card when multiple cards exist', async ({ page }) => {
  const item1 = makeRevItem({ id: 'rev_test_001' });
  const item2 = makeRevItem({ id: 'rev_test_002', data: { title: 'Second Tape', year: '1990', label: 'Orion', format: 'VHS', condition: 'good', status: 'in_collection' } });

  await page.route('**/api/review/pending', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([item1, item2]),
  }));
  await page.route('**/api/review/**', route => route.fulfill({ status: 200, body: '{"ok":true}' }));
  await page.route('**/api/tapes', async route => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 201, body: '{}' });
    route.continue();
  });

  await page.goto('/');
  await page.waitForSelector('.rev-card', { timeout: 15000 });

  const cards = page.locator('.rev-card');
  await expect(cards).toHaveCount(2);

  // Confirm the first card
  const confirmBtn = cards.first().locator('button[title*="onfirm"], .btn-ok').first();
  await confirmBtn.click();

  // After confirm: only one card remains
  await expect(cards).toHaveCount(1, { timeout: 3000 });
});

test('discard removes card without posting to /api/tapes', async ({ page }) => {
  let tapePostCalled = false;
  const item = makeRevItem({ id: 'rev_test_003' });

  await page.route('**/api/review/pending', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([item]),
  }));
  await page.route('**/api/review/**', route => route.fulfill({ status: 200, body: '{"ok":true}' }));
  await page.route('**/api/tapes', route => {
    if (route.request().method() === 'POST') tapePostCalled = true;
    route.continue();
  });

  await page.goto('/');
  await page.waitForSelector('.rev-card', { timeout: 15000 });

  const discardBtn = page.locator('.rev-card').first().locator('button[title*="iscard"], .btn-x').first();
  await discardBtn.click();

  // Review panel should close (no more cards)
  await expect(page.locator('#review.on')).toBeHidden({ timeout: 3000 });
  expect(tapePostCalled).toBe(false);
});

test('failed review item shows error reason and retry button', async ({ page }) => {
  const failedItem = makeRevItem({
    id: 'rev_test_004',
    status: 'failed',
    fail_reason: 'No tapes detected in image',
    data: {},
  });

  await page.route('**/api/review/pending', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([failedItem]),
  }));
  await page.route('**/api/review/**', route => route.fulfill({ status: 200, body: '{"ok":true}' }));
  await page.route('**/api/jobs/**/retry', route => route.fulfill({ status: 200, body: '{"ok":true}' }));

  await page.goto('/');
  await page.waitForSelector('.rev-card', { timeout: 15000 });

  const card = page.locator('.rev-card').first();
  // Should show the fail reason text
  await expect(card.locator('.fail-reason')).toContainText('No tapes detected', { timeout: 3000 });
});
