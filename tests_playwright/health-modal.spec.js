'use strict';
const { test, expect } = require('@playwright/test');
const { setupBasicMocks } = require('./helpers');

async function openHealthModal(page) {
  await page.click('#btn-menu');
  await expect(page.locator('#hbr-drawer')).toHaveClass(/open/, { timeout: 2000 });
  await page.click('#btn-health');
  await expect(page.locator('#m-health')).toBeVisible({ timeout: 3000 });
}

// ── OPEN / CLOSE ──────────────────────────────────────────────────────────────

test('system health modal opens from hamburger menu', async ({ page }) => {
  await setupBasicMocks(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await openHealthModal(page);
});

test('health-close button closes the modal', async ({ page }) => {
  await setupBasicMocks(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await openHealthModal(page);
  await page.click('#health-close');
  await expect(page.locator('#m-health')).toBeHidden({ timeout: 2000 });
});

// ── STATUS INDICATORS ─────────────────────────────────────────────────────────

test('DB dot turns ok when health API returns db:ok', async ({ page }) => {
  await setupBasicMocks(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await openHealthModal(page);

  // Wait for the health check to complete
  await expect(page.locator('#health-db-dot')).toHaveClass(/ok/, { timeout: 5000 });
  await expect(page.locator('#health-db-msg')).toContainText('Connected', { timeout: 5000 });
});

test('Ollama dot turns ok when health API returns ollama:ok', async ({ page }) => {
  await setupBasicMocks(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await openHealthModal(page);

  await expect(page.locator('#health-ollama-dot')).toHaveClass(/ok/, { timeout: 5000 });
});

test('DB dot shows error when health API returns db error', async ({ page }) => {
  await page.route('**/api/health', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ db: 'error', dbError: 'connection refused', ollama: 'ok' }) }),
  );
  await page.route('**/api/tapes', route => route.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/review/pending', route => route.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/jobs/status', route => route.fulfill({ status: 200, body: '{"pending":0,"review_pending":0}' }));
  await page.route('**/api/jobs/inflight', route => route.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/logs**', route => route.fulfill({ status: 200, body: '[]' }));

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await openHealthModal(page);

  await expect(page.locator('#health-db-dot')).toHaveClass(/off/, { timeout: 5000 });
  await expect(page.locator('#health-db-msg')).toContainText('Error', { timeout: 3000 });
});

// ── RETRY BUTTON ──────────────────────────────────────────────────────────────

test('retry button triggers another health check', async ({ page }) => {
  let callCount = 0;
  await page.route('**/api/health', route => {
    callCount++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ db: 'ok', ollama: 'ok' }) });
  });
  await page.route('**/api/tapes', route => route.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/review/pending', route => route.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/jobs/status', route => route.fulfill({ status: 200, body: '{"pending":0,"review_pending":0}' }));
  await page.route('**/api/jobs/inflight', route => route.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/logs**', route => route.fulfill({ status: 200, body: '[]' }));

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await openHealthModal(page);
  const beforeCount = callCount;

  await page.click('#health-retry');
  await page.waitForTimeout(500);

  expect(callCount).toBeGreaterThan(beforeCount);
});
