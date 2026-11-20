(function(){
'use strict';
/* ถังขยะรูปภาพ NINO — เก็บรูปที่ผู้ใช้ส่งแบบมีเวลาหมดอายุ แล้วลบจริงอัตโนมัติ
   เก็บใน IndexedDB แยก (NINO_trash) ไม่แตะ localStorage (โควตาเล็ก ใช้ร่วมกับ config) */
var DBN='NINO_trash',ST='items',EVT='nino:trash-expired';
var DEF={ttlMs:30*60*1000,maxItems:40,maxBytes:24*1024*1024,sweepMs:20000};
var MEM=new Map(),dbp=null,readyP=null,timer=null;
try{localStorage.removeItem('nino_trash');}catch(e){}
function openDB(){
  if(dbp)return dbp;
  dbp=new Promise(function(res){
    try{
      if(typeof indexedDB==='undefined')return res(null);
      var rq=indexedDB.open(DBN,1);
      rq.onupgradeneeded=function(e){var d=e.target.result;if(!d.objectStoreNames.contains(ST))d.createObjectStore(ST,{keyPath:'id'});};
      rq.onsuccess=function(e){var d=e.target.result;d.onversionchange=function(){try{d.close();}catch(_){}dbp=null;};res(d);};
      rq.onerror=function(){res(null);};
      rq.onblocked=function(){res(null);};
    }catch(e){res(null);}
  });
  return dbp;
}
function tx(mode,fn){
  return openDB().then(function(d){
    if(!d)return null;
    return new Promise(function(res){
      try{
        var t=d.transaction(ST,mode),s=t.objectStore(ST),out=fn(s);
        t.oncomplete=function(){res(out&&out.result!==undefined?out.result:true);};
        t.onerror=t.onabort=function(){res(null);};
      }catch(e){res(null);}
    });
  });
}
function idbPut(it){return tx('readwrite',function(s){return s.put(it);});}
function idbDel(id){return tx('readwrite',function(s){return s.delete(id);});}
function idbClear(){return tx('readwrite',function(s){return s.clear();});}
function idbGet(id){return tx('readonly',function(s){return s.get(id);});}
function idbAll(){return tx('readonly',function(s){return s.getAll();}).then(function(r){return Array.isArray(r)?r:[];});}
function fire(ids){
  if(!ids||!ids.length)return;
  try{window.dispatchEvent(new CustomEvent(EVT,{detail:{ids:ids.slice()}}));}catch(e){}
}
function newId(){return 'tr-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
async function all(){
  var disk=await idbAll();
  disk.forEach(function(it){if(!MEM.has(it.id))MEM.set(it.id,it);});
  return Array.from(MEM.values());
}
async function purge(){
  var now=Date.now(),dead=[];
  (await all()).forEach(function(it){if(it.expiresAt&&it.expiresAt<=now)dead.push(it.id);});
  for(var i=0;i<dead.length;i++){MEM.delete(dead[i]);await idbDel(dead[i]);}
  fire(dead);
  return dead;
}
async function enforceQuota(){
  var items=(await all()).sort(function(a,b){return a.ts-b.ts;}),total=items.reduce(function(s,i){return s+i.size;},0),dead=[];
  while(items.length&&(items.length>DEF.maxItems||total>DEF.maxBytes)){var v=items.shift();total-=v.size;dead.push(v.id);MEM.delete(v.id);await idbDel(v.id);}
  fire(dead);
}
async function add(dataUrl,name,opts){
  opts=opts||{};
  var id=opts.id||newId(),ttl=opts.ttlMs>0?opts.ttlMs:DEF.ttlMs;
  var it={id:id,name:name||'img',size:String(dataUrl||'').length,ts:Date.now(),expiresAt:Date.now()+ttl,data:String(dataUrl||''),meta:opts.meta||null};
  MEM.set(id,it);
  await idbPut(it);
  await enforceQuota();
  return{id:id,count:MEM.size,expiresAt:it.expiresAt};
}
async function getItem(id){
  var it=MEM.get(id);
  if(!it){it=await idbGet(id);if(it&&it.id)MEM.set(id,it);else it=null;}
  if(it&&it.expiresAt&&it.expiresAt<=Date.now()){await purge();return null;}
  return it||null;
}
async function get(id){var it=await getItem(id);return it?it.data:null;}
async function has(id){await readyP;return !!(await getItem(id));}
async function list(){return(await all()).map(function(i){return{id:i.id,name:i.name,size:i.size,ts:i.ts,expiresAt:i.expiresAt};});}
async function remove(id){var had=MEM.delete(id);await idbDel(id);if(had)fire([id]);}
async function touch(id,ttlMs){
  var it=await getItem(id);
  if(!it)return false;
  it.expiresAt=Date.now()+(ttlMs>0?ttlMs:DEF.ttlMs);
  MEM.set(id,it);
  await idbPut(it);
  return it.expiresAt;
}
async function expiresAt(id){var it=await getItem(id);return it?it.expiresAt:0;}
async function clean(){var ids=(await all()).map(function(i){return i.id;});MEM.clear();await idbClear();fire(ids);return Date.now();}
function sweepStart(){
  if(timer)return;
  timer=setInterval(function(){purge();},DEF.sweepMs);
  try{document.addEventListener('visibilitychange',function(){if(!document.hidden)purge();});}catch(e){}
}
readyP=purge().then(sweepStart,sweepStart);
window.ninoTrash={add:add,list:list,get:get,has:has,remove:remove,touch:touch,expiresAt:expiresAt,purge:purge,clean:clean,ready:function(){return readyP;},EVENT:EVT,defaults:DEF};
})();
