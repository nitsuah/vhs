'use strict';
const { test, expect } = require('@playwright/test');
const { setupBasicMocks, gotoCollect, makeTape } = require('./helpers');

const signedOutAuth = page => page.route('**/auth/me', r =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, user: null }) }));
const openAuth = page => page.route('**/auth/me', r =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: false, user: null }) }));

test('signed-out visitors see the landing card and call no signed-in endpoint', async ({ page }) => {
  await setupBasicMocks(page, { tapes: [] });
  await signedOutAuth(page);
  const requested = [];
  page.on('request', req => requested.push(req.url()));
  await gotoCollect(page);
  await expect(page.locator('#signed-out-landing')).toBeVisible();
  await expect(page.locator('#signed-out-landing .qs-steps li')).toHaveCount(3);
  await expect(page.locator('#empty-state')).toBeHidden();
  await page.click('#btn-menu');
  await page.click('#btn-settings-mob');
  await expect(page.locator('#vision-backend-status')).toHaveText('Sign in to see scan options.');
  expect(requested.filter(u => /\/api\/(vision|ollama|jobs|review)/.test(u))).toEqual([]);
  await page.keyboard.press('Escape');
  await page.click('#tab-capture');
  await expect(page.locator('#cam-signin-notice')).toBeVisible();
});

test('the landing card stays hidden when sign-in is not in use', async ({ page }) => {
  await setupBasicMocks(page, { tapes: [makeTape()] });
  await openAuth(page);
  await gotoCollect(page);
  await expect(page.locator('#signed-out-landing')).toBeHidden();
  await expect(page.locator('#cam-signin-notice')).toBeHidden();
});

test('a search with no match offers to clear filters', async ({ page }) => {
  await setupBasicMocks(page, { tapes: [makeTape({ title: 'Test Tape' })] });
  await openAuth(page);
  await gotoCollect(page);
  await page.fill('#search', 'zzzz');
  await expect(page.locator('#empty-state')).toContainText('No tapes match');
  await page.click('#empty-clear');
  await expect(page.locator('#empty-state')).toBeHidden();
  await expect(page.locator('#search')).toHaveValue('');
});

test('exports are disabled with an empty collection', async ({ page }) => {
  await setupBasicMocks(page, { tapes: [] });
  await openAuth(page);
  await gotoCollect(page);
  await page.click('#btn-export');
  for (const id of ['#exp-json', '#exp-csv', '#exp-tags']) await expect(page.locator(id)).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#exp-dd')).not.toHaveClass(/\bon\b/);
});

test('every popup is a labelled dialog that Esc closes', async ({ page }) => {
  await setupBasicMocks(page, { tapes: [] });
  await openAuth(page);
  await gotoCollect(page);
  for (const id of ['m-health', 'm-eggs', 'm-help', 'm-settings']) {
    await page.evaluate(m => { document.getElementById(m).style.display = 'flex'; }, id);
    const dialog = page.locator(`#${id} [role="dialog"]`);
    await expect(dialog).toBeFocused();
    await expect(dialog).toHaveAttribute('aria-labelledby', /.+/);
    await page.keyboard.press('Escape');
    await expect(page.locator(`#${id}`)).toBeHidden();
  }
});

test('capture modes are named and the sound file is not fetched on load', async ({ page }) => {
  const requested = [];
  page.on('request', req => requested.push(req.url()));
  await setupBasicMocks(page, { tapes: [] });
  await openAuth(page);
  await gotoCollect(page);
  await page.click('#tab-capture');
  await page.click('.preset-btn[data-preset="spine"]');
  await expect(page.locator('#cam-mode-label')).toContainText('Single spine');
  expect(requested.filter(u => u.endsWith('akira.mp3'))).toEqual([]);
});

test('tab labels stay visible at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await setupBasicMocks(page, { tapes: [] });
  await openAuth(page);
  await gotoCollect(page);
  await expect(page.locator('#tab-capture .tab-lbl')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('focus returns to the menu and Tab passes the advanced disclosure', async ({ page }) => {
  await setupBasicMocks(page, { tapes: [] });
  await openAuth(page);
  await gotoCollect(page);
  await page.click('#btn-menu');
  await page.click('#btn-settings-mob');
  await page.locator('#s-advanced > summary').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#s-vision-backend')).not.toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#btn-menu')).toBeFocused();
});
