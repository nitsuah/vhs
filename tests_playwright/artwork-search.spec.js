'use strict';
const { test, expect } = require('@playwright/test'); const { setupBasicMocks, gotoCollect } = require('./helpers');
async function openApp(page) {
  await setupBasicMocks(page, { tapes: [] });
  await gotoCollect(page);
}
test('search sends an encoded title and role and returns items', async ({ page }) => {
  let requestedUrl = '';
  await page.route('**/api/artwork/search**', async route => {
    requestedUrl = route.request().url();
    await route.fulfill({ json: { items: [{ title: 'Alien' }] } });
  });
  await openApp(page);
  const count = await page.evaluate(async () => {
    const m = await import('/js/modules/artwork-search.js');
    return (await m.searchArtwork({ title: 'Alien & Jaws', role: 'cover' })).length;
  });
  expect(count).toBe(1);
  expect(requestedUrl).toContain('title=Alien%20%26%20Jaws');
  expect(new URL(requestedUrl).searchParams.get('role')).toBe('cover');
});
test('non-OK and malformed responses reject with a stable error', async ({ page }) => {
  let status = 502;
  let body = JSON.stringify({ error: 'upstream failed' });
  await page.route('**/api/artwork/search**', route => route.fulfill({ status, contentType: 'application/json', body }));
  await openApp(page);
  const errors = await page.evaluate(async () => {
    const m = await import('/js/modules/artwork-search.js');
    const messages = [];
    try { await m.searchArtwork({ title: 'Alien', role: 'cover' }); } catch (e) { messages.push(e.message); }
    return messages;
  });
  status = 200;
  body = '{malformed';
  const malformed = await page.evaluate(async () => {
    const m = await import('/js/modules/artwork-search.js');
    try { await m.searchArtwork({ title: 'Alien', role: 'cover' }); } catch (e) { return e.message; }
    return 'no error';
  });
  expect(errors).toEqual(['artwork search unavailable']);
  expect(malformed).toBe('artwork search unavailable');
});
test('empty title and invalid role reject before making a request', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/artwork/search**', route => { requests++; return route.fulfill({ json: { items: [] } }); });
  await openApp(page);
  const errors = await page.evaluate(async () => {
    const m = await import('/js/modules/artwork-search.js');
    const messages = [];
    for (const args of [{ title: '  ', role: 'cover' }, { title: 'Alien', role: 'poster' }]) {
      try { await m.searchArtwork(args); } catch (e) { messages.push(e.message); }
    }
    return messages;
  });
  expect(errors).toEqual(['artwork title required', 'invalid artwork role']);
  expect(requests).toBe(0);
});
test('candidate rendering uses DOM text and Use link returns link metadata', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async () => {
    const m = await import('/js/modules/artwork-search.js');
    const container = document.createElement('div');
    const item = { title: 'Alien', previewUrl: 'https://img.example/alien.jpg', sourceUrl: 'https://commons.wikimedia.org/item/1', license: 'CC BY-SA', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', attribution: 'Studio' };
    let selected;
    m.renderArtworkCandidates(container, [item], { onUse: value => { selected = value; } });
    container.querySelector('button').click();
    return { image: container.querySelector('img')?.src, title: container.querySelector('p')?.textContent, links: [...container.querySelectorAll('a')].map(a => a.href), selected };
  });
  expect(result.image).toContain('alien.jpg');
  expect(result.title).toBe('Alien');
  expect(result.links).toContain('https://commons.wikimedia.org/item/1');
  expect(result.selected).toEqual({ url: 'https://img.example/alien.jpg', sourceUrl: 'https://commons.wikimedia.org/item/1', license: 'CC BY-SA', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', attribution: 'Studio', title: 'Alien' });
});
test('untrusted attribution is rendered as text, not markup', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async () => {
    const m = await import('/js/modules/artwork-search.js');
    const container = document.createElement('div');
    m.renderArtworkCandidates(container, [{ title: 'Alien', previewUrl: 'https://img.example/a.jpg', attribution: '<img src=x onerror=alert(1)>' }]);
    return { text: container.textContent, images: container.querySelectorAll('img').length };
  });
  expect(result.text).toContain('<img src=x onerror=alert(1)>');
  expect(result.images).toBe(1);
});
test('empty results show the empty-state message', async ({ page }) => {
  await openApp(page);
  const text = await page.evaluate(async () => {
    const m = await import('/js/modules/artwork-search.js');
    const container = document.createElement('div');
    m.renderArtworkCandidates(container, []);
    return { text: container.textContent, className: container.firstElementChild.className };
  });
  expect(text.text).toBe('No licensed artwork found');
  expect(text.className).toBe('artwork-empty');
});
