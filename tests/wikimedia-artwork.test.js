'use strict';

const {
  normalizeWikimediaLicense,
  normalizeWikimediaArtwork,
  normalizeWikimediaArtworkResults,
} = require('../src/modules/wikimedia-artwork');

const BASE = {
  title: 'File:Example.jpg',
  originalUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg',
  previewUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Example.jpg/320px-Example.jpg',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
  licenseName: 'CC BY 4.0',
  licenseUrl: 'http://creativecommons.org/licenses/by/4.0/',
  attribution: '<a href="https://commons.wikimedia.org/wiki/User:Example">Example Artist</a>',
};

function makePage(overrides = {}) {
  const value = { ...BASE, ...overrides };
  return {
    title: value.title,
    imageinfo: [{
      url: value.originalUrl,
      thumburl: value.previewUrl,
      descriptionurl: value.sourceUrl,
      extmetadata: {
        LicenseShortName: { value: value.licenseName },
        LicenseUrl: { value: value.licenseUrl },
        Attribution: { value: value.attribution },
      },
    }],
  };
}

describe('normalizeWikimediaLicense', () => {
  test.each([
    ['Public domain', 'Public domain', '', 'Public Domain'],
    ['Public Domain Mark', 'Public Domain Mark 1.0', 'https://creativecommons.org/publicdomain/mark/1.0/', 'Public Domain'],
    ['CC0', 'CC0 1.0', 'https://creativecommons.org/publicdomain/zero/1.0/', 'CC0 1.0'],
    ['CC BY', 'CC BY 3.0', 'http://creativecommons.org/licenses/by/3.0/', 'CC BY 3.0'],
    ['CC BY-SA', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/', 'CC BY-SA 4.0'],
  ])('allows %s', (_label, name, url, label) => {
    const result = normalizeWikimediaLicense({
      LicenseShortName: { value: name },
      LicenseUrl: { value: url },
    });
    expect(result.label).toBe(label);
    expect(result.url.startsWith('https://creativecommons.org/')).toBe(true);
  });

  test.each([
    ['NC', 'CC BY-NC 4.0', 'https://creativecommons.org/licenses/by-nc/4.0/'],
    ['ND', 'CC BY-ND 4.0', 'https://creativecommons.org/licenses/by-nd/4.0/'],
    ['unknown', 'Custom License', 'https://example.com/license'],
    ['missing', '', ''],
    ['mismatched name and URL', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by/4.0/'],
  ])('rejects %s', (_label, name, url) => {
    expect(normalizeWikimediaLicense({
      LicenseShortName: { value: name },
      LicenseUrl: { value: url },
    })).toBeNull();
  });
});

describe('normalizeWikimediaArtwork', () => {
  test('returns only normalized link and attribution metadata', () => {
    expect(normalizeWikimediaArtwork(makePage())).toEqual({
      title: 'File:Example.jpg',
      previewUrl: BASE.previewUrl,
      originalUrl: BASE.originalUrl,
      sourceUrl: BASE.sourceUrl,
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      attribution: 'Example Artist',
    });
  });

  test.each([
    ['missing attribution', { attribution: '' }],
    ['missing image info', { originalUrl: '' }],
    ['unsafe original host', { originalUrl: 'https://upload.wikimedia.org.evil.test/image.jpg' }],
    ['unsafe preview host', { previewUrl: 'https://example.com/image.jpg' }],
    ['unsafe source host', { sourceUrl: 'https://example.com/wiki/File:Example.jpg' }],
    ['non-HTTPS image', { originalUrl: 'http://upload.wikimedia.org/image.jpg' }],
    ['missing title', { title: '' }],
  ])('rejects %s', (_label, overrides) => {
    expect(normalizeWikimediaArtwork(makePage(overrides))).toBeNull();
  });

  test('removes encoded markup from attribution text', () => {
    const page = makePage({ attribution: '&lt;script&gt;alert(1)&lt;/script&gt; Artist' });
    expect(normalizeWikimediaArtwork(page).attribution).toBe('alert(1) Artist');
  });

  test('strips script and style end tags with whitespace and attributes', () => {
    const page = makePage({
      attribution: '<script>alert(1)</script\t\n bar> <style>bad</style foo> Artist',
    });
    expect(normalizeWikimediaArtwork(page).attribution).toBe('Artist');
  });

  test('does not mutate frozen input data', () => {
    const page = makePage();
    Object.freeze(page.imageinfo[0].extmetadata.LicenseShortName);
    Object.freeze(page.imageinfo[0].extmetadata.LicenseUrl);
    Object.freeze(page.imageinfo[0].extmetadata.Attribution);
    Object.freeze(page.imageinfo[0].extmetadata);
    Object.freeze(page.imageinfo[0]);
    Object.freeze(page.imageinfo);
    Object.freeze(page);
    expect(normalizeWikimediaArtwork(page)).not.toBeNull();
  });
});

describe('normalizeWikimediaArtworkResults', () => {
  test('normalizes pages and filters rejected results without exposing provider objects', () => {
    const result = normalizeWikimediaArtworkResults({
      query: {
        pages: {
          1: makePage(),
          2: makePage({ licenseName: 'CC BY-NC 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-nc/4.0/' }),
        },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].attribution).toBe('Example Artist');
    expect(result[0].imageinfo).toBeUndefined();
  });

  test('accepts an array of page fixtures', () => {
    expect(normalizeWikimediaArtworkResults([makePage()])).toHaveLength(1);
  });
});
