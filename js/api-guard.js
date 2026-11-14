(function(){
var HOSTS={};
var DEF={timeout:15000,retries:2,base:600};
function hostOf(u){try{return new URL(u,location.href).host;}catch(e){return'?';}}
function st(h){return HOSTS[h]||(HOSTS[h]={fails:0,until:0,last:0,ok:0});}
function isOpen(h){return st(h).until>Date.now();}
function markFail(h){var s=st(h);s.fails++;s.last=Date.now();if(s.fails>=4)s.until=Date.now()+Math.min(60000,4000*Math.pow(2,s.fails-4));}
function markOk(h){var s=st(h);s.fails=0;s.until=0;s.ok++;}
function sleep(ms,sig){return new Promise(function(res,rej){var t=setTimeout(res,ms);if(sig)sig.addEventListener('abort',function(){clearTimeout(t);rej(new DOMException('aborted','AbortError'));},{once:true});});}
function retryable(status){return status===429||status===408||status>=500;}
async function guardedFetch(url,o,opt){
o=o||{};opt=Object.assign({},DEF,opt||{});
var h=hostOf(url),f=window.ninoFetch||fetch,last=null;
if(isOpen(h)){var e0=new Error('เซิร์ฟเวอร์ '+h+' ไม่ตอบหลายครั้ง พักการเรียกชั่วคราว');e0.code='BREAKER';throw e0;}
if(navigator.onLine===false){var e1=new Error('ออฟไลน์อยู่');e1.code='OFFLINE';throw e1;}
for(var i=0;i<=opt.retries;i++){
var ac=new AbortController(),ext=o.signal,tm=setTimeout(function(){ac.abort();},opt.timeout);
var onAbort=function(){ac.abort();};
if(ext){if(ext.aborted){clearTimeout(tm);throw new DOMException('aborted','AbortError');}ext.addEventListener('abort',onAbort,{once:true});}
try{
var r=await f(url,Object.assign({},o,{signal:ac.signal}));
clearTimeout(tm);if(ext)ext.removeEventListener('abort',onAbort);
if(retryable(r.status)&&i<opt.retries){markFail(h);var ra=Number(r.headers&&r.headers.get&&r.headers.get('Retry-After'))||0;await sleep(Math.max(ra*1000,opt.base*Math.pow(2,i)+Math.random()*250),ext);continue;}
if(retryable(r.status))markFail(h);else markOk(h);
return r;
}catch(e){
clearTimeout(tm);if(ext)ext.removeEventListener('abort',onAbort);
if(ext&&ext.aborted)throw e;
last=e;markFail(h);
if(i<opt.retries)await sleep(opt.base*Math.pow(2,i)+Math.random()*250,ext);
}}
throw last||new Error('คำขอล้มเหลว');
}
async function json(url,o,opt){var r=await guardedFetch(url,o,opt);if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
function snapshot(){var out={};Object.keys(HOSTS).forEach(function(k){var s=HOSTS[k];out[k]={fails:s.fails,ok:s.ok,open:s.until>Date.now()};});return out;}
function reset(h){if(h)delete HOSTS[h];else Object.keys(HOSTS).forEach(function(k){delete HOSTS[k];});}
window.addEventListener('online',function(){reset();document.dispatchEvent(new CustomEvent('nino:net',{detail:{online:true}}));});
window.addEventListener('offline',function(){document.dispatchEvent(new CustomEvent('nino:net',{detail:{online:false}}));});
window.ninoGuard={fetch:guardedFetch,json:json,state:snapshot,reset:reset,online:function(){return navigator.onLine!==false;}};
})();
