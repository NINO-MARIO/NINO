(function(){
var LS=localStorage,KEY='nino.web',MAXCTX=3600;
var pending=null;
var CAP={gemini:20000,cse:10000,ddg:6000,wiki:6000,stack:6000};
function cap(p,ms,name,errs){return Promise.race([p,new Promise(function(res){setTimeout(function(){errs.push(name+': หมดเวลาหลัง '+Math.round(ms/1000)+' วินาที');res([]);},ms);})]);}
function on(){return LS.getItem(KEY)!=='0';}
function setOn(v){LS.setItem(KEY,v?'1':'0');sync();document.dispatchEvent(new CustomEvent('nino:web',{detail:{on:!!v}}));}
function G(){return window.ninoGuard;}
function get(u,opt){return G().json(u,{headers:{Accept:'application/json'}},opt||{timeout:9000,retries:1});}
function plain(h){return String(h||'').replace(/<[^>]+>/g,'').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#039;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();}
function isThai(q){return /[\u0E00-\u0E7F]/.test(q);}
async function wiki(q){
var h='https://'+(isThai(q)?'th':'en')+'.wikipedia.org';
var d=await get(h+'/w/api.php?action=query&list=search&srsearch='+encodeURIComponent(q)+'&srlimit=4&format=json&origin=*');
return((d.query&&d.query.search)||[]).map(function(x){return{src:'Wikipedia',title:x.title,url:h+'/wiki/'+encodeURIComponent(String(x.title).replace(/ /g,'_')),text:plain(x.snippet)};});
}
async function ddg(q){
var d=await get('https://api.duckduckgo.com/?q='+encodeURIComponent(q)+'&format=json&no_html=1&skip_disambig=1&t=nino');
var out=[];
if(d.AbstractText)out.push({src:'DuckDuckGo',title:d.Heading||q,url:d.AbstractURL||'',text:String(d.AbstractText)});
(d.RelatedTopics||[]).slice(0,4).forEach(function(r){if(r&&r.Text)out.push({src:'DuckDuckGo',title:String(r.Text).slice(0,60),url:r.FirstURL||'',text:String(r.Text)});});
return out;
}
async function stack(q){
var d=await get('https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&pagesize=3&site=stackoverflow&filter=default&q='+encodeURIComponent(q));
return(d.items||[]).map(function(x){return{src:'Stack Overflow',title:plain(x.title),url:x.link,text:'score '+x.score+' · answers '+x.answer_count+(x.is_answered?' · answered':'')};});
}
function gcfg(){try{return JSON.parse(LS.getItem('nino.google')||'{}');}catch(e){return{};}}
function setG(p){LS.setItem('nino.google',JSON.stringify(Object.assign(gcfg(),p)));}
async function gemini(q,opt){
var c=window.getCfg?getCfg():{},k=c.apiKey||'';
if(!k||!window.ninoGuard)return[];
var m=c.model||'gemini-2.5-flash';
var ask=opt&&opt.deep?'ค้นข้อมูลล่าสุดจากเว็บเกี่ยวกับ "'+q+'" แล้วเขียนสรุปประเด็นเชิงเทคนิคที่ตรวจสอบได้ ใช้ถ้อยคำเฉพาะตามแหล่งเดิม ไม่ต้องเดา ไม่ต้องเขียนเกินแหล่ง':q;
var r=await G().fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(m)+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':k},body:JSON.stringify({contents:[{role:'user',parts:[{text:ask}]}],tools:[{google_search:{}}]})},{timeout:25000,retries:1});
if(!r.ok){var eb='';try{eb=(await r.json()).error.message;}catch(e){}throw new Error('Google ผ่าน Gemini ไม่สำเร็จ (HTTP '+r.status+(eb?': '+String(eb).slice(0,120):'')+')');}
var d=await r.json(),cd=d.candidates&&d.candidates[0];
if(!cd)return[];
var txt=((cd.content&&cd.content.parts)||[]).map(function(p){return p.text||'';}).join('');
var gm=cd.groundingMetadata||{},ch=gm.groundingChunks||[],sp=gm.groundingSupports||[];
var per={};
sp.forEach(function(s){var seg=(s.segment&&s.segment.text)||'';(s.groundingChunkIndices||[]).forEach(function(ix){(per[ix]=per[ix]||[]).push(seg);});});
var out=[];
ch.forEach(function(x,ix){if(x.web&&per[ix])out.push({src:'Google',title:x.web.title||x.web.uri||'',url:x.web.uri||'',text:per[ix].join(' ').slice(0,1500)});});
if(!out.length&&txt)out.push({src:'Google',title:q,url:'',text:txt.slice(0,2500)});
return out.slice(0,6);
}
async function cse(q){
var g=gcfg();
if(!g.key||!g.cx)return[];
var d=await get('https://www.googleapis.com/customsearch/v1?key='+encodeURIComponent(g.key)+'&cx='+encodeURIComponent(g.cx)+'&num=6&q='+encodeURIComponent(q),{timeout:10000,retries:1});
return(d.items||[]).map(function(x){return{src:'Google',title:plain(x.title),url:x.link,text:plain(x.snippet)};});
}
async function search(q,opt){
opt=opt||{};q=String(q||'').trim().slice(0,200);
var errs=[];
if(!q){var e0=[];e0.errs=errs;return e0;}
function safe(p,name,ms){return cap(p.catch(function(e){errs.push(name+': '+String(e&&e.message||e).slice(0,140));return[];}),ms||CAP.wiki,name,errs);}
var p=(window.getCfg&&getCfg().provider)||'gemini';
var jobs=[safe(cse(q),'Google CSE',CAP.cse)];
if(p==='gemini')jobs.push(safe(gemini(q,opt),'Google',CAP.gemini));
jobs.push(safe(ddg(q),'DuckDuckGo',CAP.ddg));
if(opt.wiki!==false)jobs.push(safe(wiki(q),'Wikipedia',CAP.wiki));
if(/code|js|css|python|java|error|bug|api|regex|โค้ด|บั๊ก/i.test(q))jobs.push(safe(stack(q),'Stack Overflow',CAP.stack));
var rs=await Promise.all(jobs);
var seen={},out=[];
rs.forEach(function(a){a.slice(0,opt.perSource||6).forEach(function(x){var k=(x.url||x.title)+'|'+x.src;if(!seen[k]&&(x.text||x.url)){seen[k]=1;out.push(x);}});});
out=out.slice(0,10);
out.errs=errs;
out.google=out.some(function(x){return x.src==='Google';});
return out;
}
function format(rs){
if(!rs.length)return'';
var s='';
rs.forEach(function(x,i){s+='['+(i+1)+'] '+x.src+' — '+x.title+(x.url?'\nURL: '+x.url:'')+(x.text?'\n'+String(x.text).slice(0,700):'')+'\n\n';});
return s.slice(0,MAXCTX);
}
var QRE=/ค้น|หา(ข้อมูล|ให้)|ล่าสุด|ข่าว|ราคา|คืออะไร|คือใคร|ใคร|เมื่อไหร่|ที่ไหน|อัตรา|เวอร์ชัน|วิธี|search|google|latest|news|price|who|what is|when|where|version|how to/i;
function wants(t){t=String(t||'').trim();return t.length>=6&&QRE.test(t);}
/* Chat mode: the toggle itself is the request to search. Only greetings and one-word messages are skipped. */
function substantive(t){t=String(t||'').trim();return t.length>=4&&!/^(hi|hello|hey|thanks|thank you|ok|okay|สวัสดี|ขอบคุณ|โอเค|ได้เลย|555+)/i.test(t);}
/* Chat searches only when the question needs current facts or asks for a search, so ordinary chat is not slowed down. */
var CHAT_NEEDS=/ค้น|หาข้อมูล|ตอนนี้|วันนี้|เมื่อวาน|ปัจจุบัน|เดี๋ยวนี้|ล่าสุด|ข่าว|ราคา|อัตรา|ปีนี้|เมื่อไหร่|ใครเป็น|search|google|latest|news|price|today|current|now/i;
function chatNeeds(t){return CHAT_NEEDS.test(String(t||''));}
async function prepare(text,opt){
pending=null;
opt=opt||{};
var chat=!!opt.chat;
if(!on()||!G().online())return null;
if(chat?!(substantive(text)&&chatNeeds(text)):!wants(text))return null;
var overall=chat?24000:12000;
if(chat&&window.toast)toast('กำลังค้นเว็บ...');
var errs=[];
try{
var rs=await Promise.race([search(text,{}),new Promise(function(r){setTimeout(function(){errs.push('การค้นใช้เวลานานเกิน '+overall/1000+' วินาที');r([]);},overall);})]);
errs=errs.concat((rs&&rs.errs)||[]);
var srcs=(rs||[]).slice(0,6);
pending={q:text,at:Date.now(),srcs:srcs,text:format(srcs),errs:errs,google:!!(rs&&rs.google)};
document.dispatchEvent(new CustomEvent('nino:web-used',{detail:{n:srcs.length}}));
}catch(e){pending={q:text,at:Date.now(),srcs:[],text:'',errs:[String(e&&e.message||e).slice(0,140)],google:false};}
return pending;
}
function promptBlock(){
if(!on())return'';
if(!pending||Date.now()-pending.at>120000)return'\n## WEB SEARCH\nเปิดใช้งานอยู่: ใช้เครื่องมือ web_search {query} เมื่อต้องการข้อมูลล่าสุดหรือไม่แน่ใจ อ้างแหล่งที่ใช้เสมอ';
if(!pending.text)return'\n## WEB RESULTS\nค้นเว็บสำหรับข้อความนี้แล้วแต่ไม่พบผล'+(pending.errs.length?' ('+pending.errs.join('; ')+')':'')+' ห้ามแต่งข้อมูลจากเว็บ บอกผู้ใช้ตรงๆ ว่าค้นไม่เจอ';
return'\n## WEB RESULTS (ค้นมาแล้วสำหรับข้อความนี้ ใช้อ้างอิงและบอกแหล่ง ห้ามแต่งข้อมูลนอกแหล่ง)\n'+pending.text;
}
/* Chat mode system block: the results of this turn's search, or the honest reason there are none. */
function chatBlock(){
if(!on())return'';
var p=pending;
if(!p||Date.now()-p.at>120000)return'\n\n## ผลค้นเว็บ\nการค้นเว็บเปิดอยู่แต่ไม่มีผลสำหรับข้อความนี้ ตอบจากความรู้เดิม และบอกผู้ใช้ว่าไม่ได้ค้นข้อมูลล่าสุดให้';
if(!p.text)return'\n\n## ผลค้นเว็บ\nค้นเว็บแล้วแต่ไม่พบผล'+(p.errs.length?' ('+p.errs.join('; ')+')':'')+'\nอย่าเดาข้อมูลล่าสุด บอกผู้ใช้ตรงๆ ว่าค้นไม่เจอ ถ้า error บอกสาเหตุสั้นๆ (เช่นยังไม่ได้ตั้งคีย์ Gemini หรือ cx)';
var miss=p.google?'':'\nหมายเหตุ: ยังไม่มีแหล่งจาก Google (ยังไม่ได้ตั้งคีย์ Gemini หรือ cx) ผลมาจาก Wikipedia/Stack Overflow เป็นหลัก อาจตื้น ให้บอกผู้ใช้ด้วย';
return'\n\n## ผลค้นเว็บ (ค้นให้ข้อความนี้แล้ว)\nตอบจากแหล่งนี้เป็นหลัก อ้างเลข [n] ของแหล่งที่ใช้ ห้ามเพิ่มข้อเท็จจริงที่ไม่มีในแหล่ง ถ้าแหล่งขัดกันให้บอกว่าขัดกัน'+miss+'\n'+p.text;
}
/* Source list appended under a chat answer so the person can check where it came from. */
function sourcesText(){
if(!on()||!pending||!pending.srcs||!pending.srcs.length)return'';
return'\n\nแหล่งที่ค้น:\n'+pending.srcs.slice(0,4).map(function(x,i){return'['+(i+1)+'] '+x.title+(x.url?' — '+x.url:'');}).join('\n');
}
function sync(){
var b=document.getElementById('btn-web');
if(b){b.classList.toggle('on',on());var tx='เว็บ';if(b.textContent!==tx)b.textContent=tx;b.setAttribute('aria-pressed',on()?'true':'false');}
var c=document.getElementById('nc-web');if(c)c.checked=on();
}
function mount(){
if(document.getElementById('btn-web'))return;
var img=document.getElementById('btn-img');if(!img||!img.parentNode)return;
var b=document.createElement('button');b.id='btn-web';b.type='button';b.className='btn-tactile nino-toggle';b.title='เปิด/ปิดการค้นเว็บของ NINO';
b.addEventListener('click',function(){setOn(!on());});
img.parentNode.insertBefore(b,img);sync();
}
var pd=window.dispatchTool;
window.dispatchTool=async function(call){
if(call&&call.name==='web_search'){
if(!on())return{ok:false,result:null,error:'การค้นเว็บปิดอยู่ ให้ผู้ใช้เปิดปุ่มค้นเว็บก่อน'};
try{var a=call.args||{},rs=await search(String(a.query||a.q||''));return{ok:true,result:format(rs)||('ไม่พบผลลัพธ์'+(rs.errs&&rs.errs.length?' ('+rs.errs.join('; ')+')':''))};}
catch(e){return{ok:false,result:null,error:String(e&&e.message||e)};}
}
return pd?pd.apply(this,arguments):{ok:false,result:null,error:'unknown tool'};
};
var po=window.orchestratorRun;
if(typeof po==='function')window.orchestratorRun=async function(t){
var sc=window.ninoRoute&&window.ninoRoute.decide?window.ninoRoute.decide(t):'n';
var chat=sc==='c'||sc==='l';
var report=function(r){
if(chat&&r&&window.toast){
var n=r.srcs?r.srcs.length:0;
if(n)toast('ค้นเว็บได้ '+n+' แหล่ง');
else toast('ค้นเว็บไม่พบผล: '+(r.errs[0]||'ไม่มีแหล่งที่ใช้ได้').slice(0,80),'warn');
}
return r;
};
if(chat){
/* Chat: the bubble appears at once; the answer waits for the search only when there is one to wait for. */
window.__ninoWebPending=prepare(t,{chat:true}).then(report,function(){return null;});
return po.apply(this,arguments);
}
var r=await prepare(t,{chat:false});
report(r);
return po.apply(this,arguments);
};
var pb=window.buildSystemPrompt;
if(typeof pb==='function')window.buildSystemPrompt=function(){return pb.apply(this,arguments)+promptBlock();};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
document.addEventListener('change',function(e){if(e.target&&e.target.id==='nc-web')setOn(e.target.checked);});
new MutationObserver(function(){if(document.getElementById('nc-web'))sync();}).observe(document.documentElement,{childList:true,subtree:true});

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');}
var GBASE='https://www.google.com/search?igu=1';
function mode(){return LS.getItem('nino.google.mode')==='cse'?'cse':'igu';}
function setMode(m){LS.setItem('nino.google.mode',m==='cse'?'cse':'igu');}
function destination(q,m){
q=String(q||'').trim();
m=m||mode();
if(/^https?:\/\//i.test(q))return q;
if(/^(localhost|([\w-]+\.)+[a-zA-Z]{2,})(:\d+)?([\/?#]|$)/.test(q))return'https://'+q;
if(m==='cse'){
var cx=gcfg().cx;
if(!cx)return'about:blank';
return'https://cse.google.com/cse?cx='+encodeURIComponent(cx)+(q?'&q='+encodeURIComponent(q):'');
}
return q?GBASE+'&q='+encodeURIComponent(q):GBASE;
}
function panelHtml(q){
var g=gcfg(),m=mode();
var h='<div class="gp-modes" role="tablist"><button type="button" id="gp-m-igu" class="gp-mode'+(m==='igu'?' on':'')+'" role="tab">Google (igu)</button><button type="button" id="gp-m-cse" class="gp-mode'+(m==='cse'?' on':'')+'" role="tab">Programmable Search</button></div>';
h+='<div class="gp-bar"><input id="gp-q" type="text" inputmode="search" enterkeyhint="search" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="ค้นหาหรือพิมพ์ URL" aria-label="ค้นหาหรือพิมพ์ URL" value="'+esc(q)+'"><button id="gp-go" class="np-b" type="button">ไป</button><button id="gp-x" class="np-x" type="button" aria-label="ปิด">ปิด</button></div>';
h+='<iframe id="gp-frame" title="Google Search" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" src="'+esc(destination(q,m))+'"></iframe>';
h+='<div class="gp-tools"><button id="gp-ask" class="np-b" type="button">ให้ NINO ค้นและสรุป</button><a id="gp-ext" class="np-b" target="_blank" rel="noopener" href="'+esc(destination(q,m)==='about:blank'?GBASE:destination(q,m))+'">เปิดนอกแอป</a></div>';
if(m==='cse'&&!g.cx)h+='<div class="np-note">โหมดนี้ต้องมี Search engine ID (cx) สร้างฟรีที่ programmablesearchengine.google.com เลือกค้นทั้งเว็บ แล้วใส่ด้านล่าง</div>';
else if(m==='cse')h+='<div class="np-note">โหมดทางการของ Google ใช้ cx ที่ตั้งไว้ ใส่ API Key ด้วยเพื่อให้ NINO อ่านผลได้โดยตรง</div>';
else h+='<div class="np-note">โหมด igu=1 ไม่ใช่ช่องทางทางการ Google ปิดได้ทุกเมื่อ ถ้ากรอบว่าง ให้สลับเป็น Programmable Search หรือเปิดนอกแอป · NINO อ่านเนื้อหาในกรอบไม่ได้ (ข้อจำกัดของเบราว์เซอร์) จึงมีปุ่มให้ NINO ค้นเอง</div>';
h+='<details class="gp-cfg"'+(m==='cse'?' open':'')+'><summary>Google Programmable Search (cx / API Key)</summary><input id="gp-cx" placeholder="Search engine ID (cx)" value="'+esc(g.cx)+'"><input id="gp-key" type="password" placeholder="Custom Search API Key (ให้ NINO อ่านผลได้ ไม่บังคับ)" value="'+esc(g.key)+'"><button id="gp-save" class="np-b" type="button">บันทึก</button></details>';
return h;
}
function openPanel(q,m0){
var sh=document.getElementById('nino-g-sheet');
if(!sh){sh=document.createElement('div');sh.id='nino-g-sheet';sh.className='nino-sheet nino-sheet-full';sh.setAttribute('role','dialog');sh.setAttribute('aria-label','Google');document.body.appendChild(sh);}
if(m0)setMode(m0);
function draw(qq){
sh.innerHTML=panelHtml(qq);sh.classList.add('open');
sh.querySelector('#gp-x').onclick=function(){sh.classList.remove('open');};
sh.querySelector('#gp-go').onclick=function(){draw(sh.querySelector('#gp-q').value.trim());};
sh.querySelector('#gp-q').onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();draw(sh.querySelector('#gp-q').value.trim());}};
sh.querySelector('#gp-m-igu').onclick=function(){setMode('igu');draw(sh.querySelector('#gp-q').value.trim());};
sh.querySelector('#gp-m-cse').onclick=function(){setMode('cse');draw(sh.querySelector('#gp-q').value.trim());};
sh.querySelector('#gp-save').onclick=function(){setG({cx:sh.querySelector('#gp-cx').value.trim(),key:sh.querySelector('#gp-key').value.trim()});draw(sh.querySelector('#gp-q').value.trim());};
sh.querySelector('#gp-ask').onclick=function(){
var v=sh.querySelector('#gp-q').value.trim(),p=document.getElementById('prompt-input');
sh.classList.remove('open');
if(p){p.value='ค้นเว็บแล้วสรุปให้หน่อย: '+(v&&!/^https?:/i.test(v)?v:'');p.dispatchEvent(new Event('input',{bubbles:true}));p.focus();}
if(!on())setOn(true);
};
}
draw(q||'');
}
window.ninoWeb={panel:openPanel,destination:destination,mode:mode,setMode:setMode,gcfg:gcfg,setGoogle:setG,on:on,setOn:setOn,search:search,format:format,prepare:prepare,promptBlock:promptBlock,chatBlock:chatBlock,sourcesText:sourcesText,wants:wants,sync:sync};
})();
