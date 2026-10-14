// @ts-check
const { test, expect, step, openApp } = require('./vhs');

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test(
  'phone user opens the shelf and the menu',
  { tag: ['@feature:mobile-ui', '@feature:hamburger-drawer'] },
  async ({ page }) => {
    await step(
      page,
      'open the app on a phone',
      async () => {
        await openApp(page);
        await expect(page.locator('#btn-menu')).toBeVisible();
      },
      { docs: 'mobile-ui' },
    );

    await step(
      page,
      'open the menu',
      async () => {
        await page.locator('#btn-menu').click();
        await expect(page.locator('#hbr-drawer')).toBeInViewport();
        await expect(page.locator('#btn-crt')).toBeVisible();
      },
      { docs: 'hamburger-drawer' },
    );

    await step(page, 'close it with Escape', async () => {
      await page.keyboard.press('Escape');
      await expect(page.locator('#hbr-drawer')).not.toBeInViewport();
    });
  },
);
