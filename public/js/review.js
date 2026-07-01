// ── REVIEW PANEL ─────────────────────────────────────────────────────────
import { inventory, setInventory, renderInv, updateCount } from './inventory.js';
import { dbAdd, dbPut, nextId } from './db.js';
import { lookupMetadata, callAI } from './ai.js';
import { findDup, _normTitle, _titleSim } from './utils.js';
import { esc, renderTagChips } from './inventory.js';
import { toast, rotateImage90CCW, triggerTapeInsertAnim } from './utils.js';
import { cards, uidSeq, seenJobIds, _seenAdd, _seenDel, renderCards, showRevPanel, hideRevPanel, setRevLoading, setRevMsg, showRevErr, addCard } from './review.js';

const revPanel = document.getElementById('review');
const revLoading = document.getElementById('rev-loading');
const revCardsEl = document.getElementById('rev-cards');
const revErr = document.getElementById('rev-err');
const revBulk = document.getElementById('rev-bulk');

function _claimJob(card) {
  if (!card) return;
  const id = card.jobId; if (!id) return;
  _seenAdd(id);
  // processing/queued = still an upload_job on the server → cancel it
  // ready/failed = already a review_item → delete it
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

// Functions exported and used by other modules
export { cards, uidSeq, seenJobIds, _seenAdd, _seenDel, revPanel, revLoading, revCardsEl, revErr, revBulk };
export { showRevPanel, hideRevPanel, setRevLoading, setRevMsg, showRevErr, addCard, renderCards };
export { syncCard, confirmCard, discardCard, _claimJob, _reportOutcome, _flashInvRow, askDup };

function syncCard(uid) {
  const card = cards.find(c => c.uid === uid); if (!card) return;
  revCardsEl.querySelectorAll(`[data-uid="${uid}"].c-f`).forEach(el => {
    if (el.dataset.f === 'tags') {
      card.data.tags = el.value ? el.value.split(',').map(s => s.trim()).filter(Boolean) : [];
    } else {
      card.data[el.dataset.f] = el.value;
    }
  });
}

async function confirmCard(uid) {
  syncCard(uid);
  const card = cards.find(c => c.uid === uid); if (!card) return;
  // Allow saving a processing or queued card if the user manually filled in a title
  if ((card.processingState === 'processing' || card.processingState === 'queued') && !card.data.title?.trim()) return;

  // Fill / revalidate cards update an existing tape, not create a new one
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
    cards = cards.filter(c => c.uid !== uid);
    renderInv(); updateCount();
    if (!cards.length) { hideRevPanel(); _flashInvRow(tapeId); return; }
    const nextCard = cards[idx] || cards[idx - 1];
    if (nextCard) nextCard.expanded = true;
    renderCards();
    _flashInvRow(tapeId);
    return;
  }

  const title = card.data.title?.trim();
  if (!title) {
    const el = revCardsEl.querySelector(`[data-uid="${uid}"][data-f="title"]`);
    if (el) { el.style.borderColor = 'var(--red)'; el.focus(); }
    return;
  }
  const dup = findDup(title);
  if (dup && !(await askDup(dup))) return;
  const cardEl = revCardsEl.querySelector(`.rev-card[data-uid="${uid}"]`);
  const confirmBtnEl = revCardsEl.querySelector(`.c-confirm[data-uid="${uid}"]`);
  if (cardEl) cardEl.classList.add('confirming');
  const bcode = card.data.barcode || '';
  const useUpcId = bcode && /^\d{8,14}$/.test(bcode) && !inventory.find(t => t.id === bcode);
  const recId = useUpcId ? bcode : (await nextId());
  // auto-rotate capture thumbnails 90° CCW — spines are photographed sideways
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
  cards = cards.filter(c => c.uid !== uid);
  if (!cards.length) { hideRevPanel(); _flashInvRow(rec.id); return; }
  const nextCard = cards[confirmedIdx] || cards[confirmedIdx - 1];
  if (nextCard) { nextCard.expanded = true; }
  renderCards();
  const nextEl = revCardsEl.querySelectorAll('.rev-card')[Math.min(confirmedIdx, cards.length - 1)];
  if (nextEl) nextEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  _flashInvRow(rec.id);
}

function _flashInvRow(id) {
  setTimeout(() => {
    const row = document.querySelector(`#inv-list [data-id="${id}"]`);
    if (row) { row.classList.add('just-added'); row.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }, 60);
}

function discardCard(uid) {
  const card = cards.find(c => c.uid === uid);
  if (card && card.source === 'scan') _reportOutcome(card, 'discarded');
  _claimJob(card);
  cards = cards.filter(c => c.uid !== uid);
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
  // Cancel all processing/queued cards — leaves ready/failed cards in place
  const toStop = cards.filter(c => c.processingState === 'processing' || c.processingState === 'queued');
  toStop.forEach(c => _claimJob(c));
  cards = cards.filter(c => c.processingState !== 'processing' && c.processingState !== 'queued');
  if (!cards.length) hideRevPanel(); else renderCards();
});

// ── DUPLICATE MODAL ──────────────────────────────────────────────────────
function askDup(existing) {
  return new Promise(res => {
    const m = document.getElementById('m-dup');
    document.getElementById('dup-info').innerHTML = `<strong>${esc(existing.title)}</strong><br><span style="font-size:11px;color:var(--text3)">${existing.id} · ${existing.year || ''} · ${existing.label || ''}</span>`;
    m.style.display = 'flex';
    const add = () => { cleanup(); res(true); }; const cancel = () => { cleanup(); res(false); };
    function cleanup() { m.style.display = 'none'; document.getElementById('dup-add').removeEventListener('click', add); document.getElementById('dup-cancel').removeEventListener('click', cancel); }
    document.getElementById('dup-add').addEventListener('click', add);
    document.getElementById('dup-cancel').addEventListener('click', cancel);
  });
}

// Tag chips (re-exported from inventory.js)
export { renderTagChips, initTagChips };