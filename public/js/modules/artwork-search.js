'use strict';

const isHttps = value => typeof value === 'string' && value.startsWith('https://');

export async function searchArtwork({ title, role, fetchImpl = fetch }) {
  const query = typeof title === 'string' ? title.trim() : '';
  if (!query) throw new Error('artwork title required');
  if (role !== 'cover' && role !== 'spine') throw new Error('invalid artwork role');

  let payload;
  try {
    const response = await fetchImpl(`/api/artwork/search?title=${encodeURIComponent(query)}&role=${role}`);
    if (!response.ok) throw new Error('request failed');
    payload = await response.json();
  } catch {
    throw new Error('artwork search unavailable');
  }
  if (!payload || !Array.isArray(payload.items)) throw new Error('artwork search unavailable');
  return payload.items;
}

// Roles (face = cover, spine) with neither a local photo nor a saved artwork link.
export function missingArtworkRoles(tape) {
  if (!tape || typeof tape !== 'object') return [];
  return ['face', 'spine'].filter(role => !tape['photo_' + role] && !(tape.artwork_links && tape.artwork_links[role]));
}

export function toArtworkLink(item) {
  return {
    url: item.previewUrl,
    sourceUrl: item.sourceUrl,
    license: item.license,
    licenseUrl: item.licenseUrl,
    attribution: item.attribution,
    title: item.title,
  };
}

export function renderArtworkCandidates(container, items, { onUse } = {}) {
  container.replaceChildren();
  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'artwork-empty';
    empty.textContent = 'No licensed artwork found';
    container.appendChild(empty);
    return;
  }

  items.forEach(item => {
    const card = document.createElement('article');
    const image = document.createElement('img');
    image.src = item.previewUrl || '';
    image.alt = item.title || '';
    image.loading = 'lazy';
    card.appendChild(image);

    const title = document.createElement('p');
    title.textContent = item.title || '';
    card.appendChild(title);

    const license = document.createElement('a');
    license.textContent = item.license || 'License';
    if (isHttps(item.licenseUrl)) {
      license.href = item.licenseUrl;
      license.target = '_blank';
      license.rel = 'noopener noreferrer';
    }
    card.appendChild(license);

    const attribution = document.createElement('p');
    attribution.textContent = item.attribution || '';
    card.appendChild(attribution);

    if (isHttps(item.sourceUrl)) {
      const source = document.createElement('a');
      source.href = item.sourceUrl;
      source.textContent = 'Source';
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      card.appendChild(source);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Use link';
    button.addEventListener('click', () => onUse?.(toArtworkLink(item)));
    card.appendChild(button);
    container.appendChild(card);
  });
}
