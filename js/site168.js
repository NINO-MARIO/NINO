(function(){
var URL_SITE='https://168ro.online/';
/* สำเนาที่ tools/mirror-168ro.sh เก็บไว้ในเครื่อง: ถ้ามี จะเปิดจากตรงนี้ก่อนเสมอ (ใช้ได้ออฟไลน์) */
var LOCAL='games/168ro/index.html';
var CSS='#site168-root{position:fixed;inset:0;z-index:2147483079;background:#0d0b14;color:#f1e9d8;display:none;flex-direction:column;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
+'#site168-root.on{display:flex}'
+'#site168-root.s168-full{padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)}'
+'#site168-root .s168-top{flex:none;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px;padding:8px 12px;background:#14111a;border-bottom:1px solid #2b2437;font-size:14px}'
+'#site168-root.s168-full .s168-top{display:none}'
+'#site168-root .s168-title{font-weight:600;color:#ffe08a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
+'#site168-root .s168-note{color:#a99bb8;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-left:auto;margin-right:8px}'
+'#site168-root .s168-acts{display:flex;align-items:center;gap:8px;flex:none}'
+'#site168-root button,#site168-root .s168-link{background:#272030;border:1px solid #3a3145;color:#fbf7fd;border-radius:8px;padding:8px 12px;font-size:14px;min-height:36px;flex:none;text-decoration:none;display:inline-flex;align-items:center;box-sizing:border-box}'
+'#site168-root .s168-stage{position:relative;flex:1;min-height:0}'
+'#site168-root iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#0d0b14}'
+'#site168-root .s168-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#a99bb8;font-size:14px;pointer-events:none;text-align:center;padding:16px}'
+'#site168-root .s168-msg.done{display:none}'
+'#site168-root .s168-exit{display:none;position:absolute;z-index:3;top:calc(env(safe-area-inset-top,0px) + .5rem);left:calc(env(safe-area-inset-left,0px) + .5rem);width:40px;height:40px;min-height:0;padding:0;align-items:center;justify-content:center;border-radius:50%;background:rgba(13,11,20,.6);border:1px solid rgba(241,233,216,.55);color:#fbf7fd;opacity:.8}'
+'#site168-root.s168-full .s168-exit{display:flex}'
+'#site168-root .s168-exit:hover,#site168-root .s168-exit:focus,#site168-root .s168-exit:active{opacity:1}';
var ICON_FULL='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
var ICON_EXIT='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';

var root=null, frame=null, msg=null, watch=null;
var loaded=false, opened=false;
var WAIT_MS=20000;
var MSG_FIRST='กำลังโหลดเว็บครั้งแรก รอสักครู่...';
var MSG_FAIL='เปิดเว็บไม่ได้ ไม่มีสำเนาในเครื่องและไม่มีอินเทอร์เน็ต ให้เชื่อมเน็ตแล้วลองใหม่ หรือกดเปิดในเบราว์เซอร์';
/* false once the native app refuses the "immersive" op (an APK older than bridge 3) */
var immersiveOk=true;

function $(i){return document.getElementById(i);}

function css(){
  if($('site168-css'))return;
  var s=document.createElement('style');
  s.id='site168-css';
  s.textContent=CSS;
  document.head.appendChild(s);
}

/* สร้างหน้าต่างครั้งเดียว ไม่ทำลายทิ้งตอนปิด */
function ensure(){
  if(root)return;
  css();
  root=document.createElement('div');
  root.id='site168-root';
  root.setAttribute('role','dialog');
  root.setAttribute('aria-label','168ro.online');
  root.innerHTML='<div class="s168-top"><span class="s168-title">168ro.online</span>'
    +'<span class="s168-note" id="s168-note">กำลังเตรียม...</span>'
    +'<span class="s168-acts">'
    +'<button id="s168-full" type="button" aria-label="เต็มจอ" aria-pressed="false" title="เต็มจอ">'+ICON_FULL+'</button>'
    +'<a class="s168-link" href="'+URL_SITE+'" target="_blank" rel="noopener noreferrer">เปิดในเบราว์เซอร์</a>'
    +'<button id="s168-dl" type="button" title="ดาวน์โหลดไว้ใช้ออฟไลน์">โหลด</button>'
    +'<button id="s168-del" type="button" title="ลบสำเนาในเครื่อง">ลบ</button>'
    +'<button id="s168-exp" type="button" title="สำรองสำเนาเป็นไฟล์">สำรอง</button>'
    +'<button id="s168-imp" type="button" title="นำเข้าไฟล์สำรอง">นำเข้า</button>'
    +'<input id="s168-file" type="file" accept="application/json,.json" style="display:none">'
    +'<button id="s168-close" type="button" aria-label="ซ่อนเว็บ">ปิด</button></span></div>'
    +'<div class="s168-stage"><div class="s168-msg" id="s168-msg">'+MSG_FIRST+'</div>'
    +'<iframe id="s168-frame" title="168ro.online" allow="fullscreen; autoplay; clipboard-write"></iframe></div>'
    +'<button id="s168-exit" type="button" class="s168-exit" aria-label="ออกจากเต็มจอ" title="ออกจากเต็มจอ">'+ICON_EXIT+'</button>';
  document.body.appendChild(root);
  frame=$('s168-frame');
  frame.name='s168-frame';
  msg=$('s168-msg');
  if(window.nino168dl)window.nino168dl.attach(frame);
  frame.addEventListener('load',function(){
    /* โหลดครั้งแรกเสร็จแล้ว หลังจากนี้ไม่ตั้ง src ใหม่ */
    loaded=true;
    msg.classList.add('done');
    clearTimeout(watch);
  });
  $('s168-close').addEventListener('click',close);
  $('s168-dl').addEventListener('click',onDownload);
  $('s168-del').addEventListener('click',onRemove);
  $('s168-exp').addEventListener('click',onExport);
  $('s168-imp').addEventListener('click',function(){var f=$('s168-file');if(f)f.click();});
  $('s168-file').addEventListener('change',onImportPicked);
  $('s168-full').addEventListener('click',toggleFull);
  $('s168-exit').addEventListener('click',function(){setFull(false);});
}

function setFull(on){
  if(!root)return;
  on=!!on;
  root.classList.toggle('s168-full',on);
  var b=$('s168-full');
  if(b)b.setAttribute('aria-pressed',on?'true':'false');
}

function toggleFull(){
  if(root)setFull(!root.classList.contains('s168-full'));
}

/* ส่งต่อไปยังแอป (ซ่อนแถบระบบ) ใช้ op เดียวกับเกม เพื่อให้ปุ่มย้อนกลับของ Android ถูกส่งมาที่หน้านี้ */
function nativeImmersive(on){
  var NN=window.ninoNative;
  if(!immersiveOk||!NN||typeof NN.call!=='function')return;
  try{
    var p=NN.call('immersive',{on:!!on});
    if(p&&typeof p.catch==='function')p.catch(function(){immersiveOk=false;});
  }catch(e){immersiveOk=false;}
}

function musicPause(){var m=window.ninoMusic;if(m&&typeof m.pauseForGame==='function')m.pauseForGame();}
function musicResume(){var m=window.ninoMusic;if(m&&typeof m.resumeAfterGame==='function')m.resumeAfterGame();}

function check(){
  if(loaded)return;
  msg.textContent=MSG_FAIL;
  msg.classList.remove('done');
}

/* ถ้ามีสำเนาในเครื่องใช้สำเนา ไม่มีก็ใช้เว็บจริง (ซึ่งต้องมีเน็ต) */
function pickSrc(){
  return fetch(LOCAL,{cache:'no-cache'}).then(function(r){return r.ok?LOCAL:URL_SITE;}).catch(function(){return URL_SITE;});
}

function setNote(t){var n=$('s168-note');if(n)n.textContent=t;}

/* ลำดับ: สำเนาที่ดาวน์โหลดไว้ > สำเนาที่มากับแอป > เว็บจริง */
function startFrame(){
  var dl=window.nino168dl;
  var copy=dl?dl.openCopy(frame):Promise.resolve(false);
  copy.then(function(ok){
    if(ok){
      setNote('เปิดจากสำเนาในเครื่อง ใช้ได้ออฟไลน์');
      loaded=false;
      watch=setTimeout(check,WAIT_MS);
      return;
    }
    return pickSrc().then(function(src){
      setNote(src===LOCAL?'เปิดจากสำเนาที่มากับแอป':'ยังไม่มีสำเนา กดโหลดเพื่อเก็บไว้ใช้ออฟไลน์');
      frame.removeAttribute('sandbox');
      frame.setAttribute('src',src);
      watch=setTimeout(check,WAIT_MS);
    });
  });
}

var dlBusy=false;
function onDownload(){
  var dl=window.nino168dl;
  if(!dl||dlBusy)return;
  dlBusy=true;
  setNote('กำลังดาวน์โหลด...');
  dl.download(function(p){
    if(p.phase==='crawl')setNote('กำลังดาวน์โหลด '+p.done+' ไฟล์ · คิว '+p.queued);
    else setNote('กำลังแปลงเป็นไฟล์ '+p.done+'/'+p.total+' หน้า');
  }).then(function(m){
    dlBusy=false;
    setNote('เก็บแล้ว '+m.pages+' หน้า · '+m.files+' ไฟล์ · '+(m.persisted?'เก็บถาวร':'ยังไม่ได้สิทธิ์เก็บถาวร'));
    if(opened)startFrame();
  }).catch(function(e){
    dlBusy=false;
    setNote(String((e&&e.message)||e));
  });
}

function saveNative(nat,name,mime,blob){
  if(blob.size>16*1024*1024) return Promise.resolve({saved:false,why:'ไฟล์ใหญ่เกินไปสำหรับบันทึกในแอป'});
  return new Promise(function(res,rej){
    var fr=new FileReader();
    fr.onload=function(){var s=String(fr.result),k=s.indexOf(',');res(k<0?'':s.slice(k+1));};
    fr.onerror=function(){rej(fr.error);};
    fr.readAsDataURL(blob);
  }).then(function(data){return nat.call('saveFile',{name:name,mime:mime,data:data});})
    .then(function(r){return r&&r.saved?{saved:true}:{saved:false,why:(r&&r.error)||'ไม่ได้บันทึก'};});
}

function onExport(){
  var dl=window.nino168dl;
  if(!dl)return;
  var nat=window.ninoNative&&typeof window.ninoNative.call==='function'?window.ninoNative:null;
  if(nat&&!(Number(nat.bridge)>=4)){setNote('แอปรุ่นนี้ยังบันทึกไฟล์ไม่ได้ค่ะ อัปเดตแอปก่อนนะคะ');return;}
  dl.exportCopy().then(function(blob){
    if(nat){
      return saveNative(nat,'NINO-168ro-backup.json','application/json',blob).then(function(r){
        setNote(r.saved?'สำรองแล้วค่ะ':'ยังไม่ได้บันทึก: '+r.why);
      });
    }
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='NINO-168ro-backup.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1000);
    setNote('สำรองแล้ว ไฟล์ NINO-168ro-backup.json');
  }).catch(function(e){setNote(String((e&&e.message)||e));});
}

function onImportPicked(ev){
  var dl=window.nino168dl;
  var input=ev.target;
  var file=input&&input.files&&input.files[0];
  if(input)input.value='';
  if(!dl||!file)return;
  if(!window.confirm('นำเข้าไฟล์สำรองนี้? สำเนาเดิมในเครื่องจะถูกแทนที่ (ใช้เฉพาะไฟล์ที่คุณสำรองเองเท่านั้น)'))return;
  setNote('กำลังนำเข้า...');
  dl.importCopy(file).then(function(m){
    setNote('นำเข้าแล้ว '+m.pages+' หน้า');
    if(opened)startFrame();
  }).catch(function(e){setNote(String((e&&e.message)||e));});
}

function onRemove(){
  var dl=window.nino168dl;
  if(!dl)return;
  if(!window.confirm('ลบสำเนาที่เก็บไว้ในเครื่อง?'))return;
  dl.remove().then(function(){setNote('ลบสำเนาแล้ว');});
}

function open(){
  ensure();
  setFull(false);
  if(!opened){
    /* ครั้งแรกเท่านั้นที่ตั้ง src และเริ่มนับเวลารอ */
    opened=true;
    startFrame();
  }
  root.classList.add('on');
  nativeImmersive(true);
  musicPause();
}

/* ซ่อนอย่างเดียว ไม่เปลี่ยน src ของไอเฟรม หน้าเว็บ การล็อกอิน และสถานะยังอยู่ */
function close(){
  if(!root)return;
  root.classList.remove('on');
  setFull(false);
  nativeImmersive(false);
  musicResume();
}

function back(){
  if(!root||!root.classList.contains('on'))return false;
  if(root.classList.contains('s168-full')){setFull(false);return true;}
  close();
  return true;
}

function onKey(e){
  if(e.key!=='Escape')return;
  if(back()){e.preventDefault();e.stopImmediatePropagation();}
}

/* ต่อกับตัวจัดการปุ่มย้อนกลับของเกม: ให้หน้านี้จัดการก่อน ถ้าไม่ได้เปิดอยู่จึงส่งต่อให้เกมตามเดิม */
function chainGameBack(){
  var G=window.ninoOutlaw;
  if(!G||typeof G.back!=='function'||G.__site168Chained)return;
  var prev=G.back;
  G.back=function(){
    if(back())return true;
    return prev();
  };
  G.__site168Chained=true;
}

document.addEventListener('keydown',onKey);

function dock(){
  if($('btn-site168'))return;
  var anchor=$('btn-outlaw')||$('btn-amongai')||$('btn-scenes');
  if(!anchor||!anchor.parentNode)return;
  var b=document.createElement('button');
  b.id='btn-site168';
  b.type='button';
  b.className='nino-iconbtn';
  b.setAttribute('aria-label','เปิด 168ro.online');
  b.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/></svg>';
  b.addEventListener('click',open);
  anchor.parentNode.insertBefore(b,anchor.nextSibling);
}

function run(){dock();chainGameBack();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true});
window.nino168={open:open,close:close,back:back,isLoaded:function(){return loaded;}};
})();
