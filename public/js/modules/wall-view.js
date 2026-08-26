// ── WALL VIEW RENDER ──────────────────────────────────────────────────────────
import { getInventory, getWallMode, getSelectedId, setSelectedId, getSelectedIds } from './inventory-state.js';
import { getFiltered } from './filtering.js';
import { esc, _cropStyle, _eggAttrs, statusLabel } from './render-helpers.js';

export function renderWall() {
  const items = getFiltered();
  const selectedId = getSelectedId();
  const wall = document.getElementById('wall-view');
  if (!wall) return;

  const mode = getWallMode();

  if (mode === 1) { // StacksUp — upright spines, books-on-shelf
    wall.className = 'on stacksup-mode';
    wall.innerHTML = items.map(t => {
      const sel = t.id === selectedId;
      const isSpine = !!t.photo_spine;
      const src = t.photo_spine || t.photo_thumbnail;
      const inner = src
        ? `<img class="su-img${isSpine ? ' su-img-spine' : ''}" src="${esc(src)}" alt=""${_cropStyle(t, 'spine', isSpine)}>`
        : `<div class="su-ph"><span class="su-ph-txt">${esc(t.title)}</span></div>`;
      return `<div class="su-card${sel ? ' sel' : ''}" data-id="${esc(t.id)}"${_eggAttrs(t)}><div class="cover-wrap">${inner}</div><div class="su-lbl">${esc(t.title)}</div></div>`;
    }).join('');

  } else if (mode === 2) { // Spine landscape
    wall.className = 'on spine-mode';
    wall.innerHTML = items.map(t => {
      const sel = t.id === selectedId;
      const isSpine = !!t.photo_spine;
      const src = t.photo_spine || t.photo_thumbnail;
      const inner = src
        ? `<img class="spine-img" src="${esc(src)}" alt=""${_cropStyle(t, 'spine', isSpine)}>`
        : `<div class="spine-ph"><span>${esc(t.title)}</span></div>`;
      return `<div class="spine-card${sel ? ' sel' : ''}" data-id="${esc(t.id)}"${_eggAttrs(t)}><div class="cover-wrap">${inner}</div></div>`;
    }).join('');

  } else if (mode === 3) { // Covers — face/portrait images
    wall.className = 'on covers-mode';
    wall.innerHTML = items.map(t => {
      const sel = t.id === selectedId;
      const src = t.photo_face || t.photo_thumbnail;
      const inner = src
        ? `<img class="cover-img" src="${esc(src)}" alt=""${_cropStyle(t, 'face', false)}>`
        : `<div class="cover-ph"><span class="cover-ph-txt">${esc(t.title)}</span></div>`;
      return `<div class="cover-card${sel ? ' sel' : ''}" data-id="${esc(t.id)}"${_eggAttrs(t)}><div class="cover-wrap">${inner}</div><div class="cover-lbl">${esc(t.title)}</div></div>`;
    }).join('');

  } else {
    return;
  }

  // Attach events — single-select only (no multi-select in wall views)
  wall.querySelectorAll('.su-card, .spine-card, .cover-card').forEach(c => {
    c.addEventListener('click', e => {
      if (e.target.closest('input, select, button, .tag-chip')) return;
      const id = c.dataset.id;
      setSelectedId(id);
      const ids = getSelectedIds();
      ids.clear();
      ids.add(id);
      renderWall();
      window.updateBulkBar?.();
    });
    c.addEventListener('dblclick', () => {
      if (typeof window.openDetail === 'function') window.openDetail(c.dataset.id);
      else window.dispatchEvent(new CustomEvent('open-detail', { detail: c.dataset.id }));
    });
  });
}
