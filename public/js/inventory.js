// ── VHS INVENTORY MODULE ENTRY POINT ──────────────────────────────────────────
import { getInventory, setInventory, getSelectedId, setSelectedId, getIsNewTape, setIsNewTape, getSelectedIds, getWallMode, setWallMode, setIsReadOnly } from './modules/inventory-state.js';
import { getFiltered } from './modules/filtering.js';
import { renderList, renderInv as renderListView, openDetail, updateBulkBar, updateCount } from './modules/list-view.js';
import { dbUpdateTape } from './db.js';
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

// Read-only renderer for public collection share pages (/c/:slug). Reuses the
// normal table/wall renderers (gated by the isReadOnly flag, which skips
// attaching row/card click handlers and lets loadPublicCollection hide only
// the mutating toolbar controls) so column/view changes never need to be
// maintained in two places.
function renderPublicCollection(tapes) {
  setIsReadOnly(true);
  _syncInventory(tapes);
  // Re-show the main layout (loadPublicCollection hides it) and activate the
  // collect tab so the CSS rule `body[data-tab="collect"] #right{display:flex}`
  // makes #right visible.
  const main = document.getElementById('main');
  if (main) main.style.display = '';
  document.body.dataset.tab = 'collect';
  // Hide only the mutating controls — search, sort, and the view picker stay
  // live so a share visitor can still browse the collection their own way.
  ['btn-fill-data', 'btn-revalidate', 'btn-add-tape', 'btn-import', 'bulk-bar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  renderListView();
  updateCount();
}

// Global functions for inline event handlers in HTML
window.openDetail = openDetailModal;
window.renderDetailPhotos = renderDetailPhotos;
window.pinDetailPhoto = async (idx, role) => {
  const id = getSelectedId();
  const t = inventory.find(x => x.id === id);
  if (!t) return;
  const src = t.photos[idx];
  try {
    await dbUpdateTape(id, current => ({
      ...current,
      [role === 'face' ? 'photo_face' : 'photo_spine']:
        current[role === 'face' ? 'photo_face' : 'photo_spine'] === src ? null : src,
    }));
    const saved = inventory.find(x => x.id === id);
    if (saved && getSelectedId() === id) {
      renderDetailPhotos(saved);
      renderListView();
    }
  } catch (e) { toast('Save failed: ' + e.message, 'err'); }
};
window.removeDetailPhoto = async (idx) => {
  const id = getSelectedId();
  const t = inventory.find(x => x.id === id);
  if (!t) return;
  if (!confirm('Remove this photo? This cannot be undone.')) return;
  const old = t.photos[idx];
  try {
    await dbUpdateTape(id, current => {
      const photos = (current.photos || []).filter((_, i) => i !== idx);
      return {
        ...current,
        photos,
        photo_thumbnail: current.photo_thumbnail === old ? (photos[0] || '') : current.photo_thumbnail,
        photo_face: current.photo_face === old ? null : current.photo_face,
        photo_spine: current.photo_spine === old ? null : current.photo_spine,
      };
    });
    const saved = inventory.find(x => x.id === id);
    if (!saved) return;
    renderListView();
    if (getSelectedId() === id) renderDetailPhotos(saved);
    const th = document.getElementById('detail-thumb');
    if (th && getSelectedId() === id) {
      if (saved.photo_thumbnail) { th.src = saved.photo_thumbnail; th.style.display = 'block'; }
      else th.style.display = 'none';
    }
  } catch (e) { toast('Remove photo failed: ' + e.message, 'err'); }
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