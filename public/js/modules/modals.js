// ── MODALS ────────────────────────────────────────────────────────────────────
// Behaviour every popup shares: dialog semantics, focus in and back out, a Tab
// loop, and Esc. Esc presses the popup's own close button so its cleanup runs.
const CLOSE_BUTTON = {
  'm-health': 'health-close', 'm-eggs': 'eggs-close', 'm-help': 'help-close',
  'm-settings': 's-cancel', 'm-revalidate': 'rv-cancel', 'm-dup': 'dup-cancel',
  'm-detail': 'd-cancel', 'm-del-confirm': 'del-cancel', 'm-crop': 'crop-cancel',
  'm-share': 'btn-share-close',
};
const FOCUSABLE = 'summary,button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const returnFocus = new Map();

const isOpen = el => getComputedStyle(el).display !== 'none';
const isShown = el => !!el?.isConnected && el.checkVisibility({ checkVisibilityCSS: true }) && !el.closest('#hbr-drawer:not(.open)');
// Later in the document paints on top (confirm and crop sit above details).
const topModal = () => [...document.querySelectorAll('.backdrop')].filter(isOpen).pop();

function sync(backdrop) {
  const dialog = backdrop.querySelector('.modal');
  if (!dialog) return;
  const open = backdrop.isConnected && isOpen(backdrop);
  if (open && !returnFocus.has(backdrop)) {
    returnFocus.set(backdrop, document.activeElement);
    if (!dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true });
  } else if (!open && returnFocus.has(backdrop)) {
    const previous = returnFocus.get(backdrop);
    returnFocus.delete(backdrop);
    // Drawer buttons are hidden once their dialog opens: fall back to the menu.
    const target = previous !== document.body && isShown(previous) ? previous : document.getElementById('btn-menu');
    target?.focus({ preventScroll: true });
  }
}

function register(backdrop) {
  const dialog = backdrop.querySelector('.modal');
  if (!dialog) return;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.tabIndex = -1;
  const heading = dialog.querySelector('h2');
  if (heading) {
    heading.id ||= `${backdrop.id}-title`;
    dialog.setAttribute('aria-labelledby', heading.id);
  }
  new MutationObserver(() => sync(backdrop)).observe(backdrop, { attributes: true, attributeFilter: ['style', 'class'] });
  sync(backdrop);
}

document.querySelectorAll('.backdrop').forEach(register);
new MutationObserver(records => {
  for (const { addedNodes, removedNodes } of records) {
    addedNodes.forEach(n => { if (n.classList?.contains('backdrop')) register(n); });
    removedNodes.forEach(n => { if (returnFocus.has(n)) sync(n); });
  }
}).observe(document.body, { childList: true });

function closeMenus() {
  const menus = [['exp-dd', 'on'], ['exp-dd-mob', 'open']]
    .map(([id, cls]) => [document.getElementById(id), cls])
    .filter(([el, cls]) => el?.classList.contains(cls));
  menus.forEach(([el, cls]) => el.classList.remove(cls));
  const log = document.getElementById('log-panel');
  if (log && log.style.display !== 'none') {
    document.getElementById('log-close').click();
    return true;
  }
  return menus.length > 0;
}

// Capture phase, so one Esc closes one layer before other shortcuts see it.
document.addEventListener('keydown', e => {
  const modal = topModal();
  if (e.key === 'Escape') {
    if (modal) {
      const button = document.getElementById(CLOSE_BUTTON[modal.id]);
      if (button) button.click(); else modal.style.display = 'none';
    } else if (!closeMenus()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  if (e.key !== 'Tab' || !modal) return;
  const items = [...modal.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const inside = items.includes(document.activeElement);
  if (e.shiftKey && (!inside || document.activeElement === first)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (!inside || document.activeElement === last)) { e.preventDefault(); first.focus(); }
}, true);
