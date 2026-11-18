'use strict';
const { test, expect } = require('@playwright/test');
const { makeTape, setupBasicMocks, gotoCollect } = require('./helpers');

test.beforeEach(async ({ page }) => {
  // Keep each test independent of the persisted user preference/default view.
  await page.addInitScript(() => localStorage.setItem('vhs-wall-mode', '0'));
});

// ── WALL MODE CYCLING ─────────────────────────────────────────────────────────

test('initial view is list (inv-list visible, wall-view empty)', async ({ page }) => {
  const tapes = [makeTape({ id: 'VHS-0001', title: 'Alien' })];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  await expect(page.locator('#inv-list')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#wall-view')).not.toHaveClass(/on/);
});

test('first click of btn-wall switches to StacksUp mode', async ({ page }) => {
  const tapes = [makeTape({ id: 'VHS-0001', title: 'Alien' })];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  await page.click('#btn-wall');
  await page.waitForTimeout(200);

  const wall = page.locator('#wall-view');
  await expect(wall).toHaveClass(/on/, { timeout: 3000 });
  await expect(wall).toHaveClass(/stacksup-mode/);
  await expect(wall).not.toHaveClass(/spine-mode/);
  await expect(wall).not.toHaveClass(/covers-mode/);

  // List should be hidden
  const listEl = page.locator('#inv-list');
  const display = await listEl.evaluate(el => getComputedStyle(el).display);
  expect(display).toBe('none');
});

test('second click switches to spine mode', async ({ page }) => {
  const tapes = [makeTape({ id: 'VHS-0001', title: 'Alien' })];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  await page.click('#btn-wall');
  await page.click('#btn-wall');
  await page.waitForTimeout(200);

  await expect(page.locator('#wall-view')).toHaveClass(/spine-mode/, { timeout: 3000 });
});

test('third click switches to covers mode', async ({ page }) => {
  const tapes = [makeTape({ id: 'VHS-0001', title: 'Alien' })];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  await page.click('#btn-wall');
  await page.click('#btn-wall');
  await page.click('#btn-wall');
  await page.waitForTimeout(200);

  await expect(page.locator('#wall-view')).toHaveClass(/covers-mode/, { timeout: 3000 });
});

test('fourth click returns to list mode', async ({ page }) => {
  const tapes = [makeTape({ id: 'VHS-0001', title: 'Alien' })];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  // Cycle all 4 modes
  for (let i = 0; i < 4; i++) await page.click('#btn-wall');
  await page.waitForTimeout(200);

  await expect(page.locator('#wall-view')).not.toHaveClass(/on/, { timeout: 3000 });
  await expect(page.locator('#inv-list')).toBeVisible({ timeout: 2000 });
});

// ── STACKSUP MODE CARDS ──────────────────────────────────────────────────────────

test('StacksUp mode renders su-card elements for each tape', async ({ page }) => {
  const tapes = [
    makeTape({ id: 'VHS-0001', title: 'Alien' }),
    makeTape({ id: 'VHS-0002', title: 'Jaws' }),
  ];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  await page.click('#btn-wall'); // mode 1: StacksUp
  await page.waitForTimeout(200);

  const cards = page.locator('#wall-view .su-card');
  await expect(cards).toHaveCount(2, { timeout: 3000 });
});

// ── SPINE MODE CARDS ──────────────────────────────────────────────────────────

test('spine mode renders spine-card elements', async ({ page }) => {
  const tapes = [
    makeTape({ id: 'VHS-0001', title: 'Alien' }),
    makeTape({ id: 'VHS-0002', title: 'Jaws' }),
  ];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  await page.click('#btn-wall'); // mode 1
  await page.click('#btn-wall'); // mode 2: spine
  await page.waitForTimeout(200);

  const cards = page.locator('#wall-view .spine-card');
  await expect(cards).toHaveCount(2, { timeout: 3000 });
});

// ── STACKSUP MODE CARDS ───────────────────────────────────────────────────────

test('covers mode renders cover-card elements', async ({ page }) => {
  const tapes = [
    makeTape({ id: 'VHS-0001', title: 'Alien' }),
    makeTape({ id: 'VHS-0002', title: 'Jaws' }),
  ];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  await page.click('#btn-wall'); // mode 1
  await page.click('#btn-wall'); // mode 2
  await page.click('#btn-wall'); // mode 3: Covers
  await page.waitForTimeout(200);

  await expect(page.locator('#wall-view')).toHaveClass(/covers-mode/, { timeout: 3000 });
  const cards = page.locator('#wall-view .cover-card');
  await expect(cards).toHaveCount(2, { timeout: 3000 });
});

// ── BTN-WALL LABEL ────────────────────────────────────────────────────────────

test('btn-wall label cycles through view names', async ({ page }) => {
  const tapes = [makeTape()];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  const btn = page.locator('#btn-wall');
  await expect(btn).toHaveText('📋 Table');

  await btn.click();
  await expect(btn).toHaveText('📚 StacksUp');

  await btn.click();
  await expect(btn).toHaveText('⊠ Spines');

  await btn.click();
  await expect(btn).toHaveText('⊟ Covers');

  await btn.click();
  await expect(btn).toHaveText('📋 Table');
});

// ── ZOOM SLIDER ───────────────────────────────────────────────────────────────

test('zoom slider persists to localStorage and CSS variable', async ({ page }) => {
  const tapes = [makeTape()];
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);

  const slider = page.locator('#zoom-slider');
  await slider.fill('1.8');
  await slider.dispatchEvent('input');

  const cssVar = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--inv-zoom').trim(),
  );
  expect(cssVar).toBe('1.8');

  const stored = await page.evaluate(() => localStorage.getItem('vhs-collection-zoom'));
  expect(stored).toBe('1.8');
});

test('zoom slider restores saved value on reload', async ({ page }) => {
  const tapes = [makeTape()];
  await setupBasicMocks(page, { tapes });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => localStorage.setItem('vhs-collection-zoom', '2.1'));

  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.click('#tab-collect');

  const slider = page.locator('#zoom-slider');
  await expect(slider).toHaveValue('2.1', { timeout: 3000 });

  const cssVar = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--inv-zoom').trim(),
  );
  expect(cssVar).toBe('2.1');
});

// ── WALL CARD MULTI-SELECT ──────────────────────────────────────────────

test('double-clicking a wall card toggles multi-select without opening detail', async ({ page }) => {
  const tape = makeTape({ id: 'VHS-0001', title: 'Alien' });
  await setupBasicMocks(page, { tapes: [tape] });
  await page.route('**/api/tapes/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tape) }),
  );
  await gotoCollect(page);

  await page.click('#btn-wall'); // enter StacksUp mode
  await page.waitForTimeout(200);

  const card = page.locator('#wall-view .su-card').first();
  await card.dblclick();

  await expect(card).toHaveClass(/bulk-sel/, { timeout: 3000 });
  await expect(page.locator('#m-detail')).not.toBeVisible();
});
