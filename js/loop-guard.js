(function(){
var G=null;
/* ไม่ตรวจเครื่องมือกลุ่มนี้: ถามผู้ใช้ / จดบันทึก / commit ครั้งเดียว */
var EXC=/^(ask_user|skill_|journal_note|update_memory|progress_check|budget_check|wallet|switch_mode|plan_table|sh$|self_|gh_commit|gh_diff|multi$)/;
/* เครื่องมืออ่าน/ค้น: อ่านของใหม่ (พารามิเตอร์ต่าง) = สำรวจปกติ ไม่นับว่าว่างงาน · เรียกเดิมซ้ำเท่านั้นที่นับ */
var LOOK=/^(read_file|read_range|find_text|grep_files|list_functions|list_files|outline|get_diagnostics|gh_read|gh_multi_read|gh_read_func|gh_grep|gh_outline|gh_tree|gh_status|gh_history)$/;
/* แก้รีโปผ่าน gh_* ไปอยู่ใน staging ไม่ใช่ session.files → ถ้าสำเร็จถือว่ามีความคืบหน้า */
var GHW=/^(gh_edit|gh_create|gh_delete|gh_move|gh_mkdir|gh_discard|gh_restore|gh_pull|gh_push)$/;
/* warn* = ส่งคำใบ้ให้ AI ในผลลัพธ์ของเครื่องมือ (ผู้ใช้ไม่เห็น) · stop* = หยุดจริง (เกิดยากมาก)
   ปิดการหยุดจริงทั้งหมด: ninoLoopGuard.cfg.hardStop=false (เหลือเฉพาะคำใบ้ + ตัวกันงบ) */
var CFG={warnSame:2,stopSame:6,warnErrs:3,stopErrs:8,warnIdle:12,stopIdle:25,warnFlip:2,stopFlip:4,hardStop:true};
function fresh(){return{n:0,rep:{},errs:0,seen:{},idle:0};}
function S(){return typeof session!=='undefined'?session:null;}
function h(x){var s=String(x),a=5381;for(var i=0;i<s.length;i++)a=((a<<5)+a+s.charCodeAt(i))|0;return a;}
function sh(){var s=S();if(!s||!s.files)return 0;var x=0;Object.keys(s.files).sort().forEach(function(p){x=(x*31+h(p+':'+s.files[p]))|0;});return x;}
function st(o){try{return JSON.stringify(o,function(k,v){if(v&&typeof v==='object'&&!Array.isArray(v)){var r={};Object.keys(v).sort().forEach(function(q){r[q]=v[q];});return r;}return v;});}catch(e){return String(o);}}
function sug(n){
if(/^(replace_function|find_text)$/.test(n))return 'ดูชื่อจริงด้วย outline แล้วใช้ edit_batch {find,replace} หรือ {lines:[เริ่ม,จบ],text}';
if(/^gh_(tree|status|history)$/.test(n))return 'ผลเดิมอยู่ใน HISTORY แล้ว ไปต่อด้วย gh_outline {path:"ไฟล์ที่ต้องการ"} แล้วแก้ด้วย gh_edit';
if(LOOK.test(n))return 'หยุดอ่านซ้ำ ข้อมูลเดิมอยู่ใน HISTORY แล้ว ลงมือแก้ด้วย '+(/^gh_/.test(n)?'gh_edit':'edit_batch');
if(/^(write_file|stream_append)$/.test(n))return 'ใช้ edit_batch แก้เฉพาะจุดแทนเขียนทั้งไฟล์';
return 'เปลี่ยนวิธีให้ต่างจากเดิม หรือถามผู้ใช้ด้วย ask_user';}
function hint(r,n,w){var m='!'+w+' — '+sug(n);var o=Object.assign({},r,{loop_warning:m});if(o.error)o.error=o.error+' | '+m;else if(typeof o.result==='string')o.result=o.result+'\n'+m;return o;}
/* หยุดจริงเฉพาะกรณีวนหนักมาก: ข้อความสั้นบรรทัดเดียว ไม่เรียกเครื่องมือเพิ่ม ไม่ยัด list_functions */
function stop(call,n,why){var q='หยุดรอคำสั่ง: '+n+' ('+why+') จะให้ทำต่ออย่างไร?';call.args=Object.assign({},call.args||{},{question:q});if(typeof orchestratorState!=='undefined')orchestratorState.pendingQuestion=q;return{ok:true,pause:true,result:q};}
var pd=window.dispatchTool;
window.dispatchTool=async function(call){
var n=String(call&&call.name||'');
if(!G||EXC.test(n))return pd.apply(this,arguments);
var f=n+'|'+h(st(call.args||{})),h0=sh(),r=await pd.apply(this,arguments);
r=r||{ok:false,error:'ไม่มีผลลัพธ์'};
if(r.pause||r.blocked)return r;
var h1=sh(),fm=h1!==h0,okk=r.ok!==false,prog=fm||(okk&&GHW.test(n)),out=okk?'ok':'err:'+String(r.error||'').slice(0,70),key=f+'|'+out;
G.n++;G.rep[key]=(G.rep[key]||0)+1;var rc=G.rep[key];
if(prog){G.idle=0;G.errs=0;if(fm)G.seen[h1]=(G.seen[h1]||0)+1;}
else{if(!okk||rc>1||!LOOK.test(n))G.idle++;if(!okk)G.errs++;}
var same=!okk||!prog,why=null,w=null;
if(same&&rc>=CFG.stopSame)why='เรียก '+n+' เดิมซ้ำ '+rc+' ครั้งได้ผลเหมือนเดิม';
else if(same&&rc>=CFG.warnSame&&rc%2===0)w='เรียก '+n+' ด้วยพารามิเตอร์เดิมซ้ำและได้ผลเหมือนเดิม';
if(!why&&fm&&G.seen[h1]>=CFG.stopFlip)why='แก้ไฟล์วนกลับสถานะเดิม '+G.seen[h1]+' ครั้ง';
else if(!w&&fm&&G.seen[h1]===CFG.warnFlip)w='ไฟล์กลับไปเหมือนสถานะก่อนหน้า (กำลังสลับไปมา?)';
if(!why&&G.errs>=CFG.stopErrs)why='เครื่องมือล้มเหลวติดกัน '+G.errs+' ครั้ง';
else if(!w&&G.errs===CFG.warnErrs)w='ล้มเหลวติดกัน '+CFG.warnErrs+' ครั้ง';
if(!why&&G.idle>=CFG.stopIdle)why='ทำ '+G.idle+' ครั้งติดกันโดยไม่คืบหน้า (อ่าน/ค้นซ้ำ)';
else if(!w&&G.idle===CFG.warnIdle)w='อ่าน/ค้นซ้ำ '+CFG.warnIdle+' ครั้งแล้วยังไม่แก้';
if(why&&CFG.hardStop)return stop(call,n,why);
w=w||why;
return w?hint(r,n,w):r;};
function reset(){G=fresh();if(typeof orchestratorState!=='undefined')Object.assign(orchestratorState,{gateRetries:0,noopCount:0,validationRetries:0,softBlocks:0,hardBlockCount:0,planOnlyCount:0});}
['orchestratorRun','resumeOrchestrator'].forEach(function(k){var o=window[k];if(typeof o==='function')window[k]=function(){reset();return o.apply(this,arguments);};});
window.ninoLoopGuard={state:function(){return G;},reset:reset,cfg:CFG};
})();
