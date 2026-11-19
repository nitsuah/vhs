// ── DETAIL MODAL ──────────────────────────────────────────────────────────────
import { getInventory, setSelectedId, getSelectedId, setIsNewTape, getIsReadOnly } from './inventory-state.js';
import { esc, renderTagChips } from './render-helpers.js';
import { searchArtwork, renderArtworkCandidates } from './artwork-search.js';
import { dbPut } from '../db.js';
import { toast } from '../utils.js';

export function initTagChips(container, getTags, setTags) {
  function bindInput() {
    const inp = container.querySelector('.tag-add-input');
    if (!inp) return;
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ',') return;
      e.preventDefault();
      const tag = inp.value.trim().replace(/,/g, '');
      if (!tag) return;
      const tags = [...getTags()];
      if (!tags.includes(tag)) tags.push(tag);
      setTags(tags);
      container.innerHTML = renderTagChips(tags);
      bindInput();
    });
  }
  container.addEventListener('click', e => {
    const chip = e.target.closest('.tag-chip');
    if (!chip) return;
    const tag = chip.dataset.tag;
    let tags = [...getTags()];
    if (tags.includes(tag)) tags = tags.filter(t => t !== tag);
    else tags.push(tag);
    setTags(tags);
    container.innerHTML = renderTagChips(tags);
    bindInput();
  });
  bindInput();
}

export function renderDetailPhotos(t) {
  const wrap = document.getElementById('detail-photos');
  if (!wrap) return;
  const photos = t.photos || [];
  wrap.style.display = photos.length ? 'flex' : 'none';
  const countEl = document.getElementById('d-photo-count');
  if (countEl) countEl.textContent = photos.length ? `${photos.length} photo${photos.length !== 1 ? 's' : ''}` : '';

  const readOnly = getIsReadOnly();
  const artworkLinks = t.artwork_links || {};

  // Build photo cards
  const photoCards = photos.map((p, i) => {
    const isFace = t.photo_face === p;
    const isSpine = t.photo_spine === p;
    return `<div class="d-photo" data-idx="${i}">
      <img src="${esc(p)}" alt="" style="width:80px;height:56px;object-fit:cover;border-radius:4px;border:2px solid ${isFace ? 'var(--blue)' : isSpine ? 'var(--green)' : 'var(--border2)'}">
      <div class="d-photo-actions" style="display:flex;gap:3px;flex-wrap:wrap;margin-top:3px">
        <button class="pin-btn" onclick="window.pinDetailPhoto?.(${i}, 'face')" title="${isFace ? 'Unpin cover' : 'Pin as cover'}" style="font-size:10px;padding:1px 5px;background:${isFace ? 'rgba(68,136,255,.2)' : 'var(--bg4)'};border:1px solid ${isFace ? 'var(--blue)' : 'var(--border2)'};color:${isFace ? 'var(--blue)' : 'var(--text3)'};border-radius:3px;cursor:pointer">${isFace ? '★ Cover' : '☆ Cover'}</button>
        <button class="pin-btn" onclick="window.pinDetailPhoto?.(${i}, 'spine')" title="${isSpine ? 'Unpin spine' : 'Pin as spine'}" style="font-size:10px;padding:1px 5px;background:${isSpine ? 'rgba(61,187,61,.2)' : 'var(--bg4)'};border:1px solid ${isSpine ? 'var(--green)' : 'var(--border2)'};color:${isSpine ? 'var(--green)' : 'var(--text3)'};border-radius:3px;cursor:pointer">${isSpine ? '★ Spine' : '☆ Spine'}</button>
        ${(isFace || isSpine) ? `<button onclick="window.openCropOverlay?.('${isFace ? 'face' : 'spine'}')" title="Adjust position" style="font-size:10px;padding:1px 5px;background:var(--bg4);border:1px solid var(--border2);color:var(--text2);border-radius:3px;cursor:pointer">✥ Adjust</button>` : ''}
        <button class="del-btn" onclick="window.removeDetailPhoto?.(${i})" style="font-size:10px;padding:1px 5px;background:var(--bg4);border:1px solid var(--border2);color:var(--text3);border-radius:3px;cursor:pointer">✕</button>
      </div>
    </div>`;
  }).join('');

  // Build artwork link sections for cover and spine
  const roles = [
    { key: 'face', label: 'Cover', localPin: t.photo_face },
    { key: 'spine', label: 'Spine', localPin: t.photo_spine }
  ];

  const artworkSections = roles.map(({ key, label, localPin }) => {
    const link = artworkLinks[key];
    const hasLocalPin = !!localPin;
    const showFind = !hasLocalPin && !readOnly;
    const showLink = !!link;

    if (!showFind && !showLink) return '';

    if (showLink) {
      // Show existing link with preview and clear button
      return `
        <div class="d-artwork-link" data-role="${key}" style="margin-top:8px;padding:8px;background:var(--bg3);border:1px solid var(--border2);border-radius:6px;">
          <div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;">
            <img src="${esc(link.url)}" alt="${esc(link.title || '')}" style="width:80px;height:56px;object-fit:cover;border-radius:4px;border:1px solid var(--border2);flex-shrink:0" loading="lazy">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:12px;color:var(--text);margin-bottom:4px">${esc(label)} Artwork</div>
              <div style="font-size:11px;color:var(--text2);margin-bottom:2px">${esc(link.title || '')}</div>
              <div style="font-size:11px;color:var(--text3);margin-bottom:6px">
                ${link.license ? `${esc(link.license)}${link.licenseUrl ? ` <a href="${esc(link.licenseUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--blue)">License</a>` : ''}` : ''}
                ${link.attribution ? ` — ${esc(link.attribution)}` : ''}
                ${link.sourceUrl ? ` <a href="${esc(link.sourceUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--blue)">Source</a>` : ''}
              </div>
              ${!readOnly ? `<button class="btn-x" onclick="window.clearArtworkLink?.('${key}')" style="font-size:11px;padding:3px 8px;background:var(--bg4);border:1px solid var(--border2);color:var(--text3);border-radius:3px;cursor:pointer">Clear link</button>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    // Show Find artwork button
    return `
      <div class="d-artwork-find" data-role="${key}" style="margin-top:8px;">
        <button class="btn-lookup" onclick="window.findArtwork?.('${key}')" style="font-size:11px;padding:4px 10px;background:var(--bg4);border:1px solid var(--border2);color:var(--blue);border-radius:5px;cursor:pointer">${esc('Find artwork (' + label + ')')}</button>
        <div id="artwork-results-${key}" style="margin-top:6px;display:none"></div>
        <div id="artwork-error-${key}" style="margin-top:4px;color:var(--red);font-size:11px;display:none"></div>
      </div>
    `;
  }).join('');

  wrap.innerHTML = photoCards + artworkSections;
}

// Handler to search and display artwork candidates
window.findArtwork = async (role) => {
  const t = getInventory().find(x => x.id === getSelectedId());
  if (!t) return;

  const title = document.getElementById('d-title').value.trim();
  const resultsContainer = document.getElementById(`artwork-results-${role}`);
  const errorContainer = document.getElementById(`artwork-error-${role}`);

  // Hide previous results/errors
  resultsContainer.style.display = 'none';
  errorContainer.style.display = 'none';
  resultsContainer.innerHTML = '';

  if (!title) {
    errorContainer.textContent = 'Title required to search artwork';
    errorContainer.style.display = 'block';
    return;
  }

  try {
    const items = await searchArtwork({ title, role: role === 'face' ? 'cover' : 'spine' });
    resultsContainer.style.display = 'block';
    renderArtworkCandidates(resultsContainer, items, {
      onUse: (link) => window.useArtworkLink(role, link)
    });
  } catch (e) {
    errorContainer.textContent = e.message || 'Search failed';
    errorContainer.style.display = 'block';
  }
};

// Handler to use a selected artwork link
window.useArtworkLink = async (role, link) => {
  const t = getInventory().find(x => x.id === getSelectedId());
  if (!t) return;

  const key = role === 'face' ? 'face' : 'spine';
  t.artwork_links = { ...(t.artwork_links || {}), [key]: link };
  renderDetailPhotos(t);
  try {
    await dbPut(t);
    toast('Artwork link saved', 'ok');
  } catch (e) {
    toast('Save failed: ' + e.message, 'err');
  }
};

// Handler to clear an artwork link
window.clearArtworkLink = async (key) => {
  const t = getInventory().find(x => x.id === getSelectedId());
  if (!t || !t.artwork_links || !t.artwork_links[key]) return;

  delete t.artwork_links[key];
  if (Object.keys(t.artwork_links).length === 0) {
    delete t.artwork_links;
  }
  renderDetailPhotos(t);
  try {
    await dbPut(t);
    toast('Artwork link cleared', 'ok');
  } catch (e) {
    toast('Save failed: ' + e.message, 'err');
  }
};

export function openDetail(id) {
  const t = getInventory().find(x => x.id === id);
  if (!t) return;
  setSelectedId(id);
  setIsNewTape(false);

  document.getElementById('d-title').value = t.title || '';
  document.getElementById('d-year').value = t.year || '';
  document.getElementById('d-label').value = t.label || '';
  document.getElementById('d-format').value = t.format || 'VHS';
  document.getElementById('d-barcode').value = t.barcode || '';
  document.getElementById('d-value-low').value = t.value_low || '';
  document.getElementById('d-value-high').value = t.value_high || '';
  document.getElementById('d-cond').value = t.condition || 'good';
  document.getElementById('d-status').value = t.status || 'in_collection';
  document.getElementById('d-sold-price').value = t.sold_price || '';
  document.getElementById('d-notes').value = t.condition_notes || '';
  document.getElementById('d-id').value = t.id;
  document.getElementById('d-scanned').value = new Date(t.scanned_at).toLocaleString();

  const th = document.getElementById('detail-thumb');
  if (t.photo_thumbnail) { th.src = t.photo_thumbnail; th.style.display = 'block'; }
  else th.style.display = 'none';

  renderDetailPhotos(t);

  const tagWrap = document.getElementById('d-tag-chips');
  const getTags = () => (getInventory().find(x => x.id === getSelectedId()) || {}).tags || [];
  tagWrap.innerHTML = renderTagChips(t.tags || []);
  initTagChips(tagWrap, getTags, tags => {
    const rec = getInventory().find(x => x.id === getSelectedId());
    if (rec) rec.tags = tags;
  });

  window._resetDetailTabs?.();

  document.getElementById('m-detail').style.display = 'flex';
  document.getElementById('d-delete').style.display = '';

  if (/matrix/i.test(t.title)) {
    const mdl = document.getElementById('m-detail');
    mdl.classList.add('matrix-mode');
    [['d-heading', t.title, false], ['d-title', t.title, true], ['d-year', t.year || '', true], ['d-label', t.label || '', true]].forEach(([eid, val]) => {
      const el = document.getElementById(eid);
      if (el) window.scrambleToReal?.(el, val, 2200);
    });
    setTimeout(() => mdl.classList.remove('matrix-mode'), 2600);
  }
}
