// ── WALL VIEW RENDER ──────────────────────────────────────────────────────────
const { getInventory, getWallMode, getSelectedId, getSelectedIds, getIsNewTape } = require('./inventory-state');
const { getFiltered } = require('./filtering');
const { esc, _cropStyle, _eggAttrs, statusLabel, renderTagChips } = require('./render-helpers');

function renderWall() {
  const items = getFiltered();
  const selectedId = getSelectedId();
  const selectedIds = getSelectedIds();
  const wall = document.getElementById('inv-wall');
  if (!wall) return;

  const mode = getWallMode();

  if (mode === 1) { // Cover wall
    wall.className = 'inv-wall cover';
    wall.innerHTML = items.map(t => {
      const isSpine = !!t.photo_spine;
      const src = t.photo_spine || t.photo_face || t.photo_thumbnail;
      const cropRole = isSpine ? 'spine' : 'face';
      const inner = src
        ? `<img class="su-img${isSpine ? ' su-img-spine' : ''}" src="${src}" alt=""${_cropStyle(t, cropRole, isSpine)}>`
        : `<div class="su-ph"><span class="su-ph-txt">${esc(t.title)}</span></div>`;
      return `<div class="su-card" data-id="${t.id}"${_eggAttrs(t)}><div class="cover-wrap">${inner}</div><div class="su-lbl">${esc(t.title)}</div></div>`;
    }).join('');
  } else if (mode === 2) { // Spine landscape
    wall.className = 'inv-wall spine';
    wall.innerHTML = items.map(t => {
      const isSpine = !!t.photo_spine;
      const src = t.photo_spine || t.photo_thumbnail;
      const inner = src
        ? `<img class="spine-img" src="${src}" alt=""${_cropStyle(t, 'spine', true)}>`
        : `<div class="spine-ph"><span>${esc(t.title)}</span></div>`;
      return `<div class="spine-card" data-id="${t.id}"${_eggAttrs(t)}><div class="cover-wrap">${inner}</div></div>`;
    }).join('');
  } else if (mode === 3) { // StackSup upright
    wall.className = 'inv-wall stacksup';
    wall.innerHTML = items.map(t => {
      const src = t.photo_face || t.photo_thumbnail;
      const inner = src
        ? `<img class="stack-img" src="${src}" alt=""${_cropStyle(t, 'face')}>`
        : `<div class="stack-ph"><span>${esc(t.title)}</span></div>`;
      return `<div class="stack-card" data-id="${t.id}"${_eggAttrs(t)}><div class="cover-wrap">${inner}</div><div class="stack-lbl">${esc(t.title)}</div></div>`;
    }).join('');
  } else {
    // List view (should not happen here)
    return;
  }

  // Attach events
  wall.querySelectorAll('.su-card, .spine-card, .stack-card').forEach(c => {
    c.addEventListener('click', e => {
      if (e.target.closest('input, select, button, .tag-chip')) return;
      const id = c.dataset.id;
      const ids = getSelectedIds();
      if (e.shiftKey) {
        // Not implementing shift range select for wall
      } else if (e.ctrlKey || e.metaKey) {
        ids.has(id) ? ids.delete(id) : ids.add(id);
      } else {
        ids.clear();
        ids.add(id);
      }
      renderWall();
      updateBulkBar();
    });
    c.addEventListener('dblclick', () => {
      if (typeof openDetail === 'function') openDetail(c.dataset.id);
      else {
        const ev = new CustomEvent('open-detail', { detail: c.dataset.id });
        window.dispatchEvent(ev);
      }
    });
  });
}

function updateBulkBar() {
  const count = getSelectedIds().size;
  const bar = document.getElementById('bulk-bar');
  if (!bar) return;
  if (count) {
    bar.style.display = 'flex';
    bar.querySelector('.bulk-count').textContent = count;
  } else {
    bar.style.display = 'none';
  }
}

module.exports = { renderWall, updateBulkBar };