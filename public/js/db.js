// ── DB DOT ───────────────────────────────────────────────────────────────
const dbDot = document.getElementById('db-dot');
const dbDotMob = document.getElementById('db-dot-mob');
function setDbDot(state){
  const errTitle='Database error — tap to retry';
  if(dbDot){dbDot.className=state;dbDot.title=state==='err'?errTitle:'';}
  if(dbDotMob){dbDotMob.className=state;dbDotMob.title=state==='err'?errTitle:'';}
}
dbDot?.addEventListener('click',()=>{if(dbDot.className==='err')init();});
dbDotMob?.addEventListener('click',()=>{if(dbDotMob.className==='err')init();});

// ── REST API ──────────────────────────────────────────────────────────────
async function apiReq(p,opts){
  try{
    const r=await fetch(p,opts);
    if(!r.ok){const t=await r.text();throw new Error(t||r.status);}
    const d=await r.json();
    if(p.startsWith('/api/tapes')||p.startsWith('/api/jobs'))setDbDot('ok');
    return d;
  }catch(err){
    if(p.startsWith('/api/tapes')||p.startsWith('/api/jobs'))setDbDot('err');
    throw err;
  }
}

// ── LOCAL CACHE (IndexedDB backup) ───────────────────────────────────────
let _cacheDb=null;
function _openCache(){
  if(_cacheDb)return Promise.resolve(_cacheDb);
  return new Promise((res,rej)=>{
    const r=indexedDB.open('vhs-neon-cache',1);
    r.onupgradeneeded=e=>{e.target.result.createObjectStore('tapes',{keyPath:'id'});};
    r.onsuccess=e=>{_cacheDb=e.target.result;res(_cacheDb);};
    r.onerror=()=>rej(r.error);
  });
}
async function _cacheGetAll(){const db=await _openCache();return new Promise((res,rej)=>{const q=db.transaction('tapes','readonly').objectStore('tapes').getAll();q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});}
async function _cachePut(t){const db=await _openCache();return new Promise((res,rej)=>{const tx=db.transaction('tapes','readwrite');tx.objectStore('tapes').put(t);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function _cacheDel(id){const db=await _openCache();return new Promise((res,rej)=>{const tx=db.transaction('tapes','readwrite');tx.objectStore('tapes').delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function _cacheSetAll(tapes){const db=await _openCache();return new Promise((res,rej)=>{const tx=db.transaction('tapes','readwrite');const s=tx.objectStore('tapes');s.clear();tapes.forEach(t=>s.put(t));tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}

// ── DB OPERATIONS ────────────────────────────────────────────────────────
async function dbAll(){
  try{
    const tapes=await apiReq('/api/tapes');
    _cacheSetAll(tapes).catch(()=>{});
    return tapes;
  }catch(err){
    const cached=await _cacheGetAll().catch(()=>[]);
    if(cached.length)toast('Neon unavailable — showing cached data','warn',6000);
    return cached;
  }
}
async function dbAdd(v){const r=await apiReq('/api/tapes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)});_cachePut(v).catch(()=>{});return r;}
async function dbPut(v){const r=await apiReq(`/api/tapes/${encodeURIComponent(v.id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)});_cachePut(v).catch(()=>{});return r;}
async function dbDel(k){const r=await apiReq(`/api/tapes/${encodeURIComponent(k)}`,{method:'DELETE'});_cacheDel(k).catch(()=>{});return r;}

async function nextId() {
  if(!inventory.length) return 'VHS-0001';
  const max=Math.max(...inventory.map(t=>parseInt(t.id.slice(4),10)).filter(n=>!isNaN(n)));
  return `VHS-${String(max+1).padStart(4,'0')}`;
}
