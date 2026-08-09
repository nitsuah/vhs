'use strict';
const { test, expect } = require('@playwright/test');
const { makeTape, setupBasicMocks, gotoCollect } = require('./helpers');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── EXPORT DROPDOWN ───────────────────────────────────────────────────────────

test('export dropdown opens on btn-export click', async ({ page }) => {
  const tapes = [makeTape()];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  await page.click('#btn-export');
  await expect(page.locator('#exp-dd')).toHaveClass(/on/, { timeout: 2000 });
});

test('clicking outside closes export dropdown', async ({ page }) => {
  const tapes = [makeTape()];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  await page.click('#btn-export');
  await expect(page.locator('#exp-dd')).toHaveClass(/on/, { timeout: 2000 });

  // Click somewhere else
  await page.click('h1');
  await expect(page.locator('#exp-dd')).not.toHaveClass(/on/, { timeout: 2000 });
});

// ── JSON EXPORT ───────────────────────────────────────────────────────────────

test('Export JSON triggers a download', async ({ page }) => {
  const tape = makeTape({ id: 'VHS-0001', title: 'Alien', year: '1979' });
  await setupBasicMocks(page, { tapes: [tape] });
  await gotoCollect(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.click('#btn-export');
      await page.click('#exp-json');
    })(),
  ]);

  expect(download.suggestedFilename()).toBe('vhs-inventory.json');
  const filePath = await download.path();
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  expect(Array.isArray(data)).toBe(true);
  expect(data[0].title).toBe('Alien');
  expect(data[0].year).toBe('1979');
});

// ── CSV EXPORT ────────────────────────────────────────────────────────────────

test('Export CSV triggers a download with correct headers', async ({ page }) => {
  const tape = makeTape({ id: 'VHS-0001', title: 'Jaws', year: '1975' });
  await setupBasicMocks(page, { tapes: [tape] });
  await gotoCollect(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.click('#btn-export');
      await page.click('#exp-csv');
    })(),
  ]);

  expect(download.suggestedFilename()).toBe('vhs-inventory.csv');
  const filePath = await download.path();
  const content = fs.readFileSync(filePath, 'utf-8');
  expect(content).toContain('title');
  expect(content).toContain('Jaws');
});

// ── FOR SALE EXPORT ───────────────────────────────────────────────────────────

test('For Sale Export only exports for_sale tapes', async ({ page }) => {
  const tapes = [
    makeTape({ id: 'VHS-0001', title: 'For Sale Tape', status: 'for_sale' }),
    makeTape({ id: 'VHS-0002', title: 'Keeper', status: 'in_collection' }),
  ];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.click('#btn-export');
      await page.click('#exp-sell');
    })(),
  ]);

  const filePath = await download.path();
  const content = fs.readFileSync(filePath, 'utf-8');
  expect(content).toContain('For Sale Tape');
  expect(content).not.toContain('Keeper');
});

test('For Sale Export shows alert when no for-sale tapes', async ({ page }) => {
  const tapes = [makeTape({ id: 'VHS-0001', title: 'Keeper', status: 'in_collection' })];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  // Should show a browser alert when no for-sale tapes
  let alertShown = false;
  page.on('dialog', async dialog => {
    alertShown = true;
    await dialog.dismiss();
  });

  await page.click('#btn-export');
  await page.click('#exp-sell');
  await page.waitForTimeout(500);

  expect(alertShown).toBe(true);
});

// ── JSON IMPORT ───────────────────────────────────────────────────────────────

test('importing a JSON file adds tapes and shows toast', async ({ page }) => {
  const importData = [
    { id: 'VHS-9991', title: 'Imported Tape', year: '1982', format: 'VHS', condition: 'good', status: 'in_collection', scanned_at: new Date().toISOString(), tags: [] },
  ];

  await setupBasicMocks(page, { tapes: [] });
  await page.route('**/api/tapes', async route => {
    if (route.request().method() === 'POST')
      return route.fulfill({ status: 201, contentType: 'application/json', body: route.request().postData() });
    if (route.request().method() === 'GET')
      return route.fulfill({ status: 200, body: '[]' });
    route.continue();
  });

  // Write temp JSON file
  const tmpFile = path.join(os.tmpdir(), 'test-import.json');
  fs.writeFileSync(tmpFile, JSON.stringify(importData));

  await gotoCollect(page);

  const fileInput = page.locator('#import-input');
  await fileInput.setInputFiles(tmpFile);

  // Toast should appear with import success message
  await expect(page.locator('#toast-wrap')).toContainText('Imported', { timeout: 5000 });

  fs.unlinkSync(tmpFile);
});

test('importing invalid JSON shows error toast', async ({ page }) => {
  await setupBasicMocks(page, { tapes: [] });
  await gotoCollect(page);

  const tmpFile = path.join(os.tmpdir(), 'bad-import.json');
  fs.writeFileSync(tmpFile, 'this is not json {{{');

  const fileInput = page.locator('#import-input');
  await fileInput.setInputFiles(tmpFile);

  await expect(page.locator('#toast-wrap')).toContainText('Import failed', { timeout: 5000 });

  fs.unlinkSync(tmpFile);
});

test('importing a JSON array without titles skips entries', async ({ page }) => {
  const importData = [
    { id: 'VHS-9992', title: '', format: 'VHS' },
  ];

  await setupBasicMocks(page, { tapes: [] });
  let postCalls = 0;
  await page.route('**/api/tapes', async route => {
    if (route.request().method() === 'POST') { postCalls++; return route.fulfill({ status: 201, body: route.request().postData() }); }
    return route.fulfill({ status: 200, body: '[]' });
  });

  await gotoCollect(page);

  const tmpFile = path.join(os.tmpdir(), 'empty-titles.json');
  fs.writeFileSync(tmpFile, JSON.stringify(importData));

  await page.locator('#import-input').setInputFiles(tmpFile);
  await page.waitForTimeout(500);

  // No POST calls because the entry had no title
  expect(postCalls).toBe(0);
  fs.unlinkSync(tmpFile);
});
