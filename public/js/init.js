async function init(){
  setDbDot('');
  updateAiBadge();
  const _aiFallback=setTimeout(updateAiBadge,6000);
  checkOllama(true).then(()=>{clearTimeout(_aiFallback);updateAiBadge();});
  fetch('/api/health',{signal:AbortSignal.timeout(5000)}).then(r=>r.json()).then(h=>{
    setDbDot(h.db==='ok'?'ok':'err');
  }).catch(()=>{});
  initCamera().then(()=>updateCrop()).catch(e=>console.warn('Camera init error:',e));
  const preload=await _cacheGetAll().catch(()=>[]);
  if(preload.length){inventory=preload;renderInv();updateCount();}
  try{
    inventory=await retryWithBackoff(()=>dbAll(),2,800);
    setDbDot('ok');
  }catch(err){
    setDbDot('err');
    toast('Database unavailable'+(preload.length?' — showing cached data':': '+err.message),'err',8000);
    if(!preload.length){renderInv();updateCount();}
  }
  renderInv();updateCount();
  startJobPoller();
}
init().catch(err=>{setDbDot('err');console.error('init error:',err);});
