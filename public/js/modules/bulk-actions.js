// ── BULK ACTIONS ──────────────────────────────────────────────────────────────
const { getInventory, getSelectedIds } = require('./inventory-state');
const { statusLabel } = require('./render-helpers');

async function applyBulkStatus(status) {
  const ids = getSelectedIds();
  if (!ids.size) return;
  for (const id of ids) {
    const t = getInventory().find(x => x.id === id);
    if (!t) continue;
    t.status = status;
    await dbPut(t);
  }
  toast(`Updated ${ids.size} tape${ids.size !== 1 ? 's' : ''} → ${statusLabel(status)}`, 'ok');
  getSelectedIds().clear();
  if (typeof renderInv === 'function') renderInv();
  updateBulkBar();
}

async function deleteBulk() {
  const ids = getSelectedIds();
  if (!ids.size) return;
  if (!confirm(`Delete ${ids.size} tape${ids.size !== 1 ? 's' : ''}?`)) return;
  for (const id of ids) {
    await dbDel(id);
  }
  if (typeof renderInv === 'function') renderInv();
  updateBulkBar();
  toast(`Deleted ${ids.size} tape${ids.size !== 1 ? 's' : ''}`, 'ok');
}

function clearBulk() {
  getSelectedIds().clear();
  if (typeof renderInv === 'function') renderInv();
  updateBulkBar();
}

module.exports = { applyBulkStatus, deleteBulk, clearBulk };