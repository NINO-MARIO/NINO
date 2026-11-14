(function(){
'use strict';
var W=256,H=384,DB='nds-library',ST='kv';
var SPINE=['#f28ab2','#7fe7ff','#8fd3b0','#f2c275','#c9a8f5','#f26d78','#79c0ff'];
var BIOS=[
  {k:'bios7',name:'ARM7 BIOS',size:16384,txt:'16 KB'},
  {k:'bios9',name:'ARM9 BIOS',size:4096,txt:'4 KB'},
  {k:'firmware',name:'Firmware',size:262144,txt:'256 KB'}
];
var S={roms:[],have:{},core:null,coreErr:'',raf:0,fpsAt:0,fpsN:0,fps:0,ctx:null,img:null,playId:null};
function $(i){return document.getElementById(i);}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function hash(s){var h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h;}
function mb(n){return (n/1048576).toFixed(n>=10485760?0:1);}
function toast(t){var el=$('toast');el.textContent=t;el.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(function(){el.classList.remove('on');},2600);}

var dbp=null;
function db(){
  if(!dbp)dbp=new Promise(function(res,rej){
    var r=indexedDB.open(DB,1);
    r.onupgradeneeded=function(){r.result.createObjectStore(ST);};
    r.onsuccess=function(){res(r.result);};
    r.onerror=function(){rej(r.error);};
  });
  return dbp;
}
function run(mode,fn){
  return db().then(function(d){return new Promise(function(res,rej){
    var t=d.transaction(ST,mode),q=fn(t.objectStore(ST));
    t.oncomplete=function(){res(q?q.result:undefined);};
    t.onerror=function(){rej(t.error);};
    t.onabort=function(){rej(t.error);};
  });});
}
function get(k){return run('readonly',function(s){return s.get(k);});}
function put(k,v){return run('readwrite',function(s){return s.put(v,k);});}
function del(k){return run('readwrite',function(s){return s.delete(k);});}
function saveRoms(){return put('roms',S.roms);}

function render(){
  var c=$('core');
  c.className='core '+(S.core?'ok':'no');
  c.textContent=S.core?'แกนจำลอง: พร้อม ('+S.core.version+')':'แกนจำลอง: ยังไม่พร้อม'+(S.coreErr?' · '+S.coreErr:'');
  $('bios').innerHTML=BIOS.map(function(b){
    var on=!!S.have[b.k];
    return '<div class="slot"><span class="led '+(on?'on':'')+'"></span>'
      +'<div class="slot-t"><b>'+b.name+'</b><small>'+(on?'ใส่แล้ว':'ยังไม่ใส่')+' · ต้องการ '+b.txt+'</small></div>'
      +'<label class="btn small">'+(on?'เปลี่ยน':'ใส่ไฟล์')+'<input class="sr" type="file" data-bios="'+b.k+'"></label></div>';
  }).join('');
  var all=BIOS.every(function(b){return S.have[b.k];});
  $('note').textContent=all?'ตู้ BIOS ครบแล้วค่ะ':'ฉันต้องการ BIOS ครบทั้งสามไฟล์ก่อนเล่นนะคะ';
  $('shelf').innerHTML=S.roms.length
    ?S.roms.map(function(r){
        var col=SPINE[hash(r.id)%SPINE.length];
        return '<div class="cart" style="--c:'+col+'"><button class="cart-play" type="button" data-play="'+esc(r.id)+'">'
          +'<span class="cart-t">'+esc(r.title)+'</span><span class="cart-m">'+esc(r.code||'----')+' · '+mb(r.size)+' MB</span></button>'
          +'<button class="cart-del" type="button" data-del="'+esc(r.id)+'">เอาออก</button></div>';
      }).join('')
    :'<div class="empty">ชั้นนี้ยังว่างค่ะ<br>ใส่ไฟล์ .nds ของคุณเองได้เลย</div>';
}

function loadRoms(){
  return get('roms').then(function(v){S.roms=Array.isArray(v)?v:[];});
}
function loadHave(){
  return Promise.all(BIOS.map(function(b){
    return get('bios:'+b.k).then(function(x){S.have[b.k]=!!x;});
  }));
}
function feedBios(){
  return Promise.all(BIOS.map(function(b){
    return get('bios:'+b.k).then(function(buf){
      if(!buf)return;
      var r=S.core.loadBios(b.k,new Uint8Array(buf));
      if(!r.ok)toast(r.msg);
    });
  }));
}

function startCore(){
  if(typeof Go!=='function'){S.coreErr='ไม่พบ wasm_exec.js';return Promise.resolve();}
  var go=new Go();
  var fetchCore=function(){
    return fetch('core.wasm',{cache:'no-cache'}).then(function(r){
      if(!r.ok)throw new Error('ไม่พบ core.wasm');
      return r;
    });
  };
  var inst;
  if(WebAssembly.instantiateStreaming){
    inst=fetchCore().then(function(r){return WebAssembly.instantiateStreaming(r,go.importObject);}).catch(function(){
      return fetchCore().then(function(r){return r.arrayBuffer();}).then(function(b){return WebAssembly.instantiate(b,go.importObject);});
    });
  }else{
    inst=fetchCore().then(function(r){return r.arrayBuffer();}).then(function(b){return WebAssembly.instantiate(b,go.importObject);});
  }
  return inst.then(function(res){
    go.run(res.instance).catch(function(e){S.coreErr=String(e&&e.message||e);});
    if(!window.ndsCore)throw new Error('แกนไม่เริ่มทำงาน');
    S.core=window.ndsCore;
    return feedBios();
  }).catch(function(e){
    S.core=null;
    S.coreErr=(e&&e.message)?e.message:String(e);
  });
}

function addRom(file){
  if(!/\.nds$/i.test(file.name)){toast('ไฟล์นี้ไม่ใช่ .nds ค่ะ');return;}
  file.arrayBuffer().then(function(buf){
    var u=new Uint8Array(buf);
    if(u.length<0x200){toast('ไฟล์สั้นเกินไปสำหรับตลับ DS ค่ะ');return;}
    var title='',code='';
    for(var i=0;i<12&&u[i];i++)if(u[i]>=0x20&&u[i]<0x7f)title+=String.fromCharCode(u[i]);
    for(var j=12;j<16&&u[j];j++)if(u[j]>=0x20&&u[j]<0x7f)code+=String.fromCharCode(u[j]);
    var id='r'+Date.now().toString(36);
    return put('rom:'+id,buf).then(function(){
      S.roms.push({id:id,title:title.trim()||file.name,code:code.trim(),size:u.length,name:file.name});
      return saveRoms();
    }).then(function(){render();toast('ใส่ตลับแล้วค่ะ');});
  }).catch(function(e){toast('บันทึกไม่สำเร็จ: '+e.message);});
}

function setBios(k,file){
  var b=BIOS.filter(function(x){return x.k===k;})[0];
  if(!b)return;
  file.arrayBuffer().then(function(buf){
    if(buf.byteLength!==b.size){
      toast(b.name+' ขนาดไม่ตรง ได้ '+buf.byteLength+' ไบต์ ต้องการ '+b.size+' ไบต์ค่ะ');
      return;
    }
    return put('bios:'+k,buf).then(function(){
      S.have[k]=true;
      if(S.core){var r=S.core.loadBios(k,new Uint8Array(buf));if(!r.ok)toast(r.msg);}
      render();
      toast(b.name+' พร้อมแล้วค่ะ');
    });
  }).catch(function(e){toast('บันทึกไม่สำเร็จ: '+e.message);});
}

function tick(t){
  S.core.runFrame();
  S.img.data.set(S.core.framebuffer());
  S.ctx.putImageData(S.img,0,0);
  S.fpsN++;
  if(!S.fpsAt)S.fpsAt=t;
  if(t-S.fpsAt>=1000){
    S.fps=Math.round(S.fpsN*1000/(t-S.fpsAt));
    S.fpsN=0;S.fpsAt=t;
    $('fps').textContent='FPS '+S.fps;
  }
  S.raf=requestAnimationFrame(tick);
}

function openPlay(r){
  S.playId=r.id;
  $('play-title').textContent=r.title;
  $('fps').textContent='FPS --';
  $('play').classList.add('on');
  S.fpsAt=0;S.fpsN=0;
  cancelAnimationFrame(S.raf);
  S.raf=requestAnimationFrame(tick);
}

function closePlay(){
  if(!$('play').classList.contains('on'))return false;
  cancelAnimationFrame(S.raf);
  S.raf=0;
  $('play').classList.remove('on');
  S.playId=null;
  return true;
}

function play(id){
  var r=S.roms.filter(function(x){return x.id===id;})[0];
  if(!r)return;
  if(!BIOS.every(function(b){return S.have[b.k];})){toast('ใส่ BIOS ให้ครบทั้งสามไฟล์ก่อนนะคะ');return;}
  if(!S.core){toast('แกนจำลองยังไม่พร้อม ฉันเปิดให้ไม่ได้ค่ะ');return;}
  get('rom:'+id).then(function(buf){
    if(!buf){toast('ไม่พบข้อมูลของตลับนี้ค่ะ');return;}
    var res=S.core.loadRom(new Uint8Array(buf));
    if(!res.ok){toast(res.msg);return;}
    openPlay(r);
  });
}

function remove(id){
  if(!confirm('เอาตลับนี้ออกจากชั้นเลยไหมคะ?'))return;
  var keep=S.roms.filter(function(x){return x.id!==id;});
  del('rom:'+id).then(function(){
    S.roms=keep;
    return saveRoms();
  }).then(function(){render();toast('เอาออกแล้วค่ะ');})
    .catch(function(e){toast('ลบไม่สำเร็จ: '+e.message);});
}

function bind(){
  document.addEventListener('click',function(e){
    var t=e.target;
    var p=t.closest&&t.closest('[data-play]');
    if(p){play(p.getAttribute('data-play'));return;}
    var d=t.closest&&t.closest('[data-del]');
    if(d){remove(d.getAttribute('data-del'));return;}
    var o=t.closest&&t.closest('[data-act="out"]');
    if(o){closePlay();return;}
  });
  document.addEventListener('change',function(e){
    var t=e.target;
    if(!t.files||!t.files[0])return;
    var f=t.files[0];
    t.value='';
    if(t.id==='add'){addRom(f);return;}
    var k=t.getAttribute('data-bios');
    if(k)setBios(k,f);
  });
  document.addEventListener('visibilitychange',function(){if(document.hidden)closePlay();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&closePlay())e.preventDefault();});
}

window.ndsBack=function(){return closePlay();};

function init(){
  var cv=$('screen');
  cv.width=W;cv.height=H;
  S.ctx=cv.getContext('2d');
  S.img=S.ctx.createImageData(W,H);
  bind();
  if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(function(){});
  Promise.all([loadRoms(),loadHave()]).then(function(){render();return startCore();}).then(function(){render();}).catch(function(e){
    S.coreErr=e&&e.message?e.message:String(e);
    render();
  });
}
init();
})();
