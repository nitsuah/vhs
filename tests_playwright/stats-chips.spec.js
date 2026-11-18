const { test, expect } = require('@playwright/test');
const { makeTape, setupBasicMocks, gotoCollect } = require('./helpers');

async function openCollection(page, tapes, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => localStorage.setItem('vhs-wall-mode', '0'));
  await setupBasicMocks(page, { tapes });
  await gotoCollect(page);
}
const chip = (page, dimension, value) => page.locator(`#stats-chips [data-stats-filter="${dimension}"][data-value="${value}"]`);

test('status chips show inventory counts, filter rows, and toggle off', async ({ page }) => {
  await openCollection(page, [
    makeTape({ title: 'Alien', status: 'in_collection' }),
    makeTape({ title: 'Jaws', status: 'for_sale' }),
    makeTape({ title: 'The Thing', status: 'for_sale' }),
  ]);
  await expect(chip(page, 'status', 'for_sale').locator('.stats-count')).toHaveText('2');
  await chip(page, 'status', 'for_sale').click();
  await expect(chip(page, 'status', 'for_sale')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.tape-row')).toHaveCount(2);
  await chip(page, 'status', 'for_sale').click();
  await expect(chip(page, 'status', 'for_sale')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.tape-row')).toHaveCount(3);
});

test('condition filters combine with status and clear independently', async ({ page }) => {
  await openCollection(page, [
    makeTape({ title: 'A', status: 'for_sale', condition: 'fair' }),
    makeTape({ title: 'B', status: 'for_sale', condition: 'good' }),
    makeTape({ title: 'C', status: 'in_collection', condition: 'fair' }),
  ]);
  await expect(chip(page, 'condition', 'fair').locator('.stats-count')).toHaveText('2');
  await chip(page, 'status', 'for_sale').click();
  await expect(chip(page, 'condition', 'fair').locator('.stats-count')).toHaveText('1');
  await chip(page, 'condition', 'fair').click();
  await expect(page.locator('.tape-row')).toHaveCount(1);
  await chip(page, 'status', 'for_sale').click();
  await expect(chip(page, 'status', 'for_sale').locator('.stats-count')).toHaveText('1');
  await expect(chip(page, 'condition', 'fair')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.tape-row')).toHaveCount(2);
});

test('keyboard activation preserves focus after rerender', async ({ page }) => {
  await openCollection(page, [makeTape({ status: 'for_sale' }), makeTape()]);
  const button = chip(page, 'status', 'for_sale');
  await button.focus();
  await button.press('Space');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(await button.evaluate(el => document.activeElement === el)).toBe(true);
  await button.press('Enter');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(await button.evaluate(el => document.activeElement === el)).toBe(true);
});

test('chip toggles preserve search text and selected sort', async ({ page }) => {
  await openCollection(page, [
    makeTape({ title: 'Alien', status: 'for_sale' }),
    makeTape({ title: 'Alien 3', status: 'in_collection' }),
    makeTape({ title: 'Jaws', status: 'for_sale' }),
  ]);
  await page.locator('#search').fill('Alien');
  await page.locator('#sort-sel').selectOption('title_asc');
  await chip(page, 'status', 'for_sale').click();
  await chip(page, 'status', 'for_sale').click();
  await expect(page.locator('#search')).toHaveValue('Alien');
  await expect(page.locator('#sort-sel')).toHaveValue('title_asc');
  await expect(page.locator('.tape-row')).toHaveCount(2);
});

test('groups are accessible and wrap without mobile page overflow', async ({ page }) => {
  await openCollection(page, [makeTape(), makeTape({ status: 'for_sale', condition: 'poor' })], 390);
  await expect(page.getByRole('group', { name: 'Filter by status' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Filter by condition' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
