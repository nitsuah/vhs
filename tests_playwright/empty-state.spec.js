'use strict';
const { test, expect } = require('@playwright/test');
const { setupBasicMocks, gotoCollect } = require('./helpers');

// ── EMPTY STATE DISPLAY ───────────────────────────────────────────────────────

test('empty state shows when no tapes exist', async ({ page }) => {
  await setupBasicMocks(page, { tapes: [] });
  await gotoCollect(page);

  await expect(page.locator('#empty-state')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#empty-state')).toContainText('No tapes yet');
});

test('empty state is hidden when tapes exist', async ({ page }) => {
  const tapes = [{ id: 'VHS-0001', title: 'Alien', year: '1979', format: 'VHS', condition: 'good', status: 'in_collection', scanned_at: new Date().toISOString() }];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  await expect(page.locator('#empty-state')).toBeHidden({ timeout: 5000 });
  await expect(page.locator('#inv-tbl .tape-row')).toHaveCount(1, { timeout: 3000 });
});

test('empty state has an Add Manually button that opens modal', async ({ page }) => {
  await setupBasicMocks(page, { tapes: [] });
  await page.route('**/api/tapes', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, body: '[]' });
    return route.fulfill({ status: 201, body: '{}' });
  });
  await gotoCollect(page);

  await expect(page.locator('#empty-state')).toBeVisible({ timeout: 5000 });

  // Click the "Add Manually" button in the empty state
  await page.click('#empty-state button:has-text("Add Manually")');
  await expect(page.locator('#m-detail')).toBeVisible({ timeout: 3000 });
});

// ── COUNT BADGE ───────────────────────────────────────────────────────────────

test('count badge shows correct number of tapes', async ({ page }) => {
  const tapes = [
    { id: 'VHS-0001', title: 'One', year: '1979', format: 'VHS', condition: 'good', status: 'in_collection', scanned_at: new Date().toISOString() },
    { id: 'VHS-0002', title: 'Two', year: '1980', format: 'VHS', condition: 'good', status: 'in_collection', scanned_at: new Date().toISOString() },
    { id: 'VHS-0003', title: 'Three', year: '1981', format: 'VHS', condition: 'good', status: 'in_collection', scanned_at: new Date().toISOString() },
  ];
  await setupBasicMocks(page, { tapes });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('#collect-count')).toHaveText('3', { timeout: 5000 });
});

test('collect tab count badge shows 0 with no tapes', async ({ page }) => {
  await setupBasicMocks(page, { tapes: [] });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Tab count should be empty or show 0
  const tabCount = page.locator('#collect-count');
  const text = await tabCount.textContent();
  expect(text === '' || text === '0').toBe(true);
});
