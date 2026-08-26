// ── PHOTO CROP OVERLAY ────────────────────────────────────────────────────────
import { getInventory, getSelectedId } from './inventory-state.js';

let _cropRole = 'face';
let _cropX = 50, _cropY = 50, _cropS = 1;
let _cropPanning = false, _cropPx = 0, _cropPy = 0;

export function openCropOverlay(role) {
  const t = getInventory().find(x => x.id === getSelectedId());
  if (!t) return;
  _cropRole = role;
  const src = role === 'spine' ? (t.photo_spine || t.photo_thumbnail) : (t.photo_face || t.photo_thumbnail);
  if (!src) return;

  const modal = document.getElementById('m-crop');
  const img = document.getElementById('crop-img');
  const hint = document.getElementById('crop-role-hint');
  if (!modal || !img) return;

  img.src = src;
  if (hint) hint.textContent = role === 'spine'
    ? 'Positioning the spine image — drag to reposition, scroll/pinch to zoom. This sets how the spine appears in the shelf view.'
    : 'Positioning the cover image — drag to reposition, scroll/pinch to zoom. This sets how the cover appears in the cover wall.';

  const crop = (t.photo_crop || {})[role] || { x: 50, y: 50, s: 1 };
  _cropX = crop.x; _cropY = crop.y; _cropS = crop.s;

  modal.style.display = 'flex';
  updateCropPreview();
}

export function closeCropOverlay() {
  const modal = document.getElementById('m-crop');
  if (modal) modal.style.display = 'none';
}

function updateCropPreview() {
  const img = document.getElementById('crop-img');
  const pct = document.getElementById('crop-pct');
  const zoomSlider = document.getElementById('crop-zoom');
  const zoomLbl = document.getElementById('crop-zoom-lbl');
  if (!img) return;

  const parts = [];
  if (_cropRole === 'spine') parts.push('rotate(90deg)');
  if (_cropS > 1) parts.push(`scale(${_cropS.toFixed(2)})`);
  img.style.transform = parts.join(' ') || 'none';
  img.style.objectPosition = `${_cropX}% ${_cropY}%`;

  if (pct) pct.textContent = `${Math.round(_cropX)}% × ${Math.round(_cropY)}%`;
  if (zoomSlider) zoomSlider.value = String(Math.round(_cropS * 100));
  if (zoomLbl) zoomLbl.textContent = `${_cropS.toFixed(1)}×`;
}

function startDrag(x, y) {
  _cropPanning = true;
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

function onUp() { _cropPanning = false; }

export function applyCrop() {
  const t = getInventory().find(x => x.id === getSelectedId());
  if (!t) return;
  t.photo_crop = t.photo_crop || {};
  t.photo_crop[_cropRole] = { x: _cropX, y: _cropY, s: _cropS };
  closeCropOverlay();
  if (typeof window.renderInv === 'function') window.renderInv();
  if (typeof window.dbPut === 'function') window.dbPut(t).catch(e => window.toast?.('Save failed: ' + e.message, 'err'));
}

export function resetCrop() {
  _cropX = 50; _cropY = 50; _cropS = 1;
  updateCropPreview();
}

export function zoomIn() {
  _cropS = Math.min(4, _cropS * 1.2);
  updateCropPreview();
}

export function zoomOut() {
  _cropS = Math.max(1, _cropS / 1.2);
  updateCropPreview();
}

// Event listeners
const frame = document.getElementById('crop-frame');
const img = document.getElementById('crop-img');

frame?.addEventListener('mousedown', e => { startDrag(e.clientX, e.clientY); e.preventDefault(); });
frame?.addEventListener('touchstart', e => { const t = e.touches[0]; startDrag(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
document.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
document.addEventListener('mouseup', onUp);
document.addEventListener('touchmove', e => { if (_cropPanning) { const t = e.touches[0]; onMove(t.clientX, t.clientY); e.preventDefault(); } }, { passive: false });
document.addEventListener('touchend', onUp);

frame?.addEventListener('wheel', e => {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 1.1 : 0.91;
  _cropS = Math.max(1, Math.min(4, _cropS * delta));
  updateCropPreview();
}, { passive: false });

document.getElementById('crop-zoom')?.addEventListener('input', e => {
  _cropS = parseInt(e.target.value, 10) / 100;
  updateCropPreview();
});

document.getElementById('crop-save')?.addEventListener('click', applyCrop);
document.getElementById('crop-cancel')?.addEventListener('click', closeCropOverlay);
document.getElementById('crop-reset')?.addEventListener('click', resetCrop);

document.getElementById('m-crop')?.addEventListener('click', e => {
  if (e.target.id === 'm-crop') closeCropOverlay();
});
