(function(){
/* ดาวน์โหลดเว็บไปเก็บในเครื่องแล้วแปลงแต่ละหน้าเป็นไฟล์ HTML หน้าเดียว (CSS/JS/รูปฝังอยู่ในไฟล์)
   ที่เก็บ: IndexedDB ของตัวเอง (NINO_site168) ไม่ใช่ Cache Storage ปุ่มล้างแคชของแอปไม่แตะฐานนี้
   สิทธิ์: ขอ navigator.storage.persist() หลังดาวน์โหลด
   ความปลอดภัย: หน้าที่แปลงแล้วเปิดใน iframe ที่ sandbox (allow-scripts เท่านั้น) จึงไม่เข้าถึงข้อมูลของแอปได้
   หมายเหตุ: เว็บต้องอนุญาตให้อ่านข้ามโดเมน (Access-Control-Allow-Origin) ไม่งั้นดาวน์โหลดไม่ได้ */

var BASE=(typeof window.NINO_SITE168_BASE==='string'&&window.NINO_SITE168_BASE)||'https://168ro.online/';
var ROOT=new URL(BASE);
var OLD_CACHE='nino-site168';
var SITE_DB_NAME='NINO_site168', STORE='items', DB_VER=1;
var MAX_FILES=500, MAX_BYTES=80*1024*1024, LANES=4;
var busy=false, credMode='include', dbp=null, migrated=null;

function lpOf(u){var p=u.pathname;if(p.charAt(p.length-1)==='/')p+='index.html';p=p.replace(/^\/+/,'');return p||'index.html';}
function absOf(lp){return new URL('/'+lp, ROOT.origin).href;}

function resolve(ref, baseHref){
  if(ref==null)return null;
  var v=String(ref).trim();
  if(!v||v.charAt(0)==='#'||/^(data|blob|mailto|tel|javascript):/i.test(v))return null;
  var u;try{u=new URL(v,baseHref);}catch(e){return null;}
  if(u.origin!==ROOT.origin||(u.protocol!=='http:'&&u.protocol!=='https:'))return null;
  u.hash='';return u;
}

var CSS_URL=/url\(\s*(['"]?)([^'")]*)\1\s*\)|@import\s+(['"])([^'"]+)\3/g;
function cssRefs(text, base){
  var out=[];
  String(text).replace(CSS_URL,function(m,q,u1,q2,u2){var u=resolve(u1!==undefined?u1:u2,base);if(u)out.push(u);return m;});
  return out;
}

var URL_ATTRS=['href','src','poster','data'];
function htmlRefs(doc, base){
  var out=[];
  doc.querySelectorAll('*').forEach(function(el){
    URL_ATTRS.forEach(function(a){var v=el.getAttribute(a);if(v!=null){var u=resolve(v,base);if(u)out.push(u);}});
    var ss=el.getAttribute('srcset');
    if(ss)ss.split(',').forEach(function(p){var t=p.trim().split(/\s+/)[0];var u=resolve(t,base);if(u)out.push(u);});
    var st=el.getAttribute('style');
    if(st)cssRefs(st,base).forEach(function(u){out.push(u);});
  });
  doc.querySelectorAll('style').forEach(function(el){cssRefs(el.textContent,base).forEach(function(u){out.push(u);});});
  return out;
}

/* ---------- ที่เก็บ: IndexedDB ---------- */
function db(){
  if(dbp)return dbp;
  dbp=new Promise(function(res,rej){
    var r=indexedDB.open(SITE_DB_NAME,DB_VER);
    r.onupgradeneeded=function(){var d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE);};
    r.onsuccess=function(){res(r.result);};
    r.onerror=function(){dbp=null;rej(r.error||new Error('เปิดที่เก็บข้อมูลไม่ได้'));};
  });
  return dbp;
}
function run(mode, fn){
  return db().then(function(d){return new Promise(function(res,rej){
    var t=d.transaction(STORE,mode), st=t.objectStore(STORE), req=fn(st), out;
    if(req)req.onsuccess=function(){out=req.result;};
    t.oncomplete=function(){res(out);};
    t.onerror=function(){rej(t.error||new Error('เขียนข้อมูลไม่สำเร็จ'));};
    t.onabort=function(){rej(t.error||new Error('ยกเลิกการเขียนข้อมูล'));};
  });});
}
function dbGet(k){return run('readonly',function(s){return s.get(k);});}
function dbPut(k,v){return run('readwrite',function(s){return s.put(v,k);});}
function dbDel(k){return run('readwrite',function(s){return s.delete(k);});}
function dbKeys(){return run('readonly',function(s){return s.getAllKeys();});}
function dbClear(){return run('readwrite',function(s){return s.clear();});}

/* ย้ายสำเนาจากรูปแบบเก่า (Cache Storage) มาที่ IndexedDB หนึ่งครั้งต่อการเปิดแอป */
function migrate(){
  if(migrated)return migrated;
  migrated=(async function(){
    if(!('caches' in window))return;
    var names=await caches.keys();
    if(names.indexOf(OLD_CACHE)<0)return;
    var have=await dbGet('meta');
    if(!have){
      var old=await caches.open(OLD_CACHE), reqs=await old.keys();
      for(var i=0;i<reqs.length;i++){
        var url=reqs[i].url, p=url.indexOf('/__site168/');
        if(p<0)continue;
        var rel=url.slice(p+'/__site168/'.length);
        var res=await old.match(reqs[i]);
        if(!res)continue;
        if(rel==='meta.json')await dbPut('meta',await res.json());
        else if(rel.indexOf('raw/')===0)await dbPut('raw:'+rel.slice(4),{type:res.headers.get('content-type')||'application/octet-stream',blob:await res.blob()});
        else if(rel.indexOf('page/')===0)await dbPut('page:'+rel.slice(5),await res.text());
      }
    }
    await caches.delete(OLD_CACHE);
  })().catch(function(){migrated=null;});
  return migrated;
}

/* ---------- ดาวน์โหลด ---------- */
async function getOne(href){
  var modes=[credMode,'omit'], err=null;
  for(var i=0;i<modes.length;i++){
    try{
      var res=await fetch(href,{mode:'cors',credentials:modes[i],redirect:'follow',cache:'no-cache'});
      if(!res.ok)return{href:href,status:res.status};
      credMode=modes[i];
      return{href:href,url:res.url||href,type:res.headers.get('content-type')||'',blob:await res.blob()};
    }catch(e){err=e;}
  }
  return{href:href,error:(err&&err.message)||'network'};
}

async function crawl(report){
  var seen=new Set(), queue=[], stored=[], bytes=0, skipped=0;
  function add(u){
    if(!u)return;
    if(stored.length+queue.length>=MAX_FILES)return;
    var lp=lpOf(u);
    if(seen.has(lp))return;
    seen.add(lp);queue.push(u.href);
  }
  add(ROOT);
  while(queue.length){
    var batch=queue.splice(0,LANES);
    var rs=await Promise.all(batch.map(getOne));
    for(var i=0;i<rs.length;i++){
      var r=rs[i];
      if(!r.blob){
        if(r.href===ROOT.href)throw new Error('เข้าถึงเว็บจากเครื่องนี้ไม่ได้ (ไม่มีเน็ต หรือเว็บไม่อนุญาตให้แอปอ่านข้ามโดเมน)');
        skipped++;continue;
      }
      var fin=new URL(r.url||r.href);
      if(fin.origin!==ROOT.origin){skipped++;continue;}
      if(bytes+r.blob.size>MAX_BYTES){skipped++;continue;}
      bytes+=r.blob.size;
      var lp=lpOf(fin);
      var ct=r.type||(/\.[a-z0-9]+$/i.test(lp)?'application/octet-stream':'text/html');
      await dbPut('raw:'+lp,{type:ct,blob:r.blob});
      stored.push({lp:lp,type:ct});
      var base=absOf(lp), refs=[];
      if(/html/i.test(ct)){
        var doc=new DOMParser().parseFromString(await r.blob.text(),'text/html');
        refs=htmlRefs(doc,base);
      }else if(/css/i.test(ct)){
        refs=cssRefs(await r.blob.text(),base);
      }
      refs.forEach(add);
      report({phase:'crawl',done:stored.length,queued:queue.length});
    }
  }
  return{stored:stored,skipped:skipped};
}

async function loadText(lp){
  var rv=await dbGet('raw:'+lp);
  return rv?rv.blob.text():null;
}
function blobToDataUrl(b){
  return new Promise(function(res,rej){var fr=new FileReader();fr.onload=function(){res(fr.result);};fr.onerror=function(){rej(fr.error);};fr.readAsDataURL(b);});
}
async function assetByLp(lp){
  var rv=await dbGet('raw:'+lp);
  if(!rv||/html/i.test(rv.type))return null;
  return blobToDataUrl(rv.blob);
}

/* แทน url(...) ในซีเอสเอสด้วยข้อมูลฝังตัวของไฟล์ที่เก็บไว้ */
async function cssInline(text, lp){
  var base=absOf(lp), refs=[];
  String(text).replace(CSS_URL,function(m,q,u1){refs.push(u1!==undefined?u1:null);return m;});
  var datas=[];
  for(var i=0;i<refs.length;i++){
    var u=refs[i]==null?null:resolve(refs[i],base);
    datas.push(u?await assetByLp(lpOf(u)):null);
  }
  var idx=0;
  return String(text).replace(CSS_URL,function(m,q,u1){
    var d=datas[idx++];
    if(u1===undefined||!d)return m;
    return 'url("'+d+'")';
  });
}

/* ตัวจับการคลิกลิงก์ระหว่างหน้า: ส่งเป้าหมายให้หน้าแม่ (ไม่ใช้การเข้าถึง DOM เพราะ sandbox แยก origin แล้ว) */
var NAV_SCRIPT="document.addEventListener('click',function(e){var t=e.target,a=t&&t.closest?t.closest('a[data-s168-page]'):null;if(!a)return;e.preventDefault();parent.postMessage({s168:'nav',page:a.getAttribute('data-s168-page')},'*');},true);";

async function buildPage(txt, lp, pages){
  var doc=new DOMParser().parseFromString(txt,'text/html');
  var base=absOf(lp);
  doc.querySelectorAll('base').forEach(function(b){b.remove();});
  /* CSP ของเว็บต้นทางจะบล็อกสคริปต์ที่ฝังไว้ จึงตัดออก */
  doc.querySelectorAll('meta[http-equiv]').forEach(function(m){
    if(/content-security-policy/i.test(m.getAttribute('http-equiv')||''))m.remove();
  });
  var els=Array.prototype.slice.call(doc.querySelectorAll('*'));
  var late=[];
  for(var n=0;n<els.length;n++){
    var el=els[n], tag=el.tagName;
    if(tag==='STYLE'){el.textContent=await cssInline(el.textContent,lp);continue;}
    if(tag==='LINK'&&/stylesheet/i.test(el.getAttribute('rel')||'')&&el.getAttribute('href')){
      var cu=resolve(el.getAttribute('href'),base);
      var css=cu?await loadText(lpOf(cu)):null;
      if(css!=null){var st=doc.createElement('style');st.textContent=await cssInline(css,lpOf(cu));el.parentNode.replaceChild(st,el);continue;}
    }
    if(tag==='SCRIPT'&&el.getAttribute('src')){
      var su=resolve(el.getAttribute('src'),base);
      var js=su?await loadText(lpOf(su)):null;
      if(js!=null){
        var sc=doc.createElement('script');
        if(el.getAttribute('type'))sc.setAttribute('type',el.getAttribute('type'));
        sc.textContent=js.replace(/<\/script/gi,'<\\/script');
        el.parentNode.replaceChild(sc,el);
        /* defer ต้องรันหลังโครงหน้าถูกสร้าง จึงย้ายไปท้ายเอกสาร (module เลื่อนเองอยู่แล้ว) */
        if(el.hasAttribute('defer')&&el.getAttribute('type')!=='module'){sc.parentNode.removeChild(sc);late.push(sc);}
        continue;
      }
    }
    if(tag==='IFRAME')continue;
    var attrs=['href','src','poster'];
    for(var k=0;k<attrs.length;k++){
      var a=attrs[k], v=el.getAttribute(a);
      if(v==null)continue;
      var u=resolve(v,base);
      if(!u)continue;
      var tl=lpOf(u);
      if(tag==='A'&&a==='href'){if(pages.has(tl))el.setAttribute('data-s168-page',tl);continue;}
      var d=await assetByLp(tl);
      if(d)el.setAttribute(a,d);
    }
    var ss=el.getAttribute('srcset');
    if(ss){
      var parts=[], list=ss.split(',');
      for(var j=0;j<list.length;j++){
        var t=list[j].trim();if(!t)continue;
        var sp=t.split(/\s+/);
        var su2=resolve(sp[0],base);
        var dd=su2?await assetByLp(lpOf(su2)):null;
        parts.push((dd||sp[0])+(sp[1]?' '+sp[1]:''));
      }
      el.setAttribute('srcset',parts.join(', '));
    }
    var sty=el.getAttribute('style');
    if(sty)el.setAttribute('style',await cssInline(sty,lp));
  }
  late.forEach(function(s){doc.body.appendChild(s);});
  var nav=doc.createElement('script');
  nav.textContent=NAV_SCRIPT;
  doc.body.appendChild(nav);
  return '<!doctype html>\n'+doc.documentElement.outerHTML;
}

async function convert(stored, report){
  var pages=new Set(stored.filter(function(s){return /html/i.test(s.type);}).map(function(s){return s.lp;}));
  var list=Array.from(pages), keep=new Set();
  for(var i=0;i<list.length;i++){
    var lp=list[i];
    report({phase:'convert',done:i+1,total:list.length});
    var txt=await loadText(lp);
    var out=await buildPage(txt,lp,pages);
    keep.add('page:'+lp);
    await dbPut('page:'+lp,out);
  }
  stored.forEach(function(s){keep.add('raw:'+s.lp);});
  var all=await dbKeys();
  for(var q=0;q<all.length;q++){
    var k=all[q];
    if((k.indexOf('raw:')===0||k.indexOf('page:')===0)&&!keep.has(k))await dbDel(k);
  }
  return list;
}

function isPersisted(){
  try{return navigator.storage.persisted().catch(function(){return false;});}catch(e){return Promise.resolve(false);}
}
function askPersist(){
  try{return navigator.storage.persist().catch(function(){return false;});}catch(e){return Promise.resolve(false);}
}
async function quota(){
  try{var e=await navigator.storage.estimate();return{usage:e.usage||0,quota:e.quota||0};}catch(err){return null;}
}

async function download(report){
  if(busy)throw new Error('กำลังดาวน์โหลดอยู่');
  busy=true;
  try{
    await migrate();
    await askPersist();
    var got=await crawl(report);
    var list=await convert(got.stored,report);
    if(!list.length)throw new Error('ไม่พบหน้าเว็บที่อ่านได้');
    await dbPut('meta',{savedAt:Date.now(),base:BASE,root:lpOf(ROOT),files:got.stored.length,pages:list.length,skipped:got.skipped});
    return await status();
  }finally{busy=false;}
}

async function status(){
  try{
    await migrate();
    var m=await dbGet('meta');
    if(!m)return null;
    var out=Object.assign({},m);
    out.persisted=await isPersisted();
    out.quota=await quota();
    return out;
  }catch(e){return null;}
}

async function remove(){
  await migrate();
  await dbClear();
  return true;
}

/* เปิดหน้าในสำเนาลงไอเฟรมที่ให้มา (sandbox แยก origin) คืน true ถ้ามีหน้านั้น */
async function showPage(frame, lp){
  var html=await dbGet('page:'+lp);
  if(!html)return false;
  frame.setAttribute('sandbox','allow-scripts');
  frame.removeAttribute('src');
  frame.srcdoc=html;
  return true;
}
async function openCopy(frame){
  var m=await status();
  if(!m||!m.root)return false;
  return showPage(frame,m.root);
}

/* รับการคลิกลิงก์จากหน้าสำเนา แล้วเปลี่ยนหน้าในไอเฟรมเดิม */
var attached=false;
function attach(frame){
  if(attached)return;
  attached=true;
  window.addEventListener('message',function(ev){
    var d=ev.data;
    if(!d||d.s168!=='nav'||typeof d.page!=='string')return;
    if(!frame.contentWindow||ev.source!==frame.contentWindow)return;
    showPage(frame,d.page);
  });
}

/* ---------- สำรอง/นำเข้า (ไฟล์ JSON) ---------- */
function dataUrlToBlob(s){
  var i=s.indexOf(','), head=s.slice(0,i);
  var type=(/^data:([^;,]*)/.exec(head)||[])[1]||'application/octet-stream';
  var bin=atob(s.slice(i+1)), u=new Uint8Array(bin.length);
  for(var j=0;j<bin.length;j++)u[j]=bin.charCodeAt(j);
  return new Blob([u],{type:type});
}
async function exportCopy(){
  await migrate();
  var m=await status();
  if(!m)throw new Error('ยังไม่มีสำเนาให้สำรอง');
  delete m.persisted;delete m.quota;
  var keys=await dbKeys();
  var out={format:'nino-site168',v:1,meta:m,pages:{},files:{}};
  for(var i=0;i<keys.length;i++){
    var k=keys[i];
    if(k.indexOf('page:')===0)out.pages[k.slice(5)]=await dbGet(k);
    else if(k.indexOf('raw:')===0){var rv=await dbGet(k);out.files[k.slice(4)]={type:rv.type,data:await blobToDataUrl(rv.blob)};}
  }
  return new Blob([JSON.stringify(out)],{type:'application/json'});
}
async function importCopy(file){
  await migrate();
  var obj=JSON.parse(await file.text());
  if(!obj||obj.format!=='nino-site168'||!obj.meta||!obj.pages||!obj.files)throw new Error('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ NINO');
  await dbClear();
  for(var lp in obj.pages){if(Object.prototype.hasOwnProperty.call(obj.pages,lp))await dbPut('page:'+lp,String(obj.pages[lp]));}
  for(var f in obj.files){if(Object.prototype.hasOwnProperty.call(obj.files,f)){
    await dbPut('raw:'+f,{type:String(obj.files[f].type||'application/octet-stream'),blob:dataUrlToBlob(String(obj.files[f].data))});
  }}
  await dbPut('meta',Object.assign({},obj.meta,{imported:Date.now()}));
  return status();
}

window.nino168dl={base:BASE,download:download,status:status,remove:remove,openCopy:openCopy,attach:attach,exportCopy:exportCopy,importCopy:importCopy};
})();
