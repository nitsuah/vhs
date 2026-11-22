'use strict';
const { test, expect } = require('@playwright/test');
const { setupBasicMocks, gotoCollect } = require('./helpers');

test.describe('signed-out calls', () => {
  const forbiddenEndpoints = [
    '/api/ollama/api/tags',
    '/api/jobs/status',
    '/api/jobs/inflight',
    '/api/review/pending',
  ];

  test('signed out with auth enabled does not call private endpoints', async ({ page }) => {
    await setupBasicMocks(page, { tapes: [] });

    // Override auth/me to return auth enabled, user null
    page.route('**/auth/me', r =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true, user: null }),
      })
    );

    const requested = [];
    page.on('request', req => requested.push(req.url()));

    await gotoCollect(page);
    await page.waitForLoadState('networkidle');
    // Wait one poll interval (5s) + buffer
    await page.waitForTimeout(6000);

    for (const ep of forbiddenEndpoints) {
      const hit = requested.some(u => u.includes(ep));
      expect(hit).toBe(false);
    }
  });

  test('signed in with auth enabled calls the poller endpoint', async ({ page }) => {
    await setupBasicMocks(page, { tapes: [] });

    // Override auth/me to return auth enabled, user present
    page.route('**/auth/me', r =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true, user: { name: 'T', email: 't@example.com' } }),
      })
    );

    const requested = [];
    page.on('request', req => requested.push(req.url()));

    await gotoCollect(page);
    await page.waitForLoadState('networkidle');
    // Wait one poll interval (5s) + buffer
    await page.waitForTimeout(6000);

    const hit = requested.some(u => u.includes('/api/jobs/status'));
    expect(hit).toBe(true);
  });
});