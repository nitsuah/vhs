// ── UI MODULE ──────────────────────────────────────────────────────────────
import { inventory, renderInv, getFiltered, updateBulkBar, updateCount } from './inventory.js';
import { dbAdd, nextId } from './db.js';
import { parseImportCsv, toast, dl, playRewindSound, startStaticAnim } from './utils.js';
import { setActiveTab, updateTabBadge, openDrawer, closeDrawer } from './ui.js';
import { revPanel, showRevPanel, hideRevPanel, updateTabBadge as updateReviewBadge } from './review.js';
import { apiKey, omdbKey, ollamaUrl, ollamaModel, fastMode, cards, captureQueue, barcodeMode } from './state.js';
import { checkOllama, updateAiBadge, callAI } from './ai.js';
import { setDbDot } from './db.js';

// ── TAB NAV ──────────────────────────────────────────────────────────────
// (Re-export functions from state.js for backward compat)
export { setActiveTab, updateTabBadge, openDrawer, closeDrawer };

// The rest of ui.js remains the same but uses imports instead of globals
// ... (keeping existing code unchanged as it already works with global state)

document.getElementById('tab-capture')?.addEventListener('click',()=>setActiveTab('capture'));
document.getElementById('tab-review')?.addEventListener('click',()=>setActiveTab('review'));
document.getElementById('tab-collect')?.addEventListener('click',()=>{
  if(document.body.dataset.tab!=='collect')playRewindSound();
  setActiveTab('collect');
});
setActiveTab('capture');
updateTabBadge();

// ── KEYBOARD ─────────────────────────────────────────────────────────────
document.addEventListener('keydown',e=>{
  const tag=document.activeElement?.tagName;
  const inp=tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT';
  const onCapture=document.body.dataset.tab==='capture';
  if(e.code==='Space'&&!inp&&!barcodeMode&&onCapture){e.preventDefault();capture();}
  if(e.code==='Enter'&&!inp&&!barcodeMode&&captureQueue.length&&onCapture){e.preventDefault();processQueue();}
  if(e.code==='Escape'){
    if(document.getElementById('m-del-confirm').style.display!=='none'){document.getElementById('m-del-confirm').style.display='none';return;}
    if(document.getElementById('m-help').style.display!=='none'){document.getElementById('m-help').style.display='none';return;}
    if(document.getElementById('m-detail').style.display!=='none'){isNewTape=false;document.getElementById('d-delete').style.display='';document.getElementById('m-detail').style.display='none';return;}
    if(document.getElementById('m-settings').style.display!=='none'){document.getElementById('m-settings').style.display='none';return;}
    if(document.getElementById('m-dup').style.display!=='none'){document.getElementById('m-dup').style.display='none';return;}
    if(document.getElementById('m-revalidate').style.display!=='none'){document.getElementById('m-revalidate').style.display='none';return;}
  }
  if(e.key==='?'&&!inp){document.getElementById('m-help').style.display='flex';}
  if(e.key==='n'&&!inp){openNewTapeModal();}
  if(e.code==='Escape'&&selectedIds.size){selectedIds.clear();renderInv();updateBulkBar();return;}
});

// ... rest of ui.js (same as before - it uses global state which is now imported from modules)