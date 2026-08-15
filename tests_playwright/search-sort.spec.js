'use strict';
const { test, expect } = require('@playwright/test');
const { makeTape, setupBasicMocks, gotoCollect } = require('./helpers');

// ── SEARCH ────────────────────────────────────────────────────────────────────

test('search filters list to matching titles', async ({ page }) => {
  const tapes = [
    makeTape({ id: 'VHS-0001', title: 'Alien', scanned_at: '2000-01-01T00:00:00Z' }),
    makeTape({ id: 'VHS-0002', title: 'Jaws', scanned_at: '2000-01-02T00:00:00Z' }),
    makeTape({ id: 'VHS-0003', title: 'Ghostbusters', scanned_at: '2000-01-03T00:00:00Z' }),
  ];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  const search = page.locator('#search');
  await search.fill('alien');
  await search.dispatchEvent('input');

  const rows = page.locator('#inv-tbl .tape-row');
  await expect(rows).toHaveCount(1, { timeout: 3000 });
  await expect(rows.first()).toContainText('Alien');
});

test('search filters by label', async ({ page }) => {
  const tapes = [
    makeTape({ id: 'VHS-0001', title: 'Alien', label: 'Fox Video' }),
    makeTape({ id: 'VHS-0002', title: 'Jaws', label: 'Universal' }),
  ];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  const search = page.locator('#search');
  await search.fill('fox');
  await search.dispatchEvent('input');

  const rows = page.locator('#inv-tbl .tape-row');
  await expect(rows).toHaveCount(1, { timeout: 3000 });
  await expect(rows.first()).toContainText('Alien');
});

test('clearing search restores all tapes', async ({ page }) => {
  const tapes = [
    makeTape({ id: 'VHS-0001', title: 'Alien' }),
    makeTape({ id: 'VHS-0002', title: 'Jaws' }),
  ];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  const search = page.locator('#search');
  await search.fill('alien');
  await search.dispatchEvent('input');
  await expect(page.locator('#inv-tbl .tape-row')).toHaveCount(1, { timeout: 3000 });

  await search.fill('');
  await search.dispatchEvent('input');
  await expect(page.locator('#inv-tbl .tape-row')).toHaveCount(2, { timeout: 3000 });
});

test('search with no matches shows empty state', async ({ page }) => {
  const tapes = [makeTape({ id: 'VHS-0001', title: 'Alien' })];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  const search = page.locator('#search');
  await search.fill('xyzzy_no_match');
  await search.dispatchEvent('input');

  await expect(page.locator('#inv-tbl .tape-row')).toHaveCount(0, { timeout: 3000 });
  await expect(page.locator('#empty-state')).toBeVisible({ timeout: 2000 });
});

// ── SORT ──────────────────────────────────────────────────────────────────────

test('sort Title A-Z orders tapes alphabetically', async ({ page }) => {
  const tapes = [
    makeTape({ id: 'VHS-0003', title: 'Ghostbusters', scanned_at: '2000-01-03T00:00:00Z' }),
    makeTape({ id: 'VHS-0001', title: 'Alien', scanned_at: '2000-01-01T00:00:00Z' }),
    makeTape({ id: 'VHS-0002', title: 'Jaws', scanned_at: '2000-01-02T00:00:00Z' }),
  ];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  await page.selectOption('#sort-sel', 'title_asc');
  await page.waitForTimeout(200);

  const titles = await page.locator('#inv-tbl .tape-row .title-text').allTextContents();
  expect(titles).toEqual(['Alien', 'Ghostbusters', 'Jaws']);
});

test('sort Title Z-A reverses alphabetical order', async ({ page }) => {
  const tapes = [
    makeTape({ id: 'VHS-0001', title: 'Alien', scanned_at: '2000-01-01T00:00:00Z' }),
    makeTape({ id: 'VHS-0002', title: 'Jaws', scanned_at: '2000-01-02T00:00:00Z' }),
    makeTape({ id: 'VHS-0003', title: 'Ghostbusters', scanned_at: '2000-01-03T00:00:00Z' }),
  ];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  await page.selectOption('#sort-sel', 'title_desc');
  await page.waitForTimeout(200);

  const titles = await page.locator('#inv-tbl .tape-row .title-text').allTextContents();
  expect(titles).toEqual(['Jaws', 'Ghostbusters', 'Alien']);
});

test('sort Year asc puts oldest tapes first', async ({ page }) => {
  const tapes = [
    makeTape({ id: 'VHS-0001', title: 'New', year: '1995' }),
    makeTape({ id: 'VHS-0002', title: 'Old', year: '1980' }),
    makeTape({ id: 'VHS-0003', title: 'Mid', year: '1988' }),
  ];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  await page.selectOption('#sort-sel', 'year_asc');
  await page.waitForTimeout(200);

  const titles = await page.locator('#inv-tbl .tape-row .title-text').allTextContents();
  expect(titles).toEqual(['Old', 'Mid', 'New']);
});

test('sort Year desc puts newest tapes first', async ({ page }) => {
  const tapes = [
    makeTape({ id: 'VHS-0001', title: 'Old', year: '1980' }),
    makeTape({ id: 'VHS-0002', title: 'New', year: '1995' }),
  ];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  await page.selectOption('#sort-sel', 'year_desc');
  await page.waitForTimeout(200);

  const titles = await page.locator('#inv-tbl .tape-row .title-text').allTextContents();
  expect(titles[0]).toBe('New');
  expect(titles[1]).toBe('Old');
});

test('sort Condition Best→Worst orders great before poor', async ({ page }) => {
  const tapes = [
    makeTape({ id: 'VHS-0001', title: 'Poor One', condition: 'poor' }),
    makeTape({ id: 'VHS-0002', title: 'Great One', condition: 'great' }),
    makeTape({ id: 'VHS-0003', title: 'Good One', condition: 'good' }),
  ];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  await page.selectOption('#sort-sel', 'cond_asc');
  await page.waitForTimeout(200);

  const titles = await page.locator('#inv-tbl .tape-row .title-text').allTextContents();
  expect(titles[0]).toBe('Great One');
  expect(titles[titles.length - 1]).toBe('Poor One');
});

test('sort Newest by default shows most recently scanned first', async ({ page }) => {
  const tapes = [
    makeTape({ id: 'VHS-0001', title: 'First', scanned_at: '2000-01-01T00:00:00Z' }),
    makeTape({ id: 'VHS-0002', title: 'Last', scanned_at: '2000-12-31T00:00:00Z' }),
  ];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  // Default sort is scanned_desc (newest first)
  const titles = await page.locator('#inv-tbl .tape-row .title-text').allTextContents();
  expect(titles[0]).toBe('Last');
  expect(titles[1]).toBe('First');
});
