// ── TAB NAV ──────────────────────────────────────────────────────────────
function setActiveTab(tab){
  document.body.dataset.tab=tab;
  ['capture','review','collect'].forEach(t=>document.getElementById(`tab-${t}`)?.classList.toggle('active',t===tab));
  const onCapture=tab==='capture';
  const btnCapEl=document.getElementById('btn-cap');
  const btnBcEl=document.getElementById('btn-barcode');
  if(btnCapEl)btnCapEl.disabled=!onCapture;
  if(btnBcEl)btnBcEl.disabled=!onCapture;
  if(tab==='review'&&cards.length&&!revPanel.classList.contains('on'))showRevPanel();
}
function updateTabBadge(){
  const badge=document.getElementById('tab-review-count');
  if(!badge)return;
  const n=cards.length;
  badge.textContent=n;badge.style.display=n?'':'none';
}
document.getElementById('tab-capture')?.addEventListener('click',()=>setActiveTab('capture'));
document.getElementById('tab-review')?.addEventListener('click',()=>setActiveTab('review'));
document.getElementById('tab-collect')?.addEventListener('click',()=>{
  if(document.body.dataset.tab!=='collect')playRewindSound();
  setActiveTab('collect');
});
setActiveTab('capture');

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

// ── HAMBURGER MENU ────────────────────────────────────────────────────────
function openDrawer(){document.getElementById('hbr-drawer').classList.add('open');document.getElementById('hbr-backdrop').classList.add('open');}
function closeDrawer(){document.getElementById('hbr-drawer').classList.remove('open');document.getElementById('hbr-backdrop').classList.remove('open');}
document.getElementById('btn-menu').addEventListener('click',openDrawer);
[['btn-add-tape-mob','btn-add-tape'],['btn-settings-mob','btn-settings'],['btn-help-mob','btn-help'],
 ['btn-fill-data-mob','btn-fill-data']].forEach(([mob,desk])=>{
  const m=document.getElementById(mob),d=document.getElementById(desk);
  if(m&&d)m.addEventListener('click',()=>{closeDrawer();d.click();});
});

// ── HELP MODAL ───────────────────────────────────────────────────────────
document.getElementById('btn-help').addEventListener('click',()=>document.getElementById('m-help').style.display='flex');
document.getElementById('help-close').addEventListener('click',()=>document.getElementById('m-help').style.display='none');

// ── SETTINGS MODAL ───────────────────────────────────────────────────────
document.getElementById('btn-settings').addEventListener('click',()=>{
  document.getElementById('s-apikey').value=apiKey;
  document.getElementById('s-omdb-key').value=omdbKey;
  document.getElementById('s-ollama-url').value=ollamaUrl;
  document.getElementById('s-ollama-model').value=ollamaModel;
  document.getElementById('s-fast-mode').checked=fastMode;
  checkOllama();
  document.getElementById('m-settings').style.display='flex';
});
document.getElementById('s-cancel').addEventListener('click',()=>document.getElementById('m-settings').style.display='none');
document.getElementById('s-save').addEventListener('click',()=>{
  apiKey=document.getElementById('s-apikey').value.trim();
  omdbKey=document.getElementById('s-omdb-key').value.trim();
  ollamaUrl=document.getElementById('s-ollama-url').value.trim()||defaultOllamaUrl();
  ollamaModel=document.getElementById('s-ollama-model').value;
  fastMode=document.getElementById('s-fast-mode').checked;
  apiKey?localStorage.setItem('vhs-apikey',apiKey):localStorage.removeItem('vhs-apikey');
  omdbKey?localStorage.setItem('vhs-omdb-key',omdbKey):localStorage.removeItem('vhs-omdb-key');
  localStorage.setItem('vhs-ollama-url',ollamaUrl);
  localStorage.setItem('vhs-ollama-model',ollamaModel);
  localStorage.setItem('vhs-fast-mode',String(fastMode));
  updateAiBadge();
  document.getElementById('m-settings').style.display='none';
});

// ── SYSTEM HEALTH PANEL ───────────────────────────────────────────────────
async function runHealthCheck(){
  const dbDotEl=document.getElementById('health-db-dot');
  const dbMsg=document.getElementById('health-db-msg');
  const ollamaDotEl=document.getElementById('health-ollama-dot');
  const ollamaMsg=document.getElementById('health-ollama-msg');
  const remedEl=document.getElementById('health-remediation');
  const tsEl=document.getElementById('health-ts');
  dbDotEl.className='ai-dot spin2';dbMsg.textContent='Checking…';
  ollamaDotEl.className='ai-dot spin2';ollamaMsg.textContent='Checking…';
  remedEl.style.display='none';
  try{
    const h=await fetch('/api/health',{signal:AbortSignal.timeout(8000)}).then(r=>r.json());
    if(h.db==='ok'){dbDotEl.className='ai-dot ok';dbMsg.textContent='Connected to Neon';}
    else{dbDotEl.className='ai-dot off';dbMsg.textContent='Error: '+(h.dbError||'unknown');}
    if(h.ollama==='ok'){
      ollamaDotEl.className='ai-dot ok';
      const models=(h.ollamaModels||[]).join(', ')||'(no models pulled)';
      ollamaMsg.textContent='Connected · '+models;
    }else{
      ollamaDotEl.className='ai-dot off';
      ollamaMsg.textContent='Unreachable: '+(h.ollamaError||'unknown');
    }
    const remeds=[];
    if(h.db!=='ok')remeds.push('• DB: Check DATABASE_URL in .env and that Neon is reachable. The app will show cached data when DB is down.');
    if(h.ollama!=='ok')remeds.push('• Ollama: Ensure the ollama container is running ("docker compose up ollama"). Pull a model with "ollama pull llava:7b".');
    if(remeds.length){remedEl.style.display='';remedEl.innerHTML=remeds.join('<br>');}
    if(h.ts)tsEl.textContent='Checked '+new Date(h.ts).toLocaleTimeString();
    setDbDot(h.db==='ok'?'ok':'err');
  }catch(e){
    dbDotEl.className='ai-dot off';dbMsg.textContent='Health check failed: '+e.message;
    ollamaDotEl.className='ai-dot off';ollamaMsg.textContent='Could not reach server';
    remedEl.style.display='';remedEl.textContent='• Server may be down or unreachable. Try refreshing the page.';
  }
}
document.getElementById('btn-health').addEventListener('click',()=>{
  closeDrawer();
  document.getElementById('m-health').style.display='flex';
  runHealthCheck();
});
document.getElementById('health-retry').addEventListener('click',runHealthCheck);
document.getElementById('health-close').addEventListener('click',()=>document.getElementById('m-health').style.display='none');
// ── CRT SCANLINES TOGGLE ─────────────────────────────────────────────────
(function(){
  const btn=document.getElementById('btn-crt');
  function setCrt(on){
    document.body.classList.toggle('crt-on',on);
    btn.classList.toggle('active',on);
    localStorage.setItem('vhs-crt',on?'1':'');
  }
  if(localStorage.getItem('vhs-crt')==='1')setCrt(true);
  btn.addEventListener('click',()=>setCrt(!document.body.classList.contains('crt-on')));
})();

document.getElementById('btn-import-mob')?.addEventListener('click',()=>{closeDrawer();document.getElementById('import-input').click();});
document.getElementById('btn-revalidate-mob')?.addEventListener('click',()=>{closeDrawer();document.getElementById('btn-revalidate').click();});
document.getElementById('btn-export-mob')?.addEventListener('click',e=>{
  e.stopPropagation();
  document.getElementById('exp-dd-mob').classList.toggle('open');
});
[['exp-json-mob','exp-json'],['exp-csv-mob','exp-csv'],['exp-sell-mob','exp-sell'],['exp-print-mob','exp-print']].forEach(([mob,desk])=>{
  document.getElementById(mob)?.addEventListener('click',()=>{closeDrawer();document.getElementById(desk)?.click();});
});

// ── IMPORT ────────────────────────────────────────────────────────────────
document.getElementById('btn-import').addEventListener('click',()=>document.getElementById('import-input').click());
document.getElementById('import-input').setAttribute('accept','.json,.csv');
function parseImportCsv(text){
  const lines=text.trim().split(/\r?\n/);if(lines.length<2)return[];
  const headers=lines[0].split(',').map(h=>h.replace(/^"|"$/g,'').trim());
  return lines.slice(1).map(line=>{
    const vals=[];let cur='',inQ=false;
    for(let i=0;i<line.length;i++){
      const c=line[i];
      if(c==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}
      else if(c===','&&!inQ){vals.push(cur);cur='';}
      else cur+=c;
    }
    vals.push(cur);
    const obj={};
    headers.forEach((h,i)=>obj[h]=vals[i]||'');
    return {
      id:obj['id']||obj['ID']||'',title:obj['title']||obj['Title']||'',
      year:obj['year']||obj['Year']||'',label:obj['label']||obj['Label']||'',
      format:obj['format']||obj['Format']||'VHS',condition:obj['condition']||obj['Condition']||'great',
      condition_notes:obj['condition_notes']||obj['Notes']||'',
      status:(obj['status']||obj['Status']||'in_collection').toLowerCase().replace(/\s+/g,'_'),
      barcode:obj['barcode']||obj['Barcode']||'',
      value_low:obj['value_low']||obj['Est. Low ($)']||'',
      value_high:obj['value_high']||obj['Est. High ($)']||'',
      tags:[],photos:[],photo_thumbnail:'',photo_face:null,photo_spine:null,
      scanned_at:obj['scanned_at']||new Date().toISOString(),
    };
  }).filter(r=>r.title);
}
document.getElementById('import-input').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    const text=await file.text();
    let data;
    if(file.name.endsWith('.csv')){
      data=parseImportCsv(text);
    }else{
      data=JSON.parse(text);
      if(!Array.isArray(data))throw new Error('Expected a JSON array');
    }
    const existingIds=new Set(inventory.map(t=>t.id));
    let added=0,skipped=0;
    for(const item of data){
      if(!item.title){skipped++;continue;}
      if(existingIds.has(item.id)){skipped++;continue;}
      const rec={
        id:item.id||await nextId(),
        title:item.title||'',year:item.year||'',label:item.label||'',
        format:item.format||'VHS',condition:item.condition||'great',
        condition_notes:item.condition_notes||'',status:item.status||'in_collection',
        barcode:item.barcode||'',tags:item.tags||[],
        value_low:item.value_low||'',value_high:item.value_high||'',
        photos:item.photos||[],photo_thumbnail:item.photo_thumbnail||'',
        photo_face:item.photo_face||null,photo_spine:item.photo_spine||null,
        scanned_at:item.scanned_at||new Date().toISOString(),
      };
      await dbAdd(rec);inventory.push(rec);existingIds.add(rec.id);added++;
    }
    renderInv();updateCount();
    toast(`Imported ${added} tape${added!==1?'s':''}${skipped?` (${skipped} skipped)`:''}`, added?'ok':'');
  }catch(err){
    toast('Import failed: '+err.message,'err',5000);
  }
  e.target.value='';
});

// ── EXPORT ───────────────────────────────────────────────────────────────
document.getElementById('btn-export').addEventListener('click',e=>{e.stopPropagation();document.getElementById('exp-dd').classList.toggle('on');});
document.addEventListener('click',()=>document.getElementById('exp-dd').classList.remove('on'));
document.getElementById('exp-json').addEventListener('click',()=>{
  const data=inventory.map(({id,title,year,label,format,condition,condition_notes,barcode,tags,status,scanned_at})=>({id,title,year,label,format,condition,condition_notes,barcode:barcode||'',tags:tags||[],status,scanned_at}));
  dl(JSON.stringify(data,null,2),'vhs-inventory.json','application/json');
  document.getElementById('exp-dd').classList.remove('on');
});
document.getElementById('exp-csv').addEventListener('click',()=>{
  const cols=['id','title','year','label','format','condition','condition_notes','barcode','value_low','value_high','status','scanned_at'];
  const csv=[cols.join(','),...inventory.map(t=>cols.map(c=>`"${String(t[c]||'').replace(/"/g,'""')}"`).join(','))].join('\n');
  dl(csv,'vhs-inventory.csv','text/csv');
  document.getElementById('exp-dd').classList.remove('on');
});
document.getElementById('exp-sell').addEventListener('click',()=>{
  const forSale=inventory.filter(t=>t.status==='for_sale');
  if(!forSale.length){alert('No tapes marked For Sale.');return;}
  const condMap={great:'Like New',good:'Good',fair:'Acceptable',poor:'For Parts or Not Working'};
  const cols=['Title','Year','Label','Format','Condition','Notes','Barcode','Est. Low ($)','Est. High ($)','eBay Condition'];
  const rows=forSale.map(t=>[
    t.title,t.year||'',t.label||'',t.format||'VHS',t.condition||'',
    t.condition_notes||'',t.barcode||'',t.value_low||'',t.value_high||'',
    condMap[t.condition]||''
  ].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','));
  dl([cols.map(c=>`"${c}"`).join(','),...rows].join('\n'),'vhs-for-sale.csv','text/csv');
  document.getElementById('exp-dd').classList.remove('on');
});
document.getElementById('exp-tags').addEventListener('click',()=>{
  const e=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const items=inventory.filter(t=>t.status==='for_sale');
  if(!items.length){toast('No tapes marked For Sale','err');document.getElementById('exp-dd').classList.remove('on');return;}
  const tags=items.map(t=>{
    const price=t.value_low&&t.value_high?`$${t.value_low}–$${t.value_high}`:t.value_low?`$${t.value_low}`:t.value_high?`$${t.value_high}`:'$________';
    const meta=[t.year,t.label,t.condition].filter(Boolean).join(' · ');
    return `<div class="tag"><div class="t-title">${e(t.title)}</div>${meta?`<div class="t-meta">${e(meta)}</div>`:''}<div class="t-price">${price}</div><div class="t-id">${e(t.id)}</div></div>`;
  }).join('');
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Price Tags</title>
<style>@page{size:letter;margin:.4in}body{font-family:Arial,sans-serif;margin:0}
button{margin-bottom:12px;padding:7px 18px;background:#222;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:13px}
.grid{display:flex;flex-wrap:wrap;gap:8px}.tag{width:2.4in;border:1.5px dashed #aaa;padding:9px 11px;box-sizing:border-box;break-inside:avoid}
.t-title{font-size:13px;font-weight:700;line-height:1.3;margin-bottom:3px}.t-meta{font-size:10px;color:#666;margin-bottom:6px}
.t-price{font-size:22px;font-weight:900;color:#111}.t-id{font-size:9px;color:#bbb;margin-top:4px}
@media print{button{display:none}}</style></head>
<body><button onclick="window.print()">🖨 Print</button><div class="grid">${tags}</div></body></html>`;
  const w=window.open('','_blank');if(w){w.document.write(html);w.document.close();}
  document.getElementById('exp-dd').classList.remove('on');
});
document.getElementById('exp-print').addEventListener('click',()=>{
  const items=getFiltered();
  const condBadge={great:'✅ Great',good:'👍 Good',fair:'⚠️ Fair',poor:'❌ Poor'};
  const rows=items.map((t,i)=>`<tr style="background:${i%2?'#f9f9f9':'#fff'}">
    <td style="padding:6px 10px;font-family:monospace;font-size:11px;color:#666">${t.id}</td>
    <td style="padding:6px 10px;font-weight:600">${t.title}</td>
    <td style="padding:6px 10px;color:#555">${t.year||''}</td>
    <td style="padding:6px 10px;color:#555">${t.label||''}</td>
    <td style="padding:6px 10px">${condBadge[t.condition]||t.condition||''}</td>
    <td style="padding:6px 10px;color:#2a7">${(t.value_low||t.value_high)?`$${t.value_low||'?'}–$${t.value_high||'?'}`:''}</td>
    <td style="padding:6px 10px;font-size:11px;color:#777">${(t.tags||[]).join(', ')}</td>
  </tr>`).join('');
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>VHS Inventory</title>
<style>body{font-family:system-ui,sans-serif;margin:30px;color:#222}h1{margin-bottom:4px}p{color:#777;font-size:13px;margin-bottom:20px}
table{width:100%;border-collapse:collapse;font-size:13px}th{background:#222;color:#fff;padding:8px 10px;text-align:left}
tr:hover{background:#f0f0f0!important}@media print{button{display:none}}</style></head>
<body><h1>VHS Collection</h1><p>Exported ${new Date().toLocaleDateString()} · ${items.length} tape${items.length!==1?'s':''}</p>
<button onclick="window.print()" style="margin-bottom:16px;padding:8px 18px;background:#222;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">🖨 Print</button>
<table><tr><th>ID</th><th>Title</th><th>Year</th><th>Label</th><th>Condition</th><th>Est. Value</th><th>Tags</th></tr>${rows}</table></body></html>`;
  const w=window.open('','_blank');if(w){w.document.write(html);w.document.close();}
  document.getElementById('exp-dd').classList.remove('on');
});

// ── ACTIVITY LOG PANEL ───────────────────────────────────────────────────
(function(){
  const logPanel=document.getElementById('log-panel');
  const logOutput=document.getElementById('log-output');
  const followChk=document.getElementById('log-follow');
  const LEVEL_COLOR={'info':'#888','warn':'#c8a040','error':'#e84040'};
  let sse=null;

  function appendEntry(e){
    const ts=e.ts?e.ts.slice(11,19):'';
    const color=LEVEL_COLOR[e.level]||'#888';
    const msgEsc=String(e.msg||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const row=document.createElement('div');
    row.innerHTML=`<span style="color:#444">${ts}</span> <span style="color:${color}">${msgEsc}</span>`;
    logOutput.appendChild(row);
    if(followChk?.checked)logOutput.scrollTop=logOutput.scrollHeight;
    if(logOutput.children.length>300)logOutput.removeChild(logOutput.firstChild);
  }

  function openLogs(){
    logPanel.style.display='flex';
    if(sse)return;
    sse=new EventSource('/api/logs/stream');
    sse.onmessage=e=>{try{appendEntry(JSON.parse(e.data));}catch{}};
    sse.onerror=()=>{setTimeout(()=>{sse?.close();sse=null;},2000);};
  }

  document.getElementById('btn-logs')?.addEventListener('click',openLogs);
})();

// ── VHS EASTER EGGS ──────────────────────────────────────────────────────
// "Be Kind, Rewind" — 1-in-50 chance on load
if(Math.random()<1/50)setTimeout(()=>toast('📼 Be Kind, Rewind!','vhs-sticker',5000),1500);

// Shake to static (mobile)
(function(){
  let _lastShake=0,_px=0,_py=0,_pz=0;
  function onMotion(e){
    const a=e.accelerationIncludingGravity;if(!a)return;
    const now=Date.now();
    if(now-_lastShake<4000)return;
    const d=Math.abs(a.x-_px)+Math.abs(a.y-_py)+Math.abs(a.z-_pz);
    _px=a.x;_py=a.y;_pz=a.z;
    if(d>35){
      _lastShake=now;
      const c=document.getElementById('static-canvas');
      if(c)startStaticAnim(c,1000);
      setTimeout(()=>setActiveTab('capture'),400);
    }
  }
  if(typeof DeviceMotionEvent!=='undefined'){
    if(typeof DeviceMotionEvent.requestPermission==='function'){
      document.addEventListener('touchstart',()=>{
        DeviceMotionEvent.requestPermission().then(p=>{if(p==='granted')window.addEventListener('devicemotion',onMotion);}).catch(()=>{});
      },{once:true});
    }else{
      window.addEventListener('devicemotion',onMotion);
    }
  }
})();

// ── MOBILE FILTER TRAY ───────────────────────────────────────────────────
const btnFilterTray=document.getElementById('btn-filter-tray');
const invCtrl=document.getElementById('inv-ctrl');
let trayOpen=false;
btnFilterTray?.addEventListener('click',()=>{
  trayOpen=!trayOpen;
  invCtrl.classList.toggle('tray-open',trayOpen);
  btnFilterTray.textContent=trayOpen?'✕ Close':'⚙ Filter';
  if(trayOpen){
    const backdrop=document.createElement('div');
    backdrop.id='filter-backdrop';
    backdrop.style.cssText='position:fixed;inset:0;z-index:149;';
    backdrop.addEventListener('click',()=>{trayOpen=false;invCtrl.classList.remove('tray-open');btnFilterTray.textContent='⚙ Filter';backdrop.remove();});
    document.body.appendChild(backdrop);
  }else{
    document.getElementById('filter-backdrop')?.remove();
  }
});
