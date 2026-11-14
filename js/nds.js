(function(){
var SRC='games/nds/index.html';
var CSS='#nds-root{position:fixed;inset:0;z-index:2147483070;background:#14111a;display:none;flex-direction:column;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
+'#nds-root.on{display:flex}'
+'#nds-root .nds-bar{flex:none;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 10px;background:#1d1824;border-bottom:2px solid #3a3145;font-size:14px;color:#e9e2ee}'
+'#nds-root .nds-bar button{background:#272030;border:1px solid #3a3145;color:#fbf7fd;border-radius:8px;padding:6px 12px;min-height:36px}'
+'#nds-root iframe{flex:1;width:100%;min-height:0;border:0;background:#14111a}';
var SVG='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter" shape-rendering="crispEdges" aria-hidden="true"><path d="M5 3h14v18H5z"/><path d="M8 3v7h8V3M9 15h6"/></svg>';
var root=null,frame=null,ext=null;

function css(){
  if(document.getElementById('nds-css'))return;
  var s=document.createElement('style');
  s.id='nds-css';
  s.textContent=CSS;
  document.head.appendChild(s);
}

function ensure(){
  if(root)return;
  css();
  root=document.createElement('div');
  root.id='nds-root';
  root.setAttribute('role','dialog');
  root.setAttribute('aria-label','ห้องสมุด NDS');
  root.innerHTML='<div class="nds-bar"><span>ห้องสมุด NDS</span><button type="button" id="nds-close">ปิด</button></div>';
  frame=document.createElement('iframe');
  frame.title='ห้องสมุด NDS';
  root.appendChild(frame);
  document.body.appendChild(root);
  root.querySelector('#nds-close').addEventListener('click',close);
}

function open(){
  ensure();
  if(!frame.getAttribute('src')||frame.getAttribute('src')==='about:blank')frame.setAttribute('src',SRC);
  root.classList.add('on');
  var m=window.ninoMusic;
  if(m&&typeof m.pauseForGame==='function')m.pauseForGame();
}

function close(){
  if(!root)return;
  root.classList.remove('on');
  if(frame)frame.setAttribute('src','about:blank');
  var m=window.ninoMusic;
  if(m&&typeof m.resumeAfterGame==='function')m.resumeAfterGame();
}

function back(){
  if(!root||!root.classList.contains('on'))return false;
  try{
    var w=frame&&frame.contentWindow;
    if(w&&typeof w.ndsBack==='function'&&w.ndsBack())return true;
  }catch(e){}
  close();
  return true;
}

function dock(){
  if(document.getElementById('btn-nds'))return;
  var anchor=document.getElementById('btn-outlaw')||document.getElementById('btn-amongai')||document.getElementById('btn-scenes');
  if(!anchor||!anchor.parentNode)return;
  var b=document.createElement('button');
  b.id='btn-nds';
  b.type='button';
  b.className='nino-iconbtn';
  b.setAttribute('aria-label','ห้องสมุด NDS');
  b.innerHTML=SVG;
  b.addEventListener('click',open);
  anchor.parentNode.insertBefore(b,anchor.nextSibling);
}

function run(){dock();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true});

if(window.ninoOutlaw&&typeof window.ninoOutlaw.back==='function'){
  ext=window.ninoOutlaw.back;
  window.ninoOutlaw.back=function(){
    if(back())return true;
    return ext.apply(this,arguments);
  };
}
window.ninoNds={open:open,close:close,back:back};
})();
