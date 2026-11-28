(function(){
var LS=localStorage,CACHE='nino-packs',SK='nino.packs.state',CK='nino.packs.cfg';
var built=[],bi=null,man=null,busy=false,cur=null,ctl=null,queue=[],listeners=[],urls={},err={};
function cfg(){var d={lobby:true,wifiOnly:true,autoUpdate:true},c={};try{c=JSON.parse(LS.getItem(CK)||'{}');}catch(e){}return Object.assign(d,c);}
function setCfg(p){LS.setItem(CK,JSON.stringify(Object.assign(cfg(),p)));emit();}
function state(){try{return JSON.parse(LS.getItem(SK)||'{}');}catch(e){return{};}}
function save(s){LS.setItem(SK,JSON.stringify(s));}
function emit(){document.dispatchEvent(new CustomEvent('nino:packs',{detail:snapshot()}));listeners.forEach(function(f){try{f();}catch(e){}});paint();}
function ghCfg(){try{return JSON.parse(LS.getItem('nino-gh-config')||'{}');}catch(e){return{};}}
function base(){
var h=String(cfg().host||'').trim();
if(h)return h.replace(/\/*$/,'/');
if(location.hostname!=='appassets.androidplatform.net')return new URL('./packs/',location.href).href;
var r=bi&&bi.repo?bi:null,c=ghCfg();
if(r)return'https://raw.githubusercontent.com/'+r.repo+'/'+(r.branch||'main')+'/packs/';
if(c.owner)return'https://raw.githubusercontent.com/'+c.owner+'/'+(c.repo||'NINO')+'/'+(c.branch||'main')+'/packs/';
return'';
}
async function loadBuilt(){
try{var r=await fetch('./assets/scenes.json');if(r.ok){var m=await r.json();built=(m.packs||[]).map(function(p){return Object.assign({},p,{bundled:true});});}}catch(e){}
try{var r2=await fetch('./build-info.json');if(r2.ok)bi=await r2.json();}catch(e){}
}
function fx(u,o,opt){return window.ninoGuard?window.ninoGuard.fetch(u,o,opt):(window.ninoFetch||fetch)(u,o);}
async function hex(buf){var d=await crypto.subtle.digest('SHA-256',buf);return Array.from(new Uint8Array(d)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');}
async function refresh(){
var b=base();
if(!b){delete err._;man=man||{schema:1,packs:[]};emit();return man;}
try{
var r=await fx(b+'manifest.json?_='+Date.now(),{cache:'no-store'},{timeout:12000,retries:2});
if(!r.ok)throw new Error('HTTP '+r.status);
var m=await r.json();
if(!m||m.schema!==1||!Array.isArray(m.packs))throw new Error('manifest ไม่ถูกต้อง');
man=m;delete err._;
try{LS.setItem('nino.packs.man',JSON.stringify(m));}catch(e){}
}catch(e){
err._=String(e&&e.message||e);
if(!man){try{man=JSON.parse(LS.getItem('nino.packs.man')||'null');}catch(e2){}}
}
emit();return man;
}
function allPacks(){var r=man?man.packs:[];return built.filter(function(b){return !r.some(function(p){return p.id===b.id;});}).concat(r);}
function packOf(id){return allPacks().find(function(p){return p.id===id;});}
function status(id){
var p=packOf(id),s=state()[id];
if(cur&&cur.id===id)return'downloading';
if(queue.indexOf(id)>=0)return'queued';
if(!s)return p&&p.bundled?'builtin':'none';
if(p&&p.version!==s.version)return'update';
return'ready';
}
function snapshot(){
var s=state();
return{base:base(),error:err._||'',online:navigator.onLine!==false,cur:cur,busy:busy,cfg:cfg(),packs:allPacks().map(function(p){return{id:p.id,title:p.title,desc:p.desc,size:p.size,version:p.version,status:status(p.id),have:s[p.id]?s[p.id].bytes:0,fileCount:p.files.length};})};
}
async function putFile(pack,f,sig){
var r=await fx(base()+pack.id+'/'+encodeURIComponent(f.path)+'?v='+pack.version,{signal:sig},{timeout:90000,retries:2});
if(!r.ok)throw new Error(f.path+' HTTP '+r.status);
var total=Number(r.headers.get('Content-Length'))||f.size,got=0,parts=[];
if(r.body&&r.body.getReader){
var rd=r.body.getReader();
for(;;){var x=await rd.read();if(x.done)break;parts.push(x.value);got+=x.value.length;cur.fileBytes=got;cur.fileTotal=total;emit();}
}else{var ab=await r.arrayBuffer();parts.push(new Uint8Array(ab));got=ab.byteLength;}
var blob=new Blob(parts,{type:f.mime||'application/octet-stream'});
var h=await hex(await blob.arrayBuffer());
if(h!==f.sha256)throw new Error(f.path+' แฮชไม่ตรง ไฟล์เสียหายหรือถูกแก้ระหว่างทาง');
var c=await caches.open(CACHE);
await c.put(new Request(location.origin+'/__packs/'+pack.id+'/'+f.path),new Response(blob,{headers:{'Content-Type':f.mime||'application/octet-stream'}}));
return blob.size;
}
async function run(id){
var pack=packOf(id);
if(!pack)throw new Error('ไม่พบแพ็ก '+id);
var st=state(),old=st[id]||{files:{},bytes:0,version:''},keep={},bytes=0;
cur={id:id,i:0,n:pack.files.length,fileBytes:0,fileTotal:0,name:''};ctl=new AbortController();emit();
var c=await caches.open(CACHE);
for(var i=0;i<pack.files.length;i++){
var f=pack.files[i];cur.i=i;cur.name=f.path;cur.fileBytes=0;cur.fileTotal=f.size;
var same=old.files&&old.files[f.path]===f.sha256&&await c.match(new Request(location.origin+'/__packs/'+id+'/'+f.path));
if(same){keep[f.path]=f.sha256;bytes+=f.size;emit();continue;}
bytes+=await putFile(pack,f,ctl.signal);keep[f.path]=f.sha256;
var mid=state();mid[id]={version:old.version||'',files:Object.assign({},old.files,keep),bytes:bytes,at:Date.now(),partial:true};save(mid);
}
var keys=await c.keys();
for(var k=0;k<keys.length;k++){var u=new URL(keys[k].url);var pre='/__packs/'+id+'/';if(u.pathname.indexOf(pre)===0&&!keep[decodeURIComponent(u.pathname.slice(pre.length))])await c.delete(keys[k]);}
Object.keys(urls).forEach(function(k){if(k.indexOf(id+'/')===0){URL.revokeObjectURL(urls[k]);delete urls[k];}});
var done=state();done[id]={version:pack.version,files:keep,bytes:bytes,at:Date.now()};save(done);
}
async function pump(){
if(busy)return;
busy=true;
while(queue.length){
var id=queue.shift();
try{await run(id);delete err[id];}
catch(e){err[id]=(e&&e.name==='AbortError')?'หยุดไว้':String(e&&e.message||e);}
cur=null;ctl=null;emit();
}
busy=false;emit();
}
async function download(id){
if(!man)await refresh();
if(!packOf(id))return false;
if(status(id)==='ready'||status(id)==='builtin')return true;
if(queue.indexOf(id)<0&&!(cur&&cur.id===id))queue.push(id);
emit();pump();
return new Promise(function(res){
function chk(){if(status(id)==='ready'){off();res(true);}else if(!busy&&queue.indexOf(id)<0&&!(cur&&cur.id===id)){off();res(false);}}
function off(){var i=listeners.indexOf(chk);if(i>=0)listeners.splice(i,1);}
listeners.push(chk);chk();
});
}
function pause(){queue.length=0;if(ctl)ctl.abort();emit();}
async function remove(id){
var c=await caches.open(CACHE),keys=await c.keys(),pre='/__packs/'+id+'/';
for(var i=0;i<keys.length;i++)if(new URL(keys[i].url).pathname.indexOf(pre)===0)await c.delete(keys[i]);
var s=state();delete s[id];save(s);
Object.keys(urls).forEach(function(k){if(k.indexOf(id+'/')===0){URL.revokeObjectURL(urls[k]);delete urls[k];}});
emit();
}
async function blob(id,path){
var c=await caches.open(CACHE),q=new Request(location.origin+'/__packs/'+id+'/'+path),r=await c.match(q);
if(!r&&built.some(function(p){return p.id===id;})){var lr=await fetch('./assets/'+id+'/'+path);if(lr.ok)return lr.blob();}
if(!r){var ok=await download(id);if(!ok)throw new Error('ฉาก '+id+' ยังไม่พร้อม');r=await c.match(q);}
if(!r)throw new Error('ไม่พบไฟล์ '+path+' ในแพ็ก '+id);
return r.blob();
}
async function url(id,path){var k=id+'/'+path;if(urls[k])return urls[k];var b=await blob(id,path);urls[k]=URL.createObjectURL(b);return urls[k];}
function wifi(){var n=navigator.connection;if(!n)return true;if(n.saveData)return false;return !n.type||n.type==='wifi'||n.type==='ethernet'||n.effectiveType==='4g';}
async function lobby(){
var c=cfg();
if(!c.lobby||navigator.onLine===false||document.hidden)return;
if(c.wifiOnly&&!wifi())return;
if(!man)await refresh();
if(!man)return;
allPacks().forEach(function(p){if(p.bundled)return;var s=status(p.id);if(p.lobby&&s==='none')queue.push(p.id);else if(c.autoUpdate&&s==='update')queue.push(p.id);});
queue=queue.filter(function(v,i,a){return a.indexOf(v)===i;});
pump();
}
function paint(){
var b=document.getElementById('btn-scenes');
if(b){var s=snapshot(),n=s.packs.filter(function(p){return p.status==='update'||p.status==='none';}).length;
b.classList.toggle('busy',!!s.cur);
var lab=s.cur?Math.round(((s.cur.i+(s.cur.fileTotal?s.cur.fileBytes/s.cur.fileTotal:0))/s.cur.n)*100)+'%':(n?String(n):'');
b.setAttribute('data-badge',lab);
b.title=s.cur?'กำลังโหลดฉาก '+s.cur.id:'ศูนย์ดาวน์โหลดฉาก';}
var sh=document.getElementById('nino-packs-sheet');if(sh&&sh.classList.contains('open'))draw(sh);
}
function mb(n){return n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';}
function draw(sh){
var s=snapshot(),h='<div class="np-head"><b>ศูนย์ดาวน์โหลดฉาก</b><button id="np-x" class="np-x" aria-label="ปิด">ปิด</button></div>';
h+='<div class="np-note">'+(s.online?'ออนไลน์':'ออฟไลน์ ใช้ฉากที่โหลดไว้แล้ว')+(s.error?' · '+s.error.replace(/</g,'&lt;'):'')+'</div>';
if(!s.packs.length)h+='<div class="np-note">ยังไม่มีฉากให้ดาวน์โหลด</div>';
s.packs.forEach(function(p){
var pct=0,act='';
if(s.cur&&s.cur.id===p.id)pct=Math.round(((s.cur.i+(s.cur.fileTotal?s.cur.fileBytes/s.cur.fileTotal:0))/s.cur.n)*100);
else if(p.status==='ready')pct=100;
var lab={builtin:'ติดมากับแอป',none:'ดาวน์โหลด',update:'อัปเดต',ready:'ลบ',queued:'รอคิว',downloading:'หยุด'}[p.status];
act=p.status==='builtin'?'<span class="np-tag">'+lab+'</span>':'<button class="np-b" data-a="'+p.status+'" data-id="'+p.id+'">'+lab+'</button>';
h+='<div class="np-row"><div class="np-t"><b>'+p.title.replace(/</g,'&lt;')+'</b><span>'+p.desc.replace(/</g,'&lt;')+'</span><span>'+mb(p.size)+' · '+p.fileCount+' ไฟล์'+(s.cur&&s.cur.id===p.id?' · '+s.cur.name:'')+(err[p.id]?' · '+String(err[p.id]).replace(/</g,'&lt;'):'')+'</span><div class="np-bar"><i style="width:'+pct+'%"></i></div></div>'+act+'</div>';
});
h+='<div class="np-opts"><label><input type="checkbox" id="np-lobby"'+(s.cfg.lobby?' checked':'')+'> ดาวน์โหลดพื้นหลังที่หน้าหลัก</label><label><input type="checkbox" id="np-wifi"'+(s.cfg.wifiOnly?' checked':'')+'> เฉพาะ Wi-Fi</label><label><input type="checkbox" id="np-auto"'+(s.cfg.autoUpdate?' checked':'')+'> อัปเดตแพตช์ฉากอัตโนมัติ</label></div><div class="np-host"><input id="np-host" type="url" placeholder="แหล่งโหลดฉากเพิ่ม (ไม่บังคับ ใช้โฮสต์ไฟล์ที่ไหนก็ได้ ไม่ต้องใช้ GitHub)" value="'+String(s.cfg.host||'').replace(/"/g,'&quot;')+'"></div><div class="np-foot"><button id="np-r" class="np-b">รีเฟรชรายการ</button><button id="np-all" class="np-b">ดาวน์โหลดทั้งหมด</button></div>';
sh.innerHTML=h;
sh.querySelector('#np-x').onclick=closeCenter;
sh.querySelector('#np-r').onclick=function(){refresh();};
sh.querySelector('#np-all').onclick=function(){s.packs.forEach(function(p){if(p.status==='none'||p.status==='update')download(p.id);});};
sh.querySelector('#np-host').onchange=function(e){setCfg({host:e.target.value.trim()});refresh();};
sh.querySelector('#np-lobby').onchange=function(e){setCfg({lobby:e.target.checked});};
sh.querySelector('#np-wifi').onchange=function(e){setCfg({wifiOnly:e.target.checked});};
sh.querySelector('#np-auto').onchange=function(e){setCfg({autoUpdate:e.target.checked});};
sh.querySelectorAll('.np-b[data-id]').forEach(function(b){b.onclick=function(){var a=b.dataset.a,id=b.dataset.id;if(a==='ready')remove(id);else if(a==='downloading'||a==='queued')pause();else download(id);};});
}
function openCenter(){
var sh=document.getElementById('nino-packs-sheet');
if(!sh){sh=document.createElement('div');sh.id='nino-packs-sheet';sh.setAttribute('role','dialog');sh.setAttribute('aria-label','ศูนย์ดาวน์โหลดฉาก');document.body.appendChild(sh);}
sh.classList.add('open');draw(sh);if(!man)refresh();
}
function closeCenter(){var sh=document.getElementById('nino-packs-sheet');if(sh)sh.classList.remove('open');}
function toolbar(){var a=document.getElementById('nino-inspect');return a&&a.parentNode;}
function mount(){
if(document.getElementById('btn-scenes'))return;
var tb=toolbar();if(!tb)return;
var b=document.createElement('button');b.id='btn-scenes';b.type='button';b.className='nino-iconbtn';b.setAttribute('aria-label','ศูนย์ดาวน์โหลดฉาก');
b.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>';
b.addEventListener('click',function(){var sh=document.getElementById('nino-packs-sheet');if(sh&&sh.classList.contains('open'))closeCenter();else openCenter();});
tb.appendChild(b);paint();
}
function boot(){
mount();loadBuilt().then(function(){emit();});
try{man=JSON.parse(LS.getItem('nino.packs.man')||'null');}catch(e){}
setTimeout(function(){refresh().then(lobby);},4000);
document.addEventListener('nino:net',function(e){if(e.detail&&e.detail.online)refresh().then(lobby);});
document.addEventListener('visibilitychange',function(){if(!document.hidden)lobby();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.ninoScenes={list:snapshot,refresh:refresh,download:download,ensure:download,pause:pause,remove:remove,blob:blob,url:url,open:openCenter,close:closeCenter,status:status,setCfg:setCfg};
})();
