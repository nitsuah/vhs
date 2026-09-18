// ── TITLE-TRIGGERED EASTER EGGS ────────────────────────────────────────────
// Wires the title-triggered hover effects (Akira/Jaws/Ghostbusters/NOTLD/
// Speed Racer) documented in docs/EASTEREGG.md — the sound/visual functions
// already existed in utils.js but were never exported or called from
// anywhere, so none of this fired on desktop, let alone mobile.
import {
  startJawsTheme, stopJawsTheme,
  playGhostbustersDing,
  startNotldEffect, stopNotldEffect,
  startRevSound, stopRevSound,
} from '../utils.js';

// Desktop hover — real :hover has no touch equivalent, so mobile support
// comes from the tap-and-hold preview wired alongside multi-select (see
// selection.js's onEggPreview/onEggPreviewEnd, used by list-view.js and
// wall-view.js) calling startTitleEggPreview/stopTitleEggPreview below with
// the same element.
export function attachTitleEggHover(el) {
  if (!hasTitleEgg(el)) return;
  el.addEventListener('mouseenter', () => startTitleEggPreview(el));
  el.addEventListener('mouseleave', () => stopTitleEggPreview(el));
}

export function hasTitleEgg(el) {
  return el.hasAttribute('data-jaws') || el.hasAttribute('data-ghostbusters') ||
    el.hasAttribute('data-notld') || el.hasAttribute('data-speedracer');
}

export function startTitleEggPreview(el) {
  if (el.hasAttribute('data-jaws')) startJawsTheme();
  if (el.hasAttribute('data-ghostbusters')) playGhostbustersDing(el);
  if (el.hasAttribute('data-notld')) startNotldEffect(el);
  if (el.hasAttribute('data-speedracer')) startRevSound();
}

export function stopTitleEggPreview(el) {
  if (el.hasAttribute('data-jaws')) stopJawsTheme();
  if (el.hasAttribute('data-notld')) stopNotldEffect(el);
  if (el.hasAttribute('data-speedracer')) stopRevSound();
}
