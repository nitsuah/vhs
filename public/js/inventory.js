// ── INVENTORY ─────────────────────────────────────────────────────────────
function getFiltered(){
  const q=(document.getElementById('search')?.value||'').toLowerCase();
  const sort=document.getElementById('sort-sel')?.value||'scanned_desc';
  let items=inventory.filter(t=>{
    if(q&&![t.title,t.label||'',t.barcode||'',t.condition_notes||'',t.notes||''].some(s=>s.toLowerCase().includes(q))
      &&!(t.tags||[]).some(tag=>tag.toLowerCase().includes(q)))return false;
    if(colFilters.title&&!t.title.toLowerCase().includes(colFilters.title.toLowerCase()))return false;
    if(colFilters.label&&!(t.label||'').toLowerCase().includes(colFilters.label.toLowerCase()))return false;
    if(colFilters.format&&t.format!==colFilters.format)return false;
    if(colFilters.condition&&t.condition!==colFilters.condition)return false;
    if(colFilters.status&&t.status!==colFilters.status)return false;
    if(colFilters.tags&&!(t.tags||[]).some(tag=>tag.toLowerCase().includes(colFilters.tags.toLowerCase())))return false;
    if(colFilters.yrFrom&&t.year&&+t.year<+colFilters.yrFrom)return false;
    if(colFilters.yrTo&&t.year&&+t.year>+colFilters.yrTo)return false;
    return true;
  });
  items.sort((a,b)=>{
    if(sort==='title_asc')return norm(a.title).localeCompare(norm(b.title));
    if(sort==='title_desc')return norm(b.title).localeCompare(norm(a.title));
    if(sort==='scanned_asc')return(a.scanned_at||'').localeCompare(b.scanned_at||'');
    if(sort==='id_asc')return(a.id||'').localeCompare(b.id||'');
    if(sort==='year_asc')return(parseInt(a.year)||9999)-(parseInt(b.year)||9999);
    if(sort==='year_desc')return(parseInt(b.year)||0)-(parseInt(a.year)||0);
    if(sort==='val_desc')return(parseFloat(b.value_high)||parseFloat(b.value_low)||0)-(parseFloat(a.value_high)||parseFloat(a.value_low)||0);
    if(sort==='val_asc')return(parseFloat(a.value_low)||parseFloat(a.value_high)||0)-(parseFloat(b.value_low)||parseFloat(b.value_high)||0);
    const condRank={great:0,good:1,fair:2,poor:3};
    if(sort==='cond_asc')return(condRank[a.condition]??1)-(condRank[b.condition]??1);
    if(sort==='cond_desc')return(condRank[b.condition]??1)-(condRank[a.condition]??1);
    return(b.scanned_at||'').localeCompare(a.scanned_at||'');
  });
  return items;
}

function renderInv(){
  const list=document.getElementById('inv-list');
  const wall=document.getElementById('wall-view');
  const items=getFiltered();
  const empty=document.getElementById('empty-state');
  if(wallViewOn){
    list.style.display='none';wall.classList.add('on');
    if(!items.length){wall.innerHTML='<div class="empty">No tapes match.</div>';return;}
    wall.innerHTML=items.map(t=>{
      const wallSrc=t.photo_face||t.photo_thumbnail;
      const img=wallSrc?`<img class="wall-img" src="${wallSrc}" alt="">`:`<div class="wall-ph">📼</div>`;
      const meta=[t.year,t.label].filter(Boolean).join(' · ');
      const val=t.sold_price?`Sold $${t.sold_price}`:(t.value_low||t.value_high)?`$${t.value_low||'?'}–$${t.value_high||'?'}`:'';
      return `<div class="wall-card" data-id="${t.id}">${img}<div class="wall-lbl">${esc(t.title)}</div>${meta?`<div class="wall-meta">${esc(meta)}</div>`:''}${val?`<div class="wall-val">${esc(val)}</div>`:''}</div>`;
    }).join('');
    wall.querySelectorAll('.wall-card').forEach(c=>c.addEventListener('click',()=>openDetail(c.dataset.id)));
    return;
  }
  wall.classList.remove('on');list.style.display='';
  if(!items.length){list.innerHTML='';list.appendChild(empty);empty.style.display='flex';return;}
  empty.style.display='none';
  const sort=document.getElementById('sort-sel')?.value||'scanned_desc';
  const condOpts=v=>['great','good','fair','poor'].map(c=>`<option value="${c}"${(v||'good')===c?' selected':''}>${c}</option>`).join('');
  const statOpts=v=>[['in_collection','In Collection'],['for_sale','For Sale'],['sold','Sold'],['donated','Donated'],['missing','Missing'],['wanted','Wanted']].map(([c,l])=>`<option value="${c}"${v===c?' selected':''}>${l}</option>`).join('');
  const fmtOpts=v=>{const opts=[...FORMAT_LIST];if(v&&!opts.includes(v))opts.unshift(v);return opts.map(f=>`<option value="${f}"${(v||'VHS')===f?' selected':''}>${esc(f)}</option>`).join('');};
  const sa=(col,a,d)=>{const s=sort;return`<span class="sort-arr${s===a||s===d?' on':''}">${s===a?'↑':s===d?'↓':'↕'}</span>`;};
  const years=inventory.map(t=>parseInt(t.year)).filter(y=>y>=1900&&y<=2030);
  const minYr=years.length?Math.min(...years):1970;
  const maxYr=years.length?Math.max(...years):2025;
  const yrFrom=colFilters.yrFrom?+colFilters.yrFrom:minYr;
  const yrTo=colFilters.yrTo?+colFilters.yrTo:maxYr;
  const yrLbl=(yrFrom<=minYr&&yrTo>=maxYr)?'All':yrFrom+'–'+yrTo;
  list.innerHTML=`<table class="tape-table"><thead>
  <tr>
    <th style="width:28px"><input type="checkbox" id="tbl-chk-all" title="Select all"></th>
    <th style="width:188px"></th>
    <th class="th-sort" data-sa="title_asc" data-sd="title_desc">Title ${sa('title','title_asc','title_desc')}</th>
    <th class="th-sort" data-sa="year_asc" data-sd="year_desc" style="min-width:90px">Year ${sa('year','year_asc','year_desc')}</th>
    <th>Label</th><th style="width:95px">Format</th>
    <th class="th-sort" data-sa="cond_asc" data-sd="cond_desc" style="width:80px">Cond. ${sa('cond','cond_asc','cond_desc')}</th>
    <th style="width:110px">Status</th>
    <th class="th-sort" data-sa="val_asc" data-sd="val_desc" style="width:50px">$Lo ${sa('val','val_asc','val_desc')}</th>
    <th style="width:50px">$Hi</th><th>Tags</th><th>Notes</th><th style="width:28px"></th>
  </tr>
  <tr class="thead-filter">
    <td colspan="2"></td>
    <td><input class="col-f" data-cf="title" value="${esc(colFilters.title)}" placeholder="filter…"></td>
    <td><div class="yr-dual">
      <div class="yr-lbl">${esc(yrLbl)}</div>
      <div class="yr-track"></div>
      <input type="range" class="yr-slider" data-cf="yrFrom" min="${minYr}" max="${maxYr}" value="${yrFrom}" step="1">
      <input type="range" class="yr-slider" data-cf="yrTo" min="${minYr}" max="${maxYr}" value="${yrTo}" step="1">
    </div></td>
    <td><input class="col-f" data-cf="label" value="${esc(colFilters.label)}" placeholder="filter…"></td>
    <td><select class="col-f" data-cf="format"><option value="">All</option>${FORMAT_LIST.map(f=>`<option value="${f}"${colFilters.format===f?' selected':''}>${f}</option>`).join('')}</select></td>
    <td><select class="col-f" data-cf="condition"><option value="">All</option>${['great','good','fair','poor'].map(c=>`<option value="${c}"${colFilters.condition===c?' selected':''}>${c}</option>`).join('')}</select></td>
    <td><select class="col-f" data-cf="status"><option value="">All</option>${[['in_collection','In Coll.'],['for_sale','For Sale'],['sold','Sold'],['donated','Donated'],['missing','Missing'],['wanted','Wanted']].map(([v,l])=>`<option value="${v}"${colFilters.status===v?' selected':''}>${l}</option>`).join('')}</select></td>
    <td colspan="2"></td>
    <td><input class="col-f" data-cf="tags" value="${esc(colFilters.tags)}" placeholder="tag…"></td>
    <td colspan="2"></td>
  </tr>
  </thead><tbody>${items.map(t=>{
    const spineSrc=t.photo_spine||t.photo_thumbnail;
    const thumb=spineSrc?`<img class="tbl-thumb" src="${spineSrc}" loading="lazy">`:`<div class="tbl-thumb-ph">📼</div>`;
    const checked=selectedIds.has(t.id);
    return `<tr class="tape-row${checked?' selected':''}" data-id="${t.id}">
      <td style="text-align:center"><input type="checkbox" class="row-check" data-id="${t.id}" ${checked?'checked':''}></td>
      <td class="tbl-open" data-id="${t.id}">${thumb}</td>
      <td class="editable" data-id="${t.id}" data-field="title">${esc(t.title||'')}</td>
      <td class="editable" data-id="${t.id}" data-field="year">${esc(t.year||'')}</td>
      <td class="editable" data-id="${t.id}" data-field="label">${esc(t.label||'')}</td>
      <td><select class="tbl-sel" data-id="${t.id}" data-field="format">${fmtOpts(t.format)}</select></td>
      <td><select class="tbl-sel" data-id="${t.id}" data-field="condition">${condOpts(t.condition)}</select></td>
      <td><select class="tbl-sel" data-id="${t.id}" data-field="status">${statOpts(t.status||'in_collection')}</select></td>
      <td class="editable" data-id="${t.id}" data-field="value_low">${esc(t.value_low||'')}</td>
      <td class="editable" data-id="${t.id}" data-field="value_high">${esc(t.value_high||'')}</td>
      <td class="editable" data-id="${t.id}" data-field="tags">${esc((t.tags||[]).join(', '))}</td>
      <td class="editable" data-id="${t.id}" data-field="notes">${esc(t.notes||'')}</td>
      <td><button class="tbl-del" data-id="${t.id}" title="Delete">×</button></td>
    </tr>`;
  }).join('')}</tbody></table>`;
  const tbl=list.querySelector('.tape-table');
  tbl.querySelectorAll('.th-sort').forEach(th=>th.addEventListener('click',()=>{
    const sel=document.getElementById('sort-sel');if(!sel)return;
    const cur=sel.value,a=th.dataset.sa,d=th.dataset.sd;
    sel.value=(cur===a&&d)?d:a;
    renderInv();
  }));
  tbl.querySelectorAll('.col-f').forEach(el=>{
    const fire=()=>{colFilters[el.dataset.cf]=el.value;renderInv();};
    el.addEventListener('input',fire);
    el.addEventListener('change',fire);
  });
  tbl.querySelectorAll('.yr-slider').forEach(sl=>{
    sl.addEventListener('input',()=>{
      const sliders=[...tbl.querySelectorAll('.yr-slider')];
      const lo=Math.min(...sliders.map(s=>+s.value));
      const hi=Math.max(...sliders.map(s=>+s.value));
      const lbl=tbl.querySelector('.yr-lbl');
      if(lbl)lbl.textContent=(lo<=minYr&&hi>=maxYr)?'All':lo+'–'+hi;
      colFilters.yrFrom=lo<=minYr?'':String(lo);
      colFilters.yrTo=hi>=maxYr?'':String(hi);
    });
    sl.addEventListener('change',()=>renderInv());
  });
  tbl.addEventListener('click',e=>{
    if(e.target.closest('.col-f,.yr-slider,.th-sort'))return;
    const del=e.target.closest('.tbl-del');
    if(del){deleteTape(del.dataset.id);return;}
    const open=e.target.closest('.tbl-open');
    if(open){openDetail(open.dataset.id);return;}
    const td=e.target.closest('.editable');
    if(!td||td.querySelector('input'))return;
    const t=inventory.find(x=>x.id===td.dataset.id);if(!t)return;
    const field=td.dataset.field,isArr=field==='tags';
    const cur=isArr?(t.tags||[]).join(', '):(t[field]||'');
    const inp=document.createElement('input');inp.className='tbl-input';inp.value=cur;
    td.textContent='';td.appendChild(inp);inp.focus();inp.select();
    const save=async()=>{
      const v=inp.value.trim();
      if(isArr)t.tags=v?v.split(',').map(s=>s.trim()).filter(Boolean):[];else t[field]=v;
      td.textContent=isArr?t.tags.join(', '):v;
      dbPut(t).catch(e2=>toast('Save failed: '+e2.message,'err'));
    };
    inp.addEventListener('blur',save);
    inp.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();inp.blur();}if(ev.key==='Escape')td.textContent=cur;});
  });
  tbl.addEventListener('change',async e=>{
    if(e.target.closest('.col-f'))return;
    const sel=e.target.closest('.tbl-sel');
    if(sel){
      const t=inventory.find(x=>x.id===sel.dataset.id);if(!t)return;
      const field=sel.dataset.field,val=sel.value;
      if(field==='format'&&val&&!FORMAT_LIST.includes(val)){FORMAT_LIST.splice(FORMAT_LIST.length-1,0,val);}
      t[field]=val;
      dbPut(t).catch(e2=>toast('Save failed: '+e2.message,'err'));
      updateCount();return;
    }
    const cb=e.target.closest('.row-check');
    if(cb){
      if(cb.checked)selectedIds.add(cb.dataset.id);else selectedIds.delete(cb.dataset.id);
      cb.closest('.tape-row')?.classList.toggle('selected',cb.checked);
      updateBulkBar();return;
    }
    const ca=e.target.closest('#tbl-chk-all');
    if(ca){items.forEach(t=>{if(ca.checked)selectedIds.add(t.id);else selectedIds.delete(t.id);});renderInv();updateBulkBar();}
  });
}

const statusLbl=s=>({in_collection:'In Coll.',for_sale:'For Sale',sold:'Sold',donated:'Donated',missing:'Missing',wanted:'Wanted'}[s]||s);

async function deleteTape(id){
  if(!confirm('Delete this tape?'))return;
  try{await dbDel(id);inventory=inventory.filter(t=>t.id!==id);selectedIds.delete(id);renderInv();updateCount();toast('Deleted','ok');}
  catch(e){toast('Delete failed: '+e.message,'err');}
}

window.quickFilter=function(status,cond){
  if(status!==undefined&&status!==null)colFilters.status=status;
  if(cond!==undefined&&cond!==null)colFilters.condition=cond;
  renderInv();
};

const updateCount=()=>{
  const n=inventory.length;
  let totalLo=0,totalHi=0,valCount=0;
  for(const t of inventory){
    if(t.value_low||t.value_high){totalLo+=parseFloat(t.value_low)||0;totalHi+=parseFloat(t.value_high)||0;valCount++;}
  }
  const valStr=valCount?` <span style="color:var(--green);font-size:10px">$${totalLo.toFixed(0)}–$${totalHi.toFixed(0)}</span>`:'';
  document.getElementById('count-badge').innerHTML=`📼 ${n}${valStr}`;
  const mob=document.getElementById('count-badge-mob');
  if(mob)mob.innerHTML=`📼 ${n}`;
};

function updateBulkBar(){
  const n=selectedIds.size;
  const bar=document.getElementById('bulk-bar');
  bar.classList.toggle('on',n>0);
  document.getElementById('bulk-count').textContent=n>0?`${n} selected`:'';
  if(!n)document.getElementById('bulk-status-sel').value='';
}
document.getElementById('bulk-apply').addEventListener('click',async()=>{
  const status=document.getElementById('bulk-status-sel').value;
  if(!status||!selectedIds.size)return;
  for(const id of selectedIds){
    const t=inventory.find(x=>x.id===id);if(!t)continue;
    t.status=status;await dbPut(t);
  }
  renderInv();updateCount();
  toast(`Updated ${selectedIds.size} tape${selectedIds.size!==1?'s':''} → ${statusLbl(status)}`,'ok');
  selectedIds.clear();updateBulkBar();
});
document.getElementById('bulk-del').addEventListener('click',async()=>{
  if(!selectedIds.size)return;
  if(!confirm(`Delete ${selectedIds.size} tape${selectedIds.size!==1?'s':''}? This cannot be undone.`))return;
  for(const id of selectedIds){await dbDel(id);}
  inventory=inventory.filter(t=>!selectedIds.has(t.id));
  renderInv();updateCount();
  toast(`Deleted ${selectedIds.size} tape${selectedIds.size!==1?'s':''}`, 'err');
  selectedIds.clear();updateBulkBar();
});
document.getElementById('bulk-clear').addEventListener('click',()=>{selectedIds.clear();renderInv();updateBulkBar();});

document.getElementById('search')?.addEventListener('input',()=>renderInv());
const savedSort=localStorage.getItem('vhs-sort');
if(savedSort)document.getElementById('sort-sel').value=savedSort;
document.getElementById('sort-sel')?.addEventListener('change',()=>{
  localStorage.setItem('vhs-sort',document.getElementById('sort-sel').value);
  renderInv();
});

document.getElementById('btn-wall').addEventListener('click',()=>{
  wallViewOn=!wallViewOn;
  document.getElementById('btn-wall').classList.toggle('active',wallViewOn);
  renderInv();
});

// ── DETAIL MODAL ─────────────────────────────────────────────────────────
function openDetail(id){
  const t=inventory.find(x=>x.id===id);if(!t)return;
  selectedId=id;
  document.getElementById('d-heading').textContent=t.title;
  document.getElementById('d-title').value=t.title;
  document.getElementById('d-year').value=t.year||'';
  document.getElementById('d-label').value=t.label||'';
  document.getElementById('d-format').value=t.format||'VHS';
  document.getElementById('d-barcode').value=t.barcode||'';
  document.getElementById('d-value-low').value=t.value_low||'';
  document.getElementById('d-value-high').value=t.value_high||'';
  document.getElementById('d-cond').value=t.condition||'great';
  document.getElementById('d-status').value=t.status||'in_collection';
  document.getElementById('d-sold-price').value=t.sold_price||'';
  document.getElementById('d-notes').value=t.condition_notes||'';
  document.getElementById('d-id').value=t.id;
  document.getElementById('d-scanned').value=new Date(t.scanned_at).toLocaleString();
  const th=document.getElementById('detail-thumb');
  if(t.photo_thumbnail){th.src=t.photo_thumbnail;th.style.display='block';}else th.style.display='none';
  renderDetailPhotos(t);
  const tagWrap=document.getElementById('d-tag-chips');
  const getTags=()=>(inventory.find(x=>x.id===selectedId)||{}).tags||[];
  tagWrap.innerHTML=renderTagChips(t.tags||[]);
  initTagChips(tagWrap,getTags,tags=>{const rec=inventory.find(x=>x.id===selectedId);if(rec)rec.tags=tags;});
  document.getElementById('m-detail').style.display='flex';
}
async function openNewTapeModal(){
  isNewTape=true;
  selectedId=await nextId();
  document.getElementById('d-heading').textContent='New Tape';
  document.getElementById('d-title').value='';
  document.getElementById('d-year').value='';
  document.getElementById('d-label').value='';
  document.getElementById('d-format').value='VHS';
  document.getElementById('d-barcode').value='';
  document.getElementById('d-value-low').value='';
  document.getElementById('d-value-high').value='';
  document.getElementById('d-cond').value='good';
  document.getElementById('d-status').value='in_collection';
  document.getElementById('d-sold-price').value='';
  document.getElementById('d-notes').value='';
  document.getElementById('d-id').value=selectedId;
  document.getElementById('d-scanned').value=new Date().toLocaleString();
  const th=document.getElementById('detail-thumb');th.style.display='none';
  document.getElementById('detail-photos').style.display='none';
  document.getElementById('d-photo-count').textContent='No photos';
  document.getElementById('d-delete').style.display='none';
  const newTapeTags=[];
  const tagWrap=document.getElementById('d-tag-chips');
  tagWrap.innerHTML=renderTagChips([]);
  initTagChips(tagWrap,()=>newTapeTags,tags=>{newTapeTags.length=0;tags.forEach(t=>newTapeTags.push(t));});
  document.getElementById('m-detail').style.display='flex';
  setTimeout(()=>document.getElementById('d-title').focus(),50);
}
function renderDetailPhotos(t){
  const wrap=document.getElementById('detail-photos');
  const count=document.getElementById('d-photo-count');
  const photos=t.photos||[];
  count.textContent=photos.length?`${photos.length} photo${photos.length!==1?'s':''}` :'No photos';
  if(!photos.length){wrap.style.display='none';return;}
  wrap.style.display='flex';
  wrap.innerHTML=photos.map((src,i)=>{
    const isFace=t.photo_face===src;
    const isSpine=t.photo_spine===src;
    return `<div style="position:relative;flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:3px">
      <img src="${src}" style="width:72px;height:72px;object-fit:cover;border-radius:4px;border:2px solid ${isFace?'var(--blue)':isSpine?'var(--green)':'var(--border2)'};cursor:pointer" onclick="window.open('${src}','_blank')" title="Click to view full size">
      <div style="display:flex;gap:2px">
        <button onclick="rotateDetailPhotoCCW(${i})" style="background:var(--bg4);border:1px solid var(--border2);color:var(--text2);padding:1px 4px;border-radius:3px;cursor:pointer;font-size:10px" title="Rotate CCW">↺</button>
        <button onclick="rotateDetailPhoto(${i})" style="background:var(--bg4);border:1px solid var(--border2);color:var(--text2);padding:1px 4px;border-radius:3px;cursor:pointer;font-size:10px" title="Rotate CW">↻</button>
        <button onclick="pinDetailPhoto(${i},'face')" style="background:${isFace?'rgba(68,136,255,.25)':'var(--bg4)'};border:1px solid ${isFace?'var(--blue)':'var(--border2)'};color:${isFace?'var(--blue)':'var(--text3)'};padding:1px 4px;border-radius:3px;cursor:pointer;font-size:9px" title="Pin as face (wall view)">🖼</button>
        <button onclick="pinDetailPhoto(${i},'spine')" style="background:${isSpine?'rgba(61,187,61,.25)':'var(--bg4)'};border:1px solid ${isSpine?'var(--green)':'var(--border2)'};color:${isSpine?'var(--green)':'var(--text3)'};padding:1px 4px;border-radius:3px;cursor:pointer;font-size:9px" title="Pin as spine (list view)">▮</button>
        <button onclick="removeDetailPhoto(${i})" style="background:rgba(232,64,64,.15);border:1px solid rgba(232,64,64,.3);color:var(--red);padding:1px 4px;border-radius:3px;cursor:pointer;font-size:10px" title="Remove">×</button>
      </div>
    </div>`;
  }).join('');
}
function _rotateCanvas(dataUrl,angle){
  return new Promise(res=>{
    const img=new Image();
    img.onload=()=>{
      const swap=Math.abs(angle)===Math.PI/2||Math.abs(angle)===3*Math.PI/2;
      const c=document.createElement('canvas');
      c.width=swap?img.height:img.width;c.height=swap?img.width:img.height;
      const ctx=c.getContext('2d');
      ctx.translate(c.width/2,c.height/2);ctx.rotate(angle);
      ctx.drawImage(img,-img.width/2,-img.height/2);
      res(c.toDataURL('image/jpeg',0.85));
    };
    img.src=dataUrl;
  });
}
async function rotateImage90(dataUrl){return _rotateCanvas(dataUrl,Math.PI/2);}
async function rotateImage90CCW(dataUrl){return _rotateCanvas(dataUrl,-Math.PI/2);}
async function _applyRotation(idx,rotateFn){
  const t=inventory.find(x=>x.id===selectedId);if(!t)return;
  const old=t.photos[idx];
  const rotated=await rotateFn(old);
  t.photos[idx]=rotated;
  if(t.photo_thumbnail===old)t.photo_thumbnail=rotated;
  if(t.photo_face===old)t.photo_face=rotated;
  if(t.photo_spine===old)t.photo_spine=rotated;
  renderDetailPhotos(t);
  const th=document.getElementById('detail-thumb');
  if(t.photo_thumbnail){th.src=t.photo_thumbnail;th.style.display='block';}
  renderInv();
  dbPut(t).catch(e=>toast('Save failed: '+e.message,'err'));
}
window.rotateDetailPhoto=function(idx){return _applyRotation(idx,rotateImage90);};
window.rotateDetailPhotoCCW=function(idx){return _applyRotation(idx,rotateImage90CCW);};
window.pinDetailPhoto=async function(idx,role){
  const t=inventory.find(x=>x.id===selectedId);if(!t)return;
  const src=t.photos[idx];
  if(role==='face'){t.photo_face=(t.photo_face===src?null:src);}
  else{t.photo_spine=(t.photo_spine===src?null:src);}
  renderDetailPhotos(t);renderInv();
  try{await dbPut(t);}catch(e){toast('Save failed: '+e.message,'err');}
};
window.removeDetailPhoto=async function(idx){
  const t=inventory.find(x=>x.id===selectedId);if(!t)return;
  const old=t.photos[idx];
  t.photos=(t.photos||[]).filter((_,i)=>i!==idx);
  if(t.photo_thumbnail===old)t.photo_thumbnail=t.photos[0]||'';
  if(t.photo_face===old)t.photo_face=null;
  if(t.photo_spine===old)t.photo_spine=null;
  await dbPut(t);renderInv();renderDetailPhotos(t);
  const th=document.getElementById('detail-thumb');
  if(t.photo_thumbnail){th.src=t.photo_thumbnail;th.style.display='block';}else th.style.display='none';
};
document.getElementById('d-add-photo-file').addEventListener('click',()=>document.getElementById('d-photo-input').click());
document.getElementById('d-photo-input').addEventListener('change',async e=>{
  const t=inventory.find(x=>x.id===selectedId);if(!t||!e.target.files.length)return;
  for(const file of e.target.files){
    const raw=await new Promise(res=>{const r=new FileReader();r.onload=ev=>res(ev.target.result);r.readAsDataURL(file);});
    let dataUrl=await compressImage(raw);
    t.photos=t.photos||[];
    const isFirst=t.photos.length===0;
    if(isFirst){
      dataUrl=await rotateImage90CCW(dataUrl);
      t.photo_spine=dataUrl;
    }
    t.photos.push(dataUrl);
    if(!t.photo_thumbnail)t.photo_thumbnail=dataUrl;
  }
  renderInv();renderDetailPhotos(t);
  const th=document.getElementById('detail-thumb');
  if(t.photo_thumbnail){th.src=t.photo_thumbnail;th.style.display='block';}
  dbPut(t).catch(e2=>toast('Save failed: '+e2.message,'err'));
  e.target.value='';
});
document.getElementById('d-cancel').addEventListener('click',()=>{
  isNewTape=false;
  document.getElementById('d-delete').style.display='';
  document.getElementById('m-detail').style.display='none';
});
document.getElementById('d-ebay').addEventListener('click',()=>{
  const title=document.getElementById('d-title').value.trim()||document.getElementById('d-heading').textContent;
  const q=encodeURIComponent(title+' VHS');
  window.open(`https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1`,'_blank','noopener');
});
document.getElementById('d-copy-listing').addEventListener('click',async()=>{
  const t={
    title:  document.getElementById('d-title').value.trim(),
    year:   document.getElementById('d-year').value.trim(),
    label:  document.getElementById('d-label').value.trim(),
    format: document.getElementById('d-format').value.trim()||'VHS',
    condition: document.getElementById('d-cond').value,
    notes:  document.getElementById('d-notes').value.trim(),
    value_low:  document.getElementById('d-value-low').value.trim(),
    value_high: document.getElementById('d-value-high').value.trim(),
    tags:   [...document.getElementById('d-tag-chips').querySelectorAll('.tag-chip.on')].map(c=>c.dataset.tag),
  };
  if(!t.title){toast('Add a title first','err');return;}
  const condMap={great:'Like New',good:'Very Good Plus (VG+)',fair:'Good (G)',poor:'Acceptable'};
  const ebayCondition=condMap[t.condition]||'Used';
  const year=t.year?` (${t.year})`:'';
  const studio=t.label?` | ${t.label}`:'';
  const tags=t.tags.length?`\nGenres/Tags: ${t.tags.join(', ')}`:'';
  const price=t.value_low&&t.value_high?`\n\nAsking price based on recent eBay sold comps: $${t.value_low}–$${t.value_high}.`
    :t.value_high?`\n\nAsking price based on recent eBay sold comps: ~$${t.value_high}.`:'';
  const notesLine=t.notes?`\n\nSeller notes: ${t.notes}`:'';
  const listing=`${t.title}${year} [${t.format}]${studio}

Condition: ${ebayCondition}${tags}

Up for sale: ${t.title}${year} on ${t.format}.${t.label?' Released by '+t.label+'.':''}

Tape plays well. Case is in ${ebayCondition.toLowerCase()} condition. Please see photos for the best assessment.${notesLine}${price}

Ships in a padded bubble mailer. Combined shipping available.

Thanks for looking!`;
  try{
    await navigator.clipboard.writeText(listing);
    const btn=document.getElementById('d-copy-listing');
    btn.textContent='✓ Copied!';
    setTimeout(()=>{btn.textContent='📋 Listing';},2000);
  }catch{
    toast('Could not copy — try manually','err');
  }
});
document.getElementById('d-lookup').addEventListener('click',async()=>{
  const title=document.getElementById('d-title').value.trim();if(!title)return;
  const btn=document.getElementById('d-lookup');
  btn.disabled=true;btn.textContent='…';
  const meta=await lookupMetadata(title);
  btn.disabled=false;btn.textContent='🔍 Lookup';
  if(!meta)return;
  if(meta.year)document.getElementById('d-year').value=meta.year;
  if(meta.label)document.getElementById('d-label').value=meta.label;
  if(meta.format)document.getElementById('d-format').value=meta.format;
  if(meta.value_low)document.getElementById('d-value-low').value=meta.value_low;
  if(meta.value_high)document.getElementById('d-value-high').value=meta.value_high;
});
document.getElementById('d-save').addEventListener('click',async()=>{
  const titleVal=document.getElementById('d-title').value.trim();
  if(isNewTape){
    if(!titleVal){document.getElementById('d-title').style.borderColor='var(--red)';document.getElementById('d-title').focus();return;}
    const rec={
      id:selectedId,title:titleVal,
      year:document.getElementById('d-year').value.trim(),
      label:document.getElementById('d-label').value.trim(),
      format:document.getElementById('d-format').value.trim()||'VHS',
      barcode:document.getElementById('d-barcode').value.trim(),
      value_low:document.getElementById('d-value-low').value.trim(),
      value_high:document.getElementById('d-value-high').value.trim(),
      condition:document.getElementById('d-cond').value,
      status:document.getElementById('d-status').value,
      sold_price:document.getElementById('d-sold-price').value.trim(),
      condition_notes:document.getElementById('d-notes').value.trim(),
      tags:[...document.getElementById('d-tag-chips').querySelectorAll('.tag-chip.on')].map(c=>c.dataset.tag),
      photos:[],photo_thumbnail:'',photo_face:null,photo_spine:null,
      scanned_at:new Date().toISOString(),
    };
    await dbAdd(rec);inventory.push(rec);renderInv();updateCount();
    toast(`Added: ${rec.title}`,'ok');
    isNewTape=false;
    document.getElementById('d-delete').style.display='';
    document.getElementById('m-detail').style.display='none';
    return;
  }
  const t=inventory.find(x=>x.id===selectedId);if(!t)return;
  t.title=titleVal||t.title;
  t.year=document.getElementById('d-year').value.trim();
  t.label=document.getElementById('d-label').value.trim();
  t.format=document.getElementById('d-format').value.trim()||'VHS';
  t.barcode=document.getElementById('d-barcode').value.trim();
  t.value_low=document.getElementById('d-value-low').value.trim();
  t.value_high=document.getElementById('d-value-high').value.trim();
  t.condition=document.getElementById('d-cond').value;
  t.status=document.getElementById('d-status').value;
  t.sold_price=document.getElementById('d-sold-price').value.trim();
  t.condition_notes=document.getElementById('d-notes').value.trim();
  if(!t.tags)t.tags=[];
  document.getElementById('m-detail').style.display='none';
  renderInv();
  try{await dbPut(t);toast(`Saved: ${t.title}`,'ok');}
  catch(e){toast('Save failed — changes may not persist: '+e.message,'err',8000);}
});
document.getElementById('d-delete').addEventListener('click',()=>{
  const t=inventory.find(x=>x.id===selectedId);if(!t)return;
  document.getElementById('del-text').textContent=`Delete "${t.title}"? This cannot be undone.`;
  document.getElementById('m-del-confirm').style.display='flex';
});
document.getElementById('del-cancel').addEventListener('click',()=>document.getElementById('m-del-confirm').style.display='none');
document.getElementById('del-ok').addEventListener('click',async()=>{
  await dbDel(selectedId);
  inventory=inventory.filter(x=>x.id!==selectedId);
  renderInv();updateCount();
  document.getElementById('m-del-confirm').style.display='none';
  document.getElementById('m-detail').style.display='none';
});

// ── FILL DATA ─────────────────────────────────────────────────────────────
document.getElementById('btn-fill-data').addEventListener('click',async()=>{
  const targets=inventory.filter(t=>t.title&&(!t.year||(!t.value_low&&!t.value_high)));
  if(!targets.length){toast('All tapes already have complete data','');return;}
  const btn=document.getElementById('btn-fill-data');
  btn.disabled=true;
  let done=0;
  for(const t of targets){
    btn.textContent=`⚡ ${done}/${targets.length}`;
    const meta=await lookupMetadata(t.title);
    if(!meta){continue;}
    let changed=false;
    if(meta.year&&!t.year){t.year=meta.year;changed=true;}
    if(meta.label&&!t.label){t.label=meta.label;changed=true;}
    if(meta.value_low&&!t.value_low){t.value_low=meta.value_low;changed=true;}
    if(meta.value_high&&!t.value_high){t.value_high=meta.value_high;changed=true;}
    if(meta.format&&!t.format){t.format=meta.format;changed=true;}
    if(changed){await dbPut(t);done++;}
  }
  btn.disabled=false;btn.textContent='⚡ Fill Data';
  renderInv();updateCount();
  toast(`Filled data for ${done} of ${targets.length} tape${targets.length!==1?'s':''}`,done?'ok':'',4000);
});
document.getElementById('btn-add-tape').addEventListener('click',openNewTapeModal);

// ── RE-VALIDATE DIFF ─────────────────────────────────────────────────────
async function runRevalidate(){
  const targets=inventory.filter(t=>t.photo_thumbnail);
  if(!targets.length){toast('No tapes with photos to re-validate','');return;}
  const modal=document.getElementById('m-revalidate');
  const statusEl=document.getElementById('rv-status');
  const progBar=document.getElementById('rv-prog-bar');
  const progWrap=document.getElementById('rv-progress');
  const diffList=document.getElementById('rv-diff-list');
  const btnAccAll=document.getElementById('rv-accept-all');
  const btnDenyAll=document.getElementById('rv-deny-all');
  const btnApply=document.getElementById('rv-apply-selected');
  statusEl.textContent=`Queuing ${targets.length} photo${targets.length>1?'s':''} for analysis…`;
  progWrap.style.display='';progBar.style.width='0%';
  diffList.innerHTML='';
  btnAccAll.style.display='none';btnDenyAll.style.display='none';btnApply.style.display='none';
  modal.style.display='flex';
  const REVAL_FIELDS=['title','year','label','format'];

  const batch=[];
  for(let i=0;i<targets.length;i++){
    progBar.style.width=`${Math.round((i/targets.length)*40)}%`;
    statusEl.textContent=`Submitting ${i+1}/${targets.length}…`;
    try{
      const {id:jobId}=await apiReq('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({image:targets[i].photo_thumbnail,thumb:null})});
      batch.push({jobId,tape:targets[i]});
    }catch(e){console.warn('Re-validate submit failed for',targets[i].id,e);}
  }
  if(!batch.length){statusEl.textContent='Failed to submit any jobs.';return;}

  statusEl.textContent=`Processing ${batch.length} photo${batch.length>1?'s':''} via AI queue…`;
  const pending=new Set(batch.map(b=>b.jobId));
  const results=new Map();
  while(pending.size>0){
    await new Promise(r=>setTimeout(r,2000));
    const toCheck=[...pending];
    for(const jid of toCheck){
      try{
        const job=await apiReq(`/api/jobs/${encodeURIComponent(jid)}`);
        if(job.status==='done'||job.status==='failed'){
          results.set(jid,job.status==='done'?(job.result||[]):[]);
          pending.delete(jid);
        }
      }catch{}
    }
    const done=batch.length-pending.size;
    progBar.style.width=`${40+Math.round((done/batch.length)*55)}%`;
    statusEl.textContent=`Processing… ${done}/${batch.length} complete`;
  }

  for(const {jobId} of batch){
    apiReq(`/api/jobs/${encodeURIComponent(jobId)}`,{method:'DELETE'}).catch(()=>{});
  }

  const diffs=[];
  for(const {jobId,tape} of batch){
    const aiResults=results.get(jobId)||[];
    if(!aiResults.length)continue;
    const r=aiResults[0];
    for(const f of REVAL_FIELDS){
      const oldVal=(tape[f]||'').trim();
      const newVal=(r[f]||'').trim();
      if(newVal&&newVal!==oldVal)diffs.push({tape,field:f,oldVal,newVal,id:`rv-${diffs.length}`});
    }
  }

  progBar.style.width='100%';
  if(!diffs.length){
    statusEl.textContent='✓ All tapes match their photos — no differences found.';
    progWrap.style.display='none';return;
  }
  statusEl.textContent=`Found ${diffs.length} difference${diffs.length>1?'s':''} — review below:`;
  progWrap.style.display='none';
  diffList.innerHTML=diffs.map(d=>`
    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:7px;padding:9px 12px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <input type="checkbox" id="${d.id}" checked style="width:15px;height:15px;accent-color:var(--accent);flex-shrink:0">
        <label for="${d.id}" style="font-size:12px;font-weight:700;color:var(--text);cursor:pointer;flex:1">${esc(d.tape.title||d.tape.id)}</label>
        <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em">${esc(d.field)}</span>
      </div>
      <div style="display:flex;gap:8px;font-size:12px;align-items:center;flex-wrap:wrap">
        <span style="color:var(--red);background:rgba(232,64,64,.1);border:1px solid rgba(232,64,64,.2);padding:3px 8px;border-radius:4px;flex:1;min-width:80px;word-break:break-word">${esc(d.oldVal||'(empty)')}</span>
        <span style="color:var(--text3)">→</span>
        <span style="color:var(--green);background:rgba(61,187,61,.1);border:1px solid rgba(61,187,61,.2);padding:3px 8px;border-radius:4px;flex:1;min-width:80px;word-break:break-word">${esc(d.newVal)}</span>
      </div>
    </div>`).join('');
  btnAccAll.style.display='';btnDenyAll.style.display='';btnApply.style.display='';
  btnDenyAll.onclick=()=>{diffList.querySelectorAll('input[type=checkbox]').forEach(c=>c.checked=false);};
  btnAccAll.onclick=()=>{diffList.querySelectorAll('input[type=checkbox]').forEach(c=>c.checked=true);};
  btnApply.onclick=async()=>{
    let applied=0;
    for(const d of diffs.filter(d=>document.getElementById(d.id)?.checked)){
      d.tape[d.field]=d.newVal;await dbPut(d.tape);applied++;
    }
    if(applied){renderInv();updateCount();toast(`Applied ${applied} update${applied>1?'s':''}`, 'ok');}
    modal.style.display='none';
  };
}
document.getElementById('btn-revalidate').addEventListener('click',runRevalidate);
document.getElementById('rv-cancel').addEventListener('click',()=>{document.getElementById('m-revalidate').style.display='none';});

// ── MIGRATE FROM INDEXEDDB ────────────────────────────────────────────────
document.getElementById('s-migrate-idb').addEventListener('click',async()=>{
  const btn=document.getElementById('s-migrate-idb');
  const status=document.getElementById('s-migrate-status');
  btn.disabled=true;status.textContent='Reading browser storage…';
  try{
    const tapes=await new Promise((res,rej)=>{
      const r=indexedDB.open('vhs-scanner',1);
      r.onsuccess=e=>{
        const db=e.target.result;
        if(!db.objectStoreNames.contains('tapes')){res([]);return;}
        const q=db.transaction('tapes','readonly').objectStore('tapes').getAll();
        q.onsuccess=()=>res(q.result);
        q.onerror=()=>res([]);
      };
      r.onerror=()=>res([]);
      r.onupgradeneeded=()=>res([]);
    });
    if(!tapes.length){status.textContent='No local data found.';btn.disabled=false;return;}
    const existingIds=new Set(inventory.map(t=>t.id));
    let added=0,skipped=0;
    for(const tape of tapes){
      if(!tape.title||existingIds.has(tape.id)){skipped++;continue;}
      const rec={
        id:tape.id||await nextId(),title:tape.title,year:tape.year||'',label:tape.label||'',
        format:tape.format||'VHS',condition:tape.condition||'great',
        condition_notes:tape.condition_notes||'',status:tape.status||'in_collection',
        barcode:tape.barcode||'',tags:tape.tags||[],
        value_low:tape.value_low||'',value_high:tape.value_high||'',
        sold_price:tape.sold_price||'',
        photos:tape.photos||[],photo_thumbnail:tape.photo_thumbnail||'',
        photo_face:tape.photo_face||null,photo_spine:tape.photo_spine||null,
        scanned_at:tape.scanned_at||new Date().toISOString(),
      };
      await dbAdd(rec);inventory.push(rec);existingIds.add(rec.id);added++;
      status.textContent=`Migrating… ${added} imported`;
    }
    renderInv();updateCount();
    status.textContent=`Done: ${added} imported, ${skipped} skipped.`;
    if(added)toast(`Migrated ${added} tape${added!==1?'s':''} from browser storage`,'ok');
  }catch(err){
    status.textContent='Error: '+err.message;
  }
  btn.disabled=false;
});
