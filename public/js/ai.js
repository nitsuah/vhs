// ── AI BADGE ─────────────────────────────────────────────────────────────
function setAiBadge(mode,label){const el=document.getElementById('ai-badge');el.className=mode;el.textContent=label;}

async function checkOllama(silent=false){
  if(!silent){document.getElementById('ollama-dot').className='ai-dot spin2';document.getElementById('ollama-status-text').textContent='Checking…';}
  try{
    const res=await fetch(`${ollamaUrl}/api/tags`,{signal:AbortSignal.timeout(3000)});
    if(!res.ok)throw new Error();
    const data=await res.json();
    const models=(data.models||[]).map(m=>m.name);
    const has=models.some(m=>m.startsWith(ollamaModel.split(':')[0]));
    ollamaAvail=true;
    if(!silent){
      document.getElementById('ollama-dot').className='ai-dot ok';
      document.getElementById('ollama-status-text').textContent=has?`Connected · ${ollamaModel} ready`:`Connected · model not yet pulled`;
    }
  }catch{
    ollamaAvail=false;
    if(!silent){document.getElementById('ollama-dot').className='ai-dot off';document.getElementById('ollama-status-text').textContent='Ollama not reachable at '+ollamaUrl;}
  }
  updateAiBadge();
}
function updateAiBadge(){
  if(apiKey)setAiBadge('claude','CLAUDE');
  else if(ollamaAvail)setAiBadge('ollama',ollamaModel);
  else setAiBadge('noai','NO AI');
}

// ── AI DISPATCH ──────────────────────────────────────────────────────────
function preprocessForAI(base64){
  return new Promise(res=>{
    const img=new Image();
    img.onload=()=>{
      const c=document.createElement('canvas');
      c.width=img.width;c.height=img.height;
      const ctx=c.getContext('2d');
      // Boost contrast + reduce saturation — helps text legibility for vision models
      ctx.filter='contrast(160%) brightness(108%) saturate(70%)';
      ctx.drawImage(img,0,0);
      res(c.toDataURL('image/jpeg',.92).split(',')[1]);
    };
    img.onerror=()=>res(base64);
    img.src='data:image/jpeg;base64,'+base64;
  });
}

// Verify AI-detected titles against OMDb to correct spelling and add imdb_id.
// Only runs when omdbKey is set; skips low-confidence entries to avoid false matches.
async function verifyWithOmdb(results){
  if(!omdbKey||!results.length)return results;
  return Promise.all(results.map(async item=>{
    if(!item.title||item.confidence==='low')return item;
    try{
      const r=await fetch(`/api/lookup?title=${encodeURIComponent(item.title)}`,{
        signal:AbortSignal.timeout(6000),
        headers:{'x-omdb-key':omdbKey}
      });
      if(r.ok){
        const d=await r.json();
        if(d&&d.imdb_id)return{...item,year:d.year||item.year,imdb_id:d.imdb_id,label:d.label||item.label};
      }
    }catch{}
    return item;
  }));
}

async function callAI(base64){
  const b64=base64?await preprocessForAI(base64):base64;
  let results=[];
  if(apiKey&&b64){
    try{setRevMsg('Analyzing with Claude…');results=await callClaude(b64);}
    catch(e){console.warn('Claude failed:',e.message);}
  }
  if(!results.length&&b64){
    const ok=await pingOllama();
    if(ok){
      try{setRevMsg(`Analyzing with ${ollamaModel}…`);results=await callOllama(b64);}
      catch(e){console.warn('Ollama failed:',e.message);}
    }
  }
  if(!results.length){setRevMsg('No AI available');return[];}
  // Enrich results with OMDb verification when key is configured
  if(omdbKey&&results.length){
    setRevMsg('Verifying titles…');
    results=await verifyWithOmdb(results);
  }
  return results;
}
async function callClaude(base64){
  const res=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true','content-type':'application/json'},
    body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1024,messages:[{role:'user',content:[
      {type:'image',source:{type:'base64',media_type:'image/jpeg',data:base64}},
      {type:'text',text:fastMode?VISION_PROMPT_FAST:VISION_PROMPT_FULL}
    ]}]})
  });
  if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error?.message||`Claude ${res.status}`);}
  const d=await res.json();return parseJson(d.content?.[0]?.text||'[]');
}
async function callOllama(base64){
  const res=await fetch(`${ollamaUrl}/api/generate`,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({model:ollamaModel,prompt:fastMode?VISION_PROMPT_FAST:VISION_PROMPT_FULL,images:[base64],stream:false,options:{num_predict:fastMode?100:256}})
  });
  if(!res.ok)throw new Error(`Ollama ${res.status}`);
  const d=await res.json();return parseJson(d.response||'[]');
}
async function pingOllama(){
  try{const r=await fetch(`${ollamaUrl}/api/tags`,{signal:AbortSignal.timeout(2000)});ollamaAvail=r.ok;updateAiBadge();return r.ok;}
  catch{ollamaAvail=false;updateAiBadge();return false;}
}

// ── METADATA LOOKUPS ─────────────────────────────────────────────────────
async function lookupMetadata(title){
  const prompt=`You are a movie/TV database and VHS collectibles expert. For the title: "${title.replace(/"/g,'\\"')}"
Return ONLY a JSON object with these fields (omit any you are unsure about):
{"year":"1984","label":"Orion Pictures","format":"VHS","value_low":"8","value_high":"25"}
The label is the original VHS distributor or studio.
value_low/value_high are estimated USD resale ranges for a VHS in good condition.
Rough guide: common mainstream $1-5, out-of-print/cult $5-30, horror/SOV/anime/rare $20-100+.
Return {} if completely unknown.`;
  if(apiKey){
    try{
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true','content-type':'application/json'},
        body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:150,messages:[{role:'user',content:prompt}]})
      });
      if(res.ok){const d=await res.json();const r=parseJsonObj(d.content?.[0]?.text||'{}');if(r)return r;}
    }catch(e){console.warn('Lookup (Claude):',e);}
  }
  try{
    const hdrs={};if(omdbKey)hdrs['x-omdb-key']=omdbKey;
    const r=await fetch(`/api/lookup?title=${encodeURIComponent(title)}`,{signal:AbortSignal.timeout(35000),headers:hdrs});
    if(r.ok){const d=await r.json();if(d&&!d.error&&Object.keys(d).length)return d;}
  }catch(e){console.warn('Lookup (server):',e);}
  return null;
}

async function lookupBarcode(code){
  try{
    const hdrs={};if(omdbKey)hdrs['x-omdb-key']=omdbKey;
    const res=await fetch(`/api/lookup/barcode/${encodeURIComponent(code)}`,{signal:AbortSignal.timeout(8000),headers:hdrs});
    if(!res.ok)return null;
    return await res.json();
  }catch{return null;}
}
