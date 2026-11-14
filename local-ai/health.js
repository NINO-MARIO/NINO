(function(){var N=window.ninoLocal,LS=localStorage,dot=null;
function want(){return (LS.getItem('nino.focus')==='l'||N.key.isOn())&&!document.hidden&&!!N.endpoint.cfg().url;}
function paint(c,t){if(dot){dot.style.background=c;dot.title=t;}}
function say(s,t){if(s&&typeof toast==='function')toast(t);}
async function check(show){if(!N.endpoint.cfg().url){paint('#6E6279','ยังไม่ได้ตั้ง Local AI');return say(show,'ยังไม่ได้ตั้ง Local AI — เปิด >_ › Local AI');}paint('#D29922','กำลังตรวจ…');try{var r=await N.endpoint.ping();paint('#8FD3B0','Local AI พร้อม · '+r.ms+' ms');say(show,'Local AI พร้อม ('+r.ms+' ms)');}catch(e){paint('#F26D78',e.message);say(show,e.message);}}
function mk(){var f=document.getElementById('nd-focus');if(!f)return setTimeout(mk,500);if(dot)return;dot=document.createElement('span');dot.id='nl-dot';dot.style.cssText='width:12px;height:12px;border-radius:50%;background:#6E6279;display:inline-block;flex:0 0 auto;cursor:pointer';dot.title='Local AI';dot.onclick=function(){check(true);};f.insertBefore(dot,f.querySelector('span[style*="flex:1"]'));tick();}
function tick(){if(want())check(false);}
setInterval(tick,30000);document.addEventListener('visibilitychange',function(){if(!document.hidden)tick();});mk();N.health={check:check};})();
