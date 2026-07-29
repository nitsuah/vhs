// ── INVENTORY STATE ───────────────────────────────────────────────────────────
let inventory = [];
let selectedId = null;
let isNewTape = false;
let selectedIds = new Set();
let wallMode = 0;

function getInventory() { return inventory; }
function setInventory(arr) { inventory = arr; }
function getSelectedId() { return selectedId; }
function setSelectedId(id) { selectedId = id; }
function getIsNewTape() { return isNewTape; }
function setIsNewTape(val) { isNewTape = val; }
function getSelectedIds() { return selectedIds; }
function getWallMode() { return wallMode; }
function setWallMode(mode) { wallMode = mode; }

module.exports = {
  getInventory,
  setInventory,
  getSelectedId,
  setSelectedId,
  getIsNewTape,
  setIsNewTape,
  getSelectedIds,
  getWallMode,
  setWallMode
};