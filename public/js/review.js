// ── TAG CHIPS ────────────────────────────────────────────────────────────
function renderTagChips(activeTags,editable=true){
  return GENRES.map(g=>{
    const on=activeTags.includes(g);
    return `<span class="tag-chip${on?' on':''}" data-tag="${esc(g)}">${esc(g)}</span>`;
  }).join('')+(editable?`<input class="tag-add-input" placeholder="custom…" title="Add custom tag" style="margin-left:2px" value="">`:'')+
  (activeTags.filter(t=>!GENRES.includes(t)).map(t=>`<span class="tag-chip on" data-tag="${esc(t)}">${esc(t)} ×</span>`).join(''));
}
function initTagChips(container,getTags,setTags){
  container.addEventListener('click',e=>{
    const chip=e.target.closest('.tag-chip');
    if(!chip)return;
    const tag=chip.dataset.tag;
    let tags=[...getTags()];
    if(tags.includes(tag))tags=tags.filter(t=>t!==tag);
    else tags.push(tag);
    setTags(tags);
    container.innerHTML=renderTagChips(tags);
    initTagChips(container,getTags,setTags);
  });
  const inp=container.querySelector('.tag-add-input');
  if(inp)inp.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===','){
      e.preventDefault();
      const tag=inp.value.trim().replace(/,/g,'');
      if(!tag)return;
      const tags=[...getTags()];
      if(!tags.includes(tag))tags.push(tag);
      setTags(tags);
      container.innerHTML=renderTagChips(tags);
      initTagChips(container,getTags,setTags);
    }
  });
}

// ── REVIEW PANEL ─────────────────────────────────────────────────────────
const revPanel=document.getElementById('review');
const revLoading=document.getElementById('rev-loading');
const revCardsEl=document.getElementById('rev-cards');
const revErr=document.getElementById('rev-err');
const revBulk=document.getElementById('rev-bulk');

function addCard(data,source=null,thumb=null,expanded=false,jobId=null,processingState='ready',failReason=''){
  cards.push({uid:++uidSeq,data:{...data},source,thumb,expanded,jobId,processingState,failReason});
}
function _claimJob(jobId){
  if(!jobId)return;
  _seenAdd(jobId); // mark claimed so poll won't recreate a card if DELETE races the next poll tick
  fetch(`/api/jobs/${encodeURIComponent(jobId)}`,{method:'DELETE'}).catch(()=>{});
}
function showRevPanel(){revPanel.classList.add('on');revErr.style.display='none';setActiveTab('review');}
function hideRevPanel(){cards.forEach(c=>_claimJob(c.jobId));revPanel.classList.remove('on');cards=[];revCardsEl.innerHTML='';revBulk.classList.remove('on');document.getElementById('rev-title').textContent='Pending Review';updateTabBadge?.();}
function setRevLoading(on){revLoading.style.display=on?'flex':'none';}
function setRevMsg(m){const el=document.getElementById('rev-msg');if(el)el.textContent=m;}
function showRevErr(m){revErr.style.display='block';revErr.textContent=m;revCardsEl.innerHTML='';revBulk.classList.remove('on');}

function renderCards(){
  updateTabBadge?.();
  const readyCount=cards.filter(c=>c.processingState==='ready').length;
  revBulk.classList.toggle('on',readyCount>1);
  const totalN=cards.length;
  document.getElementById('rev-title').textContent=totalN?`Pending Review (${totalN})`:'Pending Review';
  if(!totalN){revCardsEl.innerHTML='';revBulk.classList.remove('on');document.getElementById('rev-title').textContent='Pending Review';if(!revErr.style.display||revErr.style.display==='none')revPanel.classList.remove('on');return;}
  const cOpts=v=>['great','good','fair','poor'].map(c=>`<option value="${c}"${v===c?' selected':''}>${c}</option>`).join('');
  const sOpts=v=>[['in_collection','In Collection'],['for_sale','For Sale'],['sold','Sold'],['donated','Donated'],['missing','Missing'],['wanted','Wanted']].map(([c,l])=>`<option value="${c}"${v===c?' selected':''}>${l}</option>`).join('');
  revCardsEl.innerHTML=`<table class="rev-table"><thead><tr>
    <th style="width:68px"></th>
    <th>Title</th><th style="width:55px">Year</th><th>Label</th><th style="width:65px">Format</th>
    <th style="width:80px">Cond.</th><th style="width:110px">Status</th>
    <th style="width:50px">$Lo</th><th style="width:50px">$Hi</th>
    <th>Tags</th><th style="width:120px"></th>
  </tr></thead><tbody>${cards.map(card=>{
    const proc=card.processingState==='processing';
    const fail=card.processingState==='failed';
    const stuck=proc&&card.jobId&&card.inflightSince&&(Date.now()-new Date(card.inflightSince).getTime()>10*60*1000);
    const lk='c-f locked';
    const thumb=card.thumb?`<img class="rev-thumb" src="${card.thumb}">`:`<div class="card-hdr-ph">${proc?'<span class="spin" style="width:12px;height:12px;border-width:2px;display:inline-block"></span>':'📼'}</div>`;
    const tags=(card.data.tags||[]).join(', ');
    const rowClass=`rev-card${proc?(stuck?' card-failed':' card-processing'):fail?' card-failed':''}`;
    const titlePlaceholder=proc?'Analyzing… (pre-fill if you know it)':fail?'Enter title manually':'Title';
    const titleStyle=!card.data.title&&!proc?'border-color:var(--yellow)':'';
    return `<tr class="${rowClass}" data-uid="${card.uid}">
      <td>${thumb}</td>
      <td><div style="display:flex;flex-direction:column;gap:2px">
        <div style="display:flex;gap:4px;align-items:center">
          <input class="c-f" data-uid="${card.uid}" data-f="title" value="${esc(card.data.title||'')}" placeholder="${titlePlaceholder}" style="${titleStyle}">
          ${!proc?`<button class="btn-lookup c-lookup" data-uid="${card.uid}" title="Look up metadata">🔍</button>`:''}
        </div>
        ${fail&&card.failReason?`<div class="fail-reason">⚠ ${esc(card.failReason)}</div>`:''}
        ${stuck?`<div class="fail-reason">⚠ Stuck — analyzing >10 min</div>`:''}
        ${proc&&card.data.title?`<div style="font-size:10px;color:var(--text3);font-style:italic">Pre-filled — won't be overwritten</div>`:''}
      </div></td>
      <td><input class="${proc?lk:'c-f'}" data-uid="${card.uid}" data-f="year" value="${esc(card.data.year||'')}" placeholder="Year"></td>
      <td><input class="${proc?lk:'c-f'}" data-uid="${card.uid}" data-f="label" value="${esc(card.data.label||'')}" placeholder="Label"></td>
      <td><select class="${proc?lk:'c-f'}" data-uid="${card.uid}" data-f="format" ${proc?'disabled':''}>${FORMAT_LIST.map(f=>`<option value="${esc(f)}"${(card.data.format||'VHS')===f?' selected':''}>${esc(f)}</option>`).join('')}</select></td>
      <td><select class="${proc?lk:'c-f'}" data-uid="${card.uid}" data-f="condition" ${proc?'disabled':''}>${cOpts(card.data.condition||'good')}</select></td>
      <td><select class="${proc?lk:'c-f'}" data-uid="${card.uid}" data-f="status" ${proc?'disabled':''}>${sOpts(card.data.status||'in_collection')}</select></td>
      <td><input class="${proc?lk:'c-f'}" data-uid="${card.uid}" data-f="value_low" value="${esc(card.data.value_low||'')}" placeholder="$"></td>
      <td><input class="${proc?lk:'c-f'}" data-uid="${card.uid}" data-f="value_high" value="${esc(card.data.value_high||'')}" placeholder="$"></td>
      <td><input class="${proc?lk:'c-f'}" data-uid="${card.uid}" data-f="tags" value="${esc(tags)}" placeholder="genres, tags…"></td>
      <td style="white-space:nowrap;display:flex;gap:4px;align-items:center;padding:5px 6px">
        ${!proc?`<button class="btn btn-sm btn-ok c-confirm" data-uid="${card.uid}" title="Confirm">✓</button>`:''}
        ${(fail||stuck)&&card.jobId?`<button class="btn-retry c-retry" data-uid="${card.uid}" title="${stuck?'Stuck — re-queue for analysis':'Re-queue for analysis'}">↺${stuck?' Stuck':''}</button>`:''}
        <button class="btn btn-sm btn-x c-discard" data-uid="${card.uid}" title="Discard">✕</button>
      </td>
    </tr>`;
  }).join('')}</tbody></table>`;
  revCardsEl.querySelectorAll('.c-f:not(.locked)').forEach(el=>{
    el.addEventListener('input',()=>syncCard(+el.dataset.uid));
    el.addEventListener('change',()=>syncCard(+el.dataset.uid));
  });
  revCardsEl.querySelectorAll('.card-processing input[data-f="title"]').forEach(el=>{
    el.addEventListener('input',()=>syncCard(+el.dataset.uid));
  });
  revCardsEl.querySelectorAll('.c-lookup').forEach(btn=>{
    btn.addEventListener('click',async e=>{
      e.stopPropagation();
      const uid=+btn.dataset.uid;syncCard(uid);
      const card=cards.find(c=>c.uid===uid);if(!card)return;
      const title=card.data.title.trim();if(!title)return;
      btn.disabled=true;btn.textContent='…';
      const meta=await lookupMetadata(title);
      btn.disabled=false;btn.textContent='🔍';
      if(!meta)return;
      if(meta.year)card.data.year=meta.year;
      if(meta.label)card.data.label=meta.label;
      if(meta.format)card.data.format=meta.format;
      if(meta.value_low)card.data.value_low=meta.value_low;
      if(meta.value_high)card.data.value_high=meta.value_high;
      renderCards();
    });
  });
  revCardsEl.querySelectorAll('.c-confirm').forEach(btn=>{
    btn.addEventListener('click',e=>{e.stopPropagation();confirmCard(+btn.dataset.uid);});
  });
  revCardsEl.querySelectorAll('.c-discard').forEach(btn=>{
    btn.addEventListener('click',e=>{e.stopPropagation();discardCard(+btn.dataset.uid);});
  });
  revCardsEl.querySelectorAll('.c-retry').forEach(btn=>{
    btn.addEventListener('click',async e=>{
      e.stopPropagation();
      const uid=+btn.dataset.uid;
      const card=cards.find(c=>c.uid===uid);if(!card?.jobId)return;
      btn.disabled=true;btn.textContent='…';
      try{
        await fetch(`/api/jobs/${encodeURIComponent(card.jobId)}/retry`,{method:'POST'});
        _seenDel(card.jobId);
        card.processingState='processing';card.failReason='';
        renderCards();
      }catch(e2){btn.disabled=false;btn.textContent='↺';toast('Retry failed','err');}
    });
  });
}

function syncCard(uid){
  const card=cards.find(c=>c.uid===uid);if(!card)return;
  revCardsEl.querySelectorAll(`[data-uid="${uid}"].c-f`).forEach(el=>{
    if(el.dataset.f==='tags'){
      card.data.tags=el.value?el.value.split(',').map(s=>s.trim()).filter(Boolean):[];
    }else{
      card.data[el.dataset.f]=el.value;
    }
  });
}

async function confirmCard(uid){
  syncCard(uid);
  const card=cards.find(c=>c.uid===uid);if(!card)return;
  if(card.processingState==='processing')return;
  const title=card.data.title.trim();
  if(!title){
    const el=revCardsEl.querySelector(`[data-uid="${uid}"][data-f="title"]`);
    if(el){el.style.borderColor='var(--red)';el.focus();}
    return;
  }
  const dup=findDup(title);
  if(dup&&!(await askDup(dup)))return;
  const cardEl=revCardsEl.querySelector(`.rev-card[data-uid="${uid}"]`);
  if(cardEl)cardEl.classList.add('confirming');
  const bcode=card.data.barcode||'';
  const useUpcId=bcode&&/^\d{8,14}$/.test(bcode)&&!inventory.find(t=>t.id===bcode);
  const recId=useUpcId?bcode:(await nextId());
  // auto-rotate capture thumbnails 90° CCW — spines are photographed sideways
  let thumb=card.thumb||'';
  if(thumb)thumb=await rotateImage90CCW(thumb);
  const rec={
    id:recId,title,
    year:card.data.year||'',label:card.data.label||'',
    format:card.data.format||'VHS',condition:card.data.condition||'good',
    condition_notes:card.data.notes||'',status:card.data.status||'in_collection',
    barcode:card.data.barcode||'',tags:card.data.tags||[],
    value_low:card.data.value_low||'',value_high:card.data.value_high||'',
    photos:thumb?[thumb]:[],
    scanned_at:new Date().toISOString(),photo_thumbnail:thumb,photo_spine:thumb,
  };
  await Promise.all([dbAdd(rec),new Promise(r=>setTimeout(r,280))]);
  _claimJob(card.jobId);
  inventory.push(rec);renderInv();updateCount();
  toast(`Saved: ${rec.title}`,'ok');
  const confirmedIdx=cards.findIndex(c=>c.uid===uid);
  cards=cards.filter(c=>c.uid!==uid);
  if(!cards.length){hideRevPanel();_flashInvRow(rec.id);return;}
  const nextCard=cards[confirmedIdx]||cards[confirmedIdx-1];
  if(nextCard){nextCard.expanded=true;}
  renderCards();
  const nextEl=revCardsEl.querySelectorAll('.rev-card')[Math.min(confirmedIdx,cards.length-1)];
  if(nextEl)nextEl.scrollIntoView({behavior:'smooth',block:'nearest'});
  _flashInvRow(rec.id);
}
function _flashInvRow(id){
  setTimeout(()=>{
    const row=document.querySelector(`#inv-list [data-id="${id}"]`);
    if(row){row.classList.add('just-added');row.scrollIntoView({behavior:'smooth',block:'nearest'});}
  },60);
}

function discardCard(uid){
  const card=cards.find(c=>c.uid===uid);
  _claimJob(card?.jobId);
  cards=cards.filter(c=>c.uid!==uid);
  if(!cards.length)hideRevPanel();else renderCards();
}

document.getElementById('btn-confirm-all').addEventListener('click',async()=>{
  for(const card of [...cards]){
    if(card.processingState==='processing')continue;
    syncCard(card.uid);if(card.data.title.trim())await confirmCard(card.uid);
  }
});
document.getElementById('btn-discard-all').addEventListener('click',hideRevPanel);

// ── DUPLICATE MODAL ──────────────────────────────────────────────────────
function askDup(existing){
  return new Promise(res=>{
    const m=document.getElementById('m-dup');
    document.getElementById('dup-info').innerHTML=`<strong>${esc(existing.title)}</strong><br><span style="font-size:11px;color:var(--text3)">${existing.id} · ${existing.year||''} · ${existing.label||''}</span>`;
    m.style.display='flex';
    const add=()=>{cleanup();res(true);};const cancel=()=>{cleanup();res(false);};
    function cleanup(){m.style.display='none';document.getElementById('dup-add').removeEventListener('click',add);document.getElementById('dup-cancel').removeEventListener('click',cancel);}
    document.getElementById('dup-add').addEventListener('click',add);
    document.getElementById('dup-cancel').addEventListener('click',cancel);
  });
}
