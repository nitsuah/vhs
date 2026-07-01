// ── VHS INVENTORY MODULE ENTRY POINT ──────────────────────────────────────────
import { getInventory, setInventory, getSelectedId, setSelectedId, getIsNewTape, setIsNewTape, getSelectedIds, getWallMode, setWallMode } from './modules/inventory-state.js';
import { getFiltered } from './modules/filtering.js';
import { renderList, renderInv as renderListView, openDetail, updateBulkBar, updateCount } from './modules/list-view.js';
import { renderWall, updateBulkBar as updateWallBulkBar } from './modules/wall-view.js';
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
  getInventory, setInventory: _syncInventory,
  getSelectedId, setSelectedId,
  getIsNewTape, setIsNewTape,
  getSelectedIds,
  getWallMode, setWallMode,
  // Filtering
  getFiltered,
  // Views
  renderList, renderWall, renderInv: renderListView, updateBulkBar, updateCount,
  // Detail modal
  openDetail: openDetailModal, renderDetailPhotos, initTagChips,
  // Crop overlay
  openCropOverlay, closeCropOverlay, applyCrop, resetCrop, zoomIn, zoomOut,
  // Bulk actions
  applyBulkStatus, deleteBulk, clearBulk,
  // Helpers
  esc, _cropStyle, _eggAttrs, statusLabel, renderTagChips
};

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
  renderInv();
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
  renderInv();
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
window.renderInv = renderInv;
window.updateBulkBar = updateBulkBar;
window.updateCount = updateCount;