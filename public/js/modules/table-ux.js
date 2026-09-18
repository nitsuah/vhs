// ── TABLE HEADER UX: sort-by-click + resizable columns ────────────────────────
// Wires the Table view's <th> elements — previously "Wall"/Table column
// headers had cursor:pointer styling implying they were clickable but no
// handler at all, and the .col-rh resize-handle CSS existed with nothing
// ever instantiating it.
import { getSortValue, setSortValue } from './inventory-state.js';

const COL_SORT_FIELD = {
  title: 'title', year: 'year', label: 'label', format: 'format',
  condition: 'cond', status: 'status', value: 'val',
};
const WIDTHS_KEY = 'vhs-col-widths';

function loadWidths() {
  try { return JSON.parse(localStorage.getItem(WIDTHS_KEY) || '{}'); } catch { return {}; }
}
function saveWidths(widths) {
  try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(widths)); } catch { /* best-effort persistence only */ }
}

export function updateSortIndicators() {
  const sort = getSortValue();
  const [field, dir] = sort.split('_');
  document.querySelectorAll('#inv-list .th-sort').forEach(th => {
    const col = th.dataset.col;
    const isActive = COL_SORT_FIELD[col] === field;
    const arrow = th.querySelector('.sort-arr');
    if (!arrow) return;
    arrow.classList.toggle('on', isActive);
    arrow.textContent = isActive && dir === 'desc' ? '▼' : '▲';
    th.setAttribute('aria-sort', isActive ? (dir === 'desc' ? 'descending' : 'ascending') : 'none');
  });
}

function applyStoredWidths() {
  const widths = loadWidths();
  document.querySelectorAll('#inv-list .th-sort').forEach(th => {
    const w = widths[th.dataset.col];
    if (w) th.style.width = w;
  });
}

export function initTableUX() {
  applyStoredWidths();
  updateSortIndicators();

  document.querySelectorAll('#inv-list .th-sort').forEach(th => {
    const col = th.dataset.col;
    const field = COL_SORT_FIELD[col];

    // Click the label (not the resize handle) to sort by this column —
    // click again to flip direction. Works identically on touch (mobile has
    // no other sort control since #sort-sel is hidden below 700px).
    const label = th.querySelector('.th-lbl') || th;
    label.addEventListener('click', () => {
      if (!field) return;
      const [curField, curDir] = getSortValue().split('_');
      const newDir = curField === field && curDir === 'asc' ? 'desc' : 'asc';
      const newValue = `${field}_${newDir}`;
      setSortValue(newValue);
      const sel = document.getElementById('sort-sel');
      if (sel && [...sel.options].some(o => o.value === newValue)) sel.value = newValue;
      window.renderInv?.();
      updateSortIndicators();
    });

    // Resize handle: drag to resize, double-click to reset to the default
    // table-layout:fixed distribution.
    const handle = th.querySelector('.col-rh');
    if (!handle) return;
    let startX = 0, startWidth = 0, dragging = false;

    function onMove(e) {
      if (!dragging) return;
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const newWidth = Math.max(40, startWidth + (x - startX));
      th.style.width = `${newWidth}px`;
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      const widths = loadWidths();
      widths[col] = th.style.width;
      saveWidths(widths);
    }
    handle.addEventListener('mousedown', e => {
      dragging = true; startX = e.clientX; startWidth = th.offsetWidth;
      e.preventDefault(); e.stopPropagation();
    });
    handle.addEventListener('touchstart', e => {
      dragging = true; startX = e.touches[0].clientX; startWidth = th.offsetWidth;
      e.stopPropagation();
    }, { passive: true });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);

    handle.addEventListener('dblclick', e => {
      e.stopPropagation();
      th.style.width = '';
      const widths = loadWidths();
      delete widths[col];
      saveWidths(widths);
    });
  });
}
