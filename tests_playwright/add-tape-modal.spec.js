'use strict';
const { test, expect } = require('@playwright/test');
const { makeTape, setupBasicMocks, gotoCollect } = require('./helpers');

async function setupDetailMocks(page, tapes) {
  let lastSavedTape = null;
  await page.route('**/api/tapes', async route => {
    if (route.request().method() === 'GET')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tapes) });
    if (route.request().method() === 'POST') {
      lastSavedTape = JSON.parse(route.request().postData() || '{}');
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(lastSavedTape) });
    }
    route.continue();
  });
  await page.route('**/api/tapes/**', async route => {
    if (route.request().method() === 'PUT') {
      lastSavedTape = JSON.parse(route.request().postData() || '{}');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(lastSavedTape) });
    }
    if (route.request().method() === 'DELETE')
      return route.fulfill({ status: 200, body: '{"ok":true}' });
    route.continue();
  });
  await page.route('**/api/review/pending', route => route.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/jobs/status', route => route.fulfill({ status: 200, body: '{"pending":0,"review_pending":0}' }));
  await page.route('**/api/jobs/inflight', route => route.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/health', route => route.fulfill({ status: 200, body: '{"db":"ok","ollama":"ok"}' }));
  await page.route('**/api/logs**', route => route.fulfill({ status: 200, body: '[]' }));
  return () => lastSavedTape;
}

// ── OPEN DETAIL FOR EXISTING TAPE ─────────────────────────────────────────────

test('detail modal opens with correct values for existing tape', async ({ page }) => {
  const tape = makeTape({ id: 'VHS-0001', title: 'Ghostbusters', year: '1984', label: 'Columbia' });
  await setupDetailMocks(page, [tape]);
  await gotoCollect(page);

  await page.evaluate((id) => openDetail(id), tape.id);
  await expect(page.locator('#m-detail')).toBeVisible({ timeout: 5000 });

  await expect(page.locator('#d-title')).toHaveValue('Ghostbusters');
  await expect(page.locator('#d-year')).toHaveValue('1984');
  await expect(page.locator('#d-label')).toHaveValue('Columbia');
});

// ── SAVE EXISTING TAPE ────────────────────────────────────────────────────────

test('d-save sends PUT with updated title', async ({ page }) => {
  const tape = makeTape({ id: 'VHS-0001', title: 'Original' });
  const getSaved = await setupDetailMocks(page, [tape]);
  await gotoCollect(page);

  await page.evaluate((id) => openDetail(id), tape.id);
  await page.fill('#d-title', 'Updated Title');
  await page.click('#d-save');

  await expect(page.locator('#m-detail')).toBeHidden({ timeout: 3000 });
  expect(getSaved()?.title).toBe('Updated Title');
});

// ── CANCEL EXISTING TAPE ──────────────────────────────────────────────────────

test('d-cancel closes modal without making API call', async ({ page }) => {
  const tape = makeTape({ id: 'VHS-0001', title: 'Original' });
  const getSaved = await setupDetailMocks(page, [tape]);
  await gotoCollect(page);

  await page.evaluate((id) => openDetail(id), tape.id);
  await page.fill('#d-title', 'Changed');
  await page.click('#d-cancel');

  await expect(page.locator('#m-detail')).toBeHidden({ timeout: 2000 });
  expect(getSaved()).toBeNull();
});

// ── DELETE TAPE ───────────────────────────────────────────────────────────────

test('delete button opens confirmation modal', async ({ page }) => {
  const tape = makeTape({ id: 'VHS-0001', title: 'Doomed Tape' });
  await setupDetailMocks(page, [tape]);
  await gotoCollect(page);

  await page.evaluate((id) => openDetail(id), tape.id);
  await expect(page.locator('#m-detail')).toBeVisible({ timeout: 5000 });

  await page.click('#d-delete');
  await expect(page.locator('#m-del-confirm')).toBeVisible({ timeout: 2000 });
  // Confirm text should mention the title
  await expect(page.locator('#del-text')).toContainText('Doomed Tape');
});

test('del-cancel closes confirmation without deleting', async ({ page }) => {
  const tape = makeTape({ id: 'VHS-0001', title: 'Safe Tape' });
  let deleteCount = 0;
  await setupDetailMocks(page, [tape]);
  await page.route('**/api/tapes/**', async route => {
    if (route.request().method() === 'DELETE') deleteCount++;
    route.continue();
  });
  await gotoCollect(page);

  await page.evaluate((id) => openDetail(id), tape.id);
  await page.click('#d-delete');
  await expect(page.locator('#m-del-confirm')).toBeVisible({ timeout: 2000 });

  await page.click('#del-cancel');
  await expect(page.locator('#m-del-confirm')).toBeHidden({ timeout: 2000 });
  expect(deleteCount).toBe(0);
});

test('del-ok deletes tape and closes both modals', async ({ page }) => {
  const tape = makeTape({ id: 'VHS-0001', title: 'Delete Me' });
  await setupDetailMocks(page, [tape]);
  await gotoCollect(page);

  await page.evaluate((id) => openDetail(id), tape.id);
  await page.click('#d-delete');
  await expect(page.locator('#m-del-confirm')).toBeVisible({ timeout: 2000 });

  await page.click('#del-ok');
  await expect(page.locator('#m-del-confirm')).toBeHidden({ timeout: 3000 });
  await expect(page.locator('#m-detail')).toBeHidden({ timeout: 2000 });
});

// ── MODAL TABS ────────────────────────────────────────────────────────────────

test('Details tab switches the active pane', async ({ page }) => {
  const tape = makeTape({ id: 'VHS-0001' });
  await setupDetailMocks(page, [tape]);
  await gotoCollect(page);

  await page.evaluate((id) => openDetail(id), tape.id);
  await expect(page.locator('#m-detail')).toBeVisible({ timeout: 5000 });

  await page.click('.modal-tab[data-tab="details"]');
  await expect(page.locator('#dtab-details')).toHaveClass(/active/, { timeout: 2000 });
  await expect(page.locator('#dtab-main')).not.toHaveClass(/active/);

  await page.click('.modal-tab[data-tab="main"]');
  await expect(page.locator('#dtab-main')).toHaveClass(/active/, { timeout: 2000 });
});

// ── ADD NEW TAPE ──────────────────────────────────────────────────────────────

test('new tape modal via btn-add-tape has blank fields', async ({ page }) => {
  await setupDetailMocks(page, []);
  await gotoCollect(page);

  await page.click('#btn-add-tape');
  await expect(page.locator('#m-detail')).toBeVisible({ timeout: 3000 });

  await expect(page.locator('#d-title')).toHaveValue('');
  await expect(page.locator('#d-year')).toHaveValue('');
  // Format defaults to VHS
  await expect(page.locator('#d-format')).toHaveValue('VHS');
  // Delete button should be hidden for new tape
  const display = await page.locator('#d-delete').evaluate(el => el.style.display);
  expect(display).toBe('none');
});

test('saving a new tape sends POST and adds it to the list', async ({ page }) => {
  const getSaved = await setupDetailMocks(page, []);
  await gotoCollect(page);

  // Empty state should show
  await expect(page.locator('#empty-state')).toBeVisible({ timeout: 3000 });

  await page.click('#btn-add-tape');
  await expect(page.locator('#m-detail')).toBeVisible({ timeout: 3000 });

  await page.fill('#d-title', 'Brand New Tape');
  await page.click('#d-save');

  await expect(page.locator('#m-detail')).toBeHidden({ timeout: 3000 });
  expect(getSaved()?.title).toBe('Brand New Tape');
});

// ── LOOKUP ────────────────────────────────────────────────────────────────────

test('lookup button calls /api/lookup and fills in year', async ({ page }) => {
  const tape = makeTape({ id: 'VHS-0001', title: 'Jaws' });
  await setupDetailMocks(page, [tape]);
  await page.route('**/api/lookup**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ year: '1975', label: 'MCA Home Video' }) }),
  );
  await gotoCollect(page);

  await page.evaluate((id) => openDetail(id), tape.id);
  await page.click('#d-lookup');

  await expect(page.locator('#d-year')).toHaveValue('1975', { timeout: 5000 });
  await expect(page.locator('#d-label')).toHaveValue('MCA Home Video', { timeout: 2000 });
});
