// ── WALL VIEW RENDER ──────────────────────────────────────────────────────────
import { getInventory, getWallMode, getSelectedId, getSelectedIds, getIsReadOnly } from './inventory-state.js';
import { getFiltered } from './filtering.js';
import { esc, _cropStyle, _eggAttrs, _genresAttr, statusLabel } from './render-helpers.js';
import { attachCardInteraction } from './selection.js';
import { attachTitleEggHover, startTitleEggPreview, stopTitleEggPreview } from './title-eggs.js';

export function renderWall() {
  const items = getFiltered();
  const selectedId = getSelectedId();
  const selectedIds = getSelectedIds();
  const wall = document.getElementById('wall-view');
  if (!wall) return;

  const mode = getWallMode();

  if (mode === 1) { // StacksUp — upright spines, books-on-shelf
    wall.className = 'on stacksup-mode';
    wall.innerHTML = items.map(t => {
      const sel = t.id === selectedId;
      const bulk = selectedIds.has(t.id);
      const isSpine = !!t.photo_spine;
      const src = t.photo_spine || t.photo_thumbnail;
      const inner = src
        ? `<img class="su-img${isSpine ? ' su-img-spine' : ''}" src="${esc(src)}" alt=""${_cropStyle(t, 'spine', isSpine)}>`
        : `<div class="su-ph"><span class="su-ph-txt">${esc(t.title)}</span></div>`;
      return `<div class="su-card${sel ? ' sel' : ''}${bulk ? ' bulk-sel' : ''}" data-id="${esc(t.id)}"${_eggAttrs(t)}${_genresAttr(t)}><div class="cover-wrap">${inner}</div><div class="su-lbl">${esc(t.title)}</div></div>`;
    }).join('');

  } else if (mode === 2) { // Spine landscape
    wall.className = 'on spine-mode';
    wall.innerHTML = items.map(t => {
      const sel = t.id === selectedId;
      const bulk = selectedIds.has(t.id);
      const src = t.photo_spine || t.photo_thumbnail;
      // .spine-img never gets the StacksUp sideways layout rotation, so the
      // crop-adjustment style must not include one either (includeRotate=false).
      const inner = src
        ? `<img class="spine-img" src="${esc(src)}" alt=""${_cropStyle(t, 'spine', false)}>`
        : `<div class="spine-ph"><span>${esc(t.title)}</span></div>`;
      return `<div class="spine-card${sel ? ' sel' : ''}${bulk ? ' bulk-sel' : ''}" data-id="${esc(t.id)}"${_eggAttrs(t)}${_genresAttr(t)}><div class="cover-wrap">${inner}</div></div>`;
    }).join('');

  } else if (mode === 3) { // Covers — face/portrait images
    wall.className = 'on covers-mode';
    wall.innerHTML = items.map(t => {
      const sel = t.id === selectedId;
      const bulk = selectedIds.has(t.id);
      const src = t.photo_face || t.photo_thumbnail;
      const inner = src
        ? `<img class="cover-img" src="${esc(src)}" alt=""${_cropStyle(t, 'face', false)}>`
        : `<div class="cover-ph"><span class="cover-ph-txt">${esc(t.title)}</span></div>`;
      return `<div class="cover-card${sel ? ' sel' : ''}${bulk ? ' bulk-sel' : ''}" data-id="${esc(t.id)}"${_eggAttrs(t)}${_genresAttr(t)}><div class="cover-wrap">${inner}</div><div class="cover-lbl">${esc(t.title)}</div></div>`;
    }).join('');

  } else {
    return;
  }

  // Desktop hover for both easter-egg kinds: genre effects are pure CSS
  // (:hover, keyed off data-genres — nothing to wire here), title-triggered
  // effects (Jaws/Ghostbusters/NOTLD/Speed Racer) need JS since they're
  // sound, not just CSS.
  wall.querySelectorAll('.su-card, .spine-card, .cover-card').forEach(c => attachTitleEggHover(c));

  if (getIsReadOnly()) return;

  // Single click/tap opens detail; dblclick or hold toggles multi-select —
  // same gesture as the table view (selection.js), so wall/stacks/spine/cover
  // cards now support multi-select too (previously single-select only).
  // A hold that continues past the multi-select trigger also previews this
  // card's easter egg (genre CSS via .egg-active, title effects via JS) —
  // mobile has no :hover, so this is its substitute.
  wall.querySelectorAll('.su-card, .spine-card, .cover-card').forEach(c => {
    attachCardInteraction(c, {
      getId: () => c.dataset.id,
      onOpen: id => {
        if (typeof window.openDetail === 'function') window.openDetail(id);
        else window.dispatchEvent(new CustomEvent('open-detail', { detail: id }));
      },
      onToggleSelect: id => {
        const ids = getSelectedIds();
        ids.has(id) ? ids.delete(id) : ids.add(id);
        renderWall();
        window.updateBulkBar?.();
      },
      onEggPreview: () => { c.classList.add('egg-active'); startTitleEggPreview(c); },
      onEggPreviewEnd: () => { c.classList.remove('egg-active'); stopTitleEggPreview(c); },
    });
  });
}
