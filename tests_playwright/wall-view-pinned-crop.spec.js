'use strict';
const { test, expect } = require('@playwright/test');
const { makeTape, setupBasicMocks, gotoCollect } = require('./helpers');

test('local pinned crop transforms survive all wall layouts', async ({ page }) => {
  const tape = makeTape({
    id: 'VHS-CROP-1',
    photo_face: 'https://images.example/face.jpg',
    photo_spine: 'https://images.example/spine.jpg',
    photos: ['https://images.example/face.jpg', 'https://images.example/spine.jpg'],
    photo_crop: { face: { x: 20, y: 30, s: 2, r: 1 }, spine: { x: 40, y: 60, s: 3, r: 2 } },
  });
  await setupBasicMocks(page, { tapes: [tape] });
  await page.route('https://images.example/**', route => route.fulfill({ status: 200, contentType: 'image/jpeg', body: '' }));
  await gotoCollect(page);

  await page.click('#btn-wall');
  let image = page.locator('#wall-view .su-card img');
  await expect(image).toHaveAttribute('style', /object-position:40% 60%/);
  await expect(image).toHaveAttribute('style', /rotate\(90deg\).*rotate\(180deg\).*scale\(3\)/);

  await page.click('#btn-wall');
  image = page.locator('#wall-view .spine-card img');
  await expect(image).toHaveAttribute('style', /object-position:40% 60%/);
  await expect(image).toHaveAttribute('style', /rotate\(180deg\).*scale\(3\)/);
  await expect(image).not.toHaveAttribute('style', /rotate\(90deg\)/);

  await page.click('#btn-wall');
  image = page.locator('#wall-view .cover-card img');
  await expect(image).toHaveAttribute('style', /object-position:20% 30%/);
  await expect(image).toHaveAttribute('style', /rotate\(90deg\).*scale\(2\)/);
});
