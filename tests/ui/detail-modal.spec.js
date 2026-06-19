// Run against the live app: docker compose --env-file .env up -d
// then: npm run test:ui
const { test, expect } = require('@playwright/test');

test('save closes the detail modal immediately', async ({ page }) => {
  await page.goto('/');
  // Wait for inventory to load
  await page.waitForSelector('.tape-row', { timeout: 10000 });

  // Open first tape
  await page.locator('.tape-row').first().click();
  await expect(page.locator('#m-detail')).toBeVisible();

  // Edit title and save
  await page.fill('#d-title', 'Playwright Test Tape');
  await page.click('#d-save');

  // Modal must close without waiting for the DB round-trip
  await expect(page.locator('#m-detail')).toBeHidden({ timeout: 1000 });
});

test('pin face button shows active state instantly', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.tape-row', { timeout: 10000 });

  // Intercept PUT to add a 2s delay so we can measure pre-await feedback
  await page.route('**/api/tapes/**', async route => {
    if (route.request().method() === 'PUT') {
      await new Promise(r => setTimeout(r, 2000));
    }
    await route.continue();
  });

  // Open a tape that has a photo
  const tapeWithPhoto = page.locator('.tape-row').filter({ has: page.locator('img.row-thumb') }).first();
  await tapeWithPhoto.click();
  await expect(page.locator('#m-detail')).toBeVisible();

  // Find a face-pin button
  const pinFaceBtn = page.locator('button[title="Pin as face (wall view)"]').first();
  if (!(await pinFaceBtn.isVisible())) {
    test.skip('No tape with photos available for this test');
    return;
  }

  await pinFaceBtn.click();

  // Active state (blue background) should appear within 200ms, before the delayed PUT completes
  await expect(pinFaceBtn).toHaveCSS('background-color', /rgba\(68,\s*136,\s*255/, { timeout: 200 });
});

test('spine pin button toggles off when clicked again', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.tape-row', { timeout: 10000 });

  const tapeWithPhoto = page.locator('.tape-row').filter({ has: page.locator('img.row-thumb') }).first();
  await tapeWithPhoto.click();
  await expect(page.locator('#m-detail')).toBeVisible();

  const pinSpineBtn = page.locator('button[title="Pin as spine (list view)"]').first();
  if (!(await pinSpineBtn.isVisible())) {
    test.skip('No tape with photos available for this test');
    return;
  }

  // Pin it
  await pinSpineBtn.click();
  await expect(pinSpineBtn).toHaveCSS('background-color', /rgba\(61,\s*187,\s*61/, { timeout: 500 });

  // Pin it again to unpin
  await pinSpineBtn.click();
  // Should return to unactive state (not green)
  await expect(pinSpineBtn).not.toHaveCSS('background-color', /rgba\(61,\s*187,\s*61/, { timeout: 500 });
});
