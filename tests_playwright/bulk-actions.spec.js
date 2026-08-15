'use strict';
const { test, expect } = require('@playwright/test');
const { makeTape, setupBasicMocks, gotoCollect } = require('./helpers');

// ── SELECTION ─────────────────────────────────────────────────────────────────

test('clicking a row selects it and shows bulk bar', async ({ page }) => {
  const tapes = [makeTape({ id: 'VHS-0001', title: 'Alien' })];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  const row = page.locator('#inv-tbl .tape-row').first();
  await row.click();

  await expect(page.locator('#bulk-bar')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#bulk-count')).toHaveText('1', { timeout: 2000 });
});

test('ctrl+click selects multiple rows', async ({ page }) => {
  const tapes = [
    makeTape({ id: 'VHS-0001', title: 'Alien' }),
    makeTape({ id: 'VHS-0002', title: 'Jaws' }),
    makeTape({ id: 'VHS-0003', title: 'Ghostbusters' }),
  ];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  const rows = page.locator('#inv-tbl .tape-row');
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ['Control'] });
  await rows.nth(2).click({ modifiers: ['Control'] });

  await expect(page.locator('#bulk-count')).toHaveText('3', { timeout: 3000 });
});

test('ctrl+click a selected row deselects it', async ({ page }) => {
  const tapes = [
    makeTape({ id: 'VHS-0001', title: 'Alien' }),
    makeTape({ id: 'VHS-0002', title: 'Jaws' }),
  ];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  const rows = page.locator('#inv-tbl .tape-row');
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ['Control'] });
  await expect(page.locator('#bulk-count')).toHaveText('2', { timeout: 2000 });

  // Deselect first row
  await rows.nth(0).click({ modifiers: ['Control'] });
  await expect(page.locator('#bulk-count')).toHaveText('1', { timeout: 2000 });
});

test('bulk-clear button hides bulk bar and deselects all', async ({ page }) => {
  const tapes = [
    makeTape({ id: 'VHS-0001', title: 'Alien' }),
    makeTape({ id: 'VHS-0002', title: 'Jaws' }),
  ];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  const rows = page.locator('#inv-tbl .tape-row');
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ['Control'] });
  await expect(page.locator('#bulk-bar')).toBeVisible({ timeout: 2000 });

  await page.click('#bulk-clear');

  await expect(page.locator('#bulk-bar')).toBeHidden({ timeout: 2000 });
  // No rows should have bulk-sel class
  const bulkRows = page.locator('#inv-tbl .tape-row.bulk-sel');
  await expect(bulkRows).toHaveCount(0);
});

// ── BULK STATUS ───────────────────────────────────────────────────────────────

test('bulk apply status sends PUT for each selected tape', async ({ page }) => {
  const tapes = [
    makeTape({ id: 'VHS-0001', title: 'Alien' }),
    makeTape({ id: 'VHS-0002', title: 'Jaws' }),
  ];
  const putIds = [];
  await setupBasicMocks(page, { tapes });
  await page.route('**/api/tapes/**', async route => {
    if (route.request().method() === 'PUT') {
      const url = route.request().url();
      putIds.push(url.split('/').pop());
      return route.fulfill({ status: 200, contentType: 'application/json', body: route.request().postData() });
    }
    route.continue();
  });

  await gotoCollect(page);

  const rows = page.locator('#inv-tbl .tape-row');
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ['Control'] });

  await page.selectOption('#bulk-status-sel', 'for_sale');
  await page.click('#bulk-apply');
  await expect.poll(() => putIds.length, { timeout: 2000 }).toBe(2);
});

// ── BULK DELETE ───────────────────────────────────────────────────────────────

test('bulk delete shows a confirmation before deleting', async ({ page }) => {
  const tapes = [makeTape({ id: 'VHS-0001', title: 'Alien' })];
  await setupBasicMocks(page, { tapes });
  await page.route('**/api/tapes/**', route => route.fulfill({ status: 200, body: '{"ok":true}' }));

  await gotoCollect(page);

  await page.locator('#inv-tbl .tape-row').first().click();
  await expect(page.locator('#bulk-bar')).toBeVisible({ timeout: 2000 });

  await page.click('#bulk-del');

  // Should show a confirm dialog or delete confirm modal
  const confirmModal = page.locator('#m-del-confirm');
  await expect(confirmModal).toBeVisible({ timeout: 3000 });
});

// ── SHIFT-CLICK RANGE SELECT ──────────────────────────────────────────────────

test('shift+click selects a range of rows', async ({ page }) => {
  const tapes = [
    makeTape({ id: 'VHS-0001', title: 'One', scanned_at: '2000-01-04T00:00:00Z' }),
    makeTape({ id: 'VHS-0002', title: 'Two', scanned_at: '2000-01-03T00:00:00Z' }),
    makeTape({ id: 'VHS-0003', title: 'Three', scanned_at: '2000-01-02T00:00:00Z' }),
    makeTape({ id: 'VHS-0004', title: 'Four', scanned_at: '2000-01-01T00:00:00Z' }),
  ];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  // Select first row, then shift-click third row → range of 3 selected
  const rows = page.locator('#inv-tbl .tape-row');
  await rows.nth(0).click();
  await rows.nth(2).click({ modifiers: ['Shift'] });

  const count = await page.locator('#bulk-count').textContent();
  expect(parseInt(count)).toBeGreaterThanOrEqual(3);
});
