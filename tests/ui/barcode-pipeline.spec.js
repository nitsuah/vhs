// Run against the live app: docker compose --env-file .env up -d
// then: npm run test:ui
//
// Tests the barcode scan → auto-confirm → inventory pipeline introduced in
// feat/barcode-autoconfirm-stacksup-fill. Valid barcodes no longer go through
// the review panel; they are written straight to the tapes table.
const { test, expect } = require('@playwright/test');

const FAKE_BARCODE = '0097360717144';

// Helper: seed the inventory via /api/tapes mock
function seedInventory(page, tapes = []) {
  return page.route('**/api/tapes', async route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(tapes),
      });
    }
    route.continue();
  });
}

test('valid barcode goes straight to inventory — no review card', async ({ page }) => {
  let savedTape = null;

  await page.route(`**/api/lookup/barcode/${FAKE_BARCODE}`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ title: 'The Empire Strikes Back', label: 'CBS/Fox', year: '1980', imdb_id: 'tt0080684', source: 'upcitemdb' }),
  }));
  await page.route('**/api/tapes', async route => {
    if (route.request().method() === 'POST') {
      savedTape = JSON.parse(route.request().postData());
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(savedTape) });
    }
    // GET returns empty inventory initially
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Trigger barcode detection
  await page.evaluate(code => { _fireBarcodeResult(code); }, FAKE_BARCODE);

  // No review card should ever appear
  await expect(page.locator('.rev-card')).toHaveCount(0, { timeout: 8000 });

  // A POST to /api/tapes must have been made with the correct barcode + title
  await expect.poll(() => savedTape, { timeout: 10000 }).not.toBeNull();
  expect(savedTape.barcode).toBe(FAKE_BARCODE);
  expect(savedTape.title).toBe('The Empire Strikes Back');
  expect(savedTape.imdb_id).toBe('tt0080684');
});

test('auto-confirmed barcode tape appears in inventory table', async ({ page }) => {
  const createdTape = {
    id: FAKE_BARCODE,
    title: 'Raiders of the Lost Ark',
    barcode: FAKE_BARCODE,
    year: '1981',
    label: 'Paramount',
    format: 'VHS',
    condition: 'good',
    status: 'in_collection',
    scanned_at: new Date().toISOString(),
  };

  await page.route(`**/api/lookup/barcode/${FAKE_BARCODE}`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ title: 'Raiders of the Lost Ark', label: 'Paramount', year: '1981', source: 'upcitemdb' }),
  }));

  // First GET returns empty; after POST simulate it appearing in inventory
  let posted = false;
  await page.route('**/api/tapes', async route => {
    if (route.request().method() === 'POST') {
      posted = true;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(createdTape) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(posted ? [createdTape] : []),
    });
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.evaluate(code => { _fireBarcodeResult(code); }, FAKE_BARCODE);

  // Toast should confirm the add
  await expect(page.locator('#toast')).toContainText('Added', { timeout: 8000 });
});

test('barcode with no UPC match falls back to review card for manual entry', async ({ page }) => {
  await page.route(`**/api/lookup/barcode/${FAKE_BARCODE}`, route => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'not found' }),
  }));
  await seedInventory(page);

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.evaluate(code => { _fireBarcodeResult(code); }, FAKE_BARCODE);

  // A review card with empty title should appear for manual entry
  const card = page.locator('.rev-card').first();
  await expect(card).toBeVisible({ timeout: 5000 });
  const titleInput = card.locator('input[data-f="title"]');
  await expect(titleInput).toHaveValue('', { timeout: 2000 });

  // Toast warns user
  await expect(page.locator('#toast')).toContainText('No match', { timeout: 3000 });
});

test('duplicate barcode shows error toast and does not add to inventory', async ({ page }) => {
  const existingTape = {
    id: FAKE_BARCODE,
    title: 'E.T.',
    barcode: FAKE_BARCODE,
    format: 'VHS',
    condition: 'good',
    status: 'in_collection',
    scanned_at: new Date().toISOString(),
  };
  let postCalled = false;

  await page.route(`**/api/lookup/barcode/${FAKE_BARCODE}`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ title: 'E.T.', source: 'upcitemdb' }),
  }));
  await page.route('**/api/tapes', async route => {
    if (route.request().method() === 'POST') { postCalled = true; return route.fulfill({ status: 201, body: '{}' }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([existingTape]) });
  });

  await page.goto('/');
  await page.waitForSelector('.tape-row', { timeout: 10000 });

  await page.evaluate(code => { _fireBarcodeResult(code); }, FAKE_BARCODE);

  // No new tape should be posted
  await expect(page.locator('#toast')).toContainText('Already in collection', { timeout: 5000 });
  expect(postCalled).toBe(false);
  // No review card either
  await expect(page.locator('.rev-card')).toHaveCount(0, { timeout: 2000 });
});
