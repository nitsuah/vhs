// ── LIST VIEW RENDER ──────────────────────────────────────────────────────────
import { getInventory, getSelectedId, getSelectedIds, getWallMode, getIsReadOnly } from './inventory-state.js';
import { getFiltered } from './filtering.js';
import { esc, _cropStyle, _eggAttrs, statusLabel, renderTagChips } from './render-helpers.js';
import { openDetail as openDetailModal, renderDetailPhotos, initTagChips } from './detail-modal.js';
import { renderWall } from './wall-view.js';
import { attachCardInteraction } from './selection.js';
import { attachTitleEggHover, startTitleEggPreview, stopTitleEggPreview } from './title-eggs.js';

export function renderList() {
  const items = getFiltered();
  const selectedId = getSelectedId();
  const selectedIds = getSelectedIds();
  const tbl = document.getElementById('inv-tbl');
  const empty = document.getElementById('empty-state');
  if (!tbl) return;

  if (!items.length) {
    tbl.innerHTML = '';
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  const rows = items.map(t => {
    const sel = t.id === selectedId;
    const bulk = selectedIds.has(t.id);
    const tagStr = (t.tags || []).map(tag => `<span class="tag-chip small">${esc(tag)}</span>`).join('');
    // Apply whichever role's crop adjustment matches the thumbnail actually
    // shown, so pan/zoom edits are visible in Table view too, not just Wall
    // views. The table thumbnail is a landscape box like .spine-img, so it
    // never gets the StacksUp rotation (includeRotate=false either way).
    const thumbCropStyle = t.photo_face && t.photo_thumbnail === t.photo_face ? _cropStyle(t, 'face', false)
      : t.photo_spine && t.photo_thumbnail === t.photo_spine ? _cropStyle(t, 'spine', false)
      : '';

    return `<tr class="tape-row${sel ? ' sel' : ''}${bulk ? ' bulk-sel' : ''}" data-id="${t.id}"${_eggAttrs(t)}>
      <td class="mc-2">${t.photo_thumbnail ? `<img class="tbl-thumb" src="${esc(t.photo_thumbnail)}" alt=""${thumbCropStyle}>` : `<div class="tbl-thumb-ph">📼</div>`}</td>
      <td class="cell-title mc-3"><span class="title-text">${esc(t.title)}</span></td>
      <td class="cell-year mc-4">${esc(t.year || '')}</td>
      <td class="cell-label mc-5">${esc(t.label || '')}</td>
      <td class="cell-format mc-6">${esc(t.format || 'VHS')}</td>
      <td class="cell-cond mc-7"><span class="cond-${t.condition || 'good'}">${esc(t.condition || 'good')}</span></td>
      <td class="cell-status mc-8">${esc(statusLabel(t.status))}</td>
      <td class="cell-val mc-9">${esc(t.value_low || t.value_high ? `$${t.value_low || '?'}–$${t.value_high || '?'}` : '')}</td>
      <td class="cell-tags mc-10">${tagStr}</td>
    </tr>`;
  }).join('');

  tbl.innerHTML = rows;
  tbl.querySelectorAll('.tape-row').forEach(row => attachTitleEggHover(row));
  if (!getIsReadOnly()) attachRowEvents(tbl);
}

function toggleSelected(id) {
  const set = getSelectedIds();
  set.has(id) ? set.delete(id) : set.add(id);
  renderList();
  updateBulkBar();
}

function modifierSelect(id, e, tbl) {
  if (e.shiftKey) {
    const ids = Array.from(tbl.querySelectorAll('.tape-row')).map(r => r.dataset.id);
    const a = ids.indexOf(getSelectedId());
    const b = ids.indexOf(id);
    if (a < 0) {
      getSelectedIds().clear();
      getSelectedIds().add(id);
    } else {
      const [lo, hi] = a < b ? [a, b] : [b, a];
      ids.slice(lo, hi + 1).forEach(i => getSelectedIds().add(i));
    }
  } else {
    const set = getSelectedIds();
    set.has(id) ? set.delete(id) : set.add(id);
  }
  renderList();
  updateBulkBar();
}

export function attachRowEvents(tbl) {
  tbl.querySelectorAll('.tape-row').forEach(row => {
    attachCardInteraction(row, {
      getId: () => row.dataset.id,
      onOpen: openDetail,
      onToggleSelect: toggleSelected,
      onModifierSelect: (id, e) => modifierSelect(id, e, tbl),
      onEggPreview: () => startTitleEggPreview(row),
      onEggPreviewEnd: () => stopTitleEggPreview(row),
    });
  });
}

export function openDetail(id) {
  openDetailModal(id);
}

export function updateBulkBar() {
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

export function updateCount() {
  const el = document.getElementById('count');
  if (el) el.textContent = getInventory().length;
}

export function renderInv() {
  if (document.body.dataset.tab === 'collect') {
    const list = document.getElementById('inv-list');
    const wall = document.getElementById('wall-view');
    if (getWallMode() === 0) {
      if (wall) wall.className = '';
      if (list) list.style.display = '';
      renderList();
    } else {
      if (list) list.style.display = 'none';
      renderWall();
    }
  }
}
