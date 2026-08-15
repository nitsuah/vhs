'use strict';
const { test, expect } = require('@playwright/test');
const { setupBasicMocks } = require('./helpers');

async function openSettings(page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.click('#btn-settings');
  await expect(page.locator('#m-settings')).toBeVisible({ timeout: 3000 });
}

// ── OPEN / CLOSE ──────────────────────────────────────────────────────────────

test('settings modal opens via settings button', async ({ page }) => {
  await setupBasicMocks(page);
  await openSettings(page);
});

test('cancel button closes settings modal without saving', async ({ page }) => {
  await setupBasicMocks(page);
  await openSettings(page);

  await page.fill('#s-apikey', 'sk-ant-test-key');
  await page.click('#s-cancel');

  await expect(page.locator('#m-settings')).toBeHidden({ timeout: 2000 });
  const stored = await page.evaluate(() => localStorage.getItem('vhs-apikey'));
  expect(stored).toBeNull();
});

// ── API KEY ───────────────────────────────────────────────────────────────────

test('saving API key persists to localStorage', async ({ page }) => {
  await setupBasicMocks(page);
  await openSettings(page);

  await page.fill('#s-apikey', 'sk-ant-mykey');
  await page.click('#s-save');

  await expect(page.locator('#m-settings')).toBeHidden({ timeout: 2000 });
  const stored = await page.evaluate(() => localStorage.getItem('vhs-apikey'));
  expect(stored).toBe('sk-ant-mykey');
});

test('clearing API key removes it from localStorage', async ({ page }) => {
  await setupBasicMocks(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => localStorage.setItem('vhs-apikey', 'sk-ant-existing'));

  await page.click('#btn-settings');
  await expect(page.locator('#m-settings')).toBeVisible({ timeout: 3000 });

  await page.fill('#s-apikey', '');
  await page.click('#s-save');

  const stored = await page.evaluate(() => localStorage.getItem('vhs-apikey'));
  expect(stored).toBeNull();
});

// ── OLLAMA URL ────────────────────────────────────────────────────────────────

test('saving Ollama URL persists to localStorage', async ({ page }) => {
  await setupBasicMocks(page);
  await openSettings(page);

  await page.fill('#s-ollama-url', 'http://my-custom-ollama:11434');
  await page.click('#s-save');

  const stored = await page.evaluate(() => localStorage.getItem('vhs-ollama-url'));
  expect(stored).toBe('http://my-custom-ollama:11434');
});

// ── FAST MODE ─────────────────────────────────────────────────────────────────

test('fast mode checkbox state persists to localStorage', async ({ page }) => {
  await setupBasicMocks(page);
  await openSettings(page);

  const checkbox = page.locator('#s-fast-mode');
  const initial = await checkbox.isChecked();

  await checkbox.click();
  await page.click('#s-save');

  const stored = await page.evaluate(() => localStorage.getItem('vhs-fast-mode'));
  expect(stored).toBe(String(!initial));
});

// ── SETTINGS RESTORES SAVED VALUES ───────────────────────────────────────────

test('opening settings shows previously saved API key', async ({ page }) => {
  await setupBasicMocks(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => localStorage.setItem('vhs-apikey', 'sk-ant-restored'));

  await page.reload();
  await page.waitForLoadState('networkidle');

  await page.click('#btn-settings');
  await expect(page.locator('#m-settings')).toBeVisible({ timeout: 3000 });

  const apiInput = page.locator('#s-apikey');
  await expect(apiInput).toHaveValue('sk-ant-restored', { timeout: 2000 });
});
