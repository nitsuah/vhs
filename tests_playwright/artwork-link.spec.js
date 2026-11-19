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


test('failed artwork persistence leaves the shared tape unchanged', async ({ page }) => {
  const tape = makeTape({ id: 'VHS-ART-FAIL', title: 'Alien' });
  await setupBasicMocks(page, { tapes: [tape] });
  await page.route('**/api/artwork/search**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ items: [{ previewUrl: 'https://images.example/alien.jpg', title: 'Alien poster' }] }),
  }));
  await page.route('**/api/tapes/**', route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 500, body: 'write failed' })
    : route.continue());
  await gotoCollect(page);
  await page.evaluate(() => window.openDetail('VHS-ART-FAIL'));
  await page.getByRole('button', { name: 'Find artwork (cover)' }).click();
  await page.getByRole('button', { name: 'Use link' }).click();
  await expect(page.getByRole('button', { name: 'Find artwork (cover)' })).toBeVisible();
  await expect(page.locator('#detail-photos .d-artwork-link')).toHaveCount(0);
});

test('concurrent face and spine saves serialize without dropping either link', async ({ page }) => {
  const tape = makeTape({ id: 'VHS-ART-QUEUE', title: 'Alien' });
  await setupBasicMocks(page, { tapes: [tape] });
  await page.route('**/api/artwork/search**', route => {
    const role = new URL(route.request().url()).searchParams.get('role') || 'art';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      items: [{ previewUrl: `https://images.example/${role}.jpg`, title: role }],
    }) });
  });
  let releaseFirst;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const puts = [];
  await page.route('**/api/tapes/**', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    puts.push(route.request().postDataJSON());
    if (puts.length === 1) await firstGate;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(puts[puts.length - 1]) });
  });
  await gotoCollect(page);
  await page.evaluate(() => window.openDetail('VHS-ART-QUEUE'));
  await page.getByRole('button', { name: 'Find artwork (cover)' }).click();
  await page.getByRole('button', { name: 'Use link' }).click();
  await page.getByRole('button', { name: 'Find artwork (spine)' }).click();
  await page.getByRole('button', { name: 'Use link' }).click();
  await expect.poll(() => puts.length).toBe(1);
  releaseFirst();
  await expect.poll(() => puts.length).toBe(2);
  expect(puts[1].artwork_links.face.url).toBe('https://images.example/cover.jpg');
  expect(puts[1].artwork_links.spine.url).toBe('https://images.example/spine.jpg');
});

test('a late save does not replace a different tape opened in the modal', async ({ page }) => {
  const first = makeTape({ id: 'VHS-ART-A', title: 'Alien' });
  const second = makeTape({ id: 'VHS-ART-B', title: 'Blade Runner' });
  await setupBasicMocks(page, { tapes: [first, second] });
  await page.route('**/api/artwork/search**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ items: [{ previewUrl: 'https://images.example/alien.jpg', title: 'Alien poster' }] }),
  }));
  let releasePut;
  const gate = new Promise(resolve => { releasePut = resolve; });
  let saved;
  await page.route('**/api/tapes/**', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    saved = route.request().postDataJSON();
    await gate;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(saved) });
  });
  await gotoCollect(page);
  await page.evaluate(() => window.openDetail('VHS-ART-A'));
  await page.getByRole('button', { name: 'Find artwork (cover)' }).click();
  await page.getByRole('button', { name: 'Use link' }).click();
  await page.evaluate(() => window.openDetail('VHS-ART-B'));
  releasePut();
  await expect(page.locator('#d-title')).toHaveValue('Blade Runner');
  await expect(page.locator('#detail-photos .d-artwork-link')).toHaveCount(0);
  expect(saved.id).toBe('VHS-ART-A');
});
