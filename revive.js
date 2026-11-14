(function(){
'use strict';
var CK='nino-canary',LK='nino-last-commit',MAX_AGE=3600000;
function jget(k){try{return JSON.parse(localStorage.getItem(k)||'null');}catch(e){return null;}}
function jset(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function drop(k){try{localStorage.removeItem(k);}catch(e){}}
function say(m,t){if(typeof toast==='function')toast(m,t||'ok');}
function last(){var c=jget(CK)||jget(LK);return c&&c.files&&c.parent&&c.sha?c:null;}
function markGood(){var c=jget(CK);if(c){jset(LK,c);drop(CK);}}
async function revert(c){
var gh=window.ninoGH;
if(!gh||!gh.configured()){say('ยังไม่ได้ตั้งค่า GitHub','err');return false;}
var done=[],skip=[];
for(var i=0;i<c.files.length;i++){
var f=c.files[i];
if(f==='version.js')continue;
var r=await gh.run('gh_restore',{path:f,ref:c.parent});
(r.ok?done:skip).push(f);
}
if(!done.length){say('ย้อนกลับไม่ได้: '+(skip.join(', ')||'ไม่มีไฟล์'),'err');return false;}
var r2=await gh.run('gh_commit',{message:'revert: restore '+done.join(', ')+' to '+String(c.parent).slice(0,7),confirm:true});
if(!r2.ok){say('commit ย้อนกลับไม่สำเร็จ: '+String(r2.error||'').slice(0,100),'err');return false;}
drop(CK);drop(LK);
say('ย้อนกลับแล้ว'+(skip.length?' (ข้าม: '+skip.join(', ')+')':'')+' — รอ deploy แล้วกดรีเฟรชตามแบนเนอร์','ok');
return true;
}
function open(){
var c=last();
if(!c){if(confirm('ไม่พบ commit ล่าสุดที่บันทึกไว้ในเครื่องนี้\nล้างแคช + Service Worker แล้วรีเฟรชแอปเลยไหม?')){if(window.ninoHardRefresh)window.ninoHardRefresh();else location.reload();}return;}
if(confirm('commit ล่าสุด '+String(c.sha).slice(0,7)+' แก้: '+c.files.join(', ')+'\n\nกด OK = ย้อนกลับไปก่อน commit นี้ (สร้าง commit ใหม่ ไม่ลบประวัติ)\nกด Cancel = ไม่ทำอะไร'))revert(c);
}
function fail(msg){
var c=last();
if(!c||Date.now()-(c.at||0)>MAX_AGE){console.warn('[revive] self-test failed:',msg);return;}
say('เวอร์ชันล่าสุดเปิดไม่ผ่านการตรวจ: '+String(msg).slice(0,80),'err');
if(confirm('แอปเวอร์ชันล่าสุดมีปัญหา: '+msg+'\n\nย้อนกลับ commit '+String(c.sha).slice(0,7)+' ไหม?'))revert(c);
}
window.ninoRevive={open:open,fail:fail,markGood:markGood,revert:revert,last:last};
})();
