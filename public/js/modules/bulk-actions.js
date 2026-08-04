// ── BULK ACTIONS ──────────────────────────────────────────────────────────────
import { getInventory, getSelectedIds } from './inventory-state.js';
import { statusLabel } from './render-helpers.js';

export async function applyBulkStatus(status) {
  const ids = getSelectedIds();
  if (!ids.size) return;
  for (const id of ids) {
    const t = getInventory().find(x => x.id === id);
    if (!t) continue;
    t.status = status;
    await window.dbPut?.(t);
  }
  window.toast?.(`Updated ${ids.size} tape${ids.size !== 1 ? 's' : ''} → ${statusLabel(status)}`, 'ok');
  getSelectedIds().clear();
  window.renderInv?.();
  window.updateBulkBar?.();
}

export async function deleteBulk() {
  const ids = getSelectedIds();
  if (!ids.size) return;
  if (!confirm(`Delete ${ids.size} tape${ids.size !== 1 ? 's' : ''}?`)) return;
  for (const id of ids) {
    await window.dbDel?.(id);
  }
  getSelectedIds().clear();
  window.renderInv?.();
  window.updateBulkBar?.();
  window.toast?.(`Deleted ${ids.size} tape${ids.size !== 1 ? 's' : ''}`, 'ok');
}

export function clearBulk() {
  getSelectedIds().clear();
  window.renderInv?.();
  window.updateBulkBar?.();
}
