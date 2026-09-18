// ── SHARED CARD/ROW SELECTION INTERACTION ─────────────────────────────────────
// Single click/tap opens the detail modal. Double-click/double-tap, or a
// press-and-hold without movement, toggles the item into multi-select instead.
// Used by both the table (list-view.js) and the wall/stacks/spine/cover cards
// (wall-view.js) so the gesture behaves identically everywhere.

const LONG_PRESS_MS = 500;
const EGG_PREVIEW_MS = 900; // deliberately past LONG_PRESS_MS — see attachCardInteraction's onEggPreview doc
const DBLCLICK_WAIT_MS = 250;
const MOVE_CANCEL_PX = 10;

// Only one press can be in progress at a time, so the hold timer and its
// window-level move/end listeners are module-level singletons rather than
// being registered once per row/card (which would not scale to large lists).
let holdTimer = null, previewTimer = null, holdSx = 0, holdSy = 0;
let activePreviewEnd = null; // cleanup for an in-progress egg preview, or null

function startHold(x, y, onFire, onPreview, onPreviewEnd) {
  holdSx = x; holdSy = y;
  holdTimer = setTimeout(() => {
    holdTimer = null;
    onFire();
  }, LONG_PRESS_MS);
  if (onPreview) {
    previewTimer = setTimeout(() => {
      previewTimer = null;
      onPreview();
      activePreviewEnd = onPreviewEnd || null;
    }, EGG_PREVIEW_MS);
  }
}
function moveHold(x, y) {
  if ((holdTimer || previewTimer) && (Math.abs(x - holdSx) > MOVE_CANCEL_PX || Math.abs(y - holdSy) > MOVE_CANCEL_PX)) {
    endHold();
  }
}
function endHold() {
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
  if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
  if (activePreviewEnd) { activePreviewEnd(); activePreviewEnd = null; }
}

window.addEventListener('mousemove', e => moveHold(e.clientX, e.clientY));
window.addEventListener('touchmove', e => moveHold(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
window.addEventListener('mouseup', endHold);
window.addEventListener('touchend', endHold);
window.addEventListener('touchcancel', endHold);

/**
 * @param {HTMLElement} el - the row/card element
 * @param {() => string} getId - returns this element's tape id (looked up
 *   lazily so a single listener setup survives re-renders of sibling rows)
 * @param {(id: string) => void} onOpen - single click/tap → open detail
 * @param {(id: string) => void} onToggleSelect - dblclick or hold → toggle multi-select
 * @param {(id: string, e: Event) => void} [onModifierSelect] - optional
 *   desktop shift/ctrl/meta-click range/toggle-select shortcut (table only)
 * @param {() => void} [onEggPreview] - optional: fires if the hold continues
 *   past EGG_PREVIEW_MS (900ms), i.e. *after* the 500ms multi-select trigger
 *   has already fired — mobile has no :hover, so this is the touch
 *   equivalent of hovering a card to see its easter egg. Deliberately a
 *   longer threshold than multi-select rather than a competing gesture: a
 *   quick hold selects, a held hold also previews.
 * @param {() => void} [onEggPreviewEnd] - cleanup called on release, only if
 *   onEggPreview actually fired
 */
export function attachCardInteraction(el, { getId, onOpen, onToggleSelect, onModifierSelect, onEggPreview, onEggPreviewEnd }) {
  let clickTimer = null;
  let justLongPressed = false;

  const isIgnoredTarget = e => e.target.closest('input, select, button, .tag-chip');

  el.addEventListener('mousedown', e => {
    if (e.button !== 0 || isIgnoredTarget(e)) return;
    startHold(e.clientX, e.clientY, () => { justLongPressed = true; onToggleSelect(getId()); }, onEggPreview, onEggPreviewEnd);
  });
  el.addEventListener('touchstart', e => {
    if (isIgnoredTarget(e)) return;
    const t = e.touches[0];
    startHold(t.clientX, t.clientY, () => { justLongPressed = true; onToggleSelect(getId()); }, onEggPreview, onEggPreviewEnd);
  }, { passive: true });

  el.addEventListener('click', e => {
    if (isIgnoredTarget(e)) return;
    if (justLongPressed) { justLongPressed = false; return; }
    if (onModifierSelect && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      onModifierSelect(getId(), e);
      return;
    }
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; } // part of a dblclick
    clickTimer = setTimeout(() => { clickTimer = null; onOpen(getId()); }, DBLCLICK_WAIT_MS);
  });

  el.addEventListener('dblclick', e => {
    if (isIgnoredTarget(e)) return;
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
    onToggleSelect(getId());
  });
}
