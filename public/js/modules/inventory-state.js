// ── INVENTORY STATE ───────────────────────────────────────────────────────────
let inventory = [];
let selectedId = null;
let isNewTape = false;
let selectedIds = new Set();
let wallMode = 0;
export const colFilters = { title: '', label: '', format: '', condition: '', status: '', tags: '', yrFrom: '', yrTo: '' };

export function getInventory() { return inventory; }
export function setInventory(arr) { inventory = arr; }
export function getSelectedId() { return selectedId; }
export function setSelectedId(id) { selectedId = id; }
export function getIsNewTape() { return isNewTape; }
export function setIsNewTape(val) { isNewTape = val; }
export function getSelectedIds() { return selectedIds; }
export function getWallMode() { return wallMode; }
export function setWallMode(mode) { wallMode = mode; }
export function getColFilters() { return colFilters; }
