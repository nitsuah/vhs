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
  const fullThumb=frame.toDataURL('image/jpeg',.6);
  document.getElementById('thumb-img').src=fullThumb;
  document.getElementById('thumb-wrap').style.display='flex';
  if(cropEl.dataset.preset==='multispine'){
    const N=4;
    const sliceW=Math.round(frame.width/N);
    for(let i=0;i<N;i++){
      const c=document.createElement('canvas');
      c.width=sliceW;c.height=frame.height;
      c.getContext('2d').drawImage(frame,i*sliceW,0,sliceW,frame.height,0,0,sliceW,frame.height);
      captureQueue.push({base64:c.toDataURL('image/jpeg',.92).split(',')[1],thumb:c.toDataURL('image/jpeg',.6)});
    }
    toast(`Staged ${N} spine slices`,'ok',2000);
  }else{
    captureQueue.push({base64:frame.toDataURL('image/jpeg',.92).split(',')[1],thumb:fullThumb});
  }
  renderQueue();
}
btnCap.addEventListener('click',capture);

// ── CAPTURE QUEUE ─────────────────────────────────────────────────────────
const queueStrip=document.getElementById('queue-strip');

function renderQueue(){
  if(!captureQueue.length){queueStrip.classList.remove('on');queueStrip.innerHTML='';return;}
  queueStrip.classList.add('on');
  queueStrip.innerHTML=captureQueue.map((item,i)=>
    `<div class="q-item"><img src="${item.thumb}" alt=""><button class="q-rm" data-i="${i}">×</button></div>`
  ).join('')+
  `<button id="btn-process-q">⬤ Analyze ${captureQueue.length}</button>`+
  (captureQueue.length>1?`<button id="btn-clear-q">Clear</button>`:'')+
  `<span class="q-count">Space = stage · Enter = analyze</span>`;
  queueStrip.querySelectorAll('.q-rm').forEach(btn=>btn.addEventListener('click',e=>{
    e.stopPropagation();captureQueue.splice(+btn.dataset.i,1);renderQueue();
  }));
  document.getElementById('btn-process-q')?.addEventListener('click',processQueue);
  document.getElementById('btn-clear-q')?.addEventListener('click',()=>{captureQueue=[];renderQueue();});
}

async function processQueue(){
  if(!captureQueue.length)return;
  const queue=[...captureQueue];
  captureQueue=[];renderQueue();

  if(apiKey){
    showRevPanel();setRevLoading(true);
    for(let i=0;i<queue.length;i++){
      setRevMsg(`Analyzing image ${i+1} of ${queue.length}…`);
      try{
        const results=await callAI(queue[i].base64);
        const wasEmpty=!cards.length;
        results.forEach((d,j)=>addCard({...d,condition:d.condition||'good',status:'in_collection',notes:''},null,queue[i].thumb,wasEmpty&&i===0&&j===0));
        if(results.length)renderCards();
      }catch(e){console.warn('Queue process (client):',e);}
    }
    setRevLoading(false);
    if(!cards.length)showRevErr("Couldn't identify any tapes — try adjusting the crop box or improve lighting.");
    return;
  }

  let submitted=0;
  for(const item of queue){
    try{
      const r=await fetch('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({image:item.base64,thumb:item.thumb})});
      if(r.ok){
        const {id:jobId}=await r.json();
        addCard({format:'VHS',condition:'good',status:'in_collection',notes:''},null,item.thumb,false,jobId,'processing');
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
// session-only: prevents within-session duplicate cards; NOT persisted so completed jobs survive page refresh
let seenJobIds=new Set();
function _seenAdd(id){seenJobIds.add(id);}
function _seenDel(id){seenJobIds.delete(id);}
async function pollReadyJobs(){
  try{
    const jobs=await fetch('/api/jobs/ready').then(r=>r.json());
    if(!Array.isArray(jobs)||!jobs.length)return;
    let changed=0;
    for(const job of jobs){
      if(seenJobIds.has(job.id))continue; // user confirmed/discarded this session
      const existing=cards.find(c=>c.jobId===job.id&&c.processingState==='processing');
      if(!existing&&cards.some(c=>c.jobId===job.id))continue; // already visible as ready/failed
      if(job.status==='failed'){
        if(existing){
          existing.processingState='failed';
          existing.failReason=job.error||'Analysis failed';
        }else{
          addCard({format:'VHS',condition:'good',status:'in_collection',notes:''},null,job.thumb,false,job.id,'failed',job.error||'Analysis failed');
          showRevPanel();
        }
        changed++;
        continue;
      }
      const results=Array.isArray(job.result)?job.result:[];
      if(!results.length){
        if(existing){
          existing.processingState='failed';
          existing.failReason='No tapes detected in image';
        }else{
          fetch(`/api/jobs/${encodeURIComponent(job.id)}`,{method:'DELETE'}).catch(()=>{});
        }
        changed++;
        continue;
      }
      if(existing){
        const d=results[0];
        if(!existing.data.title)existing.data.title=d.title||'';
        if(d.year)existing.data.year=d.year;
        if(d.label)existing.data.label=d.label;
        if(d.format)existing.data.format=d.format||'VHS';
        if(d.condition)existing.data.condition=d.condition||'good';
        existing.processingState='ready';
        for(let i=1;i<results.length;i++){
          addCard({...results[i],condition:results[i].condition||'good',status:'in_collection',notes:''},null,job.thumb,false,null,'ready');
        }
      }else{
        const wasEmpty=!cards.length;
        results.forEach((d,j)=>addCard({...d,condition:d.condition||'good',status:'in_collection',notes:''},null,job.thumb,wasEmpty&&j===0,job.id,'ready'));
        showRevPanel();
      }
      changed++;
    }
    if(changed)renderCards();
  }catch(e){console.warn('Job poll error:',e);}
}
async function resumeInflightJobs(){
  try{
    const jobs=await fetch('/api/jobs/inflight').then(r=>r.json());
    if(!Array.isArray(jobs)||!jobs.length)return;
    let added=0;
    for(const job of jobs){
      if(seenJobIds.has(job.id)||cards.some(c=>c.jobId===job.id))continue;
      const card={uid:++uidSeq,data:{format:'VHS',condition:'good',status:'in_collection',notes:''},source:null,thumb:job.thumb,expanded:false,jobId:job.id,processingState:'processing',failReason:'',inflightSince:job.created_at};
      cards.push(card);
      added++;
    }
    if(added){showRevPanel();renderCards();}
  }catch(e){console.warn('Resume inflight error:',e);}
}
function startJobPoller(){
  if(jobPollTimer)return;
  jobPollTimer=setInterval(()=>{pollReadyJobs();updateQueueStatus();},5000);
  resumeInflightJobs();
  pollReadyJobs();
  updateQueueStatus();
}

// ── QUEUE STATUS ─────────────────────────────────────────────────────────
const queueStatusEl=document.getElementById('queue-status');
let queueBusy=false;
async function updateQueueStatus(){
  if(queueBusy)return;queueBusy=true;
  try{
    const s=await fetch('/api/jobs/status').then(r=>r.json());
    const active=(s.pending||0)+(s.processing||0);
    const failed=s.failed||0;
    const newReady=Math.max(0,(s.done||0)-seenJobIds.size);
    if(!active&&!failed&&!newReady){queueStatusEl.style.display='none';return;}
    queueStatusEl.style.display='flex';
    const parts=[];
    if(s.pending)parts.push(`<span class="qs-badge qs-pending">⏳ ${s.pending} queued</span>`);
    if(s.processing)parts.push(`<span class="qs-badge qs-proc">⟳ ${s.processing} analyzing</span>`);
    if(newReady)parts.push(`<span class="qs-badge" style="background:rgba(61,187,61,.15);color:var(--green);border:1px solid rgba(61,187,61,.3);cursor:pointer" title="Click to open review panel" id="qs-ready-btn">✓ ${newReady} ready</span>`);
    if(failed)parts.push(`<span class="qs-badge qs-failed" style="cursor:pointer" title="Click to retry failed jobs" id="qs-failed-btn">⚠ ${failed} failed</span>`);
    queueStatusEl.innerHTML=`<span style="font-size:10px;color:var(--text3)">Queue:</span>${parts.join('')}`;
    document.getElementById('qs-ready-btn')?.addEventListener('click',()=>{pollReadyJobs();showRevPanel();});
    document.getElementById('qs-failed-btn')?.addEventListener('click',async()=>{
      const r=await fetch('/api/jobs/retry-failed',{method:'POST'});
      const d=await r.json();
      if(d.requeued)toast(`Re-queued ${d.requeued} failed job${d.requeued>1?'s':''}…`,'ok');
      updateQueueStatus();
    });
  }catch{}finally{queueBusy=false;}
}
