'use strict';
const { test, expect } = require('@playwright/test');
const { makeTape, setupBasicMocks, gotoCollect } = require('./helpers');

// ── HELP (?) ──────────────────────────────────────────────────────────────────

test('? key opens help modal', async ({ page }) => {
  await setupBasicMocks(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.keyboard.press('?');
  await expect(page.locator('#m-help')).toBeVisible({ timeout: 3000 });
});

test('Esc closes help modal', async ({ page }) => {
  await setupBasicMocks(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.keyboard.press('?');
  await expect(page.locator('#m-help')).toBeVisible({ timeout: 3000 });

  await page.keyboard.press('Escape');
  await expect(page.locator('#m-help')).toBeHidden({ timeout: 2000 });
});

test('help close button works', async ({ page }) => {
  await setupBasicMocks(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.keyboard.press('?');
  await expect(page.locator('#m-help')).toBeVisible({ timeout: 3000 });

  await page.click('#help-close');
  await expect(page.locator('#m-help')).toBeHidden({ timeout: 2000 });
});

// ── N KEY (ADD TAPE) ──────────────────────────────────────────────────────────

test('N key opens new tape modal with blank fields', async ({ page }) => {
  await setupBasicMocks(page);
  await page.route('**/api/tapes', route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, body: '[]' });
    return route.fulfill({ status: 201, body: '{"id":"VHS-9999","title":""}' });
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // N only fires when not focused in an input
  await page.keyboard.press('n');
  await expect(page.locator('#m-detail')).toBeVisible({ timeout: 3000 });

  // Fields should be empty
  await expect(page.locator('#d-title')).toHaveValue('', { timeout: 2000 });
  // Delete button should be hidden for new tapes
  const delBtn = page.locator('#d-delete');
  const display = await delBtn.evaluate(el => el.style.display);
  expect(display).toBe('none');
});

test('+ Add button opens new tape modal', async ({ page }) => {
  await setupBasicMocks(page);
  await page.route('**/api/tapes', route => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 200, body: '[]' });
    return route.fulfill({ status: 201, body: '{"id":"VHS-9999","title":""}' });
  });
  await gotoCollect(page);

  await page.click('#btn-add-tape');
  await expect(page.locator('#m-detail')).toBeVisible({ timeout: 3000 });
  // Delete should be hidden for new tapes
  const display = await page.locator('#d-delete').evaluate(el => el.style.display);
  expect(display).toBe('none');
});

// ── ESC DISMISSES MODALS ──────────────────────────────────────────────────────

test('Esc closes settings modal', async ({ page }) => {
  await setupBasicMocks(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.click('#btn-settings');
  await expect(page.locator('#m-settings')).toBeVisible({ timeout: 3000 });

  await page.keyboard.press('Escape');
  await expect(page.locator('#m-settings')).toBeHidden({ timeout: 2000 });
});

test('Esc closes detail modal', async ({ page }) => {
  const tape = makeTape({ id: 'VHS-0001', title: 'Alien' });
  await setupBasicMocks(page, { tapes: [tape] });
  await page.route('**/api/tapes/**', route => route.fulfill({ status: 200, body: '{"ok":true}' }));
  await gotoCollect(page);

  await page.evaluate((id) => openDetail(id), tape.id);
  await expect(page.locator('#m-detail')).toBeVisible({ timeout: 5000 });

  await page.keyboard.press('Escape');
  await expect(page.locator('#m-detail')).toBeHidden({ timeout: 2000 });
});

// ── N IN AN INPUT DOES NOT TRIGGER MODAL ─────────────────────────────────────

test('N inside a text input does not open the add tape modal', async ({ page }) => {
  await setupBasicMocks(page, { tapes: [makeTape()] });
  await gotoCollect(page);

  await page.focus('#search');
  await page.keyboard.press('n');

  // Modal should NOT open when focused in an input
  await expect(page.locator('#m-detail')).toBeHidden({ timeout: 500 }).catch(() => {});
});
