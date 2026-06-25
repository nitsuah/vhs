// Run against the live app: docker compose --env-file .env up -d
// then: npm run test:ui
//
// Tests the full capture → job → review_item → confirm pipeline
// using mocked server responses so Ollama is not required.
const { test, expect } = require('@playwright/test');

// Minimal 1×1 white JPEG as a base64 data URL (valid image, won't hit Ollama)
const FIXTURE_THUMB = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=';

test('submitted image creates a processing card that transitions to ready', async ({ page }) => {
  const JOB_ID = 'job_e2e_001';
  const REV_ID = 'rev_e2e_001';

  // Mock job submission
  await page.route('**/api/jobs', async route => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: JOB_ID }) });
    }
    route.continue();
  });

  // First poll: no review items yet (job still processing)
  // Second+ poll: return the completed review item
  let pollCount = 0;
  await page.route('**/api/review/pending', route => {
    pollCount++;
    if (pollCount < 2) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: REV_ID,
        job_id: JOB_ID,
        data: { title: 'E.T. the Extra-Terrestrial', year: '1982', label: 'MCA', format: 'VHS', condition: 'good', status: 'in_collection' },
        thumb: null,
        source: 'scan',
        status: 'pending',
        fail_reason: null,
        created_at: new Date().toISOString(),
      }]),
    });
  });

  await page.route('**/api/jobs/status', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ pending: 1, processing: 0, done: 0, failed: 0, review_pending: 0 }),
  }));
  await page.route('**/api/jobs/inflight', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([{ id: JOB_ID, thumb: null, created_at: new Date().toISOString() }]),
  }));
  await page.route('**/api/review/**', route => route.fulfill({ status: 200, body: '{"ok":true}' }));
  await page.route('**/api/tapes', async route => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 201, body: '{}' });
    route.continue();
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Inject an image into the capture queue and trigger processQueue
  await page.evaluate(({ thumb }) => {
    captureQueue = [{ base64: thumb.split(',')[1], thumb }];
    processQueue();
  }, { thumb: FIXTURE_THUMB });

  // A processing card should appear immediately
  await expect(page.locator('.card-processing')).toBeVisible({ timeout: 5000 });

  // After poll returns the review item, card transitions to ready
  await expect(page.locator('.card-processing')).toBeHidden({ timeout: 15000 });
  const titleInput = page.locator('.rev-card input[data-f="title"]').first();
  await expect(titleInput).toHaveValue('E.T. the Extra-Terrestrial', { timeout: 10000 });

  // Confirm the card
  const confirmBtn = page.locator('.rev-card .btn-ok').first();
  await expect(confirmBtn).toBeVisible({ timeout: 3000 });
  await confirmBtn.click();

  // Review panel closes after confirming the only card
  await expect(page.locator('#review.on')).toBeHidden({ timeout: 5000 });
});

test('processing card allows manual title entry and early save', async ({ page }) => {
  const JOB_ID = 'job_e2e_002';

  await page.route('**/api/jobs', async route => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: JOB_ID }) });
    }
    route.continue();
  });

  // Never resolve — job stays processing forever
  await page.route('**/api/review/pending', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await page.route('**/api/jobs/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pending: 1, processing: 0, done: 0, failed: 0, review_pending: 0 }) })
  );
  await page.route('**/api/jobs/inflight', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: JOB_ID, thumb: null, created_at: new Date().toISOString() }]) })
  );
  await page.route('**/api/jobs/**', route => route.fulfill({ status: 200, body: '{"ok":true}' }));
  await page.route('**/api/tapes', async route => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 201, body: '{}' });
    route.continue();
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.evaluate(({ thumb }) => {
    captureQueue = [{ base64: thumb.split(',')[1], thumb }];
    processQueue();
  }, { thumb: FIXTURE_THUMB });

  // Processing card should appear
  const card = page.locator('.card-processing').first();
  await expect(card).toBeVisible({ timeout: 5000 });

  // Save button should NOT be visible until user types a title
  const saveBtn = card.locator('.c-confirm');
  await expect(saveBtn).toBeHidden({ timeout: 1000 });

  // Type a title
  const titleInput = card.locator('input[data-f="title"]');
  await titleInput.fill('Ghostbusters');

  // Save button should appear
  await expect(card.locator('.c-confirm')).toBeVisible({ timeout: 2000 });
  await card.locator('.c-confirm').click();

  // Panel closes
  await expect(page.locator('#review.on')).toBeHidden({ timeout: 5000 });
});
