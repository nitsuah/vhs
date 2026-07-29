// ── PHOTO CROP OVERLAY ────────────────────────────────────────────────────────
const { getInventory, getSelectedId } = require('./inventory-state');
const { _cropStyle } = require('./render-helpers');

let _cropRole = 'face';
let _cropX = 50, _cropY = 50, _cropS = 1;
let _cropPanning = false, _cropPx = 0, _cropPy = 0;

function openCropOverlay(role) {
  const t = getInventory().find(x => x.id === getSelectedId());
  if (!t) return;
  _cropRole = role;
  const src = role === 'spine' ? (t.photo_spine || t.photo_thumbnail) : (t.photo_face || t.photo_thumbnail);
  if (!src) return;

  const overlay = document.getElementById('crop-overlay');
  const img = document.getElementById('crop-img');
  img.src = src;
  overlay.style.display = 'flex';

  // Reset crop to current values
  const crop = (t.photo_crop || {})[role] || { x: 50, y: 50, s: 1 };
  _cropX = crop.x; _cropY = crop.y; _cropS = crop.s;
  updateCropPreview();
}

function closeCropOverlay() {
  document.getElementById('crop-overlay').style.display = 'none';
}

function updateCropPreview() {
  const img = document.getElementById('crop-img');
  const handle = document.getElementById('crop-handle');
  if (!img || !handle) return;

  const parts = [];
  if (_cropRole === 'spine') parts.push('rotate(90deg)');
  if (_cropS > 1) parts.push(`scale(${_cropS})`);
  img.style.transform = parts.join(' ');
  img.style.objectPosition = `${_cropX}% ${_cropY}%`;

  handle.style.left = `${_cropX}%`;
  handle.style.top = `${_cropY}%`;
  handle.style.transform = 'translate(-50%, -50%)';
}

function startDrag(x, y) {
  _cropPanning = true;
  _cropPx = x; _cropPy = y;
}

function startResize(x, y) {
  _cropPanning = true; // reuse same flag
  _cropPx = x; _cropPy = y;
}

function onMove(x, y) {
  if (!_cropPanning) return;
  const dx = x - _cropPx;
  const dy = y - _cropPy;
  _cropX = Math.max(0, Math.min(100, _cropX + dx * 0.2));
  _cropY = Math.max(0, Math.min(100, _cropY + dy * 0.2));
  updateCropPreview();
  _cropPx = x; _cropPy = y;
}

function onUp() {
  _cropPanning = false;
}

function applyCrop() {
  const t = getInventory().find(x => x.id === getSelectedId());
  if (!t) return;
  t.photo_crop = t.photo_crop || {};
  t.photo_crop[_cropRole] = { x: _cropX, y: _cropY, s: _cropS };
  closeCropOverlay();
  if (typeof renderInv === 'function') renderInv();
  if (typeof dbPut === 'function') dbPut(t).catch(e => toast('Save failed: ' + e.message, 'err'));
}

function resetCrop() {
  _cropX = 50; _cropY = 50; _cropS = 1;
  updateCropPreview();
}

function zoomIn() {
  _cropS = Math.min(4, _cropS * 1.2);
  updateCropPreview();
}

function zoomOut() {
  _cropS = Math.max(1, _cropS / 1.2);
  updateCropPreview();
}

// Event listeners
document.getElementById('crop-overlay')?.addEventListener('click', e => {
  if (e.target.id === 'crop-overlay') closeCropOverlay();
});

document.getElementById('crop-img')?.addEventListener('mousedown', e => { startDrag(e.clientX, e.clientY); e.preventDefault(); });
document.getElementById('crop-handle')?.addEventListener('mousedown', e => { startResize(e.clientX, e.clientY); e.stopPropagation(); e.preventDefault(); });
document.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
document.addEventListener('mouseup', onUp);

document.getElementById('crop-img')?.addEventListener('touchstart', e => { if (e.target === document.getElementById('crop-handle')) return; const t = e.touches[0]; startDrag(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
document.getElementById('crop-handle')?.addEventListener('touchstart', e => { const t = e.touches[0]; startResize(t.clientX, t.clientY); e.stopPropagation(); e.preventDefault(); }, { passive: false });
document.addEventListener('touchmove', e => { if (_cropPanning) { const t = e.touches[0]; onMove(t.clientX, t.clientY); e.preventDefault(); } }, { passive: false });
document.addEventListener('touchend', onUp);

module.exports = { openCropOverlay, closeCropOverlay, applyCrop, resetCrop, zoomIn, zoomOut };