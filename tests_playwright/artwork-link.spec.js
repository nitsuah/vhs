'use strict';
const { test, expect } = require('@playwright/test');
const { makeTape, setupBasicMocks, gotoCollect } = require('./helpers');

test('artwork links are searched only on demand, saved as metadata, and cleared independently', async ({ page }) => {
  const tape = makeTape({ id: 'VHS-ART-1', title: 'Alien' });
  await setupBasicMocks(page, { tapes: [tape] });
  let saved;
  let searches = 0;
  await page.route('**/api/artwork/search**', route => {
    searches++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      items: [{ previewUrl: 'https://images.example/alien.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Alien.jpg',
        license: 'CC BY-SA', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        attribution: 'Example author', title: 'Alien poster' }],
    }) });
  });
  await page.route('**/api/tapes/**', async route => {
    if (route.request().method() === 'PUT') {
      saved = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(saved) });
    }
    return route.continue();
  });
  await gotoCollect(page);
  await page.evaluate(() => window.openDetail('VHS-ART-1'));
  await expect(page.locator('#m-detail')).toBeVisible();
  expect(searches).toBe(0);
  await page.getByRole('button', { name: 'Find artwork (cover)' }).click();
  await expect(page.getByRole('button', { name: 'Use link' })).toBeVisible();
  await page.getByRole('button', { name: 'Use link' }).click();
  await expect.poll(() => saved?.artwork_links?.face?.url).toBe('https://images.example/alien.jpg');
  expect(saved.photos).toEqual([]);
  expect(saved.photo_face).toBeNull();
  await page.getByRole('button', { name: 'Clear link' }).click();
  await expect.poll(() => saved?.artwork_links?.face).toBeUndefined();
});

test('local pins suppress artwork search for that role', async ({ page }) => {
  const tape = makeTape({ id: 'VHS-ART-2', photo_face: 'data:image/jpeg;base64,AA==', photos: ['data:image/jpeg;base64,AA=='] });
  await setupBasicMocks(page, { tapes: [tape] });
  await gotoCollect(page);
  await page.evaluate(() => window.openDetail('VHS-ART-2'));
  await expect(page.getByRole('button', { name: 'Find artwork (cover)' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Find artwork (spine)' })).toHaveCount(1);
});
