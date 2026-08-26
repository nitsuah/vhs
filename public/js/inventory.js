// ── VHS INVENTORY MODULE ENTRY POINT ──────────────────────────────────────────
import { getInventory, setInventory, getSelectedId, setSelectedId, getIsNewTape, setIsNewTape, getSelectedIds, getWallMode, setWallMode } from './modules/inventory-state.js';
import { getFiltered } from './modules/filtering.js';
import { renderList, renderInv as renderListView, openDetail, updateBulkBar, updateCount } from './modules/list-view.js';
import { dbPut } from './db.js';
import { toast } from './utils.js';
import { renderWall } from './modules/wall-view.js';
import { openDetail as openDetailModal, renderDetailPhotos, initTagChips } from './modules/detail-modal.js';
import { openCropOverlay, closeCropOverlay, applyCrop, resetCrop, zoomIn, zoomOut } from './modules/crop-overlay.js';
import { applyBulkStatus, deleteBulk, clearBulk } from './modules/bulk-actions.js';
import { esc, _cropStyle, _eggAttrs, statusLabel, renderTagChips } from './modules/render-helpers.js';

// Backward-compatible global inventory array (for existing code)
let inventory = [];

// Sync function to keep global and modular state in sync
function _syncInventory(arr) {
  inventory = arr;
  setInventory(arr);
}

// Re-export all for backward compatibility
export {
  // State
  inventory,
  _syncInventory,
  getInventory, _syncInventory as setInventory,
  getSelectedId, setSelectedId,
  getIsNewTape, setIsNewTape,
  getSelectedIds,
  getWallMode, setWallMode,
  // Filtering
  getFiltered,
  // Views
  renderList, renderWall, renderListView as renderInv, updateBulkBar, updateCount,
  // Detail modal
  openDetailModal as openDetail, renderDetailPhotos, initTagChips,
  // Crop overlay
  openCropOverlay, closeCropOverlay, applyCrop, resetCrop, zoomIn, zoomOut,
  // Bulk actions
  applyBulkStatus, deleteBulk, clearBulk,
  // Helpers
  esc, _cropStyle, _eggAttrs, statusLabel, renderTagChips,
  // Public share view
  renderPublicCollection,
};

// Read-only renderer for public collection share pages (/c/:slug).
// Targets #inv-tbl so the existing table CSS applies without edit controls.
function renderPublicCollection(tapes) {
  const tbl = document.getElementById('inv-tbl');
  if (!tbl) return;
  // Re-show the main layout (loadPublicCollection hides it) and activate the
  // collect tab so the CSS rule `body[data-tab="collect"] #right{display:flex}`
  // makes #right visible.
  const main = document.getElementById('main');
  if (main) main.style.display = '';
  document.body.dataset.tab = 'collect';
  // Hide editing controls that don't belong in a read-only view.
  ['collect-subhdr', 'bulk-bar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  // Render rows using the same column structure as renderList(), but with no
  // click handlers so the view remains read-only.
  tbl.innerHTML = tapes.length
    ? tapes.map(t => `<tr class="tape-row" data-id="${esc(t.id || '')}">
        <td class="mc-2">${t.photo_thumbnail ? `<img class="tbl-thumb" src="${esc(t.photo_thumbnail)}" alt="">` : `<div class="tbl-thumb-ph">📼</div>`}</td>
        <td class="cell-title mc-3">${esc(t.title || '')}</td>
        <td class="cell-year mc-4">${esc(t.year || '')}</td>
        <td class="cell-label mc-5">${esc(t.label || '')}</td>
        <td class="cell-format mc-6">${esc(t.format || 'VHS')}</td>
        <td class="cell-cond mc-7"><span class="cond-${t.condition || 'good'}">${esc(t.condition || 'good')}</span></td>
        <td class="cell-status mc-8">${esc(statusLabel(t.status))}</td>
        <td class="cell-val mc-9">${esc(t.value_low || t.value_high ? `$${t.value_low || '?'}–$${t.value_high || '?'}` : '')}</td>
        <td class="cell-tags mc-10">${(t.tags || []).map(g => `<span class="tag-chip small">${esc(g)}</span>`).join('')}</td>
      </tr>`).join('')
    : `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text2)">This collection is empty.</td></tr>`;
}

// Global functions for inline event handlers in HTML
window.openDetail = openDetailModal;
window.renderDetailPhotos = renderDetailPhotos;
window.pinDetailPhoto = async (idx, role) => {
  const t = inventory.find(x => x.id === getSelectedId());
  if (!t) return;
  const src = t.photos[idx];
  if (role === 'face') { t.photo_face = (t.photo_face === src ? null : src); }
  else { t.photo_spine = (t.photo_spine === src ? null : src); }
  renderDetailPhotos(t);
  renderListView();
  try { await dbPut(t); } catch (e) { toast('Save failed: ' + e.message, 'err'); }
};
window.removeDetailPhoto = async (idx) => {
  const t = inventory.find(x => x.id === getSelectedId());
  if (!t) return;
  const old = t.photos[idx];
  t.photos = (t.photos || []).filter((_, i) => i !== idx);
  if (t.photo_thumbnail === old) t.photo_thumbnail = t.photos[0] || '';
  if (t.photo_face === old) t.photo_face = null;
  if (t.photo_spine === old) t.photo_spine = null;
  await dbPut(t);
  renderListView();
  renderDetailPhotos(t);
  const th = document.getElementById('detail-thumb');
  if (t.photo_thumbnail) { th.src = t.photo_thumbnail; th.style.display = 'block'; }
  else th.style.display = 'none';
};
window.openCropOverlay = openCropOverlay;
window.applyCrop = applyCrop;
window.resetCrop = resetCrop;
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.applyBulkStatus = applyBulkStatus;
window.deleteBulk = deleteBulk;
window.clearBulk = clearBulk;
window.renderInv = renderListView;
window.updateBulkBar = updateBulkBar;
window.updateCount = updateCount;