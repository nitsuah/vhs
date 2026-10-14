// @ts-check
const { test, expect, step, openApp } = require('./vhs');

test(
  'collector opens a tape and gets ready to sell',
  {
    tag: [
      '@feature:tabbed-edit-form',
      '@feature:condition-tracking',
      '@feature:csv-export',
      '@feature:sell-drafts-ebay-mercari',
    ],
  },
  async ({ page }) => {
    const modal = page.locator('#m-detail');

    await step(
      page,
      'open Akira from the shelf',
      async () => {
        await openApp(page);
        await page.locator('#wall-view .su-card[data-id="VHS-0003"]').click();
        await expect(modal).toBeVisible();
        await expect(page.locator('#d-title')).toHaveValue('Akira');
      },
      { docs: 'tabbed-edit-form' },
    );

    await step(
      page,
      'check its condition and value',
      async () => {
        await modal.locator('.modal-tab[data-tab="details"]').click();
        await expect(page.locator('#dtab-details')).toBeVisible();
      },
      { docs: 'condition-tracking' },
    );

    await step(
      page,
      'open the export menu',
      async () => {
        await page.keyboard.press('Escape');
        await expect(modal).toBeHidden();
        await page.locator('#btn-export').click();
        await expect(page.locator('#exp-drafts')).toBeVisible();
      },
      { docs: 'csv-export' },
    );
  },
);
