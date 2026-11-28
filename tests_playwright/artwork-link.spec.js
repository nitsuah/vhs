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
    if (route.request().method() === 'GET') {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.pathname === `/api/tapes/${encodeURIComponent(tape.id)}`) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tape) });
      }
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
  await expect(page.getByText(/Save failed:/)).toBeVisible();
  await page.evaluate(() => window.openDetail('VHS-ART-FAIL'));
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
  const spineSection = page.locator('.d-artwork-search').nth(1);
  await spineSection.getByRole('button', { name: 'Find artwork (spine)' }).click();
  await spineSection.getByRole('button', { name: 'Use link' }).click();
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
  const completedSave = page.waitForResponse(response =>
    response.url().includes('/api/tapes/VHS-ART-A') && response.request().method() === 'PUT');
  releasePut();
  await completedSave;
  await expect(page.locator('#d-title')).toHaveValue('Blade Runner');
  await expect(page.locator('#detail-photos .d-artwork-link')).toHaveCount(0);
  expect(saved.id).toBe('VHS-ART-A');
});


test('candidate metadata renders as safe text and HTTPS links', async ({ page }) => {
  const tape = makeTape({ id: 'VHS-ART-SAFE', title: 'Alien' });
  await setupBasicMocks(page, { tapes: [tape] });
  await page.route('**/api/artwork/search**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{
      previewUrl: 'https://images.example/alien.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Alien.jpg',
      license: 'CC BY-SA', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      attribution: '<img src=x onerror=alert(1)> Example author', title: '<svg onload=alert(1)>Alien poster',
    }] }),
  }));
  await gotoCollect(page);
  await page.evaluate(() => window.openDetail('VHS-ART-SAFE'));
  await page.getByRole('button', { name: 'Find artwork (cover)' }).click();
  await expect(page.getByText('<svg onload=alert(1)>Alien poster')).toBeVisible();
  await expect(page.getByText('<img src=x onerror=alert(1)> Example author')).toBeVisible();
  await expect(page.locator('#m-detail img[src="https://images.example/alien.jpg"]')).toHaveCount(1);
  await expect(page.locator('#m-detail img[onerror]')).toHaveCount(0);
  const source = page.getByRole('link', { name: 'Source' });
  await expect(source).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:Alien.jpg');
  await expect(source).toHaveAttribute('rel', 'noopener noreferrer');
  const license = page.getByRole('link', { name: 'CC BY-SA' });
  await expect(license).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/');
  await expect(license).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('#m-detail svg')).toHaveCount(0);
});

test('preserves existing photos when saving and clearing an artwork link', async ({ page }) => {
  const tape = makeTape({
    id: 'VHS-ART-PHOTOS',
    title: 'Alien',
    photo_face: null,
    photo_spine: 'data:image/jpeg;base64,spine-data',
    photo_thumbnail: 'data:image/jpeg;base64,thumb-data',
    photos: ['data:image/jpeg;base64,spine-data'],
  });
  await setupBasicMocks(page, { tapes: [tape] });
  await page.route('**/api/artwork/search**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ items: [{
      previewUrl: 'https://images.example/alien.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Alien.jpg',
      license: 'CC BY-SA', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      attribution: 'Example author', title: 'Alien poster',
    }] }),
  }));
  const puts = [];
  await page.route('**/api/tapes/**', async route => {
    if (route.request().method() === 'PUT') {
      puts.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(puts[puts.length - 1]) });
    }
    return route.continue();
  });
  await gotoCollect(page);
  await page.evaluate(() => window.openDetail('VHS-ART-PHOTOS'));
  await page.getByRole('button', { name: 'Find artwork (cover)' }).click();
  await page.getByRole('button', { name: 'Use link' }).click();
  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0].photo_face).toBeNull();
  expect(puts[0].photo_spine).toBe('data:image/jpeg;base64,spine-data');
  expect(puts[0].photo_thumbnail).toBe('data:image/jpeg;base64,thumb-data');
  expect(puts[0].photos).toEqual(['data:image/jpeg;base64,spine-data']);
  expect(puts[0].artwork_links.face.url).toBe('https://images.example/alien.jpg');
  const firstPut = { ...puts[0] };
  await page.getByRole('button', { name: 'Clear link' }).click();
  await expect.poll(() => puts.length).toBe(2);
  expect(puts[1].photo_face).toBeNull();
  expect(puts[1].photo_spine).toBe('data:image/jpeg;base64,spine-data');
  expect(puts[1].photo_thumbnail).toBe('data:image/jpeg;base64,thumb-data');
  expect(puts[1].photos).toEqual(['data:image/jpeg;base64,spine-data']);
  expect(puts[1].artwork_links.face).toBeUndefined();
  // Only artwork_links.face should change; everything else byte-for-byte equal
  expect({ ...puts[1], artwork_links: null }).toEqual({ ...firstPut, artwork_links: null });
});

test('persists selected artwork metadata after reload without another search', async ({ page }) => {
  const tape = makeTape({ id: 'VHS-ART-RELOAD', title: 'Alien' });
  let searchCount = 0;
  await page.route('**/api/artwork/search**', route => {
    searchCount++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{
      previewUrl: 'https://images.example/alien.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Alien.jpg',
      license: 'CC BY-SA', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      attribution: 'Example author', title: 'Alien poster',
    }] }) });
  });
  await setupBasicMocks(page, { tapes: [tape] });
  // Stateful persistence: reads only return artwork metadata once a PUT has stored it.
  let stored = tape;
  let saved;
  await page.route('**/api/tapes', route => (route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([stored]) })
    : route.continue()));
  await page.route(`**/api/tapes/${encodeURIComponent(tape.id)}`, route => {
    if (route.request().method() === 'PUT') {
      saved = route.request().postDataJSON();
      stored = saved;
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stored) });
  });
  await gotoCollect(page);
  await page.evaluate(() => window.openDetail('VHS-ART-RELOAD'));
  await page.getByRole('button', { name: 'Find artwork (cover)' }).click();
  await page.getByRole('button', { name: 'Use link' }).click();
  await expect.poll(() => saved?.artwork_links?.face?.url).toBe('https://images.example/alien.jpg');
  expect(searchCount).toBe(1);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.click('#tab-collect');
  await page.waitForTimeout(200);
  await page.evaluate(() => window.openDetail('VHS-ART-RELOAD'));
  await expect(page.locator('#m-detail')).toBeVisible();
  await expect(page.getByText('Alien poster')).toBeVisible();
  await expect(page.getByText('Example author')).toBeVisible();
  const source = page.getByRole('link', { name: 'Source' });
  await expect(source).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:Alien.jpg');
  await expect(source).toHaveAttribute('rel', /noopener/);
  const license = page.getByRole('link', { name: 'CC BY-SA' });
  await expect(license).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/');
  await expect(license).toHaveAttribute('rel', /noopener/);
  expect(searchCount).toBe(1);
});
