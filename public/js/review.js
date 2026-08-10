// ── REVIEW PANEL ─────────────────────────────────────────────────────────
import { inventory, setInventory, renderInv, updateCount } from './inventory.js';
import { dbAdd, dbPut, nextId } from './db.js';
import { lookupMetadata, callAI } from './ai.js';
import { findDup, toast, rotateImage90CCW, triggerTapeInsertAnim, flashInvRow } from './utils.js';
import { esc, renderTagChips, initTagChips } from './inventory.js';
import { cards, setCards, uidSeq, setUidSeq, nextUidSeq } from './state.js';

const revPanel = document.getElementById('review');
const revLoading = document.getElementById('rev-loading');
const revCardsEl = document.getElementById('rev-cards');
const revErr = document.getElementById('rev-err');
const revBulk = document.getElementById('rev-bulk');

// session-only set: prevents re-adding an item after confirm/discard within the same session
const seenJobIds = new Set();
function _seenAdd(id) { seenJobIds.add(id); }
function _seenDel(id) { seenJobIds.delete(id); }

export function addCard(data, source = null, thumb = null, expanded = false, jobId = null, processingState = 'ready', failReason = '') {
  cards.push({ uid: nextUidSeq(), data: { ...data }, source, thumb, expanded, jobId, processingState, failReason, _aiTitle: data.title || null });
}

function _claimJob(card) {
  if (!card) return;
  const id = card.jobId; if (!id) return;
  _seenAdd(id);
  if (card.processingState === 'processing' || card.processingState === 'queued') {
    fetch(`/api/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  } else {
    fetch(`/api/review/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  }
}

function _reportOutcome(card, action) {
  const srcId = card.srcJobId || card.jobId;
  if (!srcId) return;
  fetch('/api/analytics/outcome', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      job_id: srcId,
      action,
      final_title: card.data.title || null,
      final_year: card.data.year || null,
      final_label: card.data.label || null,
      imdb_id: card.data.imdb_id || null,
    })
  }).catch(() => {});
}

export function showRevPanel() { revPanel.classList.add('on'); revErr.style.display = 'none'; window.updateTabBadge?.(); }
export function hideRevPanel() {
  cards.forEach(c => { if (c.processingState !== 'processing') _claimJob(c); });
  revPanel.classList.remove('on');
  setCards([]);
  revCardsEl.innerHTML = ''; revBulk.classList.remove('on');
  document.getElementById('rev-title').textContent = 'Pending Review';
  window.updateTabBadge?.();
}
export function setRevLoading(on) { revLoading.style.display = on ? 'flex' : 'none'; }
export function setRevMsg(m) { const el = document.getElementById('rev-msg'); if (el) el.textContent = m; }
window.setRevMsg = setRevMsg;
export function showRevErr(m) { revErr.style.display = 'block'; revErr.textContent = m; revCardsEl.innerHTML = ''; revBulk.classList.remove('on'); }

export function renderCards() {
  window.updateTabBadge?.();
  const readyCount = cards.filter(c => c.processingState === 'ready').length;
  const procCount = cards.filter(c => c.processingState === 'processing' || c.processingState === 'queued').length;
  revBulk.classList.toggle('on', readyCount > 0 || procCount > 0);
  const stopBtn = document.getElementById('btn-stop-proc');
  if (stopBtn) stopBtn.style.display = procCount ? '' : 'none';
  const discardAllBtn = document.getElementById('btn-discard-all');
  if (discardAllBtn) discardAllBtn.style.display = procCount ? 'none' : '';
  const totalN = cards.length;
  document.getElementById('rev-title').textContent = totalN ? `Pending Review (${totalN})` : 'Pending Review';
  if (!totalN) {
    revCardsEl.innerHTML = ''; revBulk.classList.remove('on');
    document.getElementById('rev-title').textContent = 'Pending Review';
    if (!revErr.style.display || revErr.style.display === 'none') revPanel.classList.remove('on');
    return;
  }
  revCardsEl.innerHTML = `<table class="rev-table"><thead><tr>
    <th style="width:170px"></th>
    <th>Title</th><th style="width:120px"></th>
  </tr></thead><tbody>${cards.map(card => {
    const proc = card.processingState === 'processing';
    const queued = card.processingState === 'queued';
    const fail = card.processingState === 'failed';
    const stuck = proc && card.jobId && card.inflightSince && (Date.now() - new Date(card.inflightSince).getTime() > 10 * 60 * 1000);
    const spinnerHTML = '<span class="spin" style="width:12px;height:12px;border-width:2px;display:inline-block"></span>';
    const thumb = card.thumb
      ? `<div class="rev-thumb-wrap"><img class="rev-thumb" src="${esc(card.thumb)}"></div>`
      : `<div class="card-hdr-ph">${proc ? spinnerHTML : queued ? '⏳' : '📼'}</div>`;
    const rowClass = `rev-card${proc ? (stuck ? ' card-failed' : ' card-processing') : fail ? ' card-failed' : queued ? ' card-queued' : ''}`;
    const isUpdate = card.source === 'fill' || card.source === 'revalidate';
    const titlePlaceholder = proc ? 'Analyzing… (pre-fill if you know it)' : queued ? 'Queued…' : fail ? 'Enter title manually' : 'Title';
    const titleStyle = !card.data.title && !proc && !queued ? 'border-color:var(--yellow)' : '';
    const updateBadge = isUpdate ? `<span style="font-size:9px;background:rgba(68,136,255,.18);color:var(--blue);border:1px solid rgba(68,136,255,.3);border-radius:3px;padding:1px 5px;flex-shrink:0;white-space:nowrap">${card.source === 'revalidate' ? 'Re-check' : 'Enrich'} ↑${esc(card.data.tape_id || '')}</span>` : '';
    const locked = proc || queued;
    const hasTitle = !!(card.data.title || '').trim();
    const lookupBtn = !locked && !isUpdate
      ? (hasTitle
        ? `<button class="btn-lookup c-lk-toggle" data-uid="${card.uid}" data-mode="search" title="Look up metadata">🔍</button>`
        : `<button class="btn-lookup c-lk-toggle" data-uid="${card.uid}" data-mode="retry" title="Discard — re-capture to retry" style="color:var(--red)">↺</button>`)
      : '';
    return `<tr class="${rowClass}" data-uid="${card.uid}">
      <td>${thumb}</td>
      <td><div style="display:flex;flex-direction:column;gap:2px">
        <div style="display:flex;gap:4px;align-items:center">
          <input class="c-f${isUpdate ? ' locked' : ''}" data-uid="${card.uid}" data-f="title" value="${esc(card.data.title || '')}" placeholder="${titlePlaceholder}" style="${titleStyle}" ${isUpdate ? 'readonly' : ''}>
          ${updateBadge}
          ${lookupBtn}
        </div>
        ${fail && card.failReason ? `<div class="fail-reason">⚠ ${esc(card.failReason)}</div>` : ''}
        ${stuck ? `<div class="fail-reason">⚠ Stuck — analyzing >10 min</div>` : ''}
        ${proc && card.data.title ? `<div style="font-size:10px;color:var(--text3);font-style:italic">Pre-filled — won't be overwritten</div>` : ''}
      </div></td>
      <td style="white-space:nowrap;display:flex;gap:4px;align-items:center;padding:5px 6px">
        ${(!locked || card.data.title) ? `<button class="btn btn-sm btn-ok c-confirm" data-uid="${card.uid}" title="${locked ? 'Save now (skip analysis)' : 'Confirm'}">✓</button>` : ''}
        ${stuck && card.jobId ? `<button class="btn-retry c-retry" data-uid="${card.uid}" title="Stuck — re-queue for analysis">↺ Retry</button>` : ''}
        <button class="btn btn-sm btn-x c-discard" data-uid="${card.uid}" title="Discard">✕</button>
      </td>
    </tr>`;
  }).join('')}</tbody></table>`;

  revCardsEl.querySelectorAll('.c-f:not(.locked)').forEach(el => {
    el.addEventListener('input', () => syncCard(+el.dataset.uid));
    el.addEventListener('change', () => syncCard(+el.dataset.uid));
  });
  revCardsEl.querySelectorAll('.card-processing input[data-f="title"],.card-queued input[data-f="title"]').forEach(el => {
    el.addEventListener('input', () => {
      syncCard(+el.dataset.uid);
      const row = el.closest('tr');
      const existing = row?.querySelector('.c-confirm');
      if (el.value.trim() && !existing) {
        const acts = row?.querySelector('td:last-child');
        if (acts) {
          const btn = document.createElement('button');
          btn.className = 'btn btn-sm btn-ok c-confirm'; btn.dataset.uid = el.dataset.uid; btn.title = 'Save now (skip analysis)'; btn.textContent = '✓';
          btn.addEventListener('click', e => { e.stopPropagation(); confirmCard(+btn.dataset.uid); });
          acts.prepend(btn);
        }
      } else if (!el.value.trim() && existing) { existing.remove(); }
    });
  });
  revCardsEl.querySelectorAll('tr:not(.card-processing):not(.card-queued) input[data-f="title"]').forEach(el => {
    el.addEventListener('input', () => {
      syncCard(+el.dataset.uid);
      const btn = el.closest('td')?.querySelector('.c-lk-toggle'); if (!btn) return;
      const hasTitle = !!el.value.trim();
      if (hasTitle && btn.dataset.mode === 'retry') {
        btn.dataset.mode = 'search'; btn.textContent = '🔍'; btn.title = 'Look up metadata'; btn.style.color = '';
      } else if (!hasTitle && btn.dataset.mode === 'search') {
        btn.dataset.mode = 'retry'; btn.textContent = '↺'; btn.title = 'Discard — re-capture to retry'; btn.style.color = 'var(--red)';
      }
    });
  });
  revCardsEl.querySelectorAll('.c-lk-toggle').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const uid = +btn.dataset.uid; syncCard(uid);
      if (btn.dataset.mode === 'retry') { discardCard(uid); return; }
      const card = cards.find(c => c.uid === uid); if (!card) return;
      const title = card.data.title.trim(); if (!title) return;
      btn.disabled = true; btn.textContent = '…';
      const meta = await lookupMetadata(title);
      btn.disabled = false; btn.textContent = '🔍';
      if (!meta) return;
      if (meta.year) card.data.year = meta.year;
      if (meta.label) card.data.label = meta.label;
      if (meta.format) card.data.format = meta.format;
      if (meta.value_low) card.data.value_low = meta.value_low;
      if (meta.value_high) card.data.value_high = meta.value_high;
      renderCards();
    });
  });
  revCardsEl.querySelectorAll('.c-confirm').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); confirmCard(+btn.dataset.uid); });
  });
  revCardsEl.querySelectorAll('.c-discard').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); discardCard(+btn.dataset.uid); });
  });
  revCardsEl.querySelectorAll('.c-retry').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const uid = +btn.dataset.uid;
      const card = cards.find(c => c.uid === uid); if (!card) return;
      const retryId = card.srcJobId || card.jobId; if (!retryId) return;
      btn.disabled = true; btn.textContent = '…';
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(retryId)}/retry`, { method: 'POST' });
        if (!res.ok) throw new Error(`${res.status}`);
        _seenDel(retryId);
        card.processingState = 'processing'; card.failReason = ''; card.inflightSince = new Date().toISOString();
        renderCards();
      } catch { btn.disabled = false; btn.textContent = '↺'; toast('Retry failed', 'err'); }
    });
  });
}

export function syncCard(uid) {
  const card = cards.find(c => c.uid === uid); if (!card) return;
  revCardsEl.querySelectorAll(`[data-uid="${uid}"].c-f`).forEach(el => {
    if (el.dataset.f === 'tags') {
      card.data.tags = el.value ? el.value.split(',').map(s => s.trim()).filter(Boolean) : [];
    } else {
      card.data[el.dataset.f] = el.value;
    }
  });
}

export async function confirmCard(uid) {
  syncCard(uid);
  const card = cards.find(c => c.uid === uid); if (!card) return;
  if ((card.processingState === 'processing' || card.processingState === 'queued') && !card.data.title?.trim()) return;

  if (card.source === 'fill' || card.source === 'revalidate') {
    const tapeId = card.data.tape_id;
    const t = inventory.find(x => x.id === tapeId);
    if (!t) { toast('Tape not found — may have been deleted', 'err'); discardCard(uid); return; }
    const APPLY_FIELDS = ['title', 'year', 'label', 'format', 'value_low', 'value_high', 'imdb_id'];
    for (const f of APPLY_FIELDS) { if (card.data[f] !== undefined && card.data[f] !== '') t[f] = card.data[f]; }
    await dbPut(t);
    _claimJob(card);
    toast(`Updated: ${t.title}`, 'ok');
    const idx = cards.findIndex(c => c.uid === uid);
    setCards(cards.filter(c => c.uid !== uid));
    renderInv(); updateCount();
    if (!cards.length) { hideRevPanel(); flashInvRow(tapeId); return; }
    const nextCard = cards[idx] || cards[idx - 1];
    if (nextCard) nextCard.expanded = true;
    renderCards();
    flashInvRow(tapeId);
    return;
  }

  const title = card.data.title?.trim();
  if (!title) {
    const el = revCardsEl.querySelector(`[data-uid="${uid}"][data-f="title"]`);
    if (el) { el.style.borderColor = 'var(--red)'; el.focus(); }
    return;
  }
  const dup = findDup(title, inventory);
  if (dup && !(await askDup(dup))) return;
  const cardEl = revCardsEl.querySelector(`.rev-card[data-uid="${uid}"]`);
  const confirmBtnEl = revCardsEl.querySelector(`.c-confirm[data-uid="${uid}"]`);
  if (cardEl) cardEl.classList.add('confirming');
  const bcode = card.data.barcode || '';
  const useUpcId = bcode && /^\d{8,14}$/.test(bcode) && !inventory.find(t => t.id === bcode);
  const recId = useUpcId ? bcode : (await nextId());
  let thumb = card.thumb || '';
  if (thumb) thumb = await rotateImage90CCW(thumb);
  const rec = {
    id: recId, title,
    year: card.data.year || '', label: card.data.label || '',
    format: card.data.format || 'VHS', condition: card.data.condition || 'good',
    condition_notes: card.data.notes || '', status: card.data.status || 'in_collection',
    barcode: card.data.barcode || '', tags: card.data.tags || [],
    value_low: card.data.value_low || '', value_high: card.data.value_high || '',
    imdb_id: card.data.imdb_id || '',
    photos: thumb ? [thumb] : [],
    scanned_at: new Date().toISOString(), photo_thumbnail: thumb, photo_spine: thumb,
  };
  await Promise.all([dbAdd(rec), new Promise(r => setTimeout(r, 280))]);
  const aiTitle = card._aiTitle || null;
  const action = aiTitle && aiTitle !== rec.title ? 'corrected' : 'accepted';
  _reportOutcome(card, action);
  _claimJob(card);
  inventory.push(rec); renderInv(); updateCount();
  triggerTapeInsertAnim(confirmBtnEl?.getBoundingClientRect());
  toast(`Saved: ${rec.title}`, 'ok');
  const confirmedIdx = cards.findIndex(c => c.uid === uid);
  setCards(cards.filter(c => c.uid !== uid));
  if (!cards.length) { hideRevPanel(); flashInvRow(rec.id); return; }
  const nextCard = cards[confirmedIdx] || cards[confirmedIdx - 1];
  if (nextCard) nextCard.expanded = true;
  renderCards();
  const nextEl = revCardsEl.querySelectorAll('.rev-card')[Math.min(confirmedIdx, cards.length - 1)];
  if (nextEl) nextEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  flashInvRow(rec.id);
}

export function discardCard(uid) {
  const card = cards.find(c => c.uid === uid);
  if (card && card.source === 'scan') _reportOutcome(card, 'discarded');
  _claimJob(card);
  setCards(cards.filter(c => c.uid !== uid));
  if (!cards.length) hideRevPanel(); else renderCards();
}

document.getElementById('btn-confirm-all').addEventListener('click', async () => {
  for (const card of [...cards]) {
    if (card.processingState === 'processing' || card.processingState === 'queued') continue;
    syncCard(card.uid); if (card.data.title.trim()) await confirmCard(card.uid);
  }
});
document.getElementById('btn-discard-all').addEventListener('click', () => {
  if (confirm('Discard all pending review items?')) hideRevPanel();
});
document.getElementById('btn-stop-proc')?.addEventListener('click', () => {
  const toStop = cards.filter(c => c.processingState === 'processing' || c.processingState === 'queued');
  toStop.forEach(c => _claimJob(c));
  setCards(cards.filter(c => c.processingState !== 'processing' && c.processingState !== 'queued'));
  if (!cards.length) hideRevPanel(); else renderCards();
});

// ── DUPLICATE MODAL ──────────────────────────────────────────────────────
function askDup(existing) {
  return new Promise(res => {
    const m = document.getElementById('m-dup');
    document.getElementById('dup-info').innerHTML = `<strong>${esc(existing.title)}</strong><br><span style="font-size:11px;color:var(--text3)">${esc(existing.id)} · ${esc(existing.year || '')} · ${esc(existing.label || '')}</span>`;
    m.style.display = 'flex';
    const add = () => { cleanup(); res(true); }; const cancel = () => { cleanup(); res(false); };
    function cleanup() { m.style.display = 'none'; document.getElementById('dup-add').removeEventListener('click', add); document.getElementById('dup-cancel').removeEventListener('click', cancel); }
    document.getElementById('dup-add').addEventListener('click', add);
    document.getElementById('dup-cancel').addEventListener('click', cancel);
  });
}

export { cards, uidSeq, seenJobIds, _seenAdd, _seenDel, revPanel, revLoading, revCardsEl, revErr, revBulk };
export { renderTagChips, initTagChips };
