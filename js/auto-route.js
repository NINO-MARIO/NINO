(function(){
var LS=localStorage;
var TASK=/แก้|เพิ่ม|ลบ|เปลี่ยน|ปรับ|อัปเดต|อัพเดต|แอป|ไฟล์|โค้ด|บั๊ก|บัก|ฟีเจอร์|หน้าจอ|ปุ่ม|สกิล|รีโป|commit|build|github|apk|bug|fix|code|edit|refactor|implement|patch|ui|ux|ธีม|ดีไซน์|ระบบ/i;
var CHAT_ONLY=/^(hi|hello|hey|thanks|thank you|ok|okay|สวัสดี|ขอบคุณ|โอเค|ได้เลย|555+|ว่าไง|เป็นไงบ้าง)/i;
function workshopOpen(){var a=document.querySelector('#panel-files.active,#panel-preview.active');return !!a;}
function localReady(){var N=window.ninoLocal;try{var ep=N&&N.endpoint&&N.endpoint.cfg();if(!(ep&&ep.url))return false;if(N.key&&N.key.isOn())return true;return navigator.onLine===false;}catch(e){return false;}}
function decide(text){
var t=String(text||'').trim();
if(workshopOpen())return'fs';
if(!t)return'c';
if(CHAT_ONLY.test(t)&&t.length<40)return localReady()?'l':'c';
if(TASK.test(t)||t.length>160)return'n';
return localReady()?'l':'c';
}
var prev=window.orchestratorRun;
if(typeof prev==='function'){
window.orchestratorRun=function(t){
var s=decide(t);
try{if(window.ninoScope)window.ninoScope.set(s);else LS.setItem('nino.focus',s);}catch(e){}
document.dispatchEvent(new CustomEvent('nino:route',{detail:{scope:s}}));
return prev.apply(this,arguments);
};
}
window.ninoRoute={decide:decide,workshopOpen:workshopOpen};
})();
