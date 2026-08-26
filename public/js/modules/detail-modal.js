// ── DETAIL MODAL ──────────────────────────────────────────────────────────────
import { getInventory, setSelectedId, getSelectedId, setIsNewTape } from './inventory-state.js';
import { esc, renderTagChips } from './render-helpers.js';

export function initTagChips(container, getTags, setTags) {
  function bindInput() {
    const inp = container.querySelector('.tag-add-input');
    if (!inp) return;
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ',') return;
      e.preventDefault();
      const tag = inp.value.trim().replace(/,/g, '');
      if (!tag) return;
      const tags = [...getTags()];
      if (!tags.includes(tag)) tags.push(tag);
      setTags(tags);
      container.innerHTML = renderTagChips(tags);
      bindInput();
    });
  }
  container.addEventListener('click', e => {
    const chip = e.target.closest('.tag-chip');
    if (!chip) return;
    const tag = chip.dataset.tag;
    let tags = [...getTags()];
    if (tags.includes(tag)) tags = tags.filter(t => t !== tag);
    else tags.push(tag);
    setTags(tags);
    container.innerHTML = renderTagChips(tags);
    bindInput();
  });
  bindInput();
}

export function renderDetailPhotos(t) {
  const wrap = document.getElementById('detail-photos');
  if (!wrap) return;
  const photos = t.photos || [];
  wrap.style.display = photos.length ? 'flex' : 'none';
  wrap.innerHTML = photos.map((p, i) => {
    const isFace = t.photo_face === p;
    const isSpine = t.photo_spine === p;
    return `<div class="d-photo" data-idx="${i}">
      <img src="${esc(p)}" alt="" style="width:80px;height:56px;object-fit:cover;border-radius:4px;border:2px solid ${isFace ? 'var(--blue)' : isSpine ? 'var(--green)' : 'var(--border2)'}">
      <div class="d-photo-actions" style="display:flex;gap:3px;flex-wrap:wrap;margin-top:3px">
        <button class="pin-btn" onclick="window.pinDetailPhoto?.(${i}, 'face')" title="${isFace ? 'Unpin cover' : 'Pin as cover'}" style="font-size:10px;padding:1px 5px;background:${isFace ? 'rgba(68,136,255,.2)' : 'var(--bg4)'};border:1px solid ${isFace ? 'var(--blue)' : 'var(--border2)'};color:${isFace ? 'var(--blue)' : 'var(--text3)'};border-radius:3px;cursor:pointer">${isFace ? '★ Cover' : '☆ Cover'}</button>
        <button class="pin-btn" onclick="window.pinDetailPhoto?.(${i}, 'spine')" title="${isSpine ? 'Unpin spine' : 'Pin as spine'}" style="font-size:10px;padding:1px 5px;background:${isSpine ? 'rgba(61,187,61,.2)' : 'var(--bg4)'};border:1px solid ${isSpine ? 'var(--green)' : 'var(--border2)'};color:${isSpine ? 'var(--green)' : 'var(--text3)'};border-radius:3px;cursor:pointer">${isSpine ? '★ Spine' : '☆ Spine'}</button>
        ${(isFace || isSpine) ? `<button onclick="window.openCropOverlay?.('${isFace ? 'face' : 'spine'}')" title="Adjust position" style="font-size:10px;padding:1px 5px;background:var(--bg4);border:1px solid var(--border2);color:var(--text2);border-radius:3px;cursor:pointer">✥ Adjust</button>` : ''}
        <button class="del-btn" onclick="window.removeDetailPhoto?.(${i})" style="font-size:10px;padding:1px 5px;background:var(--bg4);border:1px solid var(--border2);color:var(--text3);border-radius:3px;cursor:pointer">✕</button>
      </div>
    </div>`;
  }).join('');
}

export function openDetail(id) {
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
      if (el) window.scrambleToReal?.(el, val, 2200);
    });
    setTimeout(() => mdl.classList.remove('matrix-mode'), 2600);
  }
}
