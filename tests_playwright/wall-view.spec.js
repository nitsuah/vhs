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

// ── COVERS MODE CARDS ───────────────────────────────────────────────────────

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
  await slider.evaluate(el => {
    el.value = '1.8';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

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


// ── EXTERNAL ARTWORK LINKS ────────────────────────────────────────────────────

test('local role pins win over external links and keep their crop metadata', async ({ page }) => {
  const tape = makeTape({
    photo_spine: 'https://local.example/spine.jpg',
    photo_face: 'https://local.example/face.jpg',
    photo_thumbnail: 'https://local.example/thumb.jpg',
    artwork_links: {
      spine: { url: 'https://external.example/spine.jpg' },
      face: { url: 'https://external.example/face.jpg' },
    },
    photo_crop: { spine: { x: 20, y: 30, s: 2, r: 1 }, face: { x: 25, y: 40, s: 2, r: 1 } },
  });
  await setupBasicMocks(page, { tapes: [tape] });
  await gotoCollect(page);
  await page.click('#btn-wall');
  await expect(page.locator('#wall-view .su-card img')).toHaveAttribute('src', 'https://local.example/spine.jpg');
  await page.click('#btn-wall');
  await expect(page.locator('#wall-view .spine-card img')).toHaveAttribute('src', 'https://local.example/spine.jpg');
  await page.click('#btn-wall');
  await expect(page.locator('#wall-view .cover-card img')).toHaveAttribute('src', 'https://local.example/face.jpg');
});

test('external face and spine links are used without crop or layout transforms', async ({ page }) => {
  const tape = makeTape({
    artwork_links: {
      spine: { url: 'https://commons.example/spine.jpg' },
      face: { url: 'https://commons.example/face.jpg' },
    },
    photo_crop: { spine: { x: 10, y: 20, s: 3, r: 2 }, face: { x: 30, y: 40, s: 2, r: 1 } },
  });
  await setupBasicMocks(page, { tapes: [tape] });
  await page.route('https://commons.example/**', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: '' }));
  await gotoCollect(page);
  await page.click('#btn-wall');
  const stacks = page.locator('#wall-view .su-card img');
  await expect(stacks).toHaveAttribute('src', 'https://commons.example/spine.jpg');
  await expect(stacks).not.toHaveAttribute('style');
  await expect(stacks).not.toHaveClass(/su-img-spine/);
  await page.click('#btn-wall');
  const spine = page.locator('#wall-view .spine-card img');
  await expect(spine).toHaveAttribute('src', 'https://commons.example/spine.jpg');
  await expect(spine).not.toHaveAttribute('style', /./);
  await page.click('#btn-wall');
  const cover = page.locator('#wall-view .cover-card img');
  await expect(cover).toHaveAttribute('src', 'https://commons.example/face.jpg');
  await expect(cover).not.toHaveAttribute('style', /./);
});

test('thumbnail is the final fallback and non-HTTPS links are ignored', async ({ page }) => {
  const tape = makeTape({
    photo_thumbnail: 'https://local.example/thumb.jpg',
    artwork_links: {
      spine: { url: 'http://insecure.example/spine.jpg' },
      face: { url: 'javascript:alert(1)' },
    },
  });
  await setupBasicMocks(page, { tapes: [tape] });
  await gotoCollect(page);
  await page.click('#btn-wall');
  await expect(page.locator('#wall-view .su-card img')).toHaveAttribute('src', tape.photo_thumbnail);
  await page.click('#btn-wall');
  await expect(page.locator('#wall-view .spine-card img')).toHaveAttribute('src', tape.photo_thumbnail);
  await page.click('#btn-wall');
  await expect(page.locator('#wall-view .cover-card img')).toHaveAttribute('src', tape.photo_thumbnail);
});
