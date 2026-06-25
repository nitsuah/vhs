// ── SOUND TOGGLE ─────────────────────────────────────────────────────────
let soundEnabled=localStorage.getItem('vhs-sound')!=='false';

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
  if(!soundEnabled)return;
  try{
    const ctx=new AudioContext(),osc=ctx.createOscillator(),g=ctx.createGain();
    osc.connect(g);g.connect(ctx.destination);
    osc.frequency.value=1200;g.gain.setValueAtTime(.3,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.15);
    osc.start();osc.stop(ctx.currentTime+.15);
  }catch{}
}

// ── AKIRA EASTER EGG ─────────────────────────────────────────────────────
let _akiraLastDing=0,_akiraBuffer=null,_akiraCtx=null;
async function _loadAkiraAudio(){
  try{
    const res=await fetch('/sounds/akira.mp3');if(!res.ok)return;
    const ab=await res.arrayBuffer();
    const tmp=new AudioContext();
    _akiraBuffer=await tmp.decodeAudioData(ab);
    await tmp.close();
  }catch(e){console.warn('Akira audio:',e);}
}
function playAkiraDing(){
  if(!soundEnabled)return;
  const now=Date.now();
  if(now-_akiraLastDing<5000)return;
  _akiraLastDing=now;
  if(_akiraBuffer){
    try{
      if(!_akiraCtx||_akiraCtx.state==='closed')_akiraCtx=new AudioContext();
      if(_akiraCtx.state==='suspended')_akiraCtx.resume();
      const src=_akiraCtx.createBufferSource();
      const g=_akiraCtx.createGain();g.gain.value=0.6;
      src.buffer=_akiraBuffer;src.connect(g);g.connect(_akiraCtx.destination);
      src.start();
    }catch{}
  }else{
    _loadAkiraAudio();
    try{
      const ctx=new AudioContext();const master=ctx.createGain();master.gain.value=0.18;master.connect(ctx.destination);
      const bell=(freq,vol,decay)=>{const osc=ctx.createOscillator(),g=ctx.createGain();osc.type='sine';osc.frequency.value=freq;osc.connect(g);g.connect(master);g.gain.setValueAtTime(vol,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+decay);osc.start();osc.stop(ctx.currentTime+decay);};
      bell(880,1,2.2);bell(1320,0.35,1.6);bell(2200,0.2,1.1);bell(440,0.15,2.8);
      setTimeout(()=>ctx.close(),3200);
    }catch{}
  }
}
_loadAkiraAudio();

function buzz(){
  if(!soundEnabled)return;
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
  if(!soundEnabled)return;
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
  if(!soundEnabled)return;
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

// ── GHOSTBUSTERS DING ─────────────────────────────────────────────────────
let _gbLastDing=0;
function playGhostbustersDing(el){
  if(!soundEnabled)return;
  const now=Date.now();if(now-_gbLastDing<5000)return;_gbLastDing=now;
  if(el){el.classList.add('gb-flash');setTimeout(()=>el.classList.remove('gb-flash'),600);}
  try{
    const ctx=new AudioContext();
    const master=ctx.createGain();master.gain.value=0.14;master.connect(ctx.destination);
    const note=(freq,t,dur,vol=1)=>{
      [[0,'triangle'],[1.005,'sine']].forEach(([det,type])=>{
        const osc=ctx.createOscillator(),g=ctx.createGain();
        osc.type=type;osc.frequency.value=freq+det;osc.connect(g);g.connect(master);
        g.gain.setValueAtTime(vol*(det?0.25:1),ctx.currentTime+t);
        g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+dur);
        osc.start(ctx.currentTime+t);osc.stop(ctx.currentTime+t+dur);
      });
    };
    note(587,0,0.12,1);note(659,0.10,0.12,.85);note(784,0.19,0.20,.9);note(988,0.36,0.45,.7);
    setTimeout(()=>ctx.close(),1200);
  }catch{}
}

// ── NIGHT OF THE LIVING DEAD FLICKER + GROAN ──────────────────────────────
let _notldGroanLast=0,_notldFlickerTimer=null;
function _playNotldGroan(){
  if(!soundEnabled)return;
  const now=Date.now();if(now-_notldGroanLast<5000)return;_notldGroanLast=now;
  try{
    const ctx=new AudioContext(),dur=0.85;
    const g=ctx.createGain();g.gain.setValueAtTime(0.22,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur);g.connect(ctx.destination);
    const osc=ctx.createOscillator();osc.type='sine';osc.frequency.setValueAtTime(145,ctx.currentTime);osc.frequency.setValueAtTime(130,ctx.currentTime+0.3);osc.frequency.exponentialRampToValueAtTime(100,ctx.currentTime+dur);osc.connect(g);osc.start();osc.stop(ctx.currentTime+dur);
    const osc2=ctx.createOscillator(),g2=ctx.createGain();osc2.type='sawtooth';osc2.frequency.setValueAtTime(290,ctx.currentTime);osc2.frequency.exponentialRampToValueAtTime(210,ctx.currentTime+dur);g2.gain.setValueAtTime(0.07,ctx.currentTime);g2.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur);osc2.connect(g2);g2.connect(ctx.destination);osc2.start();osc2.stop(ctx.currentTime+dur);
    setTimeout(()=>ctx.close(),(dur+0.3)*1000);
  }catch{}
}
function startNotldEffect(el){
  if(_notldFlickerTimer){clearTimeout(_notldFlickerTimer);_notldFlickerTimer=null;}
  _playNotldGroan();let step=0;
  const flicker=()=>{
    if(!el||!el.isConnected){stopNotldEffect(el);return;}
    step++;el.style.opacity=step%2===0?'1':String(0.2+Math.random()*0.45);
    _notldFlickerTimer=setTimeout(flicker,70+Math.random()*90);
  };
  flicker();
}
function stopNotldEffect(el){
  if(_notldFlickerTimer){clearTimeout(_notldFlickerTimer);_notldFlickerTimer=null;}
  if(el)el.style.opacity='';
}

// ── SPEED RACER ENGINE REV ────────────────────────────────────────────────
let _revTimer=null,_revFreq=110,_revTempo=520;
function startRevSound(){
  if(!soundEnabled)return;
  stopRevSound();_revFreq=110;_revTempo=520;
  const tick=()=>{
    try{
      const ctx=new AudioContext(),dur=0.18;
      const g=ctx.createGain();g.gain.setValueAtTime(0.18,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur);g.connect(ctx.destination);
      const osc=ctx.createOscillator();osc.type='sawtooth';osc.frequency.setValueAtTime(_revFreq,ctx.currentTime);osc.frequency.exponentialRampToValueAtTime(_revFreq*1.18,ctx.currentTime+dur);osc.connect(g);osc.start();osc.stop(ctx.currentTime+dur);
      setTimeout(()=>ctx.close(),350);
    }catch{}
    _revFreq=Math.min(520,_revFreq*1.07);_revTempo=Math.max(75,Math.floor(_revTempo*0.87));
    _revTimer=setTimeout(tick,_revTempo);
  };
  tick();
}
function stopRevSound(){
  if(_revTimer){clearTimeout(_revTimer);_revTimer=null;}
  _revFreq=110;_revTempo=520;
}

// ── TAPE INSERT ANIMATION ─────────────────────────────────────────────────
function triggerTapeInsertAnim(srcRect){
  const badge=document.getElementById('count-badge');if(!badge)return;
  const dst=badge.getBoundingClientRect();
  const sx=(srcRect?.left||window.innerWidth/2)+(srcRect?.width||0)/2;
  const sy=(srcRect?.top||window.innerHeight/2)+(srcRect?.height||0)/2;
  const el=document.createElement('div');el.textContent='📼';
  el.style.cssText=`position:fixed;left:${sx}px;top:${sy}px;font-size:22px;z-index:9999;pointer-events:none;transform:translate(-50%,-50%);transition:left .65s cubic-bezier(.4,0,.2,1),top .65s cubic-bezier(.4,0,.2,1),opacity .55s .1s,transform .65s;opacity:1`;
  document.body.appendChild(el);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    el.style.left=(dst.left+dst.width/2)+'px';el.style.top=(dst.top+dst.height/2)+'px';
    el.style.transform='translate(-50%,-50%) scale(0.25)';el.style.opacity='0';
  }));
  setTimeout(()=>el.remove(),850);
}

// ── MILESTONE CONFETTI ────────────────────────────────────────────────────
let _milestoneSeen=null;
function checkMilestoneConfetti(n){
  if(!_milestoneSeen)_milestoneSeen=new Set((localStorage.getItem('vhs-milestones')||'').split(',').filter(Boolean));
  const hit=[50,100,200].find(m=>n>=m&&!_milestoneSeen.has(String(m)));
  if(!hit)return;
  _milestoneSeen.add(String(hit));localStorage.setItem('vhs-milestones',[..._milestoneSeen].join(','));
  const badge=document.getElementById('count-badge');if(!badge)return;
  const rect=badge.getBoundingClientRect();const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
  for(let i=0;i<26;i++){
    const el=document.createElement('div');el.textContent='📼';
    const angle=(i/26)*360,dist=55+Math.random()*90,dur=0.9+Math.random()*0.5;
    el.style.cssText=`position:fixed;left:${cx}px;top:${cy}px;font-size:${(14+Math.random()*10)|0}px;z-index:9999;pointer-events:none;transform:translate(-50%,-50%);transition:all ${dur.toFixed(2)}s cubic-bezier(.1,.8,.3,1);opacity:1`;
    document.body.appendChild(el);
    const rad=angle*Math.PI/180;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      el.style.transform=`translate(calc(-50% + ${(Math.cos(rad)*dist).toFixed(1)}px),calc(-50% + ${(Math.sin(rad)*dist).toFixed(1)}px)) scale(0.4) rotate(${(Math.random()*360).toFixed(0)}deg)`;
      el.style.opacity='0';
    }));
    setTimeout(()=>el.remove(),(dur+0.25)*1000);
  }
  toast(`🎉 ${hit} tapes in the collection! 📼`,'ok',5000);
}

// ── DOWNLOAD ─────────────────────────────────────────────────────────────
function dl(content,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();}
