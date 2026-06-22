// ── TOAST ────────────────────────────────────────────────────────────────
function toast(msg,type='',ms=3000){
  const el=document.createElement('div');
  el.className='toast'+(type?' '+type:'');
  el.textContent=msg;
  const wrap=document.getElementById('toast-wrap');
  wrap.appendChild(el);
  setTimeout(()=>{el.style.transition='opacity .3s';el.style.opacity='0';setTimeout(()=>el.remove(),300);},ms);
}

// ── JSON PARSERS ─────────────────────────────────────────────────────────
function parseJson(txt){const m=txt.trim().match(/\[[\s\S]*\]/);if(!m)return[];try{return JSON.parse(m[0]);}catch{return[];}}
function parseJsonObj(txt){const m=txt.trim().match(/\{[\s\S]*\}/);if(!m)return null;try{return JSON.parse(m[0]);}catch{return null;}}

// ── RETRY ────────────────────────────────────────────────────────────────
async function retryWithBackoff(fn,retries=3,delay=800){
  for(let i=0;i<=retries;i++){
    try{return await fn();}
    catch(err){
      if(i===retries)throw err;
      await new Promise(r=>setTimeout(r,delay*Math.pow(2,i)));
    }
  }
}

// ── DEDUP ────────────────────────────────────────────────────────────────
function lev(a,b){
  const m=a.length,n=b.length,d=Array.from({length:m+1},(_,i)=>Array(n+1).fill(0));
  for(let i=0;i<=m;i++)d[i][0]=i; for(let j=0;j<=n;j++)d[0][j]=j;
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=a[i-1]===b[j-1]?d[i-1][j-1]:1+Math.min(d[i-1][j],d[i][j-1],d[i-1][j-1]);
  return d[m][n];
}
const norm = t=>(t||'').toLowerCase().replace(/^(the |a |an )/i,'').trim();
function findDup(title){
  const n=norm(title);
  for(const t of inventory){const e=norm(t.title),L=Math.max(n.length,e.length);if(L&&1-lev(n,e)/L>=0.85)return t;}
  return null;
}

// ── SCRIPT LOADER ────────────────────────────────────────────────────────
function loadScript(src){
  return new Promise((res,rej)=>{
    if(document.querySelector(`script[src="${src}"]`))return res();
    const s=document.createElement('script');
    s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s);
  });
}

// ── AUDIO BEEP ───────────────────────────────────────────────────────────
function beep(){
  try{
    const ctx=new AudioContext(),osc=ctx.createOscillator(),g=ctx.createGain();
    osc.connect(g);g.connect(ctx.destination);
    osc.frequency.value=1200;g.gain.setValueAtTime(.3,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.15);
    osc.start();osc.stop(ctx.currentTime+.15);
  }catch{}
}

// ── AKIRA EASTER EGG ─────────────────────────────────────────────────────
let _akiraLastDing=0;
function playAkiraDing(){
  const now=Date.now();
  if(now-_akiraLastDing<5000)return;
  _akiraLastDing=now;
  try{
    const ctx=new AudioContext();
    const master=ctx.createGain();
    master.gain.value=0.18;
    master.connect(ctx.destination);
    const bell=(freq,vol,decay)=>{
      const osc=ctx.createOscillator(),g=ctx.createGain();
      osc.type='sine';osc.frequency.value=freq;
      osc.connect(g);g.connect(master);
      g.gain.setValueAtTime(vol,ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+decay);
      osc.start();osc.stop(ctx.currentTime+decay);
    };
    bell(880,1,2.2);   // fundamental
    bell(1320,0.35,1.6); // 3rd harmonic
    bell(2200,0.2,1.1);  // 5th harmonic
    bell(440,0.15,2.8);  // sub octave for warmth
    setTimeout(()=>ctx.close(),3200);
  }catch{}
}

function buzz(){
  try{
    const ctx=new AudioContext(),g=ctx.createGain();
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.4,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.35);
    [180,220,270].forEach(freq=>{
      const osc=ctx.createOscillator();
      osc.type='sawtooth';
      osc.frequency.value=freq;
      osc.connect(g);
      osc.start();osc.stop(ctx.currentTime+0.35);
    });
    setTimeout(()=>ctx.close(),600);
  }catch{}
}

// ── REWIND SOUND ─────────────────────────────────────────────────────────
let _rewindCooldown=0;
function playRewindSound(){
  const now=Date.now();
  if(now-_rewindCooldown<5000)return;
  _rewindCooldown=now;
  try{
    const ctx=new AudioContext(),dur=1.8;
    const g=ctx.createGain();
    g.gain.setValueAtTime(0.12,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur);
    g.connect(ctx.destination);
    [320,480,640].forEach(freq=>{
      const osc=ctx.createOscillator();
      osc.type='sawtooth';
      osc.frequency.setValueAtTime(freq,ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq*.25,ctx.currentTime+dur);
      osc.connect(g);osc.start();osc.stop(ctx.currentTime+dur);
    });
    setTimeout(()=>ctx.close(),(dur+.3)*1000);
  }catch{}
}

// ── JAWS THEME ────────────────────────────────────────────────────────────
let _jawsTimer=null,_jawsTempo=2000,_jawsNote=false;
function startJawsTheme(){
  stopJawsTheme();
  _jawsTempo=2000;_jawsNote=false;
  const tick=()=>{
    _jawsNote=!_jawsNote;
    try{
      const ctx=new AudioContext(),osc=ctx.createOscillator(),g=ctx.createGain();
      osc.type='triangle';
      osc.frequency.value=_jawsNote?73.4:82.4;
      osc.connect(g);g.connect(ctx.destination);
      g.gain.setValueAtTime(.28,ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.45);
      osc.start();osc.stop(ctx.currentTime+.5);
      setTimeout(()=>ctx.close(),700);
    }catch{}
    _jawsTempo=Math.max(180,Math.floor(_jawsTempo*.82));
    _jawsTimer=setTimeout(tick,_jawsTempo);
  };
  tick();
}
function stopJawsTheme(){
  if(_jawsTimer){clearTimeout(_jawsTimer);_jawsTimer=null;}
  _jawsTempo=2000;_jawsNote=false;
}

// ── TV STATIC ─────────────────────────────────────────────────────────────
function startStaticAnim(canvas,ms){
  canvas.style.display='block';
  const W=canvas.width=window.innerWidth,H=canvas.height=window.innerHeight;
  const ctx=canvas.getContext('2d');
  const off=document.createElement('canvas');
  const sc=5;off.width=Math.ceil(W/sc);off.height=Math.ceil(H/sc);
  const octx=off.getContext('2d');
  const start=Date.now();let raf;
  const draw=()=>{
    if(Date.now()-start>=ms){ctx.clearRect(0,0,W,H);canvas.style.display='none';return;}
    const img=octx.createImageData(off.width,off.height),d=img.data;
    for(let i=0;i<d.length;i+=4){const v=Math.random()*220|0;d[i]=v;d[i+1]=v;d[i+2]=v;d[i+3]=200;}
    octx.putImageData(img,0,0);
    ctx.imageSmoothingEnabled=false;ctx.drawImage(off,0,0,W,H);
    ctx.fillStyle='rgba(255,255,255,.06)';
    ctx.fillRect(0,(Math.random()*H)|0,W,(2+Math.random()*6)|0);
    raf=requestAnimationFrame(draw);
  };
  draw();
}

// ── MATRIX SCRAMBLE ───────────────────────────────────────────────────────
const _KAT='アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
function scrambleToReal(el,finalVal,totalMs){
  const isInp=el.tagName==='INPUT'||el.tagName==='TEXTAREA';
  const set=v=>isInp?(el.value=v):(el.textContent=v);
  const len=Math.max(1,finalVal.length);
  const steps=28,stepMs=totalMs/steps;
  let step=0;
  const rand=()=>_KAT[(_KAT.length*Math.random())|0];
  const tick=()=>{
    const done=Math.floor(step/steps*len);
    set(finalVal.slice(0,done)+Array.from({length:len-done},rand).join(''));
    step++;if(step<=steps)setTimeout(tick,stepMs);else set(finalVal);
  };
  tick();
}

// ── IMAGE UTILITIES ───────────────────────────────────────────────────────
function fileToB64(f){
  return new Promise((r,j)=>{const fr=new FileReader();fr.onload=()=>r(fr.result.split(',')[1]);fr.onerror=j;fr.readAsDataURL(f);});
}
function compressImage(dataUrl,maxSide=1200,quality=0.75){
  return new Promise(r=>{
    const img=new Image();
    img.onload=()=>{
      const scale=Math.min(1,maxSide/Math.max(img.width||maxSide,img.height||maxSide));
      const c=document.createElement('canvas');
      c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      r(c.toDataURL('image/jpeg',quality));
    };
    img.onerror=()=>r(dataUrl);
    img.src=dataUrl;
  });
}
function fileToThumb(f){
  return new Promise(r=>{
    const fr=new FileReader();
    fr.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        const sc=Math.min(1,200/Math.max(img.width,img.height));
        const c=document.createElement('canvas');
        c.width=img.width*sc;c.height=img.height*sc;
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        r(c.toDataURL('image/jpeg',.6));
      };
      img.src=fr.result;
    };
    fr.readAsDataURL(f);
  });
}

// ── DOWNLOAD ─────────────────────────────────────────────────────────────
function dl(content,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();}
