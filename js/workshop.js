(function(){
var KEY='nino.workshop';
function $(i){return document.getElementById(i);}
function isOn(){return localStorage.getItem(KEY)==='1';}
function apply(){
var on=isOn();
['tab-btn-files','tab-btn-preview'].forEach(function(id){var b=$(id);if(b)b.style.display=on?'':'none';});
var w=$('btn-workshop');if(w){w.classList.toggle('on',on);w.textContent=on?'Workshop: เปิด':'Workshop';}
if(!on&&typeof switchTab==='function'){var a=document.querySelector('#panel-files.active,#panel-preview.active');if(a)switchTab('chat');}
document.dispatchEvent(new CustomEvent('nino:workshop',{detail:{on:on}}));
}
function set(v){localStorage.setItem(KEY,v?'1':'0');apply();}
function mount(){
var nav=$('main-tabs');if(!nav||$('btn-workshop'))return;
var b=document.createElement('button');b.id='btn-workshop';b.type='button';b.className='btn-tactile px-3 py-2 text-xs font-mono-code';b.title='ห้องทดลองไฟล์และพรีวิว แยกจากงานแก้แอป';b.textContent='Workshop';
b.addEventListener('click',function(){set(!isOn());});
nav.appendChild(b);apply();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
window.ninoWorkshop={on:isOn,set:set};
})();
