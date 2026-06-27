// ── BATCH UPLOAD ─────────────────────────────────────────────────────────
const fileInput=document.getElementById('file-input');

document.getElementById('btn-upload').addEventListener('click',()=>fileInput.click());
fileInput.addEventListener('change',async()=>{
  if(!fileInput.files.length)return;
  const files=[...fileInput.files]; fileInput.value='';
  for(const f of files){
    try{
      const [b64,thumb]=await Promise.all([fileToB64(f),fileToThumb(f)]);
      captureQueue.push({base64:b64,thumb});
    }catch(e){console.warn('Upload stage error:',e);}
  }
  renderQueue();
});

// ── CAPTURE → STAGE ───────────────────────────────────────────────────────
function cropFrame(){
  if(!video.srcObject||video.readyState<2)return null;
  const vw=video.videoWidth||640,vh=video.videoHeight||480;
  const cr=vidWrap.getBoundingClientRect();
  const vAR=vw/vh,cAR=cr.width/cr.height;
  let dw,dh,dx,dy;
  if(vAR>cAR){dh=cr.height;dw=cr.height*vAR;dx=(cr.width-dw)/2;dy=0;}
  else{dw=cr.width;dh=cr.width/vAR;dx=0;dy=(cr.height-dh)/2;}
  const bx=cropFrac.x*cr.width,by=cropFrac.y*cr.height,bw=cropFrac.w*cr.width,bh=cropFrac.h*cr.height;
  const sx=Math.max(0,(bx-dx)/dw*vw),sy=Math.max(0,(by-dy)/dh*vh);
  const sw=Math.min(vw-sx,bw/dw*vw),sh=Math.min(vh-sy,bh/dh*vh);
  const c=document.createElement('canvas');
  c.width=Math.round(sw);c.height=Math.round(sh);
  c.getContext('2d').drawImage(video,Math.round(sx),Math.round(sy),Math.round(sw),Math.round(sh),0,0,c.width,c.height);
  return c;
}

function capture(){
  if(isCapturing||barcodeMode)return;
  const frame=cropFrame();if(!frame)return;
  const fullThumb = frame.toDataURL('image/jpeg', .4);
  document.getElementById('thumb-img').src=fullThumb;
  document.getElementById('thumb-wrap').style.display='flex';
  if(cropEl.dataset.preset==='multispine'){
    const N=5;
    const sliceW=Math.round(frame.width/N);
    for(let i=0;i<N;i++){
      const c=document.createElement('canvas');
      c.width=sliceW;c.height=frame.height;
      c.getContext('2d').drawImage(frame,i*sliceW,0,sliceW,frame.height,0,0,sliceW,frame.height);
      captureQueue.push({base64:c.toDataURL('image/jpeg',.8).split(',')[1],thumb:c.toDataURL('image/jpeg',.4)});
    }
    toast(`Staged ${N} spine slices`,'ok',2000);
  }else{
    captureQueue.push({base64:frame.toDataURL('image/jpeg',.8).split(',')[1],thumb:fullThumb});
  }
  renderQueue();
}
btnCap.addEventListener('click',capture);

// ── CAPTURE QUEUE ─────────────────────────────────────────────────────────
const queueStrip=document.getElementById('queue-strip');
// Prevent any click inside the staging strip from bubbling up to vid-wrap (which would trigger capture)
queueStrip.addEventListener('click',e=>e.stopPropagation());

function renderQueue(){
  if(!captureQueue.length){queueStrip.classList.remove('on');queueStrip.innerHTML='';return;}
  queueStrip.classList.add('on');
  const n=captureQueue.length;
  // Buttons pinned left; images newest-first (index n-1) scrolling rightward
  const imgs=[...captureQueue].reverse().map((item,displayIdx)=>{
    const origIdx=n-1-displayIdx;
    const preview=item.thumb
      ?`<img src="${item.thumb}" alt="">`
      :`<span style="font-size:20px;width:60px;height:42px;display:flex;align-items:center;justify-content:center;border-radius:4px;border:1px solid var(--border2);background:var(--bg3);pointer-events:none;flex-shrink:0">📼</span>`;
    return `<div class="q-item">${preview}<button class="q-rm" data-i="${origIdx}">×</button></div>`;
  }).join('');
  queueStrip.innerHTML=
    `<div class="q-actions"><button id="btn-process-q">⬤ Analyze ${n}</button>${n>1?`<button id="btn-clear-q">Clear</button>`:''}<span class="q-count">Space=stage · Enter=analyze</span></div><div class="q-imgs">${imgs}</div>`;
  queueStrip.querySelectorAll('.q-rm').forEach(btn=>btn.addEventListener('click',e=>{
    e.stopPropagation();captureQueue.splice(+btn.dataset.i,1);renderQueue();
  }));
  document.getElementById('btn-process-q')?.addEventListener('click',e=>{e.stopPropagation();processQueue();});
  document.getElementById('btn-clear-q')?.addEventListener('click',e=>{e.stopPropagation();captureQueue=[];renderQueue();});
}

// Called directly by camera.js when a barcode is detected — bypasses the staging queue
// so barcode lookups never block or compete with Ollama image analysis jobs.
// If the barcode resolves to a title via UPC/OMDb, auto-confirms straight to collection
// (no review card, no Ollama call). If lookup fails, falls back to a review card.
async function addBarcodeCard(code){
  const meta=await lookupBarcode(code).catch(()=>null);

  if(meta&&meta.title){
    // Duplicate guard (title-based)
    const dup=findDup(meta.title);
    if(dup){toast(`Already in collection: "${dup.title}"`, 'err', 5000);return;}
    // Also check barcode-based dup
    const bcDup=inventory.find(t=>t.barcode===code);
    if(bcDup){toast(`Already in collection: "${bcDup.title||code}"`, 'err', 5000);return;}

    const useUpcId=code&&/^\d{8,14}$/.test(code)&&!inventory.find(t=>t.id===code);
    const recId=useUpcId?code:await nextId();
    const rec={
      id:recId,
      title:meta.title,
      year:meta.year||'',
      label:meta.label||'',
      format:'VHS',
      condition:'good',
      condition_notes:'',
      status:'in_collection',
      barcode:code,
      tags:[],
      value_low:'',
      value_high:'',
      imdb_id:meta.imdb_id||'',
      photos:[],
      photo_thumbnail:'',
      photo_spine:null,
      photo_face:null,
      scanned_at:new Date().toISOString(),
    };
    await dbAdd(rec);
    inventory.push(rec);
    renderInv();updateCount();
    toast(`Added: ${rec.title}`,'ok',3000);
    _flashInvRow(rec.id);
  } else {
    // No match — show a review card so user can enter the title manually
    const uid=++uidSeq;
    const card={uid,data:{barcode:code,format:'VHS',condition:'good',status:'in_collection',notes:''},source:'barcode',thumb:null,expanded:true,jobId:null,processingState:'ready',failReason:''};
    cards.push(card);
    showRevPanel();
    renderCards();
    toast(`No match for ${code} — enter title manually`,'warn',4000);
  }
}

async function processQueue(){
  if(!captureQueue.length)return;
  const queue=[...captureQueue];
  captureQueue=[];renderQueue();

  const barcodeItems=queue.filter(item=>item.barcode);
  const imageItems=queue.filter(item=>!item.barcode);

  // Process barcode items: same auto-confirm logic as addBarcodeCard
  for(const item of barcodeItems){
    await addBarcodeCard(item.barcode);
  }

  if(!imageItems.length)return;

  if(apiKey){
    showRevPanel();setRevLoading(true);
    for(let i=0;i<imageItems.length;i++){
      setRevMsg(`Analyzing image ${i+1} of ${imageItems.length}…`);
      try{
        const results=await callAI(imageItems[i].base64);
        const wasEmpty=!cards.length;
        results.forEach((d,j)=>addCard({...d,condition:d.condition||'good',status:'in_collection',notes:''},null,imageItems[i].thumb,wasEmpty&&i===0&&j===0));
        if(results.length)renderCards();
      }catch(e){console.warn('Queue process (client):',e);}
    }
    setRevLoading(false);
    if(!cards.length&&!barcodeItems.length)showRevErr("Couldn't identify any tapes — try adjusting the crop box or improve lighting.");
    return;
  }

  let submitted=0;
  for(const item of imageItems){
    try{
      const r=await fetch('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({image:item.base64,thumb:item.thumb})});
      if(r.ok){
        const {id:uploadJobId}=await r.json();
        const card={uid:++uidSeq,data:{format:'VHS',condition:'good',status:'in_collection',notes:''},source:null,thumb:item.thumb,expanded:false,jobId:uploadJobId,srcJobId:uploadJobId,processingState:submitted===0&&!barcodeItems.length?'processing':'queued',failReason:'',inflightSince:new Date().toISOString()};
        cards.push(card);
        submitted++;
      }
    }catch(e){console.warn('Job submit error:',e);}
  }
  if(submitted){
    showRevPanel();
    renderCards();
    toast(`${submitted} image${submitted>1?'s':''} queued — Ollama is analyzing…`,'ok',4000);
  }
}

// ── JOB POLLING ──────────────────────────────────────────────────────────
let jobPollTimer=null;
// session-only set: prevents re-adding an item after confirm/discard within the same session
let seenJobIds=new Set();
function _seenAdd(id){seenJobIds.add(id);}
function _seenDel(id){seenJobIds.delete(id);}

async function pollReviewItems(){
  try{
    const items=await fetch('/api/review/pending').then(r=>r.json());
    if(!Array.isArray(items))return;
    let changed=0;
    for(const item of items){
      // Skip if we've seen this review_item OR its parent upload_job (handles race where
      // user confirmed a queued card but server already finished before the DELETE arrived)
      if(seenJobIds.has(item.id)||seenJobIds.has(item.job_id))continue;
      // Check if a processing card from the same upload_job already exists → transition it
      const existing=cards.find(c=>c.srcJobId===item.job_id&&c.processingState==='processing');
      if(!existing&&cards.some(c=>c.jobId===item.id))continue; // already shown
      const data={...((typeof item.data==='object'?item.data:{})||{}),condition:item.data?.condition||'good',status:item.data?.status||'in_collection'};
      if(existing){
        // Upgrade the processing card to this review_item; preserve any title the user typed
        const userTitle=(existing.data.title||'').trim();
        existing.jobId=item.id; // now tracks review_item id for cleanup
        existing.data=userTitle?{...data,title:userTitle}:data;
        existing.processingState=item.status==='failed'?'failed':'ready';
        existing.failReason=item.fail_reason||'';
        // Promote the next queued card to processing now that the server has freed a slot
        const nextQueued=cards.find(c=>c.processingState==='queued');
        if(nextQueued)nextQueued.processingState='processing';
      }else{
        const wasEmpty=!cards.length;
        addCard(data,item.source||'scan',item.thumb,wasEmpty,item.id,item.status==='failed'?'failed':'ready',item.fail_reason||'');
        showRevPanel();
      }
      changed++;
    }
    if(changed)renderCards();
  }catch(e){console.warn('Review poll error:',e);}
}

async function resumeInflightJobs(){
  try{
    const jobs=await fetch('/api/jobs/inflight').then(r=>r.json());
    if(!Array.isArray(jobs)||!jobs.length)return;
    let added=0;
    for(let i=0;i<jobs.length;i++){
      const job=jobs[i];
      if(seenJobIds.has(job.id)||cards.some(c=>c.srcJobId===job.id||c.jobId===job.id))continue;
      // Pending jobs from server: first (or currently-processing) = 'processing', rest = 'queued'
      const state=job.status==='processing'?'processing':'queued';
      const card={uid:++uidSeq,data:{format:'VHS',condition:'good',status:'in_collection',notes:''},source:null,thumb:job.thumb,expanded:false,jobId:job.id,srcJobId:job.id,processingState:state,failReason:'',inflightSince:job.created_at};
      cards.push(card);
      added++;
    }
    if(added){showRevPanel();renderCards();}
  }catch(e){console.warn('Resume inflight error:',e);}
}

let _pollInterval=5000;
function startJobPoller(){
  if(jobPollTimer)return;
  const schedulePoll=()=>{
    jobPollTimer=setTimeout(async()=>{
      const t0=Date.now();
      await Promise.all([pollReviewItems(),updateQueueStatus()]);
      const elapsed=Date.now()-t0;
      const total=cards.length;
      if(total>=75)console.info(`[vhs-queue] ${total} cards in review, poll took ${elapsed}ms`);
      if(total>=100)_pollInterval=Math.min(15000,_pollInterval+1000);
      else _pollInterval=5000;
      schedulePoll();
    },_pollInterval);
  };
  resumeInflightJobs();
  pollReviewItems();
  updateQueueStatus();
  schedulePoll();
}

// ── QUEUE STATUS ─────────────────────────────────────────────────────────
const queueStatusEl=document.getElementById('queue-status');
let queueBusy=false;
async function updateQueueStatus(){
  if(queueBusy)return;queueBusy=true;
  try{
    const s=await fetch('/api/jobs/status').then(r=>r.json());
    const active=(s.pending||0)+(s.processing||0);
    const retrying=s.failed||0;
    const newReady=s.review_pending||0;
    if(!active&&!retrying&&!newReady){queueStatusEl.style.display='none';return;}
    queueStatusEl.style.display='flex';
    const parts=[];
    if(s.pending)parts.push(`<span class="qs-badge qs-pending">⏳ ${s.pending} queued</span>`);
    if(s.processing)parts.push(`<span class="qs-badge qs-proc">⟳ ${s.processing} analyzing</span>`);
    if(retrying)parts.push(`<span class="qs-badge qs-pending">↺ ${retrying} retrying</span>`);
    if(newReady)parts.push(`<span class="qs-badge" style="background:rgba(61,187,61,.15);color:var(--green);border:1px solid rgba(61,187,61,.3);cursor:pointer" title="Click to open review panel" id="qs-ready-btn">✓ ${newReady} ready</span>`);
    queueStatusEl.innerHTML=`<span style="font-size:10px;color:var(--text3)">Queue:</span>${parts.join('')}`;
    document.getElementById('qs-ready-btn')?.addEventListener('click',()=>{pollReviewItems();showRevPanel();setActiveTab('review');});
  }catch{}finally{queueBusy=false;}
}
