// ── DETAIL MODAL ──────────────────────────────────────────────────────────────
const { getInventory, setSelectedId, getSelectedId, setIsNewTape, getIsNewTape } = require('./inventory-state');
const { esc, renderTagChips } = require('./render-helpers');

function initTagChips(container, getTags, setTags) {
  container.addEventListener('click', e => {
    const chip = e.target.closest('.tag-chip');
    if (!chip) return;
    const tag = chip.dataset.tag;
    let tags = [...getTags()];
    if (tags.includes(tag)) tags = tags.filter(t => t !== tag);
    else tags.push(tag);
    setTags(tags);
    container.innerHTML = renderTagChips(tags);
    initTagChips(container, getTags, setTags);
  });
  const inp = container.querySelector('.tag-add-input');
  if (inp) inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const tag = inp.value.trim().replace(/,/g, '');
      if (!tag) return;
      const tags = [...getTags()];
      if (!tags.includes(tag)) tags.push(tag);
      setTags(tags);
      container.innerHTML = renderTagChips(tags);
      initTagChips(container, getTags, setTags);
    }
  });
}

function renderDetailPhotos(t) {
  const wrap = document.getElementById('d-photos');
  if (!wrap) return;
  const photos = t.photos || [];
  wrap.innerHTML = photos.map((p, i) => `
    <div class="d-photo" data-idx="${i}">
      <img src="${p}" alt="">
      <div class="d-photo-actions">
        <button class="pin-btn" onclick="window.pinDetailPhoto?.(${i}, 'face')" title="Pin as face">${t.photo_face === p ? '★' : '☆'}</button>
        <button class="pin-btn" onclick="window.pinDetailPhoto?.(${i}, 'spine')" title="Pin as spine">${t.photo_spine === p ? '★' : '☆'}</button>
        <button class="del-btn" onclick="window.removeDetailPhoto?.(${i})">✕</button>
      </div>
    </div>
  `).join('');
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

window.pinDetailPhoto = async function(idx, role) {
  const t = getInventory().find(x => x.id === getSelectedId());
  if (!t) return;
  const src = t.photos[idx];
  if (role === 'face') { t.photo_face = (t.photo_face === src ? null : src); }
  else { t.photo_spine = (t.photo_spine === src ? null : src); }
  renderDetailPhotos(t);
  if (typeof renderInv === 'function') renderInv();
  try { await dbPut(t); } catch (e) { toast('Save failed: ' + e.message, 'err'); }
};

window.removeDetailPhoto = async function(idx) {
  const t = getInventory().find(x => x.id === getSelectedId());
  if (!t) return;
  const old = t.photos[idx];
  t.photos = (t.photos || []).filter((_, i) => i !== idx);
  if (t.photo_thumbnail === old) t.photo_thumbnail = t.photos[0] || '';
  if (t.photo_face === old) t.photo_face = null;
  if (t.photo_spine === old) t.photo_spine = null;
  await dbPut(t);
  if (typeof renderInv === 'function') renderInv();
  renderDetailPhotos(t);
  const th = document.getElementById('detail-thumb');
  if (t.photo_thumbnail) { th.src = t.photo_thumbnail; th.style.display = 'block'; }
  else th.style.display = 'none';
};

module.exports = { openDetail, renderDetailPhotos, initTagChips };