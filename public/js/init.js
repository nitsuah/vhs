import { inventory, setInventory } from './inventory.js';
import { initCamera, updateCrop } from './camera.js';
import { dbAll } from './db.js';
import { _cacheGetAll } from './db.js';
import { retryWithBackoff } from './utils.js';
import { setDbDot, toast } from './utils.js';
import { updateAiBadge, checkOllama } from './ai.js';
import { renderInv, updateCount } from './inventory.js';
import { startJobPoller } from './capture.js';

async function init() {
  setDbDot('');
  updateAiBadge();
  const _aiFallback = setTimeout(updateAiBadge, 6000);
  checkOllama(true).then(() => { clearTimeout(_aiFallback); updateAiBadge(); });
  // Only signal ok from the health ping — apiReq handles err to avoid a race
  // where a slow health SELECT 1 overrides a successful /api/tapes call
  fetch('/api/health', { signal: AbortSignal.timeout(5000) }).then(r => r.json()).then(h => {
    if (h.db === 'ok') setDbDot('ok');
  }).catch(() => {});
  initCamera().then(() => updateCrop()).catch(e => console.warn('Camera init error:', e));
  const preload = await _cacheGetAll().catch(() => []);
  if (preload.length) { setInventory(preload); renderInv(); updateCount(); }
  try {
    const tapes = await retryWithBackoff(() => dbAll(), 2, 800);
    setInventory(tapes);
    setDbDot('ok');
  } catch (err) {
    setDbDot('err');
    toast('Database unavailable' + (preload.length ? ' — showing cached data' : ': ' + err.message), 'err', 8000);
    if (!preload.length) { renderInv(); updateCount(); }
  }
  renderInv(); updateCount();
  startJobPoller();
}
init().catch(err => { console.error('init error:', err); });