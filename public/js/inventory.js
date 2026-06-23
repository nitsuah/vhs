// ── INVENTORY ─────────────────────────────────────────────────────────────
let _resizeTh=null,_resizeX0=0,_resizeW0=0;
let _longPressActive=false;

function showFbiWarning(tapeTitle){
  const ov=document.getElementById('fbi-overlay');if(!ov)return;
  const lbl=document.getElementById('fbi-tape-label');
  const btn=document.getElementById('fbi-trailer');
  if(lbl)lbl.textContent=tapeTitle?`"${tapeTitle}"`:'';
  if(btn)btn.onclick=e=>{
    e.stopPropagation();
    window.open('https://www.youtube.com/results?search_query='+encodeURIComponent(tapeTitle+' official trailer'),'_blank');
  };
  ov.classList.add('active');
  let t=setTimeout(()=>ov.classList.remove('active'),3000);
  const dismiss=()=>{clearTimeout(t);ov.classList.remove('active');ov.removeEventListener('click',dismiss);};
  ov.addEventListener('click',dismiss);
}

function _initLongPress(el,tapeId){
  let timer=null;
  const fire=()=>{
    _longPressActive=true;
    const tape=inventory.find(x=>x.id===tapeId);
    showFbiWarning(tape?.title||'');
  };
  const start=()=>{timer=setTimeout(fire,600);};
  const cancel=()=>{clearTimeout(timer);timer=null;};
  el.addEventListener('mousedown',start);
  el.addEventListener('mouseup',cancel);
  el.addEventListener('mouseleave',cancel);
  el.addEventListener('contextmenu',e=>{e.preventDefault();});
  el.addEventListener('touchstart',start,{passive:true});
  el.addEventListener('touchend',cancel);
  el.addEventListener('touchmove',cancel,{passive:true});
  el.addEventListener('touchcancel',cancel);
}
let mobileColPage=0;
function _onColResize(e){if(!_resizeTh)return;_resizeTh.style.width=Math.max(40,_resizeW0+e.clientX-_resizeX0)+'px';}
function _onColResizeEnd(){_resizeTh=null;document.removeEventListener('mousemove',_onColResize);}

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
  updateCount();
  const list=document.getElementById('inv-list');
  const wall=document.getElementById('wall-view');
  const items=getFiltered();
  const empty=document.getElementById('empty-state');
  if(wallMode>0){
    list.style.display='none';
    wall.classList.add('on');
    wall.classList.toggle('spine-mode',wallMode===2);
    wall.classList.toggle('stacksup-mode',wallMode===3);
    if(!items.length){wall.innerHTML='<div class="empty">No tapes match.</div>';return;}
    if(wallMode===2){
      wall.innerHTML=items.map(t=>{
        const src=t.photo_spine||t.photo_thumbnail;
        const img=src?`<img class="spine-img" src="${src}" alt="">`:`<div class="spine-ph-txt">${esc(t.title)}</div>`;
        const _eggAttrs=t=>`${/\bakira\b/i.test(t.title)?' data-akira="1"':''}${/\bjaws\b/i.test(t.title)?' data-jaws="1"':''}${/\bghostbusters?\b/i.test(t.title)?' data-ghostbusters="1"':''}${/\b(living dead|zombie|night of)\b/i.test(t.title)?' data-notld="1"':''}${/\b(speed racer|fast and furious|fast furious)\b/i.test(t.title)?' data-speedracer="1"':''}`;
        return `<div class="spine-card" data-id="${t.id}"${_eggAttrs(t)}>${img}<div class="spine-lbl">${esc(t.title)}</div></div>`;
      }).join('');
    }else if(wallMode===3){
      wall.innerHTML=items.map(t=>{
        const isSpine=!!t.photo_spine;
        const src=t.photo_spine||t.photo_face||t.photo_thumbnail;
        const img=src
          ?`<img class="su-img${isSpine?' su-img-spine':''}" src="${src}" alt="">`
          :`<div class="su-ph"><span class="su-ph-txt">${esc(t.title)}</span></div>`;
        const _eggAttrs2=t=>`${/\bakira\b/i.test(t.title)?' data-akira="1"':''}${/\bjaws\b/i.test(t.title)?' data-jaws="1"':''}${/\bghostbusters?\b/i.test(t.title)?' data-ghostbusters="1"':''}${/\b(living dead|zombie|night of)\b/i.test(t.title)?' data-notld="1"':''}${/\b(speed racer|fast and furious|fast furious)\b/i.test(t.title)?' data-speedracer="1"':''}`;
        return `<div class="su-card" data-id="${t.id}"${_eggAttrs2(t)}>${img}<div class="su-lbl">${esc(t.title)}</div></div>`;
      }).join('');
    }else{
      wall.innerHTML=items.map(t=>{
        const wallSrc=t.photo_face||t.photo_thumbnail;
        const img=wallSrc?`<img class="wall-img" src="${wallSrc}" alt="">`:`<div class="wall-ph-txt">${esc(t.title)}</div>`;
        const meta=[t.year,t.label].filter(Boolean).join(' · ');
        const val=t.sold_price?`Sold $${t.sold_price}`:(t.value_low||t.value_high)?`$${t.value_low||'?'}–$${t.value_high||'?'}`:'';
        const _eggAttrs3=t=>`${/\bakira\b/i.test(t.title)?' data-akira="1"':''}${/\bjaws\b/i.test(t.title)?' data-jaws="1"':''}${/\bghostbusters?\b/i.test(t.title)?' data-ghostbusters="1"':''}${/\b(living dead|zombie|night of)\b/i.test(t.title)?' data-notld="1"':''}${/\b(speed racer|fast and furious|fast furious)\b/i.test(t.title)?' data-speedracer="1"':''}`;
        return `<div class="wall-card" data-id="${t.id}"${_eggAttrs3(t)}>${img}<div class="wall-lbl">${esc(t.title)}</div>${meta?`<div class="wall-meta">${esc(meta)}</div>`:''}${val?`<div class="wall-val">${esc(val)}</div>`:''}</div>`;
      }).join('');
    }
    wall.querySelectorAll('.wall-card,.spine-card,.su-card').forEach(c=>{
      c.addEventListener('click',()=>{if(_longPressActive){_longPressActive=false;return;}openDetail(c.dataset.id);});
      _initLongPress(c,c.dataset.id);
    });
    wall.querySelectorAll('[data-akira]').forEach(c=>{
      c.addEventListener('mouseenter',playAkiraDing);
      c.addEventListener('touchstart',playAkiraDing,{passive:true});
    });
    wall.querySelectorAll('[data-jaws]').forEach(c=>{
      c.addEventListener('mouseenter',startJawsTheme);
      c.addEventListener('mouseleave',stopJawsTheme);
      c.addEventListener('touchstart',startJawsTheme,{passive:true});
      c.addEventListener('touchend',stopJawsTheme);
    });
    wall.querySelectorAll('[data-ghostbusters]').forEach(c=>{
      c.addEventListener('mouseenter',()=>playGhostbustersDing(c));
      c.addEventListener('touchstart',()=>playGhostbustersDing(c),{passive:true});
    });
    wall.querySelectorAll('[data-notld]').forEach(c=>{
      c.addEventListener('mouseenter',()=>startNotldEffect(c));
      c.addEventListener('mouseleave',()=>stopNotldEffect(c));
      c.addEventListener('touchstart',()=>startNotldEffect(c),{passive:true});
      c.addEventListener('touchend',()=>stopNotldEffect(c));
    });
    wall.querySelectorAll('[data-speedracer]').forEach(c=>{
      c.addEventListener('mouseenter',startRevSound);
      c.addEventListener('mouseleave',stopRevSound);
      c.addEventListener('touchstart',startRevSound,{passive:true});
      c.addEventListener('touchend',stopRevSound);
    });
    return;
  }
  wall.classList.remove('on','spine-mode','stacksup-mode');
  if(!items.length){list.style.display='none';list.innerHTML='';if(empty)empty.style.display='flex';return;}
  list.style.display='';if(empty)empty.style.display='none';
  const sort=document.getElementById('sort-sel')?.value||'scanned_desc';
  const condOpts=v=>['great','good','fair','poor'].map(c=>`<option value="${c}"${(v||'good')===c?' selected':''}>${c}</option>`).join('');
  const statOpts=v=>[['in_collection','In Collection'],['for_sale','For Sale'],['sold','Sold'],['donated','Donated'],['missing','Missing'],['wanted','Wanted']].map(([c,l])=>`<option value="${c}"${v===c?' selected':''}>${l}</option>`).join('');
  const fmtOpts=v=>{const opts=[...FORMAT_LIST];if(v&&!opts.includes(v))opts.unshift(v);return opts.map(f=>`<option value="${f}"${(v||'VHS')===f?' selected':''}>${esc(f)}</option>`).join('');};
  const sa=(col,a,d)=>{const s=sort;return`<span class="sort-arr${s===a||s===d?' on':''}">${s===a?'↑':s===d?'↓':'↕'}</span>`;};
  const rh='<span class="col-rh"></span>';
  const isAkira=t=>/\bakira\b/i.test(t.title);
  const isJaws=t=>/\bjaws\b/i.test(t.title);
  const isGhostbusters=t=>/\bghostbusters?\b/i.test(t.title);
  const isNotld=t=>/\b(living dead|zombie|night of)\b/i.test(t.title);
  const isSpeedRacer=t=>/\b(speed racer|fast and furious|fast furious)\b/i.test(t.title);
  const years=inventory.map(t=>parseInt(t.year)).filter(y=>y>=1900&&y<=2030);
  const minYr=years.length?Math.min(...years):1970;
  const maxYr=years.length?Math.max(...years):2025;
  const yrFrom=colFilters.yrFrom?+colFilters.yrFrom:minYr;
  const yrTo=colFilters.yrTo?+colFilters.yrTo:maxYr;
  const yrLbl=(yrFrom<=minYr&&yrTo>=maxYr)?'All':yrFrom+'–'+yrTo;
  list.innerHTML=`<table class="tape-table"><thead>
  <tr>
    <th style="width:28px">${rh}<input type="checkbox" id="tbl-chk-all" title="Select all"></th>
    <th style="width:188px" class="mc-2">${rh}</th>
    <th class="th-sort mc-3" data-sa="title_asc" data-sd="title_desc" style="width:200px">
      ${rh}<span class="th-lbl">Title ${sa('title','title_asc','title_desc')}</span>
      <button class="th-fp-btn" title="Filter">⊽</button>
      <div class="th-fp"${colFilters.title?' style="display:block"':''}>
        <input class="col-f" data-cf="title" value="${esc(colFilters.title)}" placeholder="search…">
      </div>
    </th>
    <th class="th-sort mc-4" data-sa="year_asc" data-sd="year_desc" style="min-width:90px">
      ${rh}<span class="th-lbl">Year ${sa('year','year_asc','year_desc')}</span>
      <button class="th-fp-btn" title="Filter">⊽</button>
      <div class="th-fp"${(colFilters.yrFrom||colFilters.yrTo)?' style="display:block"':''}>
        <div class="yr-dual">
          <div class="yr-lbl">${esc(yrLbl)}</div>
          <div class="yr-track"></div>
          <input type="range" class="yr-slider" data-cf="yrFrom" min="${minYr}" max="${maxYr}" value="${yrFrom}" step="1">
          <input type="range" class="yr-slider" data-cf="yrTo" min="${minYr}" max="${maxYr}" value="${yrTo}" step="1">
        </div>
      </div>
    </th>
    <th class="mc-5" style="width:120px">
      ${rh}<span class="th-lbl">Label</span>
      <button class="th-fp-btn" title="Filter">⊽</button>
      <div class="th-fp"${colFilters.label?' style="display:block"':''}>
        <input class="col-f" data-cf="label" value="${esc(colFilters.label)}" placeholder="search…">
      </div>
    </th>
    <th style="width:95px" class="mc-6">
      ${rh}<span class="th-lbl">Format</span>
      <button class="th-fp-btn" title="Filter">⊽</button>
      <div class="th-fp"${colFilters.format?' style="display:block"':''}>
        <select class="col-f" data-cf="format"><option value="">All</option>${FORMAT_LIST.map(f=>`<option value="${f}"${colFilters.format===f?' selected':''}>${f}</option>`).join('')}</select>
      </div>
    </th>
    <th class="th-sort mc-7" data-sa="cond_asc" data-sd="cond_desc" style="width:80px">
      ${rh}<span class="th-lbl">Cond. ${sa('cond','cond_asc','cond_desc')}</span>
      <button class="th-fp-btn" title="Filter">⊽</button>
      <div class="th-fp"${colFilters.condition?' style="display:block"':''}>
        <select class="col-f" data-cf="condition"><option value="">All</option>${['great','good','fair','poor'].map(c=>`<option value="${c}"${colFilters.condition===c?' selected':''}>${c}</option>`).join('')}</select>
      </div>
    </th>
    <th style="width:110px" class="mc-8">
      ${rh}<span class="th-lbl">Status</span>
      <button class="th-fp-btn" title="Filter">⊽</button>
      <div class="th-fp"${colFilters.status?' style="display:block"':''}>
        <select class="col-f" data-cf="status"><option value="">All</option>${[['in_collection','In Coll.'],['for_sale','For Sale'],['sold','Sold'],['donated','Donated'],['missing','Missing'],['wanted','Wanted']].map(([v,l])=>`<option value="${v}"${colFilters.status===v?' selected':''}>${l}</option>`).join('')}</select>
      </div>
    </th>
    <th class="th-sort mc-9" data-sa="val_asc" data-sd="val_desc" style="width:50px">
      ${rh}<span class="th-lbl">$Lo ${sa('val','val_asc','val_desc')}</span>
    </th>
    <th style="width:50px" class="mc-10">${rh}<span class="th-lbl">$Hi</span></th>
    <th class="mc-11" style="width:120px">
      ${rh}<span class="th-lbl">Tags</span>
      <button class="th-fp-btn" title="Filter">⊽</button>
      <div class="th-fp"${colFilters.tags?' style="display:block"':''}>
        <input class="col-f" data-cf="tags" value="${esc(colFilters.tags)}" placeholder="tag…">
      </div>
    </th>
    <th class="mc-12" style="width:150px">${rh}<span class="th-lbl">Notes</span></th>
    <th style="width:52px"></th>
  </tr>
  </thead><tbody>${items.map(t=>{
    const spineSrc=t.photo_spine||t.photo_thumbnail;
    const thumb=spineSrc?`<img class="tbl-thumb" src="${spineSrc}" loading="lazy">`:`<div class="tbl-thumb-ph">📼</div>`;
    const checked=selectedIds.has(t.id);
    const isEd=t.id===editingId;
    const pe=pendingEdits.get(t.id)||{};
    const edCell=(field,mc,isArr=false)=>{
      const curVal=isArr?(t.tags||[]).join(', '):(t[field]||'');
      const pv=pe[field];
      const pend=isEd&&pv!==undefined&&pv!==curVal;
      if(isEd)return`<td class="${mc}${pend?' tbl-td-pending':''}" data-id="${t.id}" data-field="${field}"><input class="tbl-input${pend?' pending':''}" data-id="${t.id}" data-field="${field}" value="${esc(pv!==undefined?pv:curVal)}"></td>`;
      return`<td class="${mc} editable" data-id="${t.id}" data-field="${field}">${esc(curVal)}</td>`;
    };
    const edCellVal=(field,mc)=>{
      const curVal=t[field]||'';const pv=pe[field];const pend=isEd&&pv!==undefined&&pv!==curVal;
      if(isEd)return`<td class="${mc}${pend?' tbl-td-pending':''}" data-id="${t.id}" data-field="${field}"><input class="tbl-input${pend?' pending':''}" data-id="${t.id}" data-field="${field}" value="${esc(pv!==undefined?pv:curVal)}"></td>`;
      return`<td class="${mc} editable" data-id="${t.id}" data-field="${field}">${curVal?`<span style="color:var(--green)">$${esc(curVal)}</span>`:''}</td>`;
    };
    const tagCell=r=>{
      const tags=r.tags||[];
      return`<td class="mc-11 editable" data-id="${r.id}" data-field="tags">${tags.map(tag=>`<span class="tag-sm">${esc(tag)}</span>`).join('')}</td>`;
    };
    const selCurVal=(field,def)=>pe[field]!==undefined?pe[field]:(t[field]||def||'');
    const selPend=(field,def)=>isEd&&pe[field]!==undefined&&pe[field]!==(t[field]||def||'');
    const actCell=isEd
      ?`<td style="white-space:nowrap;text-align:center"><button class="tbl-save" data-id="${t.id}" title="Save">✓</button><button class="tbl-cancel" data-id="${t.id}" title="Cancel">✕</button></td>`
      :`<td style="white-space:nowrap;text-align:center"><button class="tbl-del" data-id="${t.id}" title="Delete">×</button></td>`;
    return `<tr class="tape-row${checked?' selected':''}${isEd?' editing':''}" data-id="${t.id}"${isAkira(t)?' data-akira="1"':''}${isJaws(t)?' data-jaws="1"':''}${isGhostbusters(t)?' data-ghostbusters="1"':''}${isNotld(t)?' data-notld="1"':''}${isSpeedRacer(t)?' data-speedracer="1"':''}>
      <td style="text-align:center"><input type="checkbox" class="row-check" data-id="${t.id}" ${checked?'checked':''}></td>
      <td class="tbl-open mc-2" data-id="${t.id}">${thumb}</td>
      ${edCell('title','mc-3')}
      ${edCell('year','mc-4')}
      ${edCell('label','mc-5')}
      <td class="mc-6${selPend('format','VHS')?' tbl-td-pending':''}"><select class="tbl-sel${selPend('format','VHS')?' pending':''}" data-id="${t.id}" data-field="format">${fmtOpts(selCurVal('format','VHS'))}</select></td>
      <td class="mc-7${selPend('condition','good')?' tbl-td-pending':''}"><select class="tbl-sel${selPend('condition','good')?' pending':''}" data-id="${t.id}" data-field="condition">${condOpts(selCurVal('condition','good'))}</select></td>
      <td class="mc-8${selPend('status','in_collection')?' tbl-td-pending':''}"><select class="tbl-sel${selPend('status','in_collection')?' pending':''}" data-id="${t.id}" data-field="status">${statOpts(selCurVal('status','in_collection'))}</select></td>
      ${edCellVal('value_low','mc-9')}
      ${edCellVal('value_high','mc-10')}
      ${tagCell(t)}
      ${edCell('notes','mc-12')}
      ${actCell}
    </tr>`;
  }).join('')}</tbody></table>`;
  const tbl=list.querySelector('.tape-table');
  if(window.innerWidth<=700){
    tbl.dataset.mcpage=String(mobileColPage);
    tbl.querySelectorAll('.tape-row').forEach(row=>{
      let sx=0,sy=0,active=false;
      row.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;active=true;},{passive:true});
      row.addEventListener('touchmove',e=>{
        if(!active)return;
        const dx=e.touches[0].clientX-sx;
        const dy=Math.abs(e.touches[0].clientY-sy);
        if(dy>30){active=false;row.classList.remove('swipe-delete','swipe-select');return;}
        if(dx>20){row.classList.add('swipe-delete');row.classList.remove('swipe-select');}
        else if(dx<-20){row.classList.add('swipe-select');row.classList.remove('swipe-delete');}
        else{row.classList.remove('swipe-delete','swipe-select');}
      },{passive:true});
      row.addEventListener('touchend',e=>{
        row.classList.remove('swipe-delete','swipe-select');
        if(!active)return;
        active=false;
        const dx=e.changedTouches[0].clientX-sx;
        const dy=Math.abs(e.changedTouches[0].clientY-sy);
        if(dy>30)return;
        const id=row.dataset.id;
        if(dx>80){
          deleteTape(id);
        }else if(dx<-80){
          if(selectedIds.has(id))selectedIds.delete(id);
          else selectedIds.add(id);
          updateBulkBar();renderInv();
        }
      },{passive:true});
    });
  }
  tbl.querySelectorAll('.th-sort').forEach(th=>th.addEventListener('click',e=>{
    if(e.target.closest('.th-fp-btn,.th-fp,.col-rh'))return;
    const sel=document.getElementById('sort-sel');if(!sel)return;
    const cur=sel.value,a=th.dataset.sa,d=th.dataset.sd;
    sel.value=(cur===a&&d)?d:a;
    renderInv();
  }));
  tbl.querySelectorAll('.th-fp-btn').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      const pop=btn.closest('th').querySelector('.th-fp');if(!pop)return;
      const wasOn=pop.style.display==='block';
      tbl.querySelectorAll('.th-fp').forEach(p=>{p.style.display='none';});
      if(!wasOn)pop.style.display='block';
    });
  });
  tbl.querySelectorAll('.th-fp').forEach(pop=>pop.addEventListener('click',e=>e.stopPropagation()));
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
  // Column resize
  tbl.querySelectorAll('.col-rh').forEach(handle=>{
    handle.addEventListener('mousedown',e=>{
      e.preventDefault();e.stopPropagation();
      _resizeTh=handle.closest('th');
      _resizeX0=e.clientX;_resizeW0=_resizeTh.offsetWidth;
      document.addEventListener('mousemove',_onColResize);
      document.addEventListener('mouseup',_onColResizeEnd,{once:true});
    });
  });
  tbl.addEventListener('click',e=>{
    if(_longPressActive){_longPressActive=false;return;}
    if(e.target.closest('.col-f,.yr-slider,.th-sort,.col-rh'))return;
    const saveBtn=e.target.closest('.tbl-save');
    if(saveBtn){
      const id=saveBtn.dataset.id;
      const t=inventory.find(x=>x.id===id);if(!t)return;
      const pe=pendingEdits.get(id)||{};
      if('tags' in pe)t.tags=pe.tags?pe.tags.split(',').map(s=>s.trim()).filter(Boolean):[];
      const fields=['title','year','label','format','condition','status','value_low','value_high','notes'];
      fields.forEach(f=>{if(f in pe&&f!=='tags')t[f]=pe[f];});
      dbPut(t).then(()=>{
        const row=list.querySelector(`tr[data-id="${id}"]`);
        if(row){row.classList.add('just-saved');setTimeout(()=>row.classList.remove('just-saved'),1400);}
      }).catch(e2=>toast('Save failed: '+e2.message,'err'));
      editingId=null;pendingEdits.delete(id);renderInv();return;
    }
    const cancelBtn=e.target.closest('.tbl-cancel');
    if(cancelBtn){editingId=null;pendingEdits.delete(cancelBtn.dataset.id);renderInv();return;}
    const editBtn=e.target.closest('.tbl-edit');
    if(editBtn){
      if(window.innerWidth<=700){openDetail(editBtn.dataset.id);}
      else{editingId=editBtn.dataset.id;pendingEdits.delete(editingId);renderInv();}
      return;
    }
    const del=e.target.closest('.tbl-del');
    if(del){deleteTape(del.dataset.id);return;}
    const open=e.target.closest('.tbl-open');
    if(open){openDetail(open.dataset.id);return;}
    const td=e.target.closest('.editable');
    if(td&&!editingId){openDetail(td.dataset.id);return;}
  });
  // Track pending changes from edit-mode inputs
  if(editingId){
    tbl.querySelectorAll('.editing .tbl-input').forEach(inp=>{
      inp.addEventListener('input',()=>{
        const id=inp.dataset.id,field=inp.dataset.field;
        if(!pendingEdits.has(id))pendingEdits.set(id,{});
        pendingEdits.get(id)[field]=inp.value;
        const t2=inventory.find(x=>x.id===id);
        const orig=field==='tags'?(t2?.tags||[]).join(', '):(t2?.[field]||'');
        const changed=inp.value!==orig;
        inp.classList.toggle('pending',changed);
        inp.closest('td')?.classList.toggle('tbl-td-pending',changed);
      });
    });
  }
  tbl.addEventListener('change',async e=>{
    if(e.target.closest('.col-f'))return;
    const sel=e.target.closest('.tbl-sel');
    if(sel){
      const id=sel.dataset.id,field=sel.dataset.field,val=sel.value;
      const t=inventory.find(x=>x.id===id);if(!t)return;
      if(editingId===id){
        // In edit mode: buffer in pendingEdits, don't save yet
        if(!pendingEdits.has(id))pendingEdits.set(id,{});
        const orig=t[field]||'';
        if(val!==orig)pendingEdits.get(id)[field]=val;else delete pendingEdits.get(id)[field];
        sel.classList.toggle('pending',val!==orig);
        sel.closest('td')?.classList.toggle('tbl-td-pending',val!==orig);
        return;
      }
      // Not editing: save immediately
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
  tbl.querySelectorAll('tr[data-akira]').forEach(row=>{
    row.addEventListener('mouseenter',playAkiraDing);
    row.addEventListener('touchstart',playAkiraDing,{passive:true});
  });
  tbl.querySelectorAll('tr[data-jaws]').forEach(row=>{
    row.addEventListener('mouseenter',startJawsTheme);
    row.addEventListener('mouseleave',stopJawsTheme);
    row.addEventListener('touchstart',startJawsTheme,{passive:true});
    row.addEventListener('touchend',stopJawsTheme);
  });
  tbl.querySelectorAll('tr[data-ghostbusters]').forEach(row=>{
    row.addEventListener('mouseenter',()=>playGhostbustersDing(row));
    row.addEventListener('touchstart',()=>playGhostbustersDing(row),{passive:true});
  });
  tbl.querySelectorAll('tr[data-notld]').forEach(row=>{
    row.addEventListener('mouseenter',()=>startNotldEffect(row));
    row.addEventListener('mouseleave',()=>stopNotldEffect(row));
    row.addEventListener('touchstart',()=>startNotldEffect(row),{passive:true});
    row.addEventListener('touchend',()=>stopNotldEffect(row));
  });
  tbl.querySelectorAll('tr[data-speedracer]').forEach(row=>{
    row.addEventListener('mouseenter',startRevSound);
    row.addEventListener('mouseleave',stopRevSound);
    row.addEventListener('touchstart',startRevSound,{passive:true});
    row.addEventListener('touchend',stopRevSound);
  });
  tbl.querySelectorAll('tr.tape-row').forEach(row=>_initLongPress(row,row.dataset.id));
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
  const all=inventory.length;
  const filtered=getFiltered();
  const n=filtered.length;
  const isFiltered=n<all;
  let totalLo=0,totalHi=0,valCount=0;
  for(const t of filtered){
    if(t.value_low||t.value_high){totalLo+=parseFloat(t.value_low)||0;totalHi+=parseFloat(t.value_high)||0;valCount++;}
  }
  const valStr=valCount?` <span style="color:var(--green);font-size:10px">$${Math.round(totalLo)}–$${Math.round(totalHi)}</span>`:'';
  const cntHtml=isFiltered?`${n}<span style="color:var(--text3);font-size:10px">/${all}</span>`:String(all);
  document.getElementById('count-badge').innerHTML=`📼 ${cntHtml}${valStr}`;
  const mob=document.getElementById('count-badge-mob');
  if(mob)mob.innerHTML=`📼 ${isFiltered?n:all}`;
  const fillBtn=document.getElementById('btn-fill-data');
  if(fillBtn)fillBtn.style.display=all?'':'none';
  checkMilestoneConfetti(all);
};

function updateBulkBar(){
  const n=selectedIds.size;
  const bar=document.getElementById('bulk-bar');
  bar.classList.toggle('on',n>0);
  document.getElementById('bulk-count').textContent=n>0?`${n} selected`:'';
  if(!n)document.getElementById('bulk-status-sel').value='';
  // Mobile: bulk bar replaces the collect subheader when selection is active
  if(window.innerWidth<=700){
    const subhdr=document.getElementById('collect-subhdr');
    if(subhdr)subhdr.style.display=n>0?'none':'';
  }
  // Update AI button labels to indicate scope when selection is active
  const fillBtn=document.getElementById('btn-fill-data');
  if(fillBtn)fillBtn.textContent=n>0?`⚡ Fill (${n})`:'⚡ Fill';
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
document.getElementById('btn-search')?.addEventListener('click',()=>{document.getElementById('search')?.focus();renderInv();});


// Close filter popovers when clicking outside the table
document.addEventListener('click',()=>{
  document.querySelectorAll('.tape-table .th-fp[style*="display:block"]').forEach(p=>{p.style.display='none';});
});
const savedSort=localStorage.getItem('vhs-sort');
if(savedSort)document.getElementById('sort-sel').value=savedSort;
document.getElementById('sort-sel')?.addEventListener('change',()=>{
  localStorage.setItem('vhs-sort',document.getElementById('sort-sel').value);
  renderInv();
});

document.getElementById('btn-wall').addEventListener('click',()=>{
  wallMode=(wallMode+1)%4;
  const btn=document.getElementById('btn-wall');
  const labels=['⊞ Wall','⊞ Cover','☰ Stacks','▮ StacksUp'];
  btn.textContent=labels[wallMode];
  btn.classList.toggle('active',wallMode>0);
  renderInv();
});

// ── DETAIL MODAL ─────────────────────────────────────────────────────────
function openDetail(id){
  const t=inventory.find(x=>x.id===id);if(!t)return;
  if(/\bakira\b/i.test(t.title))playAkiraDing();
  selectedId=id;
  document.getElementById('d-heading').textContent=t.title;
  document.getElementById('d-title').value=t.title;
  document.getElementById('d-year').value=t.year||'';
  document.getElementById('d-label').value=t.label||'';
  document.getElementById('d-format').value=t.format||'VHS';
  document.getElementById('d-barcode').value=t.barcode||'';
  document.getElementById('d-value-low').value=t.value_low||'';
  document.getElementById('d-value-high').value=t.value_high||'';
  document.getElementById('d-cond').value=t.condition||'good';
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
  window._resetDetailTabs?.();
  document.getElementById('m-detail').style.display='flex';
  if(/matrix/i.test(t.title)){
    const mdl=document.getElementById('m-detail');
    mdl.classList.add('matrix-mode');
    [['d-heading',t.title,false],['d-title',t.title,true],['d-year',t.year||'',true],['d-label',t.label||'',true]].forEach(([eid,val])=>{
      const el=document.getElementById(eid);if(el)scrambleToReal(el,val,2200);
    });
    setTimeout(()=>mdl.classList.remove('matrix-mode'),2600);
  }
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
  window._resetDetailTabs?.();
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
    const photoRoleBadge=isFace?'<span style="font-size:9px;background:rgba(68,136,255,.2);color:var(--blue);border:1px solid rgba(68,136,255,.3);border-radius:3px;padding:1px 4px">Cover</span>':isSpine?'<span style="font-size:9px;background:rgba(61,187,61,.2);color:var(--green);border:1px solid rgba(61,187,61,.3);border-radius:3px;padding:1px 4px">Spine</span>':'';
    const btnBase='background:var(--bg4);border:1px solid var(--border2);color:var(--text2);padding:5px 8px;border-radius:5px;cursor:pointer;font-size:14px;min-height:32px;min-width:32px';
    return `<div style="position:relative;flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:4px">
      <div style="position:relative"><img src="${src}" style="width:88px;height:88px;object-fit:cover;border-radius:5px;border:2px solid ${isFace?'var(--blue)':isSpine?'var(--green)':'var(--border2)'};cursor:pointer;display:block" onclick="window.open('${src}','_blank')" title="Click to view full size">
      ${photoRoleBadge?`<div style="position:absolute;bottom:2px;left:2px">${photoRoleBadge}</div>`:''}</div>
      <div style="display:flex;gap:3px;flex-wrap:wrap;justify-content:center;max-width:88px">
        <button onclick="rotateDetailPhotoCCW(${i})" style="${btnBase}" title="Rotate CCW">↺</button>
        <button onclick="rotateDetailPhoto(${i})" style="${btnBase}" title="Rotate CW">↻</button>
        <button onclick="pinDetailPhoto(${i},'face')" style="background:${isFace?'rgba(68,136,255,.25)':'var(--bg4)'};border:1px solid ${isFace?'var(--blue)':'var(--border2)'};color:${isFace?'var(--blue)':'var(--text3)'};padding:5px 8px;border-radius:5px;cursor:pointer;font-size:14px;min-height:32px;min-width:32px" title="Pin as cover (wall view)">🖼</button>
        <button onclick="pinDetailPhoto(${i},'spine')" style="background:${isSpine?'rgba(61,187,61,.25)':'var(--bg4)'};border:1px solid ${isSpine?'var(--green)':'var(--border2)'};color:${isSpine?'var(--green)':'var(--text3)'};padding:5px 8px;border-radius:5px;cursor:pointer;font-size:14px;min-height:32px;min-width:32px" title="Pin as spine (list view)">▮</button>
        <button onclick="removeDetailPhoto(${i})" style="background:rgba(232,64,64,.15);border:1px solid rgba(232,64,64,.3);color:var(--red);padding:5px 8px;border-radius:5px;cursor:pointer;font-size:14px;min-height:32px;min-width:32px" title="Remove photo">×</button>
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
  // Store imdb_id on the in-progress edit so it's saved with the tape
  if(meta.imdb_id&&selectedId){
    const t=inventory.find(x=>x.id===selectedId);if(t&&!t.imdb_id)t.imdb_id=meta.imdb_id;
  }
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
    const saveBtn=document.getElementById('d-save');
    triggerTapeInsertAnim(saveBtn?.getBoundingClientRect());
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
async function _fetchPosterImage(url){
  try{
    const r=await fetch(`/api/fetch-image?url=${encodeURIComponent(url)}`,{signal:AbortSignal.timeout(12000)});
    if(!r.ok)return null;
    const d=await r.json();
    return d.dataUrl||null;
  }catch{return null;}
}

let _fillCancelled=false;
async function _fillLookup(t){
  // Barcode path first — most reliable
  if(t.barcode&&/^\d{8,14}$/.test(t.barcode)){
    try{
      const hdrs={};if(typeof omdbKey!=='undefined'&&omdbKey)hdrs['x-omdb-key']=omdbKey;
      const r=await fetch(`/api/lookup/barcode/${encodeURIComponent(t.barcode)}`,{signal:AbortSignal.timeout(8000),headers:hdrs});
      if(r.ok){const d=await r.json();if(d&&d.title)return d;}
    }catch{}
  }
  // OMDb title search — no AI
  try{
    const hdrs={};if(typeof omdbKey!=='undefined'&&omdbKey)hdrs['x-omdb-key']=omdbKey;
    const r=await fetch(`/api/lookup?title=${encodeURIComponent(t.title)}&noai=1`,{signal:AbortSignal.timeout(10000),headers:hdrs});
    if(r.ok){const d=await r.json();if(d&&d.imdb_id)return d;}
  }catch{}
  return null;
}
document.getElementById('btn-fill-data').addEventListener('click',async()=>{
  if(document.getElementById('btn-fill-data').disabled)return;
  const pool=selectedIds.size>0?inventory.filter(t=>selectedIds.has(t.id)):inventory;
  const targets=pool.filter(t=>t.title&&(!t.year||!t.label||!t.imdb_id||(!t.value_low&&!t.value_high)||!t.photos?.length));
  if(!targets.length){toast('All tapes already have complete data','');return;}
  const btn=document.getElementById('btn-fill-data');
  const progWrap=document.getElementById('fill-progress');
  const progBar=document.getElementById('fill-progress-bar');
  btn.disabled=true;_fillCancelled=false;
  if(progWrap){progWrap.style.display='flex';if(progBar)progBar.style.width='0%';}
  let done=0;
  for(let i=0;i<targets.length;i++){
    if(_fillCancelled)break;
    if(progBar)progBar.style.width=`${Math.round((i/targets.length)*100)}%`;
    const t=targets[i];
    const meta=await _fillLookup(t);
    if(!meta||!meta.imdb_id)continue;
    let hasChanges=false;
    if(meta.year&&!t.year){t.year=meta.year;hasChanges=true;}
    if(meta.label&&!t.label){t.label=meta.label;hasChanges=true;}
    if(meta.imdb_id&&!t.imdb_id){t.imdb_id=meta.imdb_id;hasChanges=true;}
    if(meta.value_low&&!t.value_low){t.value_low=meta.value_low;hasChanges=true;}
    if(meta.value_high&&!t.value_high){t.value_high=meta.value_high;hasChanges=true;}
    if(meta.poster&&!t.photos?.length){
      const dataUrl=await _fetchPosterImage(meta.poster);
      if(dataUrl){t.photos=[dataUrl];t.photo_thumbnail=dataUrl;t.photo_face=dataUrl;hasChanges=true;}
    }
    if(hasChanges){try{await dbPut(t);done++;}catch(e){console.warn('Fill save:',t.id,e);}}
  }
  if(progBar)progBar.style.width='100%';
  setTimeout(()=>{if(progWrap)progWrap.style.display='none';},600);
  btn.disabled=false;btn.textContent=selectedIds.size>0?`⚡ Fill (${selectedIds.size})`:'⚡ Fill';
  if(done){renderInv();updateCount();toast(`Filled ${done} tape${done!==1?'s':''}`, 'ok',4000);}
  else if(!_fillCancelled){toast(`No reliable matches found for ${targets.length} tape${targets.length!==1?'s':''}`, '',4000);}
  _fillCancelled=false;
});
document.getElementById('btn-add-tape').addEventListener('click',openNewTapeModal);
document.getElementById('bulk-fill')?.addEventListener('click',()=>document.getElementById('btn-fill-data').click());

// ── RE-VALIDATE DIFF ─────────────────────────────────────────────────────
function _normTitle(s){return(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();}
function _titleSim(a,b){
  const wa=_normTitle(a).split(' ').filter(Boolean);
  const wb=_normTitle(b).split(' ').filter(Boolean);
  if(!wa.length||!wb.length)return 0;
  const sa=new Set(wa),sb=new Set(wb);
  const common=[...sa].filter(w=>sb.has(w)).length;
  return common/Math.max(sa.size,sb.size);
}
async function runRevalidate(){
  const pool=selectedIds.size>0?inventory.filter(t=>selectedIds.has(t.id)):inventory;
  // Prefer face photos for better OCR accuracy; fall back to thumbnail
  const targets=pool.filter(t=>t.photo_face||t.photo_thumbnail);
  if(!targets.length){toast('No tapes with photos to check','');return;}
  const modal=document.getElementById('m-revalidate');
  const statusEl=document.getElementById('rv-status');
  const progBar=document.getElementById('rv-prog-bar');
  const progWrap=document.getElementById('rv-progress');
  statusEl.textContent=`Queuing ${targets.length} photo${targets.length>1?'s':''} for analysis…`;
  progWrap.style.display='';progBar.style.width='0%';
  modal.style.display='flex';

  const batch=[];
  for(let i=0;i<targets.length;i++){
    progBar.style.width=`${Math.round((i/targets.length)*40)}%`;
    statusEl.textContent=`Submitting ${i+1}/${targets.length}…`;
    try{
      const img=targets[i].photo_face||targets[i].photo_thumbnail;
      const {id:jobId}=await apiReq('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({image:img,thumb:null})});
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

  progBar.style.width='100%';
  let queued=0;
  const hdrs={};if(typeof omdbKey!=='undefined'&&omdbKey)hdrs['x-omdb-key']=omdbKey;
  for(const {jobId,tape} of batch){
    const aiResults=results.get(jobId)||[];
    if(!aiResults.length)continue;
    const r=aiResults[0];
    // Skip low-confidence results entirely
    if(r.confidence==='low')continue;
    const proposed={tape_id:tape.id};
    let hasDiff=false;
    // Title: only flag if word-similarity is below 0.75 AND not a case/punctuation difference
    const aiTitle=(r.title||'').trim();
    const existTitle=(tape.title||'').trim();
    if(aiTitle&&_normTitle(aiTitle)!==_normTitle(existTitle)&&_titleSim(aiTitle,existTitle)<0.75){
      // Cross-check with OMDb: if AI title resolves to same imdb_id, skip
      let omdbSame=false;
      if(tape.imdb_id){
        try{
          const chk=await fetch(`/api/lookup?title=${encodeURIComponent(aiTitle)}&noai=1`,{signal:AbortSignal.timeout(5000),headers:hdrs});
          if(chk.ok){const cd=await chk.json();if(cd.imdb_id===tape.imdb_id)omdbSame=true;}
        }catch{}
      }
      if(!omdbSame){proposed.title=aiTitle;hasDiff=true;}
    }
    // Year: only flag if difference > 1 year
    const aiYear=parseInt(r.year)||0;
    const existYear=parseInt(tape.year)||0;
    if(aiYear&&existYear&&Math.abs(aiYear-existYear)>1){proposed.year=String(aiYear);hasDiff=true;}
    else if(aiYear&&!existYear){proposed.year=String(aiYear);hasDiff=true;}
    if(!hasDiff)continue;
    proposed.title=proposed.title||existTitle;
    try{
      await apiReq('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:'revalidate',data:proposed,thumb:tape.photo_face||tape.photo_thumbnail||null})});
      queued++;
    }catch(e){console.warn('Revalidate queue failed:',tape.id,e);}
  }
  if(!queued){
    statusEl.textContent='✓ All tapes match their photos — no differences found.';
    progWrap.style.display='none';return;
  }
  statusEl.textContent=`${queued} difference${queued>1?'s':''} queued — check the Review tab`;
  progWrap.style.display='none';
  setTimeout(()=>{modal.style.display='none';showRevPanel();},1200);
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

// ── FILL CANCEL ───────────────────────────────────────────────────────────
document.getElementById('fill-cancel-btn')?.addEventListener('click',()=>{
  _fillCancelled=true;
  const progWrap=document.getElementById('fill-progress');
  if(progWrap)progWrap.style.display='none';
});

// ── ZOOM SLIDER ───────────────────────────────────────────────────────────
(function(){
  const slider=document.getElementById('zoom-slider');
  if(!slider)return;
  const saved=parseFloat(localStorage.getItem('vhs-zoom'))||1;
  slider.value=saved;
  document.documentElement.style.setProperty('--inv-zoom',saved);
  slider.addEventListener('input',()=>{
    const z=parseFloat(slider.value)||1;
    document.documentElement.style.setProperty('--inv-zoom',z);
    localStorage.setItem('vhs-zoom',z);
  });
})();
