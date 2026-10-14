// @ts-check
const { test, expect, step, openApp, settle } = require('./vhs');

test(
  'collector browses the shelf and finds a tape',
  {
    tag: [
      '@feature:collection-first-default-view',
      '@feature:wall-view',
      '@feature:sortable-resizable-wall-table-columns',
      '@feature:full-text-search',
      '@feature:sort',
    ],
  },
  async ({ page }) => {
    const wallBtn = page.locator('#btn-wall');
    const rows = page.locator('#inv-list tbody tr');

    await step(
      page,
      'open my collection',
      async () => {
        await openApp(page);
        await expect(wallBtn).toHaveText('📚 StacksUp');
        await expect(page.locator('#wall-view .su-lbl').first()).toHaveText('Jaws');
      },
      { docs: 'collection-first-default-view' },
    );

    await step(
      page,
      'switch to the cover wall',
      async () => {
        await wallBtn.click();
        await wallBtn.click();
        await expect(wallBtn).toHaveText('⊟ Covers');
        await expect(page.locator('#wall-view .cover-card')).toHaveCount(17);
        await settle(page);
      },
      { docs: 'wall-view' },
    );

    await step(
      page,
      'switch to the table',
      async () => {
        await wallBtn.click();
        await expect(wallBtn).toHaveText('📋 Table');
        await expect(rows).toHaveCount(17);
        await settle(page);
      },
      { docs: 'sortable-resizable-wall-table-columns' },
    );

    await step(
      page,
      'search for aliens',
      async () => {
        await page.locator('#search').fill('alien');
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText('Aliens');
      },
      { docs: 'full-text-search' },
    );

    await step(
      page,
      'sort by value',
      async () => {
        await page.locator('#search').fill('');
        await page.locator('#sort-sel').selectOption('val_desc');
        await expect(rows).toHaveCount(17);
        await expect(rows.first()).toContainText('Akira');
      },
      { docs: 'sort' },
    );
  },
);
