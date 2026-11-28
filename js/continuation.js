(function(){
var CUT=/^(MAX_TOKENS|INTERRUPTED)$/;
var SOFT=/^(OTHER|MALFORMED_FUNCTION_CALL|UNEXPECTED_TOOL_CALL|TOO_MANY_TOOL_CALLS|FINISH_REASON_UNSPECIFIED|LANGUAGE|NO_IMAGE)$/;
var POLICY=/SAFETY|RECITATION|BLOCKLIST|PROMPT_BLOCKED|PROHIBITED|SPII/;
var LIMIT={soft:2,policy:2,cut:40};
function classify(r){
r=String(r||'');
if(!r)return'done';
if(CUT.test(r))return'cut';
if(POLICY.test(r))return'policy';
if(SOFT.test(r))return'soft';
return'done';
}
function wait(ms,sig){return new Promise(function(res){var t=setTimeout(res,ms);if(sig)sig.addEventListener('abort',function(){clearTimeout(t);res();},{once:true});});}
function live(r,n,max){return'ต่อให้อัตโนมัติ ('+r+') รอบ '+n+'/'+max;}
function finalNotice(kind,r,tries){
if(kind==='policy')return'โมเดลหยุดก่อนกำหนด ('+r+') ต่อให้อัตโนมัติแล้ว '+tries+' รอบ ยังถูกตัดอีก เป็นตัวกรองเนื้อหาฝั่งผู้ให้บริการโมเดลที่ตัดเอง กด เขียนต่อ เพื่อลองอีกครั้ง หรือสร้างใหม่/สลับโมเดล';
return'โมเดลหยุดก่อนกำหนด ('+r+') ต่อให้อัตโนมัติแล้ว '+tries+' รอบไม่สำเร็จ กด เขียนต่อ เพื่อลองอีกครั้ง';
}
async function settle(o){
var n={soft:0,policy:0,cut:0},empty=0;
while(!(o.signal&&o.signal.aborted)){
var r=o.reason(),kind=classify(r);
if(kind==='done'){if(o.notice)o.notice('');return{ok:true};}
n[kind]++;
if(n[kind]>LIMIT[kind]&&kind!=='cut'){if(o.notice)o.notice(finalNotice(kind,r,LIMIT[kind]));return{ok:false,kind:kind,reason:r};}
if(kind==='cut'&&n.cut>LIMIT.cut){if(o.notice)o.notice('ต่อข้อความครบ '+LIMIT.cut+' รอบแล้ว กด เขียนต่อ ถ้ายังไม่จบ');return{ok:false,kind:'cut',reason:r};}
if(o.notice&&kind!=='cut')o.notice(live(r,n[kind],LIMIT[kind]));
if(kind!=='cut')await wait(300*n[kind],o.signal);
var got=0;
try{got=await o.run(kind,n[kind]);}
catch(e){if(e&&e.name==='AbortError')throw e;if(o.notice)o.notice('ต่อข้อความไม่ได้ ('+String(e&&e.message||e).slice(0,90)+') กด เขียนต่อ');return{ok:false,kind:'error'};}
if(kind==='cut'&&!(got>=3)&&++empty>=2)return{ok:false,kind:'empty'};
}
return{ok:false,kind:'aborted'};
}
window.ninoContinue={classify:classify,settle:settle,LIMIT:LIMIT,live:live,finalNotice:finalNotice,wait:wait};
})();
