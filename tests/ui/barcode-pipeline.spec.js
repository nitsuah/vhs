// Run against the live app: docker compose --env-file .env up -d
// then: npm run test:ui
const { test, expect } = require('@playwright/test');

const FAKE_BARCODE = '0097360717144';  // A VHS barcode format

test('barcode scan appears as processing card then transitions to ready', async ({ page }) => {
  // Mock the barcode lookup to return a known title
  await page.route(`**/api/lookup/barcode/${FAKE_BARCODE}`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ title: 'The Empire Strikes Back', label: 'CBS/Fox', year: '1980', source: 'upcitemdb' }),
  }));
  // Mock the Ollama lookup endpoint so enrichment doesn't hit real network
  await page.route('**/api/lookup', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ year: '1980', label: 'CBS/Fox', format: 'VHS', value_low: '5', value_high: '15' }),
  }));

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Simulate a barcode detection event by calling the global function directly
  await page.evaluate(code => {
    if (typeof _fireBarcodeResult === 'function') {
      _fireBarcodeResult(code);
    }
  }, FAKE_BARCODE);

  // Review panel should appear with a card immediately
  const card = page.locator('.rev-card').first();
  await expect(card).toBeVisible({ timeout: 2000 });

  // Card should eventually show the barcode value or title
  // (starts 'processing', transitions 'ready' when lookup completes)
  await expect(page.locator('.rev-card .c-f[data-f="title"]').first()).toHaveValue(
    'The Empire Strikes Back', { timeout: 8000 }
  );

  // Card should be in 'ready' state — confirm button visible, not locked
  const confirmBtn = card.locator('button[title*="onfirm"], .btn-ok').first();
  await expect(confirmBtn).toBeVisible({ timeout: 5000 });
});

test('barcode confirm saves record with barcode field populated', async ({ page }) => {
  let savedTape = null;

  await page.route(`**/api/lookup/barcode/${FAKE_BARCODE}`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ title: 'Raiders of the Lost Ark', label: 'Paramount', year: '1981', source: 'upcitemdb' }),
  }));
  await page.route('**/api/lookup', route => route.fulfill({
    status: 404, contentType: 'application/json', body: '{"error":"not found"}',
  }));
  await page.route('**/api/tapes', async route => {
    if (route.request().method() === 'POST') {
      savedTape = JSON.parse(route.request().postData());
      await route.fulfill({ status: 201, body: JSON.stringify(savedTape) });
    } else {
      await route.continue();
    }
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.evaluate(code => { _fireBarcodeResult(code); }, FAKE_BARCODE);

  // Wait for card to become ready (lookup complete)
  const confirmBtn = page.locator('.rev-card button[title*="onfirm"], .rev-card .btn-ok').first();
  await expect(confirmBtn).toBeVisible({ timeout: 8000 });
  await confirmBtn.click();

  // Record must have been POSTed with barcode field
  await expect.poll(() => savedTape).not.toBeNull();
  expect(savedTape.barcode).toBe(FAKE_BARCODE);
  expect(savedTape.title).toBe('Raiders of the Lost Ark');
});

test('barcode already in collection shows duplicate warning and still creates ready card', async ({ page }) => {
  // Seed inventory with the barcode
  await page.route('**/api/tapes', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ id: FAKE_BARCODE, title: 'E.T.', barcode: FAKE_BARCODE, format: 'VHS', condition: 'good', status: 'in_collection', scanned_at: new Date().toISOString() }]),
  }));

  await page.goto('/');
  await page.waitForSelector('.tape-row', { timeout: 10000 });

  await page.evaluate(code => { _fireBarcodeResult(code); }, FAKE_BARCODE);

  // Card should appear as 'ready' immediately (no lookup needed for dupes)
  const card = page.locator('.rev-card').first();
  await expect(card).toBeVisible({ timeout: 2000 });
  const confirmBtn = card.locator('button[title*="onfirm"], .btn-ok').first();
  await expect(confirmBtn).toBeVisible({ timeout: 1000 });

  // Should show an error toast about duplicate
  await expect(page.locator('#toast')).toContainText('Already in collection', { timeout: 3000 });
});
