// Run against the live app: docker compose --env-file .env up -d
// then: npm run test:ui
const { test, expect } = require('@playwright/test');

const FAKE_JOB = {
  id: 'job_test_001',
  thumb: null,
  result: [{ title: 'Test Tape', year: '1987', label: 'Vestron', format: 'VHS' }],
  created_at: new Date().toISOString(),
};

test('confirm auto-advances to next card when multiple cards exist', async ({ page }) => {
  const FAKE_JOB_2 = { ...FAKE_JOB, id: 'job_test_002', result: [{ title: 'Second Tape', year: '1990', label: 'Orion', format: 'VHS' }] };

  await page.route('**/api/jobs/ready', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([FAKE_JOB, FAKE_JOB_2]),
  }));
  await page.route('**/api/jobs/job_test_*', route => route.fulfill({ status: 200, body: '{"ok":true}' }));
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

  await page.route('**/api/jobs/ready', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([FAKE_JOB]),
  }));
  await page.route('**/api/jobs/**', route => route.fulfill({ status: 200, body: '{"ok":true}' }));
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
