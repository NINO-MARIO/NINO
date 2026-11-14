(function(){
'use strict';
var RUNNING=String(self.NINO_VERSION||'0');
var FAST_MS=15000,FAST_MAX=16,SLOW_MS=300000;
var bar=null,fast=null,fastLeft=0;
function $(id){return document.getElementById(id);}
function say(m,t){if(typeof toast==='function')toast(m,t||'ok');}
function parseVer(t){var m=/NINO_VERSION='([^']+)'/.exec(t||'');return m?m[1]:null;}
async function fetchLatest(){try{var r=await fetch('./version.js?_='+Date.now(),{cache:'no-store'});return r.ok?parseVer(await r.text()):null;}catch(e){return null;}}
function isNative(){return !!(window.NINO_NATIVE&&window.ninoOta&&window.ninoOta.native);}
function otaLabel(p){return p&&p.version?'v'+p.version:(p&&p.tag)||'?';}
function busy(){try{return typeof session!=='undefined'&&!!session&&!!session.taskMode;}catch(e){return false;}}
function refreshNow(){
if(isNative()&&window.ninoSys){window.ninoSys.updateLatest(function(m){say(m,'ok');}).catch(function(e){say('อัปเดตไม่สำเร็จ: '+e.message,'err');});return;}
if(busy()&&!confirm('AI กำลังทำงานอยู่ — รีเฟรชตอนนี้จะหยุดงานที่ค้างอยู่ ต้องการรีเฟรชเลยไหม?'))return;
if(window.ninoHardRefresh)window.ninoHardRefresh();else location.reload();
}
function hide(){if(bar&&bar.parentNode)bar.parentNode.removeChild(bar);bar=null;}
function btn(label,fn){
var b=document.createElement('button');
b.type='button';b.textContent=label;b.addEventListener('click',fn);
b.style.cssText='padding:4px 10px;border:1px solid rgba(255,255,255,.5);border-radius:6px;background:rgba(0,0,0,.25);color:#fff;font-size:12px;cursor:pointer;flex-shrink:0';
return b;
}
function show(text,ready){
if(!document.body)return;
if(!bar){
bar=document.createElement('div');
bar.id='nino-update-bar';
bar.setAttribute('role','status');
bar.style.cssText='position:fixed;left:8px;right:8px;top:calc(env(safe-area-inset-top,0px) + 8px);z-index:99999;display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;color:#fff;font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,.5)';
document.body.appendChild(bar);
}
bar.style.background=ready?'#D9558A':'#9A6700';
bar.textContent='';
var s=document.createElement('span');
s.textContent=text;s.style.flex='1';
bar.appendChild(s);
bar.appendChild(btn(isNative()?'ติดตั้งและรีบูต':'รีเฟรชเลย',refreshNow));
bar.appendChild(btn('ปิด',hide));
}
function stopFast(){if(fast){clearInterval(fast);fast=null;}}
async function check(){
if(isNative()){
try{var r=await window.ninoOta.check();if(r.available){stopFast();show('มีเวอร์ชันใหม่ (OTA) '+otaLabel(r.pointer)+' — ติดตั้งแล้วรีบูตได้เลย (ตรวจลายเซ็นให้)',true);return true;}}catch(e){}
return false;
}
var v=await fetchLatest();
if(v&&v!==RUNNING){stopFast();show('มีเวอร์ชันใหม่ v'+v+' (ตอนนี้ v'+RUNNING+') — กดรีเฟรชเพื่อใช้งาน',true);return true;}
return false;
}
function startFast(){
stopFast();fastLeft=FAST_MAX;
fast=setInterval(async function(){fastLeft--;var ok=await check();if(ok||fastLeft<=0)stopFast();},FAST_MS);
}
async function checkNow(){
if(isNative()){
try{var r=await window.ninoOta.check();if(r.available)await check();else say(r.pointer?'เป็นเวอร์ชันล่าสุดแล้ว ('+r.running.id+')':'ยังไม่มีเวอร์ชัน OTA บน GitHub (ต้อง commit และรอ CI)','ok');}catch(e){say('ตรวจอัปเดตไม่ได้: '+e.message,'err');}
return;
}
var v=await fetchLatest();
if(v===null){say('ตรวจอัปเดตไม่ได้ (ออฟไลน์?)','err');return;}
if(v!==RUNNING)await check();else say('เป็นเวอร์ชันล่าสุดแล้ว (v'+RUNNING+')','ok');
}
async function offerCommit(){
var gh=window.ninoGH;
if(!gh||!gh.configured||!gh.configured())return null;
var st=gh.stagedList();
if(!st.length)return null;
if(!confirm('มีไฟล์ที่ AI แก้แล้วแต่ยังไม่ได้ commit ลง repo:\n- '+st.join('\n- ')+'\n\nคอมมิทเลยไหม? (กด Cancel = เก็บไว้ก่อน)'))return null;
var r=await gh.run('gh_commit',{message:'update: '+st.slice(0,4).join(', ')+(st.length>4?' +'+(st.length-4):''),confirm:true});
if(r.ok)say('commit สำเร็จ','ok');else say('commit ไม่สำเร็จ: '+String(r.error||'').slice(0,100),'err');
return r;
}
function setBadge(){var el=$('nino-ver-badge');if(el)el.textContent='NINO v'+RUNNING+' · build '+(self.NINO_BUILD||'?');}
function announce(){
try{
var k='nino_last_ver',p=localStorage.getItem(k);
if(p&&p!==RUNNING){var ch=(self.NINO_CHANGES||[])[0];say('อัปเดตเป็น v'+RUNNING+(ch?' — '+ch.c:''),'ok');}
localStorage.setItem(k,RUNNING);
}catch(e){}
}
window.addEventListener('nino:committed',function(e){
var d=e.detail||{};
if(!d.runtime)return;
if(isNative()){show('commit '+String(d.sha||'').slice(0,7)+(d.version?' → v'+d.version:'')+' แล้ว — เปิดคอนโซล › Versions แล้วกด Build เพื่อสร้างและติดตั้งเวอร์ชันนี้ทั้งแอป',false);return;}
show('commit '+String(d.sha||'').slice(0,7)+(d.version?' → v'+d.version:'')+' แล้ว — รอ GitHub Pages deploy ราว 1 นาที แอปจะแจ้งอีกครั้งเมื่อพร้อมรีเฟรช',false);
startFast();
});
document.addEventListener('visibilitychange',function(){if(!document.hidden)check();});
document.addEventListener('click',function(e){if(e.target&&e.target.id==='nino-check-update')checkNow();});
window.addEventListener('load',function(){setBadge();setTimeout(announce,1500);});
setTimeout(check,4000);
setInterval(check,SLOW_MS);
window.ninoUpdate={check:check,checkNow:checkNow,refreshNow:refreshNow,offerCommit:offerCommit,show:show,version:RUNNING};
})();
