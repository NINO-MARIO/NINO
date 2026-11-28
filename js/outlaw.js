(function(){
var SRC='games/outlaw/index.html';
var CSS='#outlaw-root{position:fixed;inset:0;z-index:2147483080;background:#0d0b14;color:#f1e9d8;display:none;flex-direction:column;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
+'#outlaw-root.on{display:flex}'
+'#outlaw-root.ol-full{padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)}'
+'#outlaw-root .ol-top{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:#14111a;border-bottom:1px solid #2b2437;font-size:14px}'
+'#outlaw-root.ol-full .ol-top{display:none}'
+'#outlaw-root .ol-title{font-weight:600;color:#ffe08a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
+'#outlaw-root .ol-note{color:#a99bb8;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-left:auto;margin-right:8px}'
+'#outlaw-root .ol-acts{display:flex;align-items:center;gap:8px;flex:none}'
+'#outlaw-root button{background:#272030;border:1px solid #3a3145;color:#fbf7fd;border-radius:8px;padding:8px 12px;font-size:14px;min-height:36px;flex:none}'
+'#outlaw-root .ol-stage{position:relative;flex:1;min-height:0}'
+'#outlaw-root iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#0d0b14}'
+'#outlaw-root .ol-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#a99bb8;font-size:14px;pointer-events:none;text-align:center;padding:16px}'
+'#outlaw-root .ol-msg.done{display:none}'
+'#outlaw-root .ol-exit{display:none;position:absolute;z-index:3;top:calc(env(safe-area-inset-top,0px) + .5rem);left:calc(env(safe-area-inset-left,0px) + .5rem);width:40px;height:40px;min-height:0;padding:0;align-items:center;justify-content:center;border-radius:50%;background:rgba(13,11,20,.6);border:1px solid rgba(241,233,216,.55);color:#fbf7fd;opacity:.8}'
+'#outlaw-root.ol-full .ol-exit{display:flex}'
+'#outlaw-root .ol-exit:hover,#outlaw-root .ol-exit:focus,#outlaw-root .ol-exit:active{opacity:1}';
var ICON_FULL='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
var ICON_EXIT='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';

var root=null, frame=null, msg=null, watch=null;
var WAIT_MS=20000;
var MSG_LOAD='กำลังเปิดเกม...';
var MSG_FAIL='เปิดเกมไม่ได้ เกมยังโหลดไม่ครบในเครื่องนี้ ให้เชื่อมอินเทอร์เน็ตไว้สักครู่ แล้วปิดและเปิดเกมใหม่';
/* false once the native app refuses the "immersive" op (an APK older than bridge 3): then the game just runs without hiding the bars */
var immersiveOk=true;

/* ถ้าเกมไม่ได้วาดภาพหลังโหลดหน้าไปแล้ว (ไฟล์ของเกมยังไม่ครบ) ให้บอกผู้เล่นแทนจอว่างเปล่า */
function check(){
  var d=null;
  try{d=frame&&frame.contentDocument;}catch(e){d=null;}
  if(d&&d.querySelector('canvas'))return;
  if(!frame||!frame.getAttribute('src')||frame.getAttribute('src')==='about:blank')return;
  msg.textContent=MSG_FAIL;
  msg.classList.remove('done');
}

function $(i){return document.getElementById(i);}

function css(){
  if($('outlaw-css'))return;
  var s=document.createElement('style');
  s.id='outlaw-css';
  s.textContent=CSS;
  document.head.appendChild(s);
}

function ensure(){
  if(root)return;
  css();
  root=document.createElement('div');
  root.id='outlaw-root';
  root.setAttribute('role','dialog');
  root.setAttribute('aria-label','เกม Outlaw Immortals');
  root.innerHTML='<div class="ol-top"><span class="ol-title">Outlaw Immortals</span>'
    +'<span class="ol-note">เล่นออฟไลน์ได้ เซฟอยู่ในเครื่องนี้</span>'
    +'<span class="ol-acts">'
    +'<button id="ol-full" type="button" aria-label="เต็มจอ" aria-pressed="false" title="เต็มจอ">'+ICON_FULL+'</button>'
    +'<button id="ol-close" type="button" aria-label="ปิดเกม">ปิด</button></span></div>'
    +'<div class="ol-stage"><div class="ol-msg" id="ol-msg">กำลังเปิดเกม...</div>'
    +'<iframe id="ol-frame" title="Outlaw Immortals" allow="fullscreen; autoplay"></iframe></div>'
    +'<button id="ol-exit" type="button" class="ol-exit" aria-label="ออกจากเต็มจอ" title="ออกจากเต็มจอ">'+ICON_EXIT+'</button>';
  document.body.appendChild(root);
  frame=$('ol-frame');
  msg=$('ol-msg');
  frame.addEventListener('load',function(){
    if(!frame.getAttribute('src')||frame.getAttribute('src')==='about:blank')return;
    msg.classList.add('done');
    hookKeys();
    clearTimeout(watch);
    watch=setTimeout(check,WAIT_MS);
  });
  $('ol-close').addEventListener('click',close);
  $('ol-full').addEventListener('click',toggleFull);
  $('ol-exit').addEventListener('click',function(){setFull(false);});
}

/* ปุ่มเต็มจอ: แค่สลับคลาส ไม่แตะ src ของไอเฟรม (เกมไม่โหลดใหม่ และ Phaser ปรับขนาดตามไอเฟรมที่เปลี่ยน) */
function setFull(on){
  if(!root)return;
  on=!!on;
  root.classList.toggle('ol-full',on);
  var b=$('ol-full');
  if(b)b.setAttribute('aria-pressed',on?'true':'false');
}

function toggleFull(){
  if(root)setFull(!root.classList.contains('ol-full'));
}

/* ส่งต่อไปยังแอป (ซ่อนแถบระบบ) ถ้าแอปไม่รู้จักคำสั่ง ให้จำไว้แล้วไม่ส่งอีก */
function nativeImmersive(on){
  var NN=window.ninoNative;
  if(!immersiveOk||!NN||typeof NN.call!=='function')return;
  try{
    var p=NN.call('immersive',{on:!!on});
    if(p&&typeof p.catch==='function')p.catch(function(){immersiveOk=false;});
  }catch(e){immersiveOk=false;}
}

var perfObs=null,lt={n:0,max:0,sum:0},ltTimer=0;
function musicPause(){var m=window.ninoMusic;if(m&&typeof m.pauseForGame==='function')m.pauseForGame();}
function musicResume(){var m=window.ninoMusic;if(m&&typeof m.resumeAfterGame==='function')m.resumeAfterGame();}
function probeReport(){if(lt.n)console.warn('[outlaw] longtask n='+lt.n+' max='+Math.round(lt.max)+'ms total='+Math.round(lt.sum)+'ms');}
function probeStop(quiet){if(perfObs){try{perfObs.disconnect();}catch(e){}perfObs=null;}clearInterval(ltTimer);ltTimer=0;if(!quiet)probeReport();}
function probeStart(){probeStop(true);lt={n:0,max:0,sum:0};try{if(typeof PerformanceObserver==='function'){perfObs=new PerformanceObserver(function(list){list.getEntries().forEach(function(e){lt.n++;lt.sum+=e.duration;if(e.duration>lt.max)lt.max=e.duration;});});perfObs.observe({type:'longtask',buffered:false});}}catch(e){perfObs=null;}ltTimer=setInterval(probeReport,30000);}

function open(){
  ensure();
  msg.textContent=MSG_LOAD;
  msg.classList.remove('done');
  setFull(false);
  if(!frame.getAttribute('src')||frame.getAttribute('src')==='about:blank')frame.setAttribute('src',SRC);
  root.classList.add('on');
  nativeImmersive(true);
  probeStart();
  musicPause();
}

function close(){
  if(!root)return;
  root.classList.remove('on');
  setFull(false);
  nativeImmersive(false);
  probeStop();
  musicResume();
  /* ว่างไอเฟรมเพื่อหยุดเกมและเสียง ตอนเปิดใหม่จะโหลดเกมจากไฟล์ในเครื่องอีกครั้ง */
  clearTimeout(watch);
  if(frame)frame.setAttribute('src','about:blank');
  if(msg)msg.classList.remove('done');
}

/* ย้อนกลับ (ปุ่มย้อนกลับของ Android หรือ Esc): ออกจากเต็มจอก่อน ถ้าไม่ได้เต็มจอก็ปิดเกม ตอบ true ถ้าจัดการแล้ว */
function back(){
  if(!root||!root.classList.contains('on'))return false;
  if(root.classList.contains('ol-full')){setFull(false);return true;}
  close();
  return true;
}

function onKey(e){
  if(e.key!=='Escape')return;
  if(back()){e.preventDefault();e.stopImmediatePropagation();}
}

/* เมื่อเกมมีโฟกัสอยู่ คีย์จะไม่ไปถึงหน้าหลัก จึงดักใน window ของไอเฟรมด้วย (ทำใหม่ทุกครั้งที่เกมโหลด) */
function hookKeys(){
  try{
    var w=frame.contentWindow;
    if(w&&!w.__olKeys){w.__olKeys=true;w.addEventListener('keydown',onKey,true);}
  }catch(e){}
}

document.addEventListener('keydown',onKey);

function dock(){
  if($('btn-outlaw'))return;
  var anchor=$('btn-amongai')||$('btn-scenes');
  if(!anchor||!anchor.parentNode)return;
  var b=document.createElement('button');
  b.id='btn-outlaw';
  b.type='button';
  b.className='nino-iconbtn';
  b.setAttribute('aria-label','เกม Outlaw Immortals');
  b.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l4 4"/><path d="M3 21l2-2"/></svg>';
  b.addEventListener('click',open);
  anchor.parentNode.insertBefore(b,anchor.nextSibling);
}

function run(){dock();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true});
window.ninoOutlaw={open:open,close:close,back:back,stats:function(){return{longTasks:lt.n,maxMs:Math.round(lt.max),totalMs:Math.round(lt.sum)};}};
})();
