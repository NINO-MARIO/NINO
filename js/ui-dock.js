(function(){
function $(i){return document.getElementById(i);}
function bar(){var a=$('nino-inspect');return a&&a.parentNode;}
function dock(){
var tb=bar();
if(!tb)return false;
tb.classList.add('nino-dock');
var gh=$('nino-su-btn');
if(gh&&gh.parentNode!==tb){
gh.removeAttribute('style');gh.className='nino-iconbtn nino-gh';gh.setAttribute('aria-label','ตั้งค่า GitHub');
tb.appendChild(gh);
}
var g=$('btn-google');
if(!g){g=document.createElement('button');g.id='btn-google';g.type='button';g.className='nino-iconbtn';g.setAttribute('aria-label','ค้นด้วย Google');g.textContent='G';g.addEventListener('click',function(){if(window.ninoWeb)window.ninoWeb.panel('');});tb.appendChild(g);}
var sc=$('btn-scenes');
if(sc&&sc.parentNode!==tb)tb.appendChild(sc);
return !!(gh&&sc);
}
function plus(){
var b=$('btn-img');
if(!b||b.getAttribute('data-plus'))return;
b.setAttribute('data-plus','1');b.className='nino-plus';b.setAttribute('aria-label','แนบรูปภาพ');
b.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
}
function run(){plus();dock();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true});
window.ninoDock={run:run};
})();
