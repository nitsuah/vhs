// ── INVENTORY STATE ───────────────────────────────────────────────────────────
// localStorage can throw (quota exceeded, private-browsing/storage-disabled
// modes, sandboxed contexts) — the reads below run at module load, so an
// unguarded throw here would break the whole app's initial script
// evaluation rather than just losing one preference.
function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, val) { try { localStorage.setItem(key, val); } catch { /* best-effort persistence only */ } }

let inventory = [];
let selectedId = null;
let isNewTape = false;
let selectedIds = new Set();
// Default Collections view is Stacks (mode 1); persisted so a user's chosen
// view (Table/StacksUp/Spines/Covers) survives a reload.
const _savedWallMode = parseInt(safeGet('vhs-wall-mode'), 10);
let wallMode = [0, 1, 2, 3].includes(_savedWallMode) ? _savedWallMode : 1;
let isReadOnly = false;
// Single source of truth for the active sort — both the #sort-sel dropdown
// and the per-column header click-to-sort (Priority 5) write here, so
// filtering.js has one place to read from regardless of which control was
// used (the dropdown only covers 5 of the 7 sortable columns; column-header
// clicks cover all of them, including ones with no matching <option>).
let sortValue = safeGet('vhs-sort') || 'scanned_desc';
export const colFilters = { title: '', label: '', format: '', condition: '', status: '', tags: '', yrFrom: '', yrTo: '' };

export function getInventory() { return inventory; }
export function setInventory(arr) { inventory = arr; }
export function getSelectedId() { return selectedId; }
export function setSelectedId(id) { selectedId = id; }
export function getIsNewTape() { return isNewTape; }
export function setIsNewTape(val) { isNewTape = val; }
export function getSelectedIds() { return selectedIds; }
export function getWallMode() { return wallMode; }
export function setWallMode(mode) { wallMode = mode; safeSet('vhs-wall-mode', String(mode)); }
export function getColFilters() { return colFilters; }
export function getIsReadOnly() { return isReadOnly; }
export function setIsReadOnly(val) { isReadOnly = val; }
export function getSortValue() { return sortValue; }
export function setSortValue(val) { sortValue = val; safeSet('vhs-sort', val); }
