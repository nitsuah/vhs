// ── LIST VIEW RENDER ──────────────────────────────────────────────────────────
const { getInventory, getSelectedId, getSelectedIds, getIsNewTape } = require('./inventory-state');
const { getFiltered } = require('./filtering');
const { esc, _cropStyle, _eggAttrs, statusLabel, renderTagChips } = require('./render-helpers');

let _resizeTh = null, _resizeX0 = 0, _resizeW0 = 0;
let _longPressActive = false;

function renderList() {
  const items = getFiltered();
  const selectedId = getSelectedId();
  const selectedIds = getSelectedIds();
  const isNewTape = getIsNewTape();
  const tbl = document.getElementById('inv-tbl');
  if (!tbl) return;

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

function attachRowEvents(tbl) {
  tbl.querySelectorAll('.tape-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('input, select, button, .tag-chip')) return;
      const id = row.dataset.id;
      if (e.shiftKey) {
        const ids = Array.from(tbl.querySelectorAll('.tape-row')).map(r => r.dataset.id);
        const a = ids.indexOf(getSelectedId());
        const b = ids.indexOf(id);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        ids.slice(lo, hi + 1).forEach(i => getSelectedIds().add(i));
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
    _initLongPress(row, row.dataset.id);
  });
}

function _initLongPress(row, id) {
  let timer, sx, sy;
  const start = (x, y) => {
    sx = x; sy = y;
    timer = setTimeout(() => {
      _longPressActive = true;
      const t = getInventory().find(x => x.id === id);
      if (t) {
        openCropOverlay('face', t);
      }
    }, 500);
  };
  const move = (x, y) => {
    if (timer && (Math.abs(x - sx) > 10 || Math.abs(y - sy) > 10)) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const end = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    _longPressActive = false;
  };

  row.addEventListener('mousedown', e => start(e.clientX, e.clientY));
  row.addEventListener('touchstart', e => start(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  window.addEventListener('mousemove', e => move(e.clientX, e.clientY));
  window.addEventListener('touchmove', e => move(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  window.addEventListener('mouseup', end);
  window.addEventListener('touchend', end);
}

function openDetail(id) {
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
      if (el) scrambleToReal(el, val, 2200);
    });
    setTimeout(() => mdl.classList.remove('matrix-mode'), 2600);
  }
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

function updateCount() {
  const el = document.getElementById('count');
  if (el) el.textContent = getInventory().length;
}

function renderInv() {
  if (document.body.dataset.tab === 'collect') {
    if (getWallMode() === 0) renderList();
    else renderWall();
  }
}

module.exports = { renderList, renderInv, openDetail, updateBulkBar, updateCount, attachRowEvents };