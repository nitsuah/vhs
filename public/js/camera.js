// ── CAMERA ───────────────────────────────────────────────────────────────
const video=document.getElementById('video');
const camSel=document.getElementById('camera-select');
const isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function showNoCam(msg){
  document.getElementById('no-cam-msg').textContent=msg||'Camera unavailable';
  document.getElementById('no-cam').style.display='flex';
  video.style.display='none';
  document.getElementById('crop').style.display='none';
}
function hideNoCam(){
  document.getElementById('no-cam').style.display='none';
  video.style.display='';
  document.getElementById('crop').style.display='';
}

const btnEnableCam=document.getElementById('btn-enable-cam');

function camApiBlocked(){
  return location.protocol!=='https:'&&location.hostname!=='localhost'&&location.hostname!=='127.0.0.1';
}

async function initCamera(){
  if(camApiBlocked()){
    showNoCam('Camera requires HTTPS.\nOpen this app via https:// or from localhost.');
    return;
  }
  if(!navigator.mediaDevices?.getUserMedia){
    showNoCam('Camera not available in this browser.\nTry Chrome or Safari over HTTPS.');
    return;
  }
  btnEnableCam.disabled=true;
  btnEnableCam.textContent='Requesting…';
  try{
    const probe=await navigator.mediaDevices.getUserMedia({
      video: isMobile ? {facingMode:{ideal:'environment'}} : true
    });
    probe.getTracks().forEach(t=>t.stop());
    await populateCameras();
    currentFacing='environment';
    const defaultDev=isMobile?null:cameraDevices[0]?.deviceId;
    await startStream(defaultDev);
    checkTorch();
  }catch(e){
    console.warn('Camera:',e.name,e.message);
    if(e.name==='NotAllowedError'||e.name==='PermissionDeniedError'){
      const hint=isMobile
        ?'Tap the lock/info icon in your browser address bar to allow camera, then tap Enable again.'
        :'Allow camera access in your browser and click Enable again.';
      showNoCam('Camera permission denied.\n'+hint);
    }else if(e.name==='NotFoundError'){
      showNoCam('No camera found on this device.');
    }else{
      showNoCam('Could not start camera: '+e.message);
    }
  }finally{
    btnEnableCam.disabled=false;
    btnEnableCam.textContent='Enable Camera';
  }
}
let currentFacing='environment';
async function startStream(deviceId){
  if(video.srcObject)video.srcObject.getTracks().forEach(t=>t.stop());
  try{
    const videoConstraints=deviceId
      ? {deviceId:{exact:deviceId}}
      : isMobile
        ? {facingMode:{ideal:currentFacing},width:{ideal:1920},height:{ideal:1080},focusMode:{ideal:'continuous'}}
        : {width:{ideal:1920},height:{ideal:1080}};
    const constraints={video:videoConstraints,audio:false};
    video.srcObject=await navigator.mediaDevices.getUserMedia(constraints);
    await video.play();
    hideNoCam();
    updateCrop();
    if(!barcodeMode)checkTorch();
    if(barcodeMode&&barcodeRdr)startBarcodeLoop();
  }catch(e){
    showNoCam(e.name==='NotAllowedError'?'Camera permission denied.\nTap Enable to retry.':'Could not start camera: '+e.message);
  }
}
camSel.addEventListener('change',()=>startStream(camSel.value));
btnEnableCam.addEventListener('click',()=>initCamera());

// ── CROP BOX ─────────────────────────────────────────────────────────────
const vidWrap=document.getElementById('vid-wrap');
const cropEl=document.getElementById('crop');
const cropHandle=document.getElementById('crop-handle');
function updateCrop(){
  const r=vidWrap.getBoundingClientRect();
  cropEl.style.left=cropFrac.x*r.width+'px'; cropEl.style.top=cropFrac.y*r.height+'px';
  cropEl.style.width=cropFrac.w*r.width+'px'; cropEl.style.height=cropFrac.h*r.height+'px';
}
function startDrag(cx,cy){
  dragging=true; const r=vidWrap.getBoundingClientRect();
  dragOrig={mx:cx,my:cy,fx:cropFrac.x,fy:cropFrac.y,rw:r.width,rh:r.height};
}
function startResize(cx,cy){
  resizing=true; const r=vidWrap.getBoundingClientRect();
  dragOrig={mx:cx,my:cy,fw:cropFrac.w,fh:cropFrac.h,rw:r.width,rh:r.height};
}
function onMove(cx,cy){
  if(dragging){
    const dx=(cx-dragOrig.mx)/dragOrig.rw,dy=(cy-dragOrig.my)/dragOrig.rh;
    cropFrac.x=Math.max(0,Math.min(dragOrig.fx+dx,1-cropFrac.w));
    cropFrac.y=Math.max(0,Math.min(dragOrig.fy+dy,1-cropFrac.h));
    updateCrop();
  }
  if(resizing){
    const dx=(cx-dragOrig.mx)/dragOrig.rw,dy=(cy-dragOrig.my)/dragOrig.rh;
    cropFrac.w=Math.max(0.1,Math.min(dragOrig.fw+dx,1-cropFrac.x));
    cropFrac.h=Math.max(0.08,Math.min(dragOrig.fh+dy,1-cropFrac.y));
    updateCrop();
  }
}
cropEl.addEventListener('mousedown',e=>{
  if(e.target===cropHandle)return;
  startDrag(e.clientX,e.clientY); e.preventDefault();
});
cropHandle.addEventListener('mousedown',e=>{
  startResize(e.clientX,e.clientY); e.stopPropagation(); e.preventDefault();
});
document.addEventListener('mousemove',e=>onMove(e.clientX,e.clientY));
document.addEventListener('mouseup',()=>{dragging=false;resizing=false;});
cropEl.addEventListener('touchstart',e=>{
  if(e.target===cropHandle)return;
  const t=e.touches[0]; startDrag(t.clientX,t.clientY); e.preventDefault();
},{passive:false});
cropHandle.addEventListener('touchstart',e=>{
  const t=e.touches[0]; startResize(t.clientX,t.clientY); e.stopPropagation(); e.preventDefault();
},{passive:false});
document.addEventListener('touchmove',e=>{
  if(dragging||resizing){const t=e.touches[0];onMove(t.clientX,t.clientY);e.preventDefault();}
},{passive:false});
document.addEventListener('touchend',()=>{dragging=false;resizing=false;});
window.addEventListener('resize',updateCrop);

// ── BARCODE ──────────────────────────────────────────────────────────────
const barcodeOverlay=document.getElementById('barcode-overlay');
const btnBarcode=document.getElementById('btn-barcode');
const btnCap=document.getElementById('btn-cap');
const _barcodeBtnHTML=btnBarcode.innerHTML; // preserve the SVG icon

async function toggleBarcodeMode(){
  const btnTorch=document.getElementById('btn-torch');
  if(barcodeMode){
    barcodeMode=false;
    btnBarcode.classList.remove('active');btnBarcode.innerHTML=_barcodeBtnHTML;
    barcodeOverlay.classList.remove('on');cropEl.style.display='';btnCap.disabled=false;
    barcodeRdr=null;
    if(torchOn){
      torchOn=false;btnTorch.classList.remove('active');btnTorch.textContent='🔦';
    }
    // Use currentFacing (not stale camSel) so rear camera is restored
    await startStream(null);
  }else{
    btnBarcode.innerHTML='<span style="font-size:11px">⟳</span>';btnBarcode.disabled=true;
    try{await loadScript('https://unpkg.com/@zxing/library@0.20.0/umd/index.min.js');}
    catch{btnBarcode.innerHTML=_barcodeBtnHTML;btnBarcode.disabled=false;return;}
    barcodeMode=true;
    btnBarcode.classList.add('active');btnBarcode.innerHTML=_barcodeBtnHTML;btnBarcode.disabled=false;
    barcodeOverlay.classList.add('on');cropEl.style.display='none';btnCap.disabled=false;
    currentFacing='environment';
    await startBarcodeStream();
    checkTorch();
    startBarcodeLoop();
  }
}

async function startBarcodeStream(){
  if(video.srcObject)video.srcObject.getTracks().forEach(t=>t.stop());
  try{
    const vidConstraint=isMobile
      ?{facingMode:{ideal:currentFacing},width:{ideal:1920},height:{ideal:1080}}
      :{width:{ideal:1920},height:{ideal:1080}};
    video.srcObject=await navigator.mediaDevices.getUserMedia({video:vidConstraint,audio:false});
    await video.play();
    document.getElementById('no-cam').style.display='none';
    video.style.display='';
  }catch{
    await startStream(null);
  }
}

function updateBcTarget(){
  const t=document.getElementById('bc-target');
  if(t){t.style.width=bcZoom*100+'%';t.style.height=bcZoom*40+'%';}
  const lbl=document.getElementById('bc-zoom-label');
  if(lbl)lbl.textContent=Math.round(bcZoom*100)+'%';
}
document.getElementById('bc-zoom-out').addEventListener('click',()=>{
  bcZoom=Math.max(0.3,Math.round((bcZoom-.1)*10)/10);updateBcTarget();
});
document.getElementById('bc-zoom-in').addEventListener('click',()=>{
  bcZoom=Math.min(0.9,Math.round((bcZoom+.1)*10)/10);updateBcTarget();
});
updateBcTarget();

function bcAdaptiveThreshold(imgData){
  const d=imgData.data,n=d.length;
  let sum=0;
  for(let i=0;i<n;i+=4)sum+=d[i];
  const mean=sum/(n/4);
  for(let i=0;i<n;i+=4){const v=d[i]<mean?0:255;d[i]=d[i+1]=d[i+2]=v;}
  return imgData;
}

function bcSharpen(imgData){
  const w=imgData.width,h=imgData.height,d=imgData.data;
  const src=new Uint8ClampedArray(d);
  const k=[0,-1,0,-1,5,-1,0,-1,0];
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)for(let c=0;c<3;c++){
    let v=0;
    for(let ky=-1;ky<=1;ky++)for(let kx=-1;kx<=1;kx++)
      v+=src[((y+ky)*w+(x+kx))*4+c]*k[(ky+1)*3+(kx+1)];
    d[(y*w+x)*4+c]=Math.max(0,Math.min(255,v));
  }
  return imgData;
}

function buildBcVariant(vw,vh,v,fullFrame=false){
  const sw=fullFrame?vw:Math.round(vw*bcZoom);
  const sh=fullFrame?vh:Math.round(vh*bcZoom*.4);
  const sx=fullFrame?0:Math.round((vw-sw)/2);
  const sy=fullFrame?0:Math.round((vh-sh)/2);
  const scale=v===1?2:1;
  const c=document.createElement('canvas');
  c.width=sw*scale;c.height=sh*scale;
  const ctx=c.getContext('2d');
  if(v===0){
    ctx.filter='grayscale(100%) contrast(220%) brightness(110%)';
    ctx.drawImage(video,sx,sy,sw,sh,0,0,c.width,c.height);
  }else if(v===1){
    ctx.filter='grayscale(100%) contrast(300%) brightness(108%)';
    ctx.drawImage(video,sx,sy,sw,sh,0,0,c.width,c.height);
  }else if(v===2){
    ctx.filter='grayscale(100%)';
    ctx.drawImage(video,sx,sy,sw,sh,0,0,c.width,c.height);
    ctx.putImageData(bcAdaptiveThreshold(ctx.getImageData(0,0,c.width,c.height)),0,0);
  }else{
    ctx.filter='grayscale(100%)';
    ctx.drawImage(video,sx,sy,sw,sh,0,0,c.width,c.height);
    ctx.putImageData(bcAdaptiveThreshold(bcSharpen(ctx.getImageData(0,0,c.width,c.height))),0,0);
  }
  return c;
}

function flashBcTarget(){
  const t=document.getElementById('bc-target');
  if(!t)return;
  t.classList.remove('hit');
  void t.offsetWidth;
  t.classList.add('hit');
  setTimeout(()=>t.classList.remove('hit'),500);
}

function _fireBarcodeResult(code){
  const now=Date.now();
  if(code===lastCode.val&&now-lastCode.t<4000)return;
  lastCode={val:code,t:now};
  beep();flashBcTarget();
  const bcLabelEl=document.getElementById('bc-label');
  if(bcLabelEl)bcLabelEl.textContent=`✓ ${code}`;
  setTimeout(()=>{if(bcLabelEl)bcLabelEl.textContent='Hold barcode in box — or tap 📷';},3500);
  const bcDup=inventory.find(t=>t.barcode&&t.barcode===code);
  if(bcDup)toast(`Already in collection: "${bcDup.title||code}"`, 'err', 5000);
  const uid=++uidSeq;
  cards.push({uid,data:{title:bcDup?bcDup.title:'',barcode:code,format:'VHS',condition:'good',status:'in_collection',notes:''},source:'barcode',thumb:null,expanded:true,jobId:null,processingState:bcDup?'ready':'processing',failReason:''});
  renderCards();showRevPanel();
  if(!bcDup){
    lookupBarcode(code).then(async meta=>{
      const card=cards.find(c=>c.uid===uid);
      if(card&&meta&&!card.data.title){
        card.data.title=meta.title;
        if(meta.label)card.data.label=meta.label;
        if(meta.year)card.data.year=meta.year;
        toast(`Barcode matched: ${meta.title}`,'ok');
        const enriched=await lookupMetadata(meta.title).catch(()=>null);
        if(enriched){
          const c2=cards.find(c=>c.uid===uid);if(!c2){return;}
          if(enriched.year&&!c2.data.year)c2.data.year=enriched.year;
          if(enriched.label&&!c2.data.label)c2.data.label=enriched.label;
          if(enriched.format)c2.data.format=enriched.format;
          if(enriched.value_low)c2.data.value_low=enriched.value_low;
          if(enriched.value_high)c2.data.value_high=enriched.value_high;
        }
      }else if(card&&!meta){
        toast('No barcode match — enter title manually','warn',3000);
      }
      const c3=cards.find(c=>c.uid===uid);
      if(c3){c3.processingState='ready';renderCards();}
    }).catch(()=>{
      const c=cards.find(c=>c.uid===uid);
      if(c){c.processingState='ready';renderCards();}
    });
  }
}

function startBarcodeLoop(){
  const useNativeDetector='BarcodeDetector' in window;
  let nativeDetector=null;
  if(useNativeDetector){
    try{
      nativeDetector=new BarcodeDetector({formats:['ean_13','upc_a','upc_e','ean_8','code_128','code_39','itf']});
    }catch{nativeDetector=null;}
  }

  if(!nativeDetector){
    if(!window.ZXing)return;
    const hints=new Map([
      [ZXing.DecodeHintType.TRY_HARDER,true],
      [ZXing.DecodeHintType.POSSIBLE_FORMATS,[
        ZXing.BarcodeFormat.EAN_13,ZXing.BarcodeFormat.UPC_A,ZXing.BarcodeFormat.UPC_E,
        ZXing.BarcodeFormat.EAN_8,ZXing.BarcodeFormat.CODE_128,
        ZXing.BarcodeFormat.CODE_39,ZXing.BarcodeFormat.ITF,
      ]]
    ]);
    barcodeRdr=new ZXing.BrowserMultiFormatReader(hints);
  }

  let busy=false;
  const candidates=new Map();
  let noDetectSince=Date.now();

  const loop=async()=>{
    if(!barcodeMode)return;
    if(!busy&&video.readyState>=2&&video.videoWidth>0){
      busy=true;
      try{
        let code=null;
        if(nativeDetector){
          const results=await nativeDetector.detect(video).catch(()=>[]);
          if(results.length)code=results[0].rawValue;
        }else{
          const vw=video.videoWidth,vh=video.videoHeight;
          let result=null;
          for(let v=0;v<5&&!result;v++){
            try{result=await barcodeRdr.decodeFromCanvas(buildBcVariant(vw,vh,v%4,v===4));}catch{}
          }
          if(result){
            const raw=result.getText(),now=Date.now();
            const prev=candidates.get(raw)||{count:0,firstSeen:now};
            if(now-prev.firstSeen>2000){candidates.set(raw,{count:1,firstSeen:now});}
            else{
              const c=prev.count+1;
              candidates.set(raw,{count:c,firstSeen:prev.firstSeen});
              if(c>=2)code=raw;
            }
          }
        }
        if(code){
          candidates.clear();
          noDetectSince=Date.now();
          _fireBarcodeResult(code);
        } else {
          const bcLbl=document.getElementById('bc-label');
          if(bcLbl&&Date.now()-noDetectSince>8000){
            bcLbl.textContent='No barcode found — try the 📷 button';
          }
        }
      }catch{}
      busy=false;
    }
    if(barcodeMode)setTimeout(loop,nativeDetector?80:120);
  };
  loop();
}

async function toggleTorch(){
  const btnTorch=document.getElementById('btn-torch');
  const track=video.srcObject?.getVideoTracks()[0];
  if(!track)return;
  torchOn=!torchOn;
  try{
    await track.applyConstraints({advanced:[{torch:torchOn}]});
    btnTorch.classList.toggle('active',torchOn);
    btnTorch.textContent='🔦';
  }catch{
    toast('Torch not supported on this camera','err');
    torchOn=false;btnTorch.classList.remove('active');
  }
}

async function snapAndDecode(){
  if(!video.videoWidth)return;
  let code=null;
  if('BarcodeDetector' in window){
    try{
      const det=new BarcodeDetector({formats:['ean_13','upc_a','upc_e','ean_8','code_128','code_39','itf']});
      const results=await det.detect(video);
      if(results.length)code=results[0].rawValue;
    }catch{}
  }
  if(!code&&window.ZXing&&barcodeRdr){
    const vw=video.videoWidth,vh=video.videoHeight;
    for(let v=0;v<5&&!code;v++){
      try{const r=await barcodeRdr.decodeFromCanvas(buildBcVariant(vw,vh,v%4,v===4));if(r)code=r.getText();}catch{}
    }
  }
  if(code){_fireBarcodeResult(code);}
  else{toast('No barcode detected — try adjusting zoom or lighting','err');}
}
document.getElementById('btn-torch').addEventListener('click',toggleTorch);
btnBarcode.addEventListener('click',toggleBarcodeMode);

// ── NATIVE CAMERA BARCODE FALLBACK ────────────────────────────────────────
function buildBcVariantFromSrc(src,vw,vh,v){
  const scale=v===1?2:1;
  const c=document.createElement('canvas');
  c.width=vw*scale;c.height=vh*scale;
  const ctx=c.getContext('2d');
  if(v===0){
    ctx.filter='grayscale(100%) contrast(220%) brightness(110%)';
    ctx.drawImage(src,0,0,c.width,c.height);
  }else if(v===1){
    ctx.filter='grayscale(100%) contrast(300%) brightness(108%)';
    ctx.drawImage(src,0,0,c.width,c.height);
  }else if(v===2){
    ctx.filter='grayscale(100%)';
    ctx.drawImage(src,0,0,c.width,c.height);
    ctx.putImageData(bcAdaptiveThreshold(ctx.getImageData(0,0,c.width,c.height)),0,0);
  }else{
    ctx.filter='grayscale(100%)';
    ctx.drawImage(src,0,0,c.width,c.height);
    ctx.putImageData(bcAdaptiveThreshold(bcSharpen(ctx.getImageData(0,0,c.width,c.height))),0,0);
  }
  return c;
}
async function decodeBarcodeFromFile(file){
  const url=URL.createObjectURL(file);
  try{
    await loadScript('https://unpkg.com/@zxing/library@0.20.0/umd/index.min.js');
    const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url;});
    const hints=new Map([[ZXing.DecodeHintType.POSSIBLE_FORMATS,[
      ZXing.BarcodeFormat.EAN_13,ZXing.BarcodeFormat.UPC_A,ZXing.BarcodeFormat.UPC_E,
      ZXing.BarcodeFormat.EAN_8,ZXing.BarcodeFormat.CODE_128,ZXing.BarcodeFormat.CODE_39,
    ]]]);
    const rdr=new ZXing.BrowserMultiFormatReader(hints);
    let result=null;
    for(let v=0;v<4&&!result;v++){
      try{result=rdr.decodeFromCanvas(buildBcVariantFromSrc(img,img.naturalWidth,img.naturalHeight,v));}catch{}
    }
    if(!result){
      const stripH=Math.round(img.naturalHeight*.15);
      const stripY=Math.round((img.naturalHeight-stripH)/2);
      for(let v=0;v<4&&!result;v++){
        const strip=document.createElement('canvas');
        strip.width=img.naturalWidth;strip.height=stripH;
        strip.getContext('2d').drawImage(img,0,stripY,img.naturalWidth,stripH,0,0,img.naturalWidth,stripH);
        try{result=rdr.decodeFromCanvas(buildBcVariantFromSrc(strip,img.naturalWidth,stripH,v));}catch{}
      }
    }
    return result?.getText()||null;
  }finally{URL.revokeObjectURL(url);}
}

// ── TORCH ────────────────────────────────────────────────────────────────
function checkTorch(){
  setTimeout(()=>{
    const track=video.srcObject?.getVideoTracks()[0];
    const btnTorch=document.getElementById('btn-torch');
    if(isMobile||track?.getCapabilities?.()?.torch)btnTorch.style.display='';
    else btnTorch.style.display='none';
  },400);
}

// ── CAMERA FLIP ───────────────────────────────────────────────────────────
let cameraDevices=[];
let camIdx=0;
const btnCamFlip=document.getElementById('btn-cam-flip');
async function populateCameras(){
  cameraDevices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
  camSel.innerHTML=cameraDevices.map((d,i)=>`<option value="${d.deviceId}">${d.label||'Camera '+(i+1)}</option>`).join('');
  if(cameraDevices.length>1){camIdx=isMobile?Math.max(0,cameraDevices.length-1):0;}
}
btnCamFlip?.addEventListener('click',async()=>{
  if(isMobile){
    currentFacing=currentFacing==='environment'?'user':'environment';
    await startStream(null);
  }else{
    if(cameraDevices.length<2)return;
    camIdx=(camIdx+1)%cameraDevices.length;
    const id=cameraDevices[camIdx]?.deviceId;
    camSel.value=id;
    await startStream(id);
  }
});

// ── CROP PRESETS ─────────────────────────────────────────────────────────
document.querySelectorAll('.preset-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const p=btn.dataset.preset;
    if(!CROP_PRESETS[p])return;
    cropFrac={...CROP_PRESETS[p]};
    updateCrop();
    cropEl.dataset.preset=p;
    document.querySelectorAll('.preset-btn').forEach(b=>b.classList.toggle('active',b.dataset.preset===p));
  });
});

// ── TAP-TO-SNAP ───────────────────────────────────────────────────────────
const vidWrapEl=document.getElementById('vid-wrap');
vidWrapEl.addEventListener('click',e=>{
  if(!video.srcObject)return;
  if(e.target.id==='crop'||e.target.closest('#barcode-overlay')||e.target.id==='crop-handle')return;
  if(barcodeMode){
    snapAndDecode();
  } else {
    document.getElementById('btn-cap').click();
  }
});
