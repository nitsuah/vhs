'use strict';

const UPLOAD_HOST = 'upload.wikimedia.org';
const COMMONS_HOST = 'commons.wikimedia.org';
const LICENSE_VERSIONS = new Set(['1.0', '2.0', '2.5', '3.0', '4.0']);

function metadataValue(metadata, key) {
  const entry = metadata && metadata[key];
  if (typeof entry === 'string') return entry;
  return entry && typeof entry.value === 'string' ? entry.value : '';
}

function decodeHtmlEntities(value) {
  const named = {
    amp: '&',
    apos: "'",
    copy: '©',
    gt: '>',
    ldquo: '“',
    lsquo: '‘',
    lt: '<',
    mdash: '—',
    nbsp: ' ',
    ndash: '–',
    quot: '"',
    rdquo: '”',
    rsquo: '’',
  };
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] || match;
    const hex = entity[1].toLowerCase() === 'x';
    const number = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (!Number.isInteger(number) || number < 0 || number > 0x10ffff) return match;
    try {
      return String.fromCodePoint(number);
    } catch {
      return match;
    }
  });
}

function plainText(value) {
  return decodeHtmlEntities(
    String(value || '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  ).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function isProhibitedLicense(name, url) {
  const text = (String(name || '') + ' ' + String(url || '')).toLowerCase();
  return /\b(?:nc|nd)\b|non[-\s]?commercial|no[-\s]?derivatives/.test(text) ||
    /\/by-nc(?:-nd)?\/|\/by-nd\//.test(text);
}

function licenseFromName(value) {
  const name = plainText(value).toLowerCase();
  const versionMatch = /\b(1\.0|2\.0|2\.5|3\.0|4\.0)\b/.exec(name);
  const version = versionMatch ? versionMatch[1] : null;
  if (/\bcc0\b|creative commons zero|public domain dedication/.test(name)) {
    return { type: 'cc0', version: '1.0' };
  }
  if (/\bpublic domain(?: mark)?\b|\bpdm\b/.test(name)) {
    return { type: 'pd', version: '1.0' };
  }
  if (/cc\s*by[\s-]*sa\b|attribution[\s-]*share.?alike/.test(name)) {
    return { type: 'by-sa', version };
  }
  if (/cc\s*by\b|creative commons attribution/.test(name)) {
    return { type: 'by', version };
  }
  return null;
}

function licenseFromUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) ||
      url.hostname.toLowerCase() !== 'creativecommons.org' ||
      url.username || url.password || url.port || url.search || url.hash) {
      return null;
    }
    const path = url.pathname.toLowerCase().replace(/\/+$/, '');
    if (path === '/publicdomain/mark/1.0') return { type: 'pd', version: '1.0' };
    if (path === '/publicdomain/zero/1.0') return { type: 'cc0', version: '1.0' };
    const match = /^\/licenses\/(by|by-sa)\/(1\.0|2\.0|2\.5|3\.0|4\.0)$/.exec(path);
    if (match && LICENSE_VERSIONS.has(match[2])) {
      return { type: match[1], version: match[2] };
    }
  } catch {
    return null;
  }
  return null;
}

function canonicalLicense(license) {
  const version = license.version || '4.0';
  if (license.type === 'pd') {
    return {
      label: 'Public Domain',
      url: 'https://creativecommons.org/publicdomain/mark/1.0/',
    };
  }
  if (license.type === 'cc0') {
    return {
      label: 'CC0 1.0',
      url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    };
  }
  if (license.type === 'by') {
    return {
      label: 'CC BY ' + version,
      url: 'https://creativecommons.org/licenses/by/' + version + '/',
    };
  }
  if (license.type === 'by-sa') {
    return {
      label: 'CC BY-SA ' + version,
      url: 'https://creativecommons.org/licenses/by-sa/' + version + '/',
    };
  }
  return null;
}

function normalizeWikimediaLicense(extmetadata = {}) {
  const name = metadataValue(extmetadata, 'LicenseShortName') ||
    metadataValue(extmetadata, 'UsageTerms');
  const sourceUrl = metadataValue(extmetadata, 'LicenseUrl').trim();
  if (isProhibitedLicense(name, sourceUrl)) return null;

  const byName = licenseFromName(name);
  const byUrl = licenseFromUrl(sourceUrl);
  if (sourceUrl && !byUrl) return null;
  if (byName && byUrl &&
    (byName.type !== byUrl.type ||
      (byName.version && byUrl.version && byName.version !== byUrl.version))) {
    return null;
  }
  const license = byUrl || byName;
  return license ? canonicalLicense(license) : null;
}

function safeWikimediaUrl(value, expectedHost) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== expectedHost ||
      url.username || url.password || url.port) {
      return '';
    }
    return url.href;
  } catch {
    return '';
  }
}

function normalizeWikimediaArtwork(page) {
  if (!page || typeof page !== 'object') return null;
  const info = Array.isArray(page.imageinfo) ? page.imageinfo[0] : page.imageinfo;
  if (!info || typeof info !== 'object') return null;

  const extmetadata = info.extmetadata || page.extmetadata || {};
  const license = normalizeWikimediaLicense(extmetadata);
  const attribution = plainText(
    metadataValue(extmetadata, 'Attribution') ||
      metadataValue(extmetadata, 'Artist') ||
      metadataValue(extmetadata, 'Credit'),
  );
  const title = plainText(page.title || info.title || metadataValue(extmetadata, 'ObjectName'));
  const previewUrl = safeWikimediaUrl(info.thumburl || info.url, UPLOAD_HOST);
  const originalUrl = safeWikimediaUrl(info.url, UPLOAD_HOST);
  const sourceUrl = safeWikimediaUrl(info.descriptionurl || page.fullurl, COMMONS_HOST);

  if (!license || !attribution || !title || !previewUrl || !originalUrl || !sourceUrl) {
    return null;
  }
  return {
    title,
    previewUrl,
    originalUrl,
    sourceUrl,
    license: license.label,
    licenseUrl: license.url,
    attribution,
  };
}

function normalizeWikimediaArtworkResults(response) {
  const pages = response && response.query && response.query.pages;
  const items = Array.isArray(response)
    ? response
    : Array.isArray(pages)
      ? pages
      : pages && typeof pages === 'object'
        ? Object.values(pages)
        : response && response.imageinfo
          ? [response]
          : [];
  return items.map(normalizeWikimediaArtwork).filter(Boolean);
}

module.exports = {
  normalizeWikimediaLicense,
  normalizeWikimediaArtwork,
  normalizeWikimediaArtworkResults,
};
