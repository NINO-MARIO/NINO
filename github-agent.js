(function(){
'use strict';
var KEY='nino-gh-config',SKEY='nino-gh-stage',API='https://api.github.com';
var LIM={win:220,chars:12000,result:14000,lineCap:10000,turnRead:999999999,fileMax:400000,grepFiles:60,createMax:200000,keep:0.5,seen:3};
var BIN=/\.(png|jpe?g|gif|webp|ico|bmp|pdf|zip|gz|jar|apk|aab|jks|keystore|woff2?|ttf|otf|mp3|mp4|wav|ogg|webm|so|dex|class)$/i;
var PROT=/^(self-upgrade\.js|github-agent\.js|nino-agent\.js|revive\.js|revive\.html|service-worker\.js|lock\.js|skill-lib\.js|\.github\/|android\/|tools\/ci\/|tools\/check\.js|tools\/make-now\.js|tools\/test\/|js\/ota\.js|js\/obs\.js|js\/term\.js|js\/loop-guard\.js|js\/delegate\.js|js\/lib-health\.js|js\/prompt-cache\.js|js\/native-bridge\.js)/;
var RUNTIME=/^(app\.js|js\/[\w.-]+\.js|index\.html|style\.css|version\.js|update-notifier\.js|revive\.js|github-agent\.js|nino-agent\.js|service-worker\.js|self-upgrade\.js|code-brain\.js|roleplay-callback\.js|trash\.js)$/;
var SECRET=/ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AIza[0-9A-Za-z_\-]{35}|sk-[A-Za-z0-9]{32,}/;
var S={tree:null,treeAt:0,staged:{},blobs:{},turn:{read:0,seen:{}},active:false,rate:null};
var H={};
var T={};
function cfg(){try{var c=JSON.parse(localStorage.getItem(KEY)||'{}');return{owner:String(c.owner||'').trim(),repo:String(c.repo||'NINO').trim(),branch:String(c.branch||'main').trim(),token:String(c.token||'').trim()};}catch(e){return{owner:'',repo:'nino-app',branch:'main',token:''};}}
function configured(){var c=cfg();return !!(c.owner&&c.repo&&c.token);}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
function encPath(p){return String(p).split('/').map(encodeURIComponent).join('/');}
function fail(m){return{ok:false,result:null,error:m};}
function good(r,x){var o={ok:true,result:r,error:null};if(x)Object.keys(x).forEach(function(k){o[k]=x[k];});return o;}
function extOf(p){var m=/\.([A-Za-z0-9]+)$/.exec(p);return m?m[1].toLowerCase():'';}
function isRoot(p){return p==null||/^(\.|\.\/|\/|)$/.test(String(p).trim());}
function norm(p){var s=String(p||'').trim().replace(/\\/g,'/').replace(/^(\.\/)+/,'').replace(/^\/+/,'');if(!s||/(^|\/)\.\.(\/|$)/.test(s)||s.length>200)throw new Error('path ไม่ถูกต้อง: '+p);return s;}
function esc(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function clip(s,n){s=String(s);return s.length>n?s.slice(0,n)+'…':s;}
function lineAt(t,i){var n=1;for(var k=0;k<i&&k<t.length;k++)if(t.charCodeAt(k)===10)n++;return n;}
function occ(t,f){var r=[],i=0;while((i=t.indexOf(f,i))!==-1){r.push(i);i+=f.length;if(r.length>500)break;}return r;}
async function mapLimit(items,n,fn){var out=new Array(items.length),i=0;async function w(){while(i<items.length){var k=i++;out[k]=await fn(items[k],k);}}var ws=[];for(var k=0;k<Math.min(n,items.length);k++)ws.push(w());await Promise.all(ws);return out;}
async function errText(res){try{var j=await res.json();return res.status+' '+(j.message||res.statusText);}catch(e){return res.status+' '+res.statusText;}}
async function api(method,path,body,accept){
var c=cfg();
if(!c.owner||!c.repo||!c.token)throw new Error('ยังไม่ได้ตั้งค่า GitHub — กดปุ่ม ใส่ owner/repo/token');
if(S.rate!==null&&S.rate<3)throw new Error('GitHub rate limit ใกล้หมด รอสักครู่');
var url=API+'/repos/'+encodeURIComponent(c.owner)+'/'+encodeURIComponent(c.repo)+path,res;
for(var i=0;i<2;i++){
var h={'Accept':accept||'application/vnd.github+json','Authorization':'Bearer '+c.token,'X-GitHub-Api-Version':'2022-11-28'};
if(body)h['Content-Type']='application/json';
res=await fetch(url,{method:method,headers:h,body:body?JSON.stringify(body):undefined,cache:'no-store'});
var rem=res.headers.get('x-ratelimit-remaining');
if(rem!==null)S.rate=+rem;
if(res.status>=500&&i===0){await sleep(700);continue;}
break;
}
return res;
}
function save(){try{localStorage.setItem(SKEY,JSON.stringify(S.staged));}catch(e){try{localStorage.removeItem(SKEY);}catch(_){}}}
function restore(){try{var j=JSON.parse(localStorage.getItem(SKEY)||'{}');if(j&&typeof j==='object')S.staged=j;}catch(e){S.staged={};}}
async function loadTree(force){
if(!force&&S.tree&&Date.now()-S.treeAt<60000)return S.tree;
var c=cfg();
var res=await api('GET','/git/trees/'+encPath(c.branch)+'?recursive=1');
if(!res.ok)throw new Error(await errText(res));
var j=await res.json(),map={};
(j.tree||[]).forEach(function(e){if(e.type==='blob')map[e.path]={sha:e.sha,size:e.size||0,mode:e.mode||'100644'};});
S.tree={sha:j.sha,map:map,truncated:!!j.truncated};
S.treeAt=Date.now();
return S.tree;
}
async function blob(sha){
if(S.blobs[sha]!==undefined)return S.blobs[sha];
var res=await api('GET','/git/blobs/'+sha,null,'application/vnd.github.raw+json');
if(!res.ok)throw new Error(await errText(res));
var t=await res.text();
if(Object.keys(S.blobs).length>150)S.blobs={};
S.blobs[sha]=t;
return t;
}
async function getText(p){
var s=S.staged[p];
if(s)return s.del?null:s.text;
var t=await loadTree(false),e=t.map[p];
if(!e)return null;
if(BIN.test(p))throw new Error('ไฟล์ไบนารี อ่านไม่ได้: '+p);
if(e.size>LIM.fileMax)throw new Error('ไฟล์ใหญ่เกิน '+LIM.fileMax+' bytes: '+p+' — ใช้ gh_grep ช่วย');
return (await blob(e.sha)).replace(/\r\n/g,'\n');
}
function crlfOf(p){var s=S.staged[p];if(s)return !!s.crlf;var e=S.tree&&S.tree.map[p];return !!(e&&S.blobs[e.sha]&&/\r\n/.test(S.blobs[e.sha]));}
function rev(p){return S.staged[p]?S.staged[p].rev:0;}
function put(p,text,base,baseSha,crlf,del){
var c=S.staged[p];
S.staged[p]={text:text,base:c?c.base:base,baseSha:c?c.baseSha:baseSha,crlf:c?c.crlf:!!crlf,rev:(c?c.rev:0)+1,del:!!del};
save();
}
function allPaths(){var m={};if(S.tree)Object.keys(S.tree.map).forEach(function(k){m[k]=1;});Object.keys(S.staged).forEach(function(k){if(S.staged[k].del)delete m[k];else m[k]=1;});return Object.keys(m).sort();}
function sizeOf(p){var s=S.staged[p];if(s&&!s.del)return s.text.length;var e=S.tree&&S.tree.map[p];return e?e.size:0;}
function span(a,b){var i=0,n=Math.min(a.length,b.length);while(i<n&&a[i]===b[i])i++;var j=0;while(j<n-i&&a[a.length-1-j]===b[b.length-1-j])j++;return{i:i,ja:a.length-j,jb:b.length-j};}
function numRange(ls,s,e,cap){var o=[];for(var i=s;i<=e;i++)o.push(i+': '+clip(ls[i-1],cap||200));return o;}
function windowTxt(ls,s,e){var n=e-s+1;if(n<=40)return numRange(ls,s,e).join('\n');return numRange(ls,s,s+19).concat(['…(ข้าม '+(n-35)+' บรรทัด)'],numRange(ls,e-14,e)).join('\n');}
function tidy(str,ext,raw){
if(raw||typeof str!=='string')return{t:str,n:0};
var js=/^(js|mjs|cjs|ts|jsx|tsx|html|htm)$/.test(ext),css=ext==='css';
if(!js&&!css)return{t:str,n:0};
var out=[],n=0,blk=false,ls=str.split('\n');
ls.forEach(function(l){
var s=l.trim();
if(blk){n++;if(s.indexOf('*/')>=0)blk=false;return;}
if(!s&&ls.length>1){n++;return;}
if(js&&/^\/\/(?!#)/.test(s)){n++;return;}
if(/^\/\*(?!!)/.test(s)){if(s.indexOf('*/')<0)blk=true;n++;return;}
if(ext.indexOf('htm')===0&&/^<!--.*-->$/.test(s)){n++;return;}
out.push(l);
});
return{t:out.join('\n'),n:n};
}
function jsErr(t){if(/^\s*(import|export)\s/m.test(t))return null;try{new Function(t);return null;}catch(e){return e.name+': '+e.message;}}
function cssErr(t){var s=t.replace(/\/\*[\s\S]*?\*\//g,'').replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g,'');var o=(s.match(/\{/g)||[]).length,c=(s.match(/\}/g)||[]).length;return o===c?null:'วงเล็บปีกกา CSS ไม่สมดุล { '+o+' } '+c;}
function htmlErr(t){var re=/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,m,k=0;while((m=re.exec(t))){k++;if(/\bsrc\s*=/.test(m[1])||/type\s*=\s*["'](?!text\/javascript)/i.test(m[1]))continue;var e=jsErr(m[2]);if(e)return 'inline <script> #'+k+' '+e;}var so=(t.match(/<script\b/gi)||[]).length,sc=(t.match(/<\/script>/gi)||[]).length;return so===sc?null:'<script> ปิดไม่ครบ';}
function iifeRest(t){var m=/^\s*(?:(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)\s*)*(?:['"]use strict['"];?\s*)?(\(\s*function\b)/.exec(t);if(!m)return null;var open=t.indexOf('(',m.index+m[0].length-m[1].length),close=scan(t,open,'(',')');if(close<0)return-1;return t.slice(close+1).replace(/^\s*(\(\s*\))?\s*;?/,'').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g,'').trim().length;}
function dupNames(t){var re=declRe(''),m,c={},d=0;while((m=re.exec(t))){var n=m[2]||m[3]||m[4];c[n]=(c[n]||0)+1;if(c[n]===2)d++;}return d;}
function integrity(p,oldT,newT){if(!/\.(js|mjs)$/.test(p))return null;var a=iifeRest(oldT||''),b=iifeRest(newT);if(b===-1&&a!==-1)return'IIFE ปิดไม่ครบ';if(b>0&&!(a>0))return'มีโค้ด '+b+' ตัวอักษรอยู่นอก IIFE — ต้องแทรกก่อนบรรทัดปิด })(); เท่านั้น';if(dupNames(newT)>dupNames(oldT||''))return'ประกาศชื่อ function/const ซ้ำเพิ่ม — ใช้ op block แทนที่ของเดิม ห้ามตั้งชื่อใหม่ซ้ำ';return null;}
function askUser(msg){try{return H.userConfirm?!!H.userConfirm(msg):(typeof confirm==='function'?confirm(msg):true);}catch(e){return false;}}
function check(p,t){
var ext=extOf(p);
if(ext==='json'){try{JSON.parse(t);}catch(e){return e.message;}return null;}
if(/^(js|mjs|cjs)$/.test(ext))return jsErr(t);
if(ext==='css')return cssErr(t);
if(ext==='html'||ext==='htm')return htmlErr(t);
return null;
}
function skipStr(t,i){var q=t[i],n=t.length;i++;while(i<n){var c=t[i];if(c==='\\'){i+=2;continue;}if(q==='`'&&c==='$'&&t[i+1]==='{'){var e=scan(t,i+1,'{','}');if(e<0)return n;i=e+1;continue;}if(c===q)return i+1;if(q!=='`'&&c==='\n')return i;i++;}return n;}
function scan(t,i,o,c){
var d=0,n=t.length,prev='';
while(i<n){
var ch=t[i];
if(ch==='\''||ch==='"'||ch==='`'){i=skipStr(t,i);prev='s';continue;}
if(ch==='/'){
var nx=t[i+1];
if(nx==='/'){while(i<n&&t[i]!=='\n')i++;continue;}
if(nx==='*'){var e=t.indexOf('*/',i+2);i=e<0?n:e+2;continue;}
if(prev===''||'(,=:[!&|?{};+-*%<>~^'.indexOf(prev)>=0){
i++;var cls=false;
while(i<n){var r=t[i];if(r==='\\'){i+=2;continue;}if(r==='\n')break;if(r==='[')cls=true;else if(r===']')cls=false;else if(r==='/'&&!cls){i++;break;}i++;}
while(i<n&&/[a-z]/i.test(t[i]))i++;
prev='s';continue;
}
}
if(ch===o)d++;
else if(ch===c){d--;if(d===0)return i;}
if(/[\w$]/.test(ch))prev='a';else if(!/\s/.test(ch))prev=ch;
i++;
}
return -1;
}
function declEnd(t,k,kind){
var p=k,open=-1,q;
if(kind==='class'){open=t.indexOf('{',k);}
else if(kind==='function'){var pe=scan(t,t.indexOf('(',k-1),'(',')');if(pe<0)return null;open=t.indexOf('{',pe);}
else{
while(/\s/.test(t[p]))p++;
if(t.startsWith('async',p)&&/\s|\(/.test(t[p+5]))p+=5;
while(/\s/.test(t[p]))p++;
if(t.startsWith('function',p)){var pe2=scan(t,t.indexOf('(',p),'(',')');if(pe2<0)return null;open=t.indexOf('{',pe2);}
else if(t[p]==='('){var pe3=scan(t,p,'(',')');if(pe3<0)return null;q=pe3+1;while(/\s/.test(t[q]))q++;if(t.substr(q,2)!=='=>')return null;q+=2;while(/\s/.test(t[q]))q++;if(t[q]!=='{')return null;open=q;}
else if(t[p]==='{'||t[p]==='[')open=p;
else{var am=/^[\w$]+\s*=>\s*/.exec(t.slice(p,p+80));if(!am||t[p+am[0].length]!=='{')return null;open=p+am[0].length;}
}
if(open<0)return null;
var cl=scan(t,open,t[open]==='['?'[':'{',t[open]==='['?']':'}');
if(cl<0)return null;
var end=cl+1;
if(t[end]===';')end++;
return{open:open,end:end};
}
function declRe(ind){return new RegExp('^'+ind+'((?:async\\s+)?function\\s*\\*?\\s+([\\w$]+)\\s*\\(|class\\s+([\\w$]+)\\b|(?:const|let|var)\\s+([\\w$]+)\\s*=)','gm');}
function declKind(g){return /function/.test(g)?'function':/^class/.test(g)?'class':'const';}
function findBlock(t,name){
var nm=String(name||'').replace(/[^\w$]/g,'');
if(!nm)return null;
var inds=['','[ \\t]{1,8}'];
for(var q=0;q<inds.length;q++){
var re=declRe(inds[q]),m;
while((m=re.exec(t))){
if((m[2]||m[3]||m[4])!==nm)continue;
var st=m.index+m[0].length-m[1].length,k=st+m[1].length,d=declEnd(t,k,declKind(m[1]));
if(d)return{start:st,end:d.end};
}
}
return null;
}
function jsSymbols(t,ind){
ind=ind||'';
var re=declRe(ind),m,o=[],cnt={},line=1,last=0;
while((m=re.exec(t))){
var nm=m[2]||m[3]||m[4],st=m.index+m[0].length-m[1].length,k=st+m[1].length;
for(;last<st;last++)if(t.charCodeAt(last)===10)line++;
var d=declEnd(t,k,declKind(m[1]));
cnt[nm]=(cnt[nm]||0)+1;
o.push({line:line,kind:declKind(m[1]),name:nm,size:d?d.end-st:0});
}
if(o.length<3&&!ind)return jsSymbols(t,'[ \\t]{0,8}');
return o.map(function(s){return 'L'+s.line+' '+s.kind+' '+s.name+(s.size?' ('+s.size+'c)':'')+(cnt[s.name]>1?' DUP':'');});
}
function build(text,ops,ext,raw){
var lines=text.split('\n'),total=lines.length,lo=[],to=[],tn=0;
function T2(s){var r=tidy(s,ext,raw);tn+=r.n;return r.t;}
function err(m){return{err:m};}
for(var i=0;i<ops.length;i++){
var o=ops[i]||{},k=o.op,tag='op#'+(i+1)+' '+k,nl;
if(k==='lines'||k==='delete'){
var s=+o.start,e=+(o.end||o.start);
if(!(s>=1&&e>=s&&e<=total))return err(tag+': ช่วงบรรทัด '+o.start+'-'+(o.end||o.start)+' ไม่ถูกต้อง (ไฟล์มี '+total+' บรรทัด)');
if(k==='delete'||o.text===''||o.text==null)nl=[];
else{var tt=T2(String(o.text));nl=tt===''?[]:tt.split('\n');if(!nl.length&&String(o.text).trim())return err(tag+': เนื้อหาว่างหลังกรองคอมเมนต์/บรรทัดว่าง');}
lo.push({s:s,e:e,n:nl,i:i});
}else if(k==='insert'){
var at=o.after!=null?+o.after:+o.before-1;
if(!(at>=0&&at<=total)||isNaN(at))return err(tag+': ตำแหน่ง insert ไม่ถูกต้อง');
var t2=T2(String(o.text==null?'':o.text));
if(t2==='')return err(tag+': text ว่างหลังกรองคอมเมนต์/บรรทัดว่าง');
lo.push({s:at+1,e:at,n:t2.split('\n'),i:i});
}else if(k==='replace'||k==='block'||k==='append'||k==='prepend')to.push({o:o,tag:tag});
else return err(tag+': op ไม่รู้จัก (ใช้ replace|lines|delete|insert|block|append|prepend)');
}
lo.sort(function(a,b){return a.s-b.s||a.e-b.e||a.i-b.i;});
for(var q=0;q<lo.length-1;q++){var X=lo[q],Y=lo[q+1];if(X.e>=Y.s&&!(X.e<X.s&&Y.e<Y.s))return err('ops เลขบรรทัดซ้อนกัน (op#'+(X.i+1)+' กับ op#'+(Y.i+1)+')');}
for(var j=lo.length-1;j>=0;j--)lines.splice.apply(lines,[lo[j].s-1,Math.max(0,lo[j].e-lo[j].s+1)].concat(lo[j].n));
var out=lines.join('\n');
for(var z=0;z<to.length;z++){
var op=to[z].o,tg=to[z].tag;
if(op.op==='replace'){
var f=String(op.find==null?'':op.find);
if(!f)return err(tg+': find ว่าง');
var pos=occ(out,f);
if(!pos.length)return err(tg+': ไม่พบข้อความ "'+clip(f,60)+'" — ตรวจด้วย gh_read/gh_grep ก่อน');
if(pos.length>1&&!op.all&&!op.occurrence)return err(tg+': พบ '+pos.length+' ที่ (บรรทัด '+pos.slice(0,6).map(function(x){return lineAt(out,x);}).join(',')+') — ระบุ occurrence:N หรือ all:true');
var w=T2(String(op.with==null?'':op.with));
if(w===''&&String(op.with||'').trim())return err(tg+': with ว่างหลังกรองคอมเมนต์');
if(op.all)out=out.split(f).join(w);
else{var at2=pos[(+op.occurrence||1)-1];if(at2===undefined)return err(tg+': occurrence เกินจำนวนที่พบ ('+pos.length+')');out=out.slice(0,at2)+w+out.slice(at2+f.length);}
}else if(op.op==='block'){
var b=findBlock(out,op.name),viaH=false;
if(!b&&H.findTopLevelBlock){b=H.findTopLevelBlock(out,op.name);viaH=true;}
if(!b)return err(tg+': ไม่พบ function/class/const "'+op.name+'" (ต้องอยู่ต้นบรรทัด) — ใช้ gh_outline ตรวจชื่อ หรือใช้ op replace/lines');
var st=b.start;
if(viaH&&out.slice(st-6,st)==='async ')st-=6;
var cd=T2(String(op.code||'')).trim();
if(!cd)return err(tg+': code ว่าง');
out=out.slice(0,st)+cd+out.slice(b.end);
}else if(op.op==='append'){
var ta=T2(String(op.text||''));
if(!ta)return err(tg+': text ว่าง');
var nlA=/\n$/.test(out);
out=out.replace(/\n+$/,'')+'\n'+ta+(nlA?'\n':'');
}else{
var tp=T2(String(op.text||''));
if(!tp)return err(tg+': text ว่าง');
out=tp+'\n'+out;
}
}
return{text:out,tidy:tn};
}
function listing(prefix,depth){
var p=prefix?prefix.replace(/\/+$/,''):'',dirs={},files=[];
allPaths().forEach(function(k){
if(p&&k.indexOf(p+'/')!==0&&k!==p)return;
var rel=p?k.slice(p.length+1):k,parts=rel.split('/');
if(parts.length>depth){var dn=(p?p+'/':'')+parts.slice(0,depth).join('/')+'/';dirs[dn]=(dirs[dn]||0)+1;}
else files.push(k);
});
var o=files.map(function(k){return k+' ('+sizeOf(k)+'B)'+(S.staged[k]?' *':'');});
Object.keys(dirs).forEach(function(d){o.push(d+' ('+dirs[d]+' ไฟล์)');});
return o;
}
function outline(path,t){
var ext=extOf(path),ls=t.split('\n'),o=[];
if(/^(js|mjs|cjs|ts|jsx|tsx)$/.test(ext)){o=jsSymbols(t);}
else if(ext==='html'||ext==='htm'){ls.forEach(function(l,i){var m;if(/<(script|style)\b/i.test(l))o.push('L'+(i+1)+' '+clip(l.trim(),70));else if((m=l.match(/\bid=["']([^"']+)["']/)))o.push('L'+(i+1)+' #'+m[1]);});}
else if(ext==='css'){ls.forEach(function(l,i){if(/^[^\s}\/][^{]*\{/.test(l))o.push('L'+(i+1)+' '+clip(l.split('{')[0].trim(),60));});}
else if(ext==='md'){ls.forEach(function(l,i){if(/^#{1,4}\s/.test(l))o.push('L'+(i+1)+' '+clip(l,70));});}
else if(ext==='json'){ls.forEach(function(l,i){var m=l.match(/^\s{0,2}"([^"]+)"\s*:/);if(m)o.push('L'+(i+1)+' '+m[1]);});}
var n=o.length;
if(n>360)o=o.slice(0,360).concat(['…+'+(n-360)+' รายการ']);
return o;
}
T.gh_tree=async function(a){
await loadTree(!!a.refresh);
var p=isRoot(a.path)?'':norm(a.path),d=Math.max(1,+a.depth||(p?3:2)),o=listing(p,d);
if(!o.length)return fail('ไม่พบ path: '+(p||'/'));
var n=o.length;
if(n>200)o=o.slice(0,200).concat(['…+'+(n-200)+' รายการ — ระบุ path']);
var c=cfg();
return good('['+c.owner+'/'+c.repo+'@'+c.branch+' '+allPaths().length+' ไฟล์'+(S.tree.truncated?' (tree ถูกตัด)':'')+']\n'+o.join('\n'));
};
T.gh_outline=async function(a){
if(isRoot(a.path))return T.gh_tree({depth:1});
var p=norm(a.path),t=await getText(p);
if(t===null)return fail('ไม่พบไฟล์ '+p);
var o=outline(p,t);
return good('[OUTLINE '+p+' '+t.split('\n').length+' บรรทัด rev='+rev(p)+']\n'+(o.length?o.join('\n'):'(ไม่มีโครงสร้างที่ตรวจพบ — ใช้ gh_read/gh_grep)'));
};
T.gh_read=async function(a){
var p=norm(a.path),t=await getText(p);
if(t===null)return fail('ไม่พบไฟล์ '+p);
var ls=t.split('\n'),total=ls.length,s=Math.max(1,+a.startLine||1),e=a.endLine?Math.min(total,+a.endLine):Math.min(total,s+LIM.win-1);
if(s>total||e<s)return fail('ช่วงบรรทัดไม่ถูกต้อง (ไฟล์มี '+total+' บรรทัด)');
var key=p+'|'+s+'|'+e+'|'+rev(p)+'|'+t.length;
S.turn.seen[key]=(S.turn.seen[key]||0)+1;
if(S.turn.seen[key]>LIM.seen)return fail('อ่านช่วงนี้ซ้ำเกิน '+LIM.seen+' ครั้งแล้ว — ใช้ผลใน [HISTORY] หรือ gh_edit ได้เลย');
var c0=a.endCol?Math.max(0,+a.startCol||0):0,c1=a.endCol?+a.endCol:0;
var body=[],chars=0,i;
for(i=s;i<=e;i++){
var raw=ls[i-1],seg=c1?raw.slice(c0,c1):raw;
if(!c1&&seg.length>LIM.lineCap)seg=seg.slice(0,LIM.lineCap)+'…[+'+(raw.length-LIM.lineCap)+' chars — ใช้ startCol/endCol หรือ gh_grep]';
var ln=i+': '+seg;
if(chars+ln.length>LIM.chars&&i>s)break;
body.push(ln);chars+=ln.length+1;
}
S.turn.read+=chars;
if(S.turn.read>LIM.turnRead)return fail('อ่านต่อเทิร์นเกินขีด ('+LIM.turnRead+' chars) — สรุปงาน commit แล้วค่อยทำต่อในเทิร์นถัดไป');
var last=s+body.length-1;
return good('[GH '+p+' lines '+s+'-'+last+'/'+total+' rev='+rev(p)+' '+t.length+'B]\n'+body.join('\n')+(last<total?'\n[next: startLine='+(last+1)+']':'\n[EOF]'));
};
T.gh_grep=async function(a){
var pat=String(a.pattern||'');
if(!pat)return fail('pattern required');
var fl=a.ignoreCase?'i':'',re;
try{re=new RegExp(pat,fl);}catch(e){re=new RegExp(esc(pat),fl);}
await loadTree(false);
var pre=a.path?[].concat(a.path).map(function(x){return norm(x).replace(/\/$/,'');}):null;
var exts=a.ext?[].concat(a.ext).map(function(x){return String(x).replace(/^\./,'').toLowerCase();}):null;
var paths=allPaths().filter(function(p){
if(BIN.test(p)||sizeOf(p)>LIM.fileMax)return false;
if(pre&&!pre.some(function(x){return p===x||p.indexOf(x+'/')===0;}))return false;
if(exts&&exts.indexOf(extOf(p))<0)return false;
return true;
});
function hot(p){if(S.staged[p])return 1;var e=S.tree.map[p];return e&&S.blobs[e.sha]!==undefined?1:0;}
paths.sort(function(x,y){return hot(y)-hot(x);});
var scan=paths.slice(0,LIM.grepFiles),skipped=paths.length-scan.length;
var texts=await mapLimit(scan,6,async function(p){try{return await getText(p);}catch(e){return null;}});
var ctx=Math.max(0,Math.min(3,+a.context||0)),max=Math.max(1,Math.min(60,+a.max||30)),out=[],cnt=0;
function snip(l,idx,len){return l.length<=180?l:'…'+l.slice(Math.max(0,idx-70),idx+len+70)+'…';}
scan.forEach(function(p,k){
var t=texts[k];
if(t==null||cnt>=max)return;
var ls=t.split('\n');
for(var i=0;i<ls.length&&cnt<max;i++){
var m=re.exec(ls[i]);
if(!m)continue;
cnt++;
for(var b=Math.max(0,i-ctx);b<i;b++)out.push(p+':'+(b+1)+'- '+clip(ls[b],160));
out.push(p+':'+(i+1)+': '+snip(ls[i],m.index,m[0].length));
for(var f=i+1;f<=Math.min(ls.length-1,i+ctx);f++)out.push(p+':'+(f+1)+'- '+clip(ls[f],160));
}
});
var txt=out.join('\n');
S.turn.read+=txt.length;
return good('[grep /'+pat+'/ hits='+cnt+' ไฟล์ที่ค้น '+scan.length+'/'+paths.length+(skipped>0?' — ระบุ path/ext เพื่อจำกัด':'')+']\n'+(txt||'(ไม่พบ)'));
};
T.gh_edit=async function(a){
var p=norm(a.path),ops=a.ops;
if(!Array.isArray(ops)||!ops.length)return fail('ops ว่าง');
if(ops.length>40)return fail('ops เกิน 40 รายการ แยกเป็นหลายคำสั่ง');
var cur=await getText(p);
if(cur===null)return fail('ไม่พบไฟล์ '+p+' (ไฟล์ใหม่ใช้ gh_create)');
if(a.rev!=null&&+a.rev!==rev(p))return fail('rev ไม่ตรง (ปัจจุบัน rev='+rev(p)+') — gh_read ช่วงที่เกี่ยวข้องใหม่');
var r=build(cur,ops,extOf(p),!!a.raw);
if(r.err)return fail(r.err);
if(r.text===cur)return fail('ไม่มีการเปลี่ยนแปลง');
if(!a.allowShrink&&cur.length>500&&r.text.length<cur.length*LIM.keep)return fail('ลบเกินครึ่งไฟล์ — ยืนยันด้วย allowShrink:true');
var ve=check(p,r.text);
if(ve&&!check(p,cur))return fail('ไวยากรณ์ผิด ไม่ได้ stage: '+ve);
var ie=integrity(p,cur,r.text);
if(ie)return fail('โครงสร้างผิด ไม่ได้ stage: '+ie);
var e0=S.tree&&S.tree.map[p];
put(p,r.text,cur,e0?e0.sha:null,crlfOf(p));
var A=cur.split('\n'),B=r.text.split('\n'),d=span(A,B),s=Math.max(1,d.i),e=Math.min(B.length,Math.max(d.jb+2,s));
var dl=r.text.length-cur.length;
return good('OK '+p+' rev='+rev(p)+' Δ'+(dl>=0?'+':'')+dl+' chars '+A.length+'→'+B.length+' บรรทัด (stage แล้ว ยังไม่ commit)'+(r.tidy?' tidy-'+r.tidy+' บรรทัด':'')+'\n'+windowTxt(B,s,e));
};
T.gh_create=async function(a){
var p=norm(a.path),c=String(a.content==null?'':a.content);
if(!c)return fail('content ว่าง');
if(c.length>LIM.createMax)return fail('content ใหญ่เกิน '+LIM.createMax+' chars แยกสร้างเป็นหลายไฟล์/ใช้ gh_edit append');
var ex=await getText(p);
if(ex!==null){
if(!a.overwrite)return fail('ไฟล์มีอยู่แล้ว — ใช้ gh_edit');
if(ex.length>2000&&!a.force)return fail('ห้ามเขียนทับทั้งไฟล์ใหญ่ — ใช้ gh_edit เฉพาะจุด');
}
var t=tidy(c,extOf(p),!!a.raw).t,ve=check(p,t);
if(ve)return fail('ไวยากรณ์ผิด ไม่ได้ stage: '+ve);
var ie=integrity(p,ex||'',t);
if(ie)return fail('โครงสร้างผิด ไม่ได้ stage: '+ie);
var e0=S.tree&&S.tree.map[p];
put(p,t,ex,e0?e0.sha:null,false);
return good('OK '+(ex===null?'สร้าง ':'เขียนทับ ')+p+' '+t.split('\n').length+' บรรทัด '+t.length+' chars rev='+rev(p)+' (stage แล้ว)');
};
T.gh_delete=async function(a){
var p=norm(a.path),ex=await getText(p);
if(ex===null)return fail('ไม่พบไฟล์ '+p);
var s=S.staged[p];
if(s&&s.baseSha==null){delete S.staged[p];save();return good('ยกเลิกไฟล์ใหม่ที่ stage ไว้ '+p);}
var e0=S.tree&&S.tree.map[p];
put(p,'',ex,e0?e0.sha:null,crlfOf(p),true);
return good('OK ลบ '+p+' (stage แล้ว)');
};
T.gh_move=async function(a){
var f=norm(a.from),t=norm(a.to),src=await getText(f);
if(src===null)return fail('ไม่พบไฟล์ '+f);
if(await getText(t)!==null)return fail('ปลายทางมีอยู่แล้ว '+t);
var cr=crlfOf(f),r=await T.gh_delete({path:f});
if(!r.ok)return r;
put(t,src,null,null,cr);
return good('OK ย้าย '+f+' → '+t+' (stage แล้ว)');
};
function diffOf(p){
var s=S.staged[p];
if(s.del)return '--- '+p+' (ลบ '+(s.base?s.base.split('\n').length:0)+' บรรทัด)';
if(s.base==null)return '+++ '+p+' (ไฟล์ใหม่ '+s.text.split('\n').length+' บรรทัด)';
var A=s.base.split('\n'),B=s.text.split('\n'),d=span(A,B),o=['@@ '+p+' -'+(d.i+1)+','+(d.ja-d.i)+' +'+(d.i+1)+','+(d.jb-d.i)+' @@'];
var rm=A.slice(d.i,d.ja),ad=B.slice(d.i,d.jb);
rm.slice(0,30).forEach(function(l,k){o.push('-'+(d.i+1+k)+': '+clip(l,160));});
if(rm.length>30)o.push('…-'+(rm.length-30)+' บรรทัด');
ad.slice(0,30).forEach(function(l,k){o.push('+'+(d.i+1+k)+': '+clip(l,160));});
if(ad.length>30)o.push('…+'+(ad.length-30)+' บรรทัด');
return o.join('\n');
}
T.gh_diff=async function(a){
var ps=a.path?[norm(a.path)]:Object.keys(S.staged);
ps=ps.filter(function(p){return S.staged[p];});
if(!ps.length)return good('(ไม่มีไฟล์ staged)');
return good(ps.map(diffOf).join('\n'));
};
T.gh_status=async function(){
var c=cfg(),ps=Object.keys(S.staged),o=[c.owner+'/'+c.repo+'@'+c.branch+' rate='+(S.rate===null?'?':S.rate)+' อ่านเทิร์นนี้='+S.turn.read+'/'+LIM.turnRead];
ps.forEach(function(p){var s=S.staged[p];o.push((s.del?'D ':s.base==null?'A ':'M ')+p+' rev='+s.rev+' '+(s.del?0:s.text.length)+'B');});
if(!ps.length)o.push('(ไม่มีไฟล์ staged)');
return good(o.join('\n'));
};
T.gh_discard=async function(a){
if(a.path){var p=norm(a.path);if(!S.staged[p])return fail('ไม่ได้ stage '+p);delete S.staged[p];save();return good('ยกเลิก '+p);}
var n=Object.keys(S.staged).length;S.staged={};save();return good('ยกเลิกทั้งหมด '+n+' ไฟล์');
};
async function bumpVersion(msg){
var p='version.js',cur=await getText(p);
if(cur===null)return null;
var re=/NINO_VERSION='(\d+)\.(\d+)\.(\d+)'/,m=re.exec(cur);
if(!m)return null;
var st=S.staged[p];
if(st&&st.base!=null){var b=re.exec(st.base);if(b&&b[0]!==m[0])return{from:b[1]+'.'+b[2]+'.'+b[3],to:m[1]+'.'+m[2]+'.'+m[3],auto:false};}
var feat=/^(feat|feature)/i.test(msg),n=[+m[1],feat?+m[2]+1:+m[2],feat?0:+m[3]+1].join('.');
var d=new Date(),y=d.getFullYear(),mo=('0'+(d.getMonth()+1)).slice(-2),da=('0'+d.getDate()).slice(-2);
var note=String(msg).split('\n')[0].replace(/['"\\]/g,'').slice(0,120);
var t=cur.replace(re,"NINO_VERSION='"+n+"'").replace(/NINO_BUILD=\d+/,'NINO_BUILD='+y+mo+da);
var head='NINO_CHANGES=[\n',at=t.indexOf(head);
if(at<0)return null;
at+=head.length;
t=t.slice(0,at)+"{v:'"+n+"',d:'"+y+'-'+mo+'-'+da+"',c:'"+note+"'},\n"+t.slice(at);
if(check(p,t))return null;
var e0=S.tree&&S.tree.map[p];
put(p,t,cur,e0?e0.sha:null,crlfOf(p));
return{from:m[1]+'.'+m[2]+'.'+m[3],to:n,auto:true};
}
T.gh_commit=async function(a){
var c=cfg(),ps=Object.keys(S.staged);
if(a.paths){var want=[].concat(a.paths).map(norm);ps=ps.filter(function(p){return want.indexOf(p)>=0;});}
if(!ps.length)return fail('ไม่มีไฟล์ staged ให้ commit');
var msg=String(a.message||'').trim();
if(!msg)return fail('message required');
var bump=null;
if(!a.noBump&&ps.some(function(p){return RUNTIME.test(p)&&p!=='version.js';})){try{bump=await bumpVersion(msg);}catch(e){bump=null;}if(bump&&ps.indexOf('version.js')<0)ps.push('version.js');}
var pr=ps.filter(function(p){return PROT.test(p);});
var big=ps.filter(function(p){var s=S.staged[p];if(s.del||s.base==null)return false;var g=s.text.length-s.base.length;return g>40000||(s.base.length>20000&&g>s.base.length*0.25);});
if(pr.length||big.length){var why=(pr.length?'แตะไฟล์ระบบ: '+pr.join(', ')+'. ':'')+(big.length?'ไฟล์โตผิดปกติ: '+big.join(', ')+'. ':'');if(!(a.confirm||a.approved))return fail(why+'ต้องส่ง confirm:true และผู้ใช้ต้องกดอนุมัติ');if(!askUser('NINO ขอ commit — '+why+'อนุมัติไหม?'))return fail('ผู้ใช้ไม่อนุมัติ');}
for(var i=0;i<ps.length;i++){var s=S.staged[ps[i]];if(!s.del&&SECRET.test(s.text)&&!(s.base&&SECRET.test(s.base)))return fail('พบรูปแบบ token/API key ใน '+ps[i]+' — ไม่ commit');}
var t=await loadTree(true),bad=[];
ps.forEach(function(p){var cur=t.map[p]?t.map[p].sha:null;if(cur!==S.staged[p].baseSha)bad.push(p);});
if(bad.length)return fail('ไฟล์ถูกแก้บน GitHub ไปแล้ว: '+bad.join(', ')+' — gh_discard แล้วอ่านใหม่');
var r=await api('GET','/git/ref/heads/'+encPath(c.branch));
if(!r.ok)return fail(await errText(r));
var head=(await r.json()).object.sha;
r=await api('GET','/git/commits/'+head);
if(!r.ok)return fail(await errText(r));
var base=(await r.json()).tree.sha,items=[],err=null;
await mapLimit(ps,4,async function(p){
var s=S.staged[p],mode=t.map[p]?t.map[p].mode:'100644';
if(s.del){items.push({path:p,mode:mode,type:'blob',sha:null});return;}
var rb=await api('POST','/git/blobs',{content:s.crlf?s.text.replace(/\n/g,'\r\n'):s.text,encoding:'utf-8'});
if(!rb.ok){err=await errText(rb);return;}
items.push({path:p,mode:mode,type:'blob',sha:(await rb.json()).sha});
});
if(err)return fail('สร้าง blob ไม่สำเร็จ: '+err);
r=await api('POST','/git/trees',{base_tree:base,tree:items});
if(!r.ok)return fail('สร้าง tree ไม่สำเร็จ: '+await errText(r));
var tree=(await r.json()).sha;
r=await api('POST','/git/commits',{message:msg,tree:tree,parents:[head]});
if(!r.ok)return fail('สร้าง commit ไม่สำเร็จ: '+await errText(r));
var cm=await r.json();
r=await api('PATCH','/git/refs/heads/'+encPath(c.branch),{sha:cm.sha,force:false});
if(!r.ok)return fail('อัปเดต branch ไม่สำเร็จ: '+await errText(r));
ps.forEach(function(p){delete S.staged[p];});
save();S.tree=null;
var rf=ps.filter(function(p){return RUNTIME.test(p);});
if(rf.length){try{localStorage.setItem('nino-canary',JSON.stringify({sha:cm.sha,parent:head,files:rf,at:Date.now()}));}catch(e){}}
try{window.dispatchEvent(new CustomEvent('nino:committed',{detail:{sha:cm.sha,files:ps.slice(),runtime:rf.length>0,version:bump?bump.to:null,message:msg}}));}catch(e){}
return good('COMMIT '+cm.sha.slice(0,7)+' '+ps.length+' ไฟล์: '+ps.join(', ')+'\nhttps://github.com/'+c.owner+'/'+c.repo+'/commit/'+cm.sha+''+(bump?'\nเวอร์ชัน v'+bump.from+' → v'+bump.to+(bump.auto?' (ระบบ bump ให้เอง)':''):'')+(rf.length?'\nแอปขึ้นแบนเนอร์ให้ผู้ใช้กดรีเฟรชเองแล้ว — บอกผู้ใช้สั้นๆ ว่ารอ GitHub Pages deploy ประมาณ 1 นาทีแล้วกดรีเฟรช':''),{sha:cm.sha,version:bump?bump.to:null});
};
T.gh_history=async function(a){
var c=cfg(),q='?sha='+encodeURIComponent(c.branch)+'&per_page='+Math.max(1,Math.min(20,+a.limit||8))+(a.path?'&path='+encodeURIComponent(norm(a.path)):'');
var r=await api('GET','/commits'+q);
if(!r.ok)return fail(await errText(r));
var j=await r.json();
return good(j.map(function(x){return x.sha.slice(0,7)+' '+String(x.commit.author.date).slice(0,10)+' '+clip(String(x.commit.message).split('\n')[0],80);}).join('\n')||'(ไม่มี commit)');
};
T.gh_restore=async function(a){
var p=norm(a.path),ref=String(a.ref||'').trim();
if(!ref)return fail('ref required (sha จาก gh_history)');
var r=await api('GET','/contents/'+encPath(p)+'?ref='+encodeURIComponent(ref),null,'application/vnd.github.raw+json');
if(!r.ok)return fail(await errText(r));
var txt=(await r.text()).replace(/\r\n/g,'\n'),cur=await getText(p),ve=check(p,txt);
if(ve)return fail('ไวยากรณ์ผิด: '+ve);
var e0=S.tree&&S.tree.map[p];
put(p,txt,cur,e0?e0.sha:null,crlfOf(p));
return good('OK คืน '+p+' จาก '+ref.slice(0,7)+' rev='+rev(p)+' (stage แล้ว)');
};
T.gh_multi_read=async function(a){
var secs=a.sections||[];
if(!secs.length)return fail('sections required: [{path,startLine?,endLine?}] max 5');
if(secs.length>5)return fail('max 5 sections');
var out=[];
for(var i=0;i<secs.length;i++){
var s=secs[i],p=norm(s.path),t=await getText(p);
if(t===null){out.push('['+p+'] NOT FOUND');continue;}
var ls=t.split('\n'),tot=ls.length;
var st=Math.max(1,+(s.startLine||1));
var en=Math.min(tot,+(s.endLine||tot));
out.push('['+p+'] L'+st+'-'+en+'/'+tot+':\n'+ls.slice(st-1,en).map(function(l,j){return(st+j)+': '+l;}).join('\n'));
}
return good('multi_read '+secs.length+'/5:\n'+out.join('\n---\n'));
};
T.gh_read_func=async function(a){
var p=norm(a.path),fn=String(a.name||'').trim();
if(!fn)return fail('name required');
var txt=await getText(p);
if(txt===null)return fail('ไม่พบไฟล์ '+p);
var L=txt.split('\n'),s=-1,e=-1;
for(var i=0;i<L.length;i++){
var l=L[i];
if(l.indexOf(fn)!==-1&&/function|T\.|const |var |let /.test(l)){s=i;break;}
}
if(s===-1)return fail('ไม่พบ '+fn+' ใน '+p);
var d=0,o=false;
for(var i=s;i<L.length;i++){
for(var c=0;c<L[i].length;c++){
if(L[i][c]==='{'){d++;o=true;}
if(L[i][c]==='}'){d--;}
}
if(o&&d===0){e=i;break;}
}
if(e===-1)e=Math.min(s+50,L.length-1);
return good('['+p+'] '+fn+' L'+(s+1)+'-'+(e+1)+'/'+L.length+':\n'+L.slice(s,e+1).map(function(l,j){return(s+1+j)+': '+l;}).join('\n'));
};
async function run(name,a){
try{
var fn=T[name];
if(!fn)return fail('ไม่รู้จักเครื่องมือ: '+name);
var r=await fn(a||{});
if(r.ok&&typeof r.result==='string'&&r.result.length>LIM.result)r.result=r.result.slice(0,LIM.result)+'\n…[ตัด '+(r.result.length-LIM.result)+' chars]';
return r;
}catch(e){return fail(String(e&&e.message||e));}
}
var RULES=[
'tool_call.name → args:',
'gh_tree {path?,depth?,refresh?} | gh_outline {path} แผนที่ function/id/section+เลขบรรทัด (เรียกก่อนอ่านไฟล์ใหญ่)',
'gh_read {path,startLine?,endLine?,startCol?,endCol?} อ่าน "N: text" ทีละ ≤220 บรรทัด ดู [next] ท้ายผล | gh_grep {pattern,path?,ext?,context?,max?,ignoreCase?} ค้นทุกไฟล์',
'gh_edit {path,rev?,ops:[...]} แก้เฉพาะจุดแล้ว stage (ยังไม่ commit) ops:',
'  {op:"replace",find,with,occurrence?,all?} {op:"lines",start,end,text} {op:"delete",start,end} {op:"insert",after|before:N,text} {op:"block",name,code} {op:"append",text} {op:"prepend",text}',
'  เลขบรรทัดของทุก op อ้างไฟล์ก่อนเริ่มคำสั่งนั้น; op แบบข้อความทำหลังสุด; ผลลัพธ์คืนบรรทัดใหม่พร้อมเลข',
'gh_create {path,content} | gh_delete {path} | gh_move {from,to} | gh_diff {path?} | gh_status | gh_discard {path?}',
'gh_commit {message,paths?,confirm?} commit ทุกไฟล์ที่ stage เป็น 1 commit (commit ไฟล์รันไทม์แล้วระบบ bump version.js ให้เอง ห้ามแก้ version.js เอง; แอปแจ้งผู้ใช้รีเฟรชเอง) (confirm:true เมื่อแตะไฟล์ป้องกัน รายชื่ออยู่ใน NOW.md · ผู้ใช้ต้องกดอนุมัติเองอีกชั้น)',
'gh_history {path?,limit?} | gh_restore {path,ref} คืนไฟล์จาก commit เก่า',
'gh_pull {path} โหลดไฟล์ repo เข้า editor/preview ในแอป | gh_push {path} ส่งไฟล์จาก editor เข้า stage',
'gh_multi_read sections:[{path,startLine?,endLine?}] อ่าน ≤5 ช่วงไฟล์ในคำสั่่งเดียว | gh_read_func {path,name} อ่าน function เดียวโดย brace-matching | gh_diagnose {path} ตรวจ brace/paren/bracket + IIFE + script-block',
'กฎ: (1) gh_outline/gh_grep → gh_read ช่วงแคบ → gh_edit → gh_diff → gh_commit (2) ห้ามเขียนไฟล์ทั้งไฟล์ทับของเดิม ใช้ ops เฉพาะจุดเท่านั้น (3) ห้ามเขียนคอมเมนต์/คำอธิบายลงในโค้ด ห้ามเว้นบรรทัดว่างโดยไม่จำเป็น (4) หลาย op ในไฟล์เดียวรวมใน gh_edit เดียว (5) ผลที่อ่านแล้วอยู่ใน [HISTORY] อย่าอ่านซ้ำ เลขบรรทัดเปลี่ยนหลัง gh_edit ให้ใช้เลขจากผลลัพธ์ล่าสุด (6) commit แล้วรายงาน sha และบอกให้รีโหลดแอป (7) ห้ามใส่ token/API key ในไฟล์ (8) ห้ามแทรกโค้ดหลัง })(); ของ IIFE และห้ามประกาศชื่อซ้ำ ระบบจะปฏิเสธ — แก้ฟังก์ชันเดิมด้วย op block (9) commit ไฟล์รันไทม์ (app.js/index.html/*.js) แล้วต้องรอผู้ใช้รีโหลดยืนยันก่อนแก้ซ้ำ ถ้าบูตไม่ผ่านระบบจะคืนชีพเอง'
].join('\n');
function promptBlock(){
if(!configured())return '';
var c=cfg(),ps=Object.keys(S.staged),o=['## GITHUB AGENT — '+c.owner+'/'+c.repo+'@'+c.branch+' (ใช้เมื่อผู้ใช้ให้แก้ไฟล์ใน repo/แอป NINO เอง; ใช้แทน self_upgrade)',RULES];
if(S.tree){var l=listing('',allPaths().length>80?1:3);o.push('REPO ('+allPaths().length+' ไฟล์): '+clip(l.join(' | '),3000));}
else o.push('REPO: ยังไม่โหลด — เรียก gh_tree');
o.push('STAGED: '+(ps.length?ps.map(function(p){return p+'#'+S.staged[p].rev;}).join(', '):'(none)'));
return o.join('\n');
}
function wantsGH(text){return configured()&&/github|repo\b|รีโป|commit|คอมมิท|gh_|แก้แอป|ตัวแอป|nino.*(แก้|อัป)|อัป(เกรด|เดต)ตัวเอง|อัพ(เกรด|เดต)ตัวเอง|แก้(โค้ด)?ตัวเอง|โค้ดตัวเอง/i.test(String(text||''));}
function setHooks(h){Object.keys(h||{}).forEach(function(k){H[k]=h[k];});}
function ensureTree(){return configured()?loadTree(false).catch(function(){return null;}):Promise.resolve(null);}
function stageText(p,text){var pp=norm(p),e0=S.tree&&S.tree.map[pp];return getText(pp).then(function(cur){put(pp,text,cur,e0?e0.sha:null,crlfOf(pp));return rev(pp);});}
function readText(p){return getText(norm(p));}
T.gh_diagnose=async function(a){var p=norm(a.path),txt=await getText(p);if(txt===null)return fail('not found '+p);var L=txt.split('\n'),iss=[],bc=0,pr=0,br=0;for(var i=0;i<L.length;i++){for(var j=0;j<L[i].length;j++){var c=L[i][j];if(c==='{')bc++;else if(c==='}')bc--;else if(c==='(')pr++;else if(c===')')pr--;else if(c==='[')br++;else if(c===']')br--;}}if(bc)iss.push('brace \u0394'+bc);if(pr)iss.push('paren \u0394'+pr);if(br)iss.push('bracket \u0394'+br);var sc=(txt.match(/<script(?![^>]*src)/gi)||[]).length;if(sc>1)iss.push('script blocks: '+sc);var fns=txt.match(/(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g)||[],nm={};fns.forEach(function(f){var n=f.replace(/^(?:function|const|let|var)\s+/,'');if(nm[n])iss.push('dup: '+n);nm[n]=1;});return good('['+p+'] '+L.length+' lines '+(iss.length?'ISSUES: '+iss.join('; '):'OK'));};
restore();
window.ninoGH={paths:allPaths,check:check,configured:configured,wantsGH:wantsGH,run:run,promptBlock:promptBlock,ensureTree:ensureTree,setHooks:setHooks,stageText:stageText,readText:readText,stagedList:function(){return Object.keys(S.staged);},setActive:function(v){S.active=!!v;},active:function(){return S.active;},resetTurn:function(){S.turn={read:0,seen:{}};},isProtected:function(p){return PROT.test(String(p||'').replace(/^\.?\/+/,''));},tools:Object.keys(T)};
})();
