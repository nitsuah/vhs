// vhs-specific journey fixture: every journey starts from the fictional demo
// collection (promo/demo-seed.js) served by the in-browser API mock
// (promo/demo-mocks.js), with the clock frozen at the seed's "today", so a
// step's screenshot only changes when the UI does.
const { test: base, expect, step } = require('./journey');
const SEED = require('../../promo/demo-seed.js');
const { mockApi } = require('../../promo/demo-mocks.js');

const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(new Date(SEED.NOW));
    // Sounds off, skip the 50/100/200-tape confetti, and make Math.random
    // repeatable (mulberry32) so random easter eggs, like the 1-in-50
    // "Be Kind, Rewind!" toast on load (public/js/ui.js), never land in a
    // baseline on some nights and not others.
    await page.addInitScript(() => {
      localStorage.setItem('vhs-sound', '0');
      localStorage.setItem('vhs-milestones', '50,100,200');
      let s = 0x5eed;
      Math.random = () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    });
    await mockApi(page);
    await use(page);
  },
});

// Fonts and cover images loaded, nothing in flight.
async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images]
        .filter((i) => !i.complete)
        .map((i) => new Promise((r) => { i.onload = i.onerror = r; })),
    );
  });
}

/** Open the app on the Collection tab and wait for the seeded shelf. */
async function openApp(page) {
  await page.goto('/');
  await expect(page.locator('#wall-view .su-card')).toHaveCount(SEED.TAPES.length);
  await settle(page);
}

module.exports = { test, expect, step, openApp, settle, SEED };
