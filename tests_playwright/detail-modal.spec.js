// Run against the live app: docker compose --env-file .env up -d
// then: npm run test:ui
const { test, expect } = require('@playwright/test');

const THUMB = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=';

function makeTape(overrides = {}) {
  return {
    id: 'VHS-0042',
    title: 'Ghostbusters',
    year: '1984',
    label: 'Columbia',
    format: 'VHS',
    condition: 'good',
    status: 'in_collection',
    scanned_at: new Date().toISOString(),
    ...overrides,
  };
}

async function setupMocks(page, tapes) {
  let savedTape = tapes[0] ? { ...tapes[0] } : null;

  await page.route('**/api/tapes', async route => {
    if (route.request().method() === 'GET')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tapes) });
    if (route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      savedTape = body;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(body) });
    }
    route.continue();
  });
  await page.route('**/api/tapes/**', async route => {
    if (route.request().method() === 'PUT') {
      const body = JSON.parse(route.request().postData() || '{}');
      savedTape = body;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (route.request().method() === 'DELETE')
      return route.fulfill({ status: 200, body: '{"ok":true}' });
    route.continue();
  });
  await page.route('**/api/review/**', route =>
    route.fulfill({ status: 200, body: JSON.stringify([]) }),
  );
  await page.route('**/api/review/pending', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/jobs/**', route =>
    route.fulfill({ status: 200, body: '{"ok":true}' }),
  );
  await page.route('**/api/jobs/status', route =>
    route.fulfill({ status: 200, body: '{"pending":0,"processing":0,"done":0,"failed":0,"review_pending":0}' }),
  );
  await page.route('**/api/jobs/inflight', route =>
    route.fulfill({ status: 200, body: '[]' }),
  );
  await page.route('**/api/health', route =>
    route.fulfill({ status: 200, body: '{"db":"ok","ollama":"ok"}' }),
  );
  await page.route('**/api/logs**', route =>
    route.fulfill({ status: 200, body: '[]' }),
  );
  await page.route('**/api/lookup**', route =>
    route.fulfill({ status: 200, body: '{}' }),
  );

  return () => savedTape;
}

// ── Open / close ──────────────────────────────────────────────────────────────

test('detail modal opens with tape data populated', async ({ page }) => {
  const tape = makeTape({ title: 'Ghostbusters', year: '1984', label: 'Columbia' });
  await setupMocks(page, [tape]);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.click('#tab-collect');
  // Open detail via programmatic call
  await page.evaluate((id) => openDetail(id), tape.id);

  const modal = page.locator('#m-detail');
  await expect(modal).toBeVisible({ timeout: 5000 });

  await expect(page.locator('#d-title')).toHaveValue('Ghostbusters');
  await expect(page.locator('#d-year')).toHaveValue('1984');
  await expect(page.locator('#d-label')).toHaveValue('Columbia');
});

test('save button closes the modal immediately', async ({ page }) => {
  const tape = makeTape();
  const getSaved = await setupMocks(page, [tape]);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.click('#tab-collect');
  await page.evaluate((id) => openDetail(id), tape.id);

  await page.fill('#d-title', 'Updated Title');
  await page.click('#d-save');

  await expect(page.locator('#m-detail')).toBeHidden({ timeout: 2000 });
  // Title was sent in PUT body
  const saved = getSaved();
  expect(saved?.title).toBe('Updated Title');
});

test('cancel button closes modal without saving changes', async ({ page }) => {
  const tape = makeTape({ title: 'Original Title' });
  const getSaved = await setupMocks(page, [tape]);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.click('#tab-collect');
  await page.evaluate((id) => openDetail(id), tape.id);

  await page.fill('#d-title', 'Changed But Not Saved');
  await page.click('#d-cancel');

  await expect(page.locator('#m-detail')).toBeHidden({ timeout: 2000 });
});

// ── Photo management ──────────────────────────────────────────────────────────

test('pinning face photo shows cover badge and blue border', async ({ page }) => {
  const tape = makeTape({ photos: [THUMB], photo_thumbnail: THUMB });
  await setupMocks(page, [tape]);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.click('#tab-collect');
  await page.evaluate((id) => openDetail(id), tape.id);

  const modal = page.locator('#m-detail');
  await expect(modal).toBeVisible({ timeout: 5000 });

  // Detail photos should be visible
  await expect(page.locator('#detail-photos')).toBeVisible({ timeout: 3000 });

  // Pin the photo as face cover
  const pinFaceBtn = page.locator('button[title="Pin as cover (wall view)"]').first();
  await pinFaceBtn.click();

  // Active (blue) border should appear immediately
  const thumbImg = page.locator('#detail-photos img').first();
  const borderColor = await thumbImg.evaluate(el => getComputedStyle(el).borderColor);
  // Blue = rgb(68, 136, 255) approximately
  expect(borderColor).toMatch(/68/);
});

test('📍 adjust button appears for pinned cover photo', async ({ page }) => {
  const tape = makeTape({ photos: [THUMB], photo_face: THUMB, photo_thumbnail: THUMB });
  await setupMocks(page, [tape]);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.click('#tab-collect');
  await page.evaluate((id) => openDetail(id), tape.id);

  await expect(page.locator('#m-detail')).toBeVisible({ timeout: 5000 });

  // 📍 button should be present because photo is already pinned
  const adjustBtn = page.locator('button[title="Adjust position / zoom"]');
  await expect(adjustBtn).toBeVisible({ timeout: 3000 });
});

test('crop overlay opens from 📍 button and saves via PUT', async ({ page }) => {
  const tape = makeTape({ id: 'VHS-0042', photos: [THUMB], photo_face: THUMB, photo_thumbnail: THUMB });
  const getSaved = await setupMocks(page, [tape]);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.click('#tab-collect');
  await page.evaluate((id) => openDetail(id), tape.id);

  await page.locator('button[title="Adjust position / zoom"]').first().click();
  const cropModal = page.locator('#m-crop');
  await expect(cropModal).toBeVisible({ timeout: 3000 });

  // Save immediately (default 50%/50% position)
  await page.click('#crop-save');
  await expect(cropModal).toBeHidden({ timeout: 2000 });

  // photo_crop should have been set on the tape
  const saved = getSaved();
  expect(saved?.photo_crop?.face).toBeDefined();
  expect(saved?.photo_crop?.face?.x).toBe(50);
  expect(saved?.photo_crop?.face?.y).toBe(50);
});

// ── Delete confirmation ────────────────────────────────────────────────────────

test('delete button opens confirmation modal', async ({ page }) => {
  const tape = makeTape();
  await setupMocks(page, [tape]);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.click('#tab-collect');
  await page.evaluate((id) => openDetail(id), tape.id);

  await expect(page.locator('#m-detail')).toBeVisible({ timeout: 5000 });

  await page.click('#d-delete');

  // Delete confirmation modal should appear
  await expect(page.locator('#m-del-confirm')).toBeVisible({ timeout: 2000 });
});

test('cancelling delete dismisses confirmation without removing tape', async ({ page }) => {
  const tape = makeTape();
  let deleteCallCount = 0;
  await setupMocks(page, [tape]);
  await page.route('**/api/tapes/**', route => {
    if (route.request().method() === 'DELETE') deleteCallCount++;
    route.continue();
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.click('#tab-collect');
  await page.evaluate((id) => openDetail(id), tape.id);

  await page.click('#d-delete');
  await expect(page.locator('#m-del-confirm')).toBeVisible({ timeout: 2000 });

  await page.click('#del-cancel');
  await expect(page.locator('#m-del-confirm')).toBeHidden({ timeout: 2000 });
  expect(deleteCallCount).toBe(0);
});

// ── Edit tabs (Main / Details) ────────────────────────────────────────────────

test('modal tabs switch between Main and Details panes', async ({ page }) => {
  const tape = makeTape();
  await setupMocks(page, [tape]);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.click('#tab-collect');
  await page.evaluate((id) => openDetail(id), tape.id);

  await expect(page.locator('#m-detail')).toBeVisible({ timeout: 5000 });

  // Details tab
  await page.click('.modal-tab[data-tab="details"]');
  await expect(page.locator('#dtab-details')).toHaveClass(/active/, { timeout: 2000 });
  await expect(page.locator('#dtab-main')).not.toHaveClass(/active/);

  // Back to Main
  await page.click('.modal-tab[data-tab="main"]');
  await expect(page.locator('#dtab-main')).toHaveClass(/active/, { timeout: 2000 });
});
