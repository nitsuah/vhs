// @ts-check
const { test, expect, step, openApp } = require('./vhs');

test(
  "collector confirms the AI's picks",
  { tag: ['@feature:ai-photo-scanning'] },
  async ({ page }) => {
    const card = (title) => page.locator(`#rev-cards input[value="${title}"]`);

    await step(
      page,
      'open the review queue',
      async () => {
        await openApp(page);
        await expect(page.locator('#tab-review-count')).toHaveText('2');
        await page.locator('#tab-review').click();
        await expect(card('Ghostbusters II')).toBeVisible();
        await expect(card('Who Framed Roger Rabbit')).toBeVisible();
      },
      { docs: 'ai-photo-scanning' },
    );

    await step(page, 'confirm all of them', async () => {
      await page.locator('#btn-confirm-all').click();
      await expect(card('Ghostbusters II')).toHaveCount(0);
      await expect(page.locator('#toast-wrap')).toContainText('Saved: Who Framed Roger Rabbit');
      await expect(page.locator('#tab-review-count')).toBeHidden();
      // Toasts fade on a timer; let them go so the baseline is stable.
      await expect(page.locator('#toast-wrap .toast')).toHaveCount(0, { timeout: 10000 });
    });

    await step(
      page,
      'open the collection',
      async () => {
        await page.locator('#tab-collect').click();
        await expect(page.locator('#wall-view .su-card')).toHaveCount(19);
        await expect(page.locator('#collect-count')).toHaveText('19');
      },
      { screenshot: false },
    );
  },
);
