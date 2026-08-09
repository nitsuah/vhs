// ── LIST VIEW RENDER ──────────────────────────────────────────────────────────
import { getInventory, getSelectedId, getSelectedIds, getIsNewTape, setSelectedId, setIsNewTape, getWallMode } from './inventory-state.js';
import { getFiltered } from './filtering.js';
import { esc, _cropStyle, _eggAttrs, statusLabel, renderTagChips } from './render-helpers.js';
import { openCropOverlay } from './crop-overlay.js';
import { openDetail as openDetailModal, renderDetailPhotos, initTagChips } from './detail-modal.js';
import { renderWall } from './wall-view.js';

let _longPressActive = false;

// Global window listeners for long-press — registered once, not per row
window.addEventListener('mousemove', e => _lpMove(e.clientX, e.clientY));
window.addEventListener('touchmove', e => _lpMove(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
window.addEventListener('mouseup', _lpEnd);
window.addEventListener('touchend', _lpEnd);

let _lpTimer = null, _lpSx = 0, _lpSy = 0, _lpId = null;

function _lpStart(x, y, id) {
  _lpSx = x; _lpSy = y; _lpId = id;
  _lpTimer = setTimeout(() => {
    _longPressActive = true;
    const t = getInventory().find(x => x.id === _lpId);
    if (t) { setSelectedId(_lpId); openCropOverlay('face'); }
  }, 500);
}

function _lpMove(x, y) {
  if (_lpTimer && (Math.abs(x - _lpSx) > 10 || Math.abs(y - _lpSy) > 10)) {
    clearTimeout(_lpTimer);
    _lpTimer = null;
  }
}

function _lpEnd() {
  if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; }
  _longPressActive = false;
}

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

    return `<tr class="tape-row${sel ? ' sel' : ''}${bulk ? ' bulk-sel' : ''}${_eggAttrs(t)}" data-id="${t.id}">
      <td><img class="row-thumb" src="${t.photo_thumbnail || ''}" alt=""></td>
      <td class="cell-title"><span class="title-text">${esc(t.title)}</span></td>
      <td class="cell-year">${esc(t.year || '')}</td>
      <td class="cell-label">${esc(t.label || '')}</td>
      <td class="cell-format">${esc(t.format || 'VHS')}</td>
      <td class="cell-cond"><span class="cond-${t.condition || 'good'}">${esc(t.condition || 'good')}</span></td>
      <td class="cell-status">${esc(statusLabel(t.status))}</td>
      <td class="cell-val">${esc(t.value_low || t.value_high ? `$${t.value_low || '?'}–$${t.value_high || '?'}` : '')}</td>
      <td class="cell-tags">${tagStr}</td>
    </tr>`;
  }).join('');

  tbl.innerHTML = rows;
  attachRowEvents(tbl);
}

export function attachRowEvents(tbl) {
  tbl.querySelectorAll('.tape-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('input, select, button, .tag-chip')) return;
      const id = row.dataset.id;
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
      } else if (e.ctrlKey || e.metaKey) {
        const set = getSelectedIds();
        set.has(id) ? set.delete(id) : set.add(id);
      } else {
        getSelectedIds().clear();
        getSelectedIds().add(id);
      }
      renderList();
      updateBulkBar();
    });

    row.addEventListener('dblclick', () => openDetail(row.dataset.id));

    row.addEventListener('mousedown', e => _lpStart(e.clientX, e.clientY, row.dataset.id));
    row.addEventListener('touchstart', e => _lpStart(e.touches[0].clientX, e.touches[0].clientY, row.dataset.id), { passive: true });
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
