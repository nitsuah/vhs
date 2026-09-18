// ── AI MODULE ─────────────────────────────────────────────────────────────
import { apiKey, ollamaUrl, ollamaModel, fastMode, omdbKey, ollamaAvail, setOllamaAvail, localAiUrl, localAiModel, VISION_PROMPT_FAST, VISION_PROMPT_FULL } from './state.js';
import { parseJson, parseJsonObj } from './utils.js';

// ── AI BADGE ─────────────────────────────────────────────────────────────
function setAiBadge(mode,label){const el=document.getElementById('ai-badge');el.className=mode;el.textContent=label;}

export async function checkOllama(silent=false){
  if(!silent){document.getElementById('ollama-dot').className='ai-dot spin2';document.getElementById('ollama-status-text').textContent='Checking…';}
  try{
    const res=await fetch(`${ollamaUrl}/api/tags`,{signal:AbortSignal.timeout(3000)});
    if(!res.ok)throw new Error();
    const data=await res.json();
    const models=(data.models||[]).map(m=>m.name);
    const has=models.some(m=>m.startsWith(ollamaModel.split(':')[0]));
    setOllamaAvail(true);
    if(!silent){
      document.getElementById('ollama-dot').className='ai-dot ok';
      document.getElementById('ollama-status-text').textContent=has?`Connected · ${ollamaModel} ready`:`Connected · model not yet pulled`;
    }
  }catch{
    setOllamaAvail(false);
    if(!silent){document.getElementById('ollama-dot').className='ai-dot off';document.getElementById('ollama-status-text').textContent='Ollama not reachable at '+ollamaUrl;}
  }
  updateAiBadge();
}
export function updateAiBadge(){
  const hasAi = !!(apiKey || ollamaAvail || localAiUrl);
  if(apiKey)setAiBadge('claude','CLAUDE');
  else if(ollamaAvail)setAiBadge('ollama',ollamaModel);
  else if(localAiUrl)setAiBadge('ollama','LOCAL AI');
  else setAiBadge('noai','NO AI');
  // Hide fill/check buttons when no AI is connected
  ['btn-fill-data','btn-revalidate','bulk-fill','btn-fill-data-mob','btn-revalidate-mob'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.style.display=hasAi?'':'none';
  });
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

export async function callAI(base64){
  const b64=base64?await preprocessForAI(base64):base64;
  let results=[];
  if(apiKey&&b64){
    try{window.setRevMsg?.('Analyzing with Claude…');results=await callClaude(b64);}
    catch(e){console.warn('Claude failed:',e.message);}
  }
  if(!results.length&&b64&&localAiUrl){
    try{window.setRevMsg?.('Analyzing with local AI…');results=await callLocalAI(b64);}
    catch(e){console.warn('Local AI failed:',e.message);}
  }
  if(!results.length&&b64){
    const ok=await pingOllama();
    if(ok){
      try{window.setRevMsg?.(`Analyzing with ${ollamaModel}…`);results=await callOllama(b64);}
      catch(e){console.warn('Ollama failed:',e.message);}
    }
  }
  if(!results.length){window.setRevMsg?.('No AI available');return[];}
  // Enrich results with OMDb verification when key is configured
  if(omdbKey&&results.length){
    window.setRevMsg?.('Verifying titles…');
    results=await verifyWithOmdb(results);
  }
  return results;
}
async function callClaude(base64){
  for(let attempt=0;attempt<3;attempt++){
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true','content-type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1024,messages:[{role:'user',content:[
        {type:'image',source:{type:'base64',media_type:'image/jpeg',data:base64}},
        {type:'text',text:fastMode?VISION_PROMPT_FAST:VISION_PROMPT_FULL}
      ]}]})
    });
    if(res.status===429||res.status===529){
      const retry=parseInt(res.headers.get('retry-after')||'0',10)||Math.pow(2,attempt+1)*1000;
      console.warn(`Claude rate limit — retrying in ${retry}ms (attempt ${attempt+1})`);
      window.setRevMsg?.(`Rate limited — waiting ${Math.round(retry/1000)}s…`);
      await new Promise(r=>setTimeout(r,retry));
      continue;
    }
    if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error?.message||`Claude ${res.status}`);}
    const d=await res.json();return parseJson(d.content?.[0]?.text||'[]');
  }
  throw new Error('Claude rate limit — max retries reached');
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
  try{const r=await fetch(`${ollamaUrl}/api/tags`,{signal:AbortSignal.timeout(2000)});setOllamaAvail(r.ok);updateAiBadge();return r.ok;}
  catch{setOllamaAvail(false);updateAiBadge();return false;}
}

// Generic OpenAI-compatible chat-completions vision call — works against
// LM Studio, llama.cpp's server, 9router, or any other local router that
// speaks the OpenAI API surface, not just Ollama's own /api/generate shape.
async function callLocalAI(base64){
  const res=await fetch(`${localAiUrl.replace(/\/$/,'')}/v1/chat/completions`,{
    method:'POST',headers:{'content-type':'application/json'},
    signal:AbortSignal.timeout(30000),
    body:JSON.stringify({
      model:localAiModel||'local-model',
      messages:[{role:'user',content:[
        {type:'image_url',image_url:{url:`data:image/jpeg;base64,${base64}`}},
        {type:'text',text:fastMode?VISION_PROMPT_FAST:VISION_PROMPT_FULL}
      ]}],
      max_tokens:fastMode?200:512,
    })
  });
  if(!res.ok)throw new Error(`Local AI ${res.status}`);
  const d=await res.json();
  return parseJson(d.choices?.[0]?.message?.content||'[]');
}

// Every captured tape photo gets sent to whatever URL is connected here, so
// a custom URL is restricted to loopback addresses — otherwise a mistaken or
// malicious non-local URL would silently become a standing exfiltration
// destination for the user's own photos once persisted.
function isLoopbackHost(urlStr){
  try{
    const host=new URL(urlStr).hostname.toLowerCase();
    return host==='localhost'||host==='127.0.0.1'||host==='::1'||host==='[::1]'||/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
  }catch{return false;}
}

// ── LOCAL AI DISCOVERY (Priority 3b) ────────────────────────────────────────
// Best-effort browser-side discovery for a hosted deployment (e.g. Netlify)
// with no AI backend configured. Checks a small FIXED list of known local
// endpoints (never arbitrary port scanning) via a plain fetch — this only
// works when the target answers the browser's request, which depends on
// factors outside this app's control (see findLocalAI's returned `note`).
const LOCAL_AI_CANDIDATES=[
  {kind:'ollama',label:'Ollama',url:'http://localhost:11434'},
  {kind:'openai',label:'LM Studio / OpenAI-compatible',url:'http://localhost:1234'},
];

export async function findLocalAI(customUrl){
  const candidates=LOCAL_AI_CANDIDATES.map(c=>({...c}));
  const results=[];
  if(customUrl){
    const u=customUrl.trim().replace(/\/$/,'');
    if(u&&isLoopbackHost(u)){
      candidates.push({kind:'openai',label:'Custom',url:u},{kind:'ollama',label:'Custom (Ollama)',url:u});
    }else if(u){
      results.push({kind:'custom-rejected',label:'Custom',url:u,found:false,rejected:true});
    }
  }
  for(const c of candidates){
    const probeUrl=c.kind==='ollama'?`${c.url}/api/tags`:`${c.url}/v1/models`;
    try{
      const res=await fetch(probeUrl,{signal:AbortSignal.timeout(2500)});
      // For OpenAI-compatible providers, also capture a real model id from
      // /v1/models — callLocalAI's fallback 'local-model' placeholder is
      // rejected by some providers (LM Studio included), so a discovered
      // connection needs an actual id to be usable after Connect.
      const model=c.kind==='openai'&&res.ok?await res.json().then(d=>d?.data?.find(m=>typeof m?.id==='string')?.id||'').catch(()=>''):'';
      results.push({...c,found:res.ok&&(c.kind!=='openai'||!!model),model});
    }catch{
      // fetch() deliberately does not expose *why* a request failed (plain
      // connection-refused, CORS rejection, and a Chrome Private Network
      // Access preflight block are all indistinguishable TypeErrors) — so
      // this cannot claim to know which one happened, only that this
      // candidate didn't respond.
      results.push({...c,found:false});
    }
  }
  return results;
}

// ── METADATA LOOKUPS ─────────────────────────────────────────────────────
// Set right before lookupMetadata/lookupBarcode resolve to a "not found"
// result, so callers can show a specific reason instead of a generic toast.
let _lastLookupFailure = null;
export function getLastLookupFailure(){ return _lastLookupFailure; }

function describeServerReasons(reasons, sources){
  if (!reasons) return null;
  const parts = [];
  sources.forEach(([key, label]) => {
    const r = reasons[key];
    if (r === 'not_configured') parts.push(`no ${label} key set`);
    else if (r && r !== 'ok' && r !== 'skipped' && r !== 'no_match') parts.push(`${label} ${r}`);
  });
  return parts.length ? parts.join(', ') : null;
}

export async function lookupMetadata(title){
  const prompt=`You are a movie/TV database and VHS collectibles expert. For the title: ${JSON.stringify(title)}
Return ONLY a JSON object with these fields (omit any you are unsure about):
{"year":"1984","label":"Orion Pictures","format":"VHS","value_low":"8","value_high":"25"}
The label is the original VHS distributor or studio.
value_low/value_high are estimated USD resale ranges for a VHS in good condition.
Rough guide: common mainstream $1-5, out-of-print/cult $5-30, horror/SOV/anime/rare $20-100+.
Return {} if completely unknown.`;

  let claudeResult=null;
  let claudeReason = apiKey ? 'ok' : 'not_configured';
  if(apiKey){
    try{
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true','content-type':'application/json'},
        body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:150,messages:[{role:'user',content:prompt}]})
      });
      if(res.ok){const d=await res.json();claudeResult=parseJsonObj(d.content?.[0]?.text||'{}')||null;}
      else claudeReason = `error (HTTP ${res.status})`;
    }catch(e){claudeReason='unreachable';console.warn('Lookup (Claude):',e);}
  }

  // Always call server for OMDb enrichment (imdb_id, poster, authoritative year/label)
  let serverResult=null;
  let serverReasons=null;
  try{
    const hdrs={};if(omdbKey)hdrs['x-omdb-key']=omdbKey;
    const r=await fetch(`/api/lookup?title=${encodeURIComponent(title)}`,{signal:AbortSignal.timeout(35000),headers:hdrs});
    if(r.ok){
      const d=await r.json();
      if(d&&!d.error&&Object.keys(d).length)serverResult=d;
      else if(d&&d.reasons)serverReasons=d.reasons;
    }
  }catch(e){console.warn('Lookup (server):',e);}

  if(!claudeResult&&!serverResult){
    const claudePart = claudeReason!=='ok' ? [['claude', claudeReason==='not_configured'?'not_configured':claudeReason]] : [];
    const reasons = { ...(serverReasons||{}) };
    claudePart.forEach(([k,v])=>{reasons[k]=v;});
    const detail = describeServerReasons(reasons, [['claude','Claude'],['ollama','Ollama'],['omdb','OMDb']]);
    _lastLookupFailure = detail ? `No metadata found for "${title}" — ${detail}` : `No metadata found for "${title}"`;
    return null;
  }
  _lastLookupFailure = null;
  // Merge: Claude supplies value estimates; server/OMDb supplies authoritative metadata + poster
  const merged={...(claudeResult||{}),...{}};
  if(serverResult){
    if(serverResult.imdb_id)merged.imdb_id=serverResult.imdb_id;
    if(serverResult.year)merged.year=serverResult.year;
    if(serverResult.label)merged.label=serverResult.label;
    if(serverResult.poster)merged.poster=serverResult.poster;
  }
  return Object.keys(merged).length?merged:null;
}

export async function lookupBarcode(code){
  try{
    const hdrs={};if(omdbKey)hdrs['x-omdb-key']=omdbKey;
    const res=await fetch(`/api/lookup/barcode/${encodeURIComponent(code)}`,{signal:AbortSignal.timeout(8000),headers:hdrs});
    if(!res.ok){
      const d=await res.json().catch(()=>null);
      const detail = d?.reasons ? describeServerReasons(d.reasons, [['upcitemdb','UPCItemDB'],['openlibrary','Open Library']]) : null;
      _lastLookupFailure = detail ? `No match for ${code} — ${detail}` : `No match for ${code}`;
      return null;
    }
    _lastLookupFailure = null;
    return await res.json();
  }catch(e){_lastLookupFailure=`Barcode lookup failed: ${e.message}`;return null;}
}
