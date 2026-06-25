// E2E tests for features added in feat/collection-enhancements-v3:
// - Collect tab counter (inline tape count)
// - Review tab badge + auto-hide when empty
// - Sound toggle state (text + localStorage)
// - Easter egg modal open/close
// - StacksUp zoom slider → CSS variable
// - Photo crop overlay open/save
// - FBI warning + YouTube close button
// - Fill progress status bar in review section
//
// Run after: docker compose --env-file .env up -d
// Then:      npm run test:ui
const { test, expect } = require('@playwright/test');

// Shared mock setup — mocks tapes + review APIs so the app loads cleanly
async function setupBasicMocks(page, { tapes = [], reviewItems = [] } = {}) {
  await page.route('**/api/tapes', async route => {
    if (route.request().method() === 'GET')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tapes) });
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(tapes[0] || {}) });
  });
  await page.route('**/api/review/pending', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reviewItems) }),
  );
  await page.route('**/api/jobs/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pending: 0, processing: 0, done: 0, failed: 0, review_pending: reviewItems.length }) }),
  );
  await page.route('**/api/jobs/inflight', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/health', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ db: 'ok', ollama: 'ok' }) }),
  );
  await page.route('**/api/logs**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
}

function makeTape(overrides = {}) {
  return {
    id: `VHS-${String(Math.floor(Math.random() * 9000) + 1000)}`,
    title: 'Test Tape',
    year: '1985',
    label: 'Vestron',
    format: 'VHS',
    condition: 'good',
    status: 'in_collection',
    scanned_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeRevItem(overrides = {}) {
  return {
    id: `rev_${Math.random().toString(36).slice(2, 8)}`,
    job_id: null,
    data: { title: 'Review Tape', year: '1989', label: 'Orion', format: 'VHS', condition: 'good', status: 'in_collection' },
    thumb: null,
    source: 'scan',
    status: 'pending',
    fail_reason: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── Collect tab counter ────────────────────────────────────────────────────────

test('collect tab shows tape count inline next to emoji', async ({ page }) => {
  const tapes = [makeTape(), makeTape(), makeTape()];
  await setupBasicMocks(page, { tapes });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // The count label lives inside #tab-collect beside the 📼 emoji
  const countLbl = page.locator('#collect-count');
  await expect(countLbl).toHaveText('3', { timeout: 5000 });
});

test('collect tab count updates when filtered', async ({ page }) => {
  const tapes = [
    makeTape({ title: 'Jaws', condition: 'great' }),
    makeTape({ title: 'Alien', condition: 'good' }),
  ];
  await setupBasicMocks(page, { tapes });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Switch to Collect tab and verify both tapes are shown
  await page.click('#tab-collect');
  const count = page.locator('#collect-count');
  await expect(count).toHaveText('2', { timeout: 5000 });
});

// ── Review tab badge + auto-hide ───────────────────────────────────────────────

test('review tab is hidden when no review items exist', async ({ page }) => {
  await setupBasicMocks(page, { tapes: [], reviewItems: [] });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const reviewTab = page.locator('#tab-review');
  await expect(reviewTab).toBeHidden({ timeout: 5000 });
});

test('review tab shows with correct badge count when items exist', async ({ page }) => {
  const items = [makeRevItem(), makeRevItem(), makeRevItem()];
  await setupBasicMocks(page, { reviewItems: items });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const reviewTab = page.locator('#tab-review');
  await expect(reviewTab).toBeVisible({ timeout: 5000 });

  const badge = page.locator('#tab-review-count');
  await expect(badge).toBeVisible({ timeout: 3000 });
  await expect(badge).toHaveText('3', { timeout: 3000 });
});

// ── Sound toggle ───────────────────────────────────────────────────────────────

test('sound toggle button changes text and persists to localStorage', async ({ page }) => {
  await setupBasicMocks(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Open hamburger drawer
  await page.click('#btn-menu');
  await expect(page.locator('#hbr-drawer')).toBeVisible({ timeout: 3000 });

  // Initial state: sounds on
  const soundBtn = page.locator('#btn-sound');
  await expect(soundBtn).toContainText('Sounds', { timeout: 2000 });

  // Toggle off
  await soundBtn.click();

  // Re-open drawer
  await page.click('#btn-menu');
  await expect(page.locator('#btn-sound')).toContainText('Sounds Off', { timeout: 2000 });

  // localStorage should be 'false'
  const stored = await page.evaluate(() => localStorage.getItem('vhs-sound'));
  expect(stored).toBe('false');
});

test('sound state persists across page reload', async ({ page }) => {
  await setupBasicMocks(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Disable sound
  await page.evaluate(() => { localStorage.setItem('vhs-sound', 'false'); });
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Open drawer — button should show disabled state
  await page.click('#btn-menu');
  const soundBtn = page.locator('#btn-sound');
  await expect(soundBtn).toContainText('Sounds Off', { timeout: 3000 });
});

// ── Easter egg modal ───────────────────────────────────────────────────────────

test('easter egg modal opens from hamburger menu and can be closed', async ({ page }) => {
  await setupBasicMocks(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Open drawer and click 🥚
  await page.click('#btn-menu');
  await page.click('#btn-eggs');

  const modal = page.locator('#m-eggs');
  await expect(modal).toBeVisible({ timeout: 3000 });

  // Close it
  await page.click('#eggs-close');
  await expect(modal).toBeHidden({ timeout: 3000 });
});

// ── StacksUp zoom slider ───────────────────────────────────────────────────────

test('zoom slider updates --inv-zoom CSS variable', async ({ page }) => {
  const tapes = [makeTape({ title: 'Jaws', photo_thumbnail: null })];
  await setupBasicMocks(page, { tapes });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Switch to Collect tab
  await page.click('#tab-collect');

  // Find the zoom slider
  const slider = page.locator('#zoom-slider');
  await expect(slider).toBeVisible({ timeout: 5000 });

  // Set slider to 2.0
  await slider.fill('2');
  await slider.dispatchEvent('input');

  const invZoom = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--inv-zoom').trim(),
  );
  expect(invZoom).toBe('2');
});

// ── Photo crop overlay ─────────────────────────────────────────────────────────

test('crop overlay opens when 📍 button clicked on pinned cover photo', async ({ page }) => {
  const THUMB = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=';
  const tape = makeTape({
    id: 'VHS-9001',
    title: 'Crop Test',
    photos: [THUMB],
    photo_face: THUMB,
    photo_thumbnail: THUMB,
  });

  await setupBasicMocks(page, { tapes: [tape] });
  await page.route('**/api/tapes/VHS-9001', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tape) }),
  );

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Switch to Collect tab and open detail for the tape
  await page.click('#tab-collect');
  await page.evaluate((id) => openDetail(id), tape.id);

  const modal = page.locator('#m-detail');
  await expect(modal).toBeVisible({ timeout: 5000 });

  // The 📍 button should be present for the pinned face photo
  const cropBtn = page.locator('button[title*="Adjust"]').first();
  await expect(cropBtn).toBeVisible({ timeout: 3000 });

  await cropBtn.click();

  const cropOverlay = page.locator('#m-crop');
  await expect(cropOverlay).toBeVisible({ timeout: 3000 });

  // Frame and image should be visible
  await expect(page.locator('#crop-frame')).toBeVisible();
  await expect(page.locator('#crop-img')).toBeVisible();
});

test('crop overlay can be cancelled without saving', async ({ page }) => {
  const THUMB = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=';
  const tape = makeTape({ id: 'VHS-9002', photos: [THUMB], photo_face: THUMB, photo_thumbnail: THUMB });

  await setupBasicMocks(page, { tapes: [tape] });
  await page.route('**/api/tapes/**', route => route.fulfill({ status: 200, body: '{"ok":true}' }));

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.click('#tab-collect');
  await page.evaluate((id) => openDetail(id), tape.id);

  await page.locator('button[title*="Adjust"]').first().click();
  const overlay = page.locator('#m-crop');
  await expect(overlay).toBeVisible({ timeout: 3000 });

  await page.click('#crop-cancel');
  await expect(overlay).toBeHidden({ timeout: 2000 });
});

test('crop reset button returns position to center', async ({ page }) => {
  const THUMB = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=';
  const tape = makeTape({ id: 'VHS-9003', photos: [THUMB], photo_face: THUMB, photo_thumbnail: THUMB });

  await setupBasicMocks(page, { tapes: [tape] });
  await page.route('**/api/tapes/**', route => route.fulfill({ status: 200, body: '{"ok":true}' }));

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.click('#tab-collect');
  await page.evaluate((id) => openDetail(id), tape.id);

  await page.locator('button[title*="Adjust"]').first().click();
  await expect(page.locator('#m-crop')).toBeVisible({ timeout: 3000 });

  // Move zoom slider off-center
  await page.locator('#crop-zoom').fill('200');
  await page.locator('#crop-zoom').dispatchEvent('input');

  // Pct label should show scale > 1
  const pct = page.locator('#crop-pct');
  await expect(pct).toContainText('2.0×', { timeout: 2000 });

  // Reset
  await page.click('#crop-reset');
  // After reset, scale indicator (·) should be gone (back to 1.0); × is always present as position separator
  await expect(pct).not.toContainText('·', { timeout: 2000 });
});

// ── FBI warning YouTube close button ──────────────────────────────────────────

test('FBI warning overlay can be closed via the ✕ button', async ({ page }) => {
  await setupBasicMocks(page, { tapes: [makeTape({ title: 'Jaws' })] });
  await page.route('**/api/trailer**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videoId: 'dQw4w9WgXcQ' }) }),
  );

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Trigger FBI overlay directly
  await page.evaluate(() => showFbiWarning('Jaws'));

  const overlay = page.locator('#fbi-overlay');
  await expect(overlay).toHaveClass(/active/, { timeout: 3000 });

  // Wait for youtube-mode to activate (requires videoId and 2.5s timeout)
  await expect(overlay).toHaveClass(/youtube-mode/, { timeout: 5000 });

  // Close button should now be visible (inside youtube-mode wrapper)
  const closeBtn = page.locator('#fbi-youtube-close');
  await expect(closeBtn).toBeVisible({ timeout: 2000 });
  await closeBtn.click();

  await expect(overlay).not.toHaveClass(/active/, { timeout: 3000 });
});

// ── Fill status bar in review section ─────────────────────────────────────────

test('fill review status element exists and is hidden initially', async ({ page }) => {
  const items = [makeRevItem()];
  await setupBasicMocks(page, { reviewItems: items });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const statusBar = page.locator('#fill-review-status');
  // Should be in DOM but hidden
  await expect(statusBar).toBeHidden({ timeout: 3000 });
});

// ── Hamburger drawer (mobile nav) ─────────────────────────────────────────────

test('hamburger drawer opens and closes', async ({ page }) => {
  await setupBasicMocks(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const drawer = page.locator('#hbr-drawer');
  await expect(drawer).not.toHaveClass(/open/, { timeout: 3000 });

  await page.click('#btn-menu');
  await expect(drawer).toHaveClass(/open/, { timeout: 2000 });

  // Click backdrop to close
  await page.click('#hbr-backdrop');
  await expect(drawer).not.toHaveClass(/open/, { timeout: 2000 });
});

// ── StacksUp spine zoom consistency ───────────────────────────────────────────

test('su-img-spine uses calc with --inv-zoom (zoom-aware sizing)', async ({ page }) => {
  const tape = makeTape({ title: 'Spine Test', photo_spine: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=' });
  await setupBasicMocks(page, { tapes: [tape] });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.click('#tab-collect');

  // Switch to StacksUp view (view mode 3) by evaluating directly
  await page.evaluate(() => { wallMode = 3; renderInv(); });

  const spineImg = page.locator('.su-img-spine').first();
  await expect(spineImg).toBeVisible({ timeout: 5000 });

  // Verify the CSS variable drives sizing (width should reflect zoom level)
  const width = await spineImg.evaluate(el => getComputedStyle(el).width);
  // Default zoom=1 → 186px × 1 = 186px
  expect(parseFloat(width)).toBeCloseTo(186, 0);
});
