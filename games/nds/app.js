(function(){
'use strict';
var W=256,H=384,DB='nds-library',ST='kv';
var SPINE=['#f28ab2','#7fe7ff','#8fd3b0','#f2c275','#c9a8f5','#f26d78','#79c0ff'];
var BIOS=[
  {k:'bios7',name:'ARM7 BIOS',size:16384,txt:'16 KB',req:true,what:'ไฟล์ระบบของชิป ARM7 (ไฟล์จากเครื่องของคุณเอง)'},
  {k:'bios9',name:'ARM9 BIOS',size:4096,txt:'4 KB',req:true,what:'ไฟล์ระบบของชิป ARM9 (ไฟล์จากเครื่องของคุณเอง)'},
  {k:'firmware',name:'Firmware',size:262144,txt:'256 KB',req:false,what:'ข้อมูลตั้งค่าของเครื่อง ไม่บังคับ: ไม่ใส่ก็เล่นได้ แต่เข้าเมนูระบบ DS ไม่ได้'}
];
var S={roms:[],have:{},free:{},core:null,coreErr:'',raf:0,fpsAt:0,fpsN:0,fps:0,ctx:null,img:null,playId:null};
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

/* แฮช SHA-256 ที่ยืนยันแล้ว (อ่านจาก bios-hashes.json) ว่าง = ยังไม่มีแฮชให้เทียบ */
var KNOWN={bios7:[],bios9:[],firmware:[]};
var MAX_ZIP=64*1024*1024;
function loadKnown(){
  return fetch('bios-hashes.json',{cache:'no-cache'}).then(function(r){return r.ok?r.json():null;}).then(function(j){
    if(!j)return;
    BIOS.forEach(function(b){KNOWN[b.k]=Array.isArray(j[b.k])?j[b.k].map(function(x){return String(x).toLowerCase();}):[];});
  }).catch(function(){});
}
function sha256Hex(buf){
  return crypto.subtle.digest('SHA-256',buf).then(function(d){
    return Array.prototype.map.call(new Uint8Array(d),function(b){return ('0'+b.toString(16)).slice(-2);}).join('');
  });
}
/* ด่านก่อนเล่น: เฉพาะไฟล์ที่ req=true (ARM7, ARM9) ต้องมี Firmware ไม่บังคับ */
function biosReady(){return BIOS.every(function(b){return !b.req||S.have[b.k];});}
function biosBySize(size){
  return BIOS.filter(function(b){return b.size===size;})[0]||null;
}

function render(){
  var c=$('core');
  c.className='core '+(S.core?'ok':'no');
  c.textContent=S.core?'แกนจำลอง: พร้อม ('+S.core.version+')':'แกนจำลอง: ยังไม่พร้อม'+(S.coreErr?' · '+S.coreErr:'');
  $('bios').innerHTML=BIOS.map(function(b){
    var on=!!S.have[b.k];
    var h=(S.hash&&S.hash[b.k])||'';
    var refs=(KNOWN[b.k]||[]).length;
    var st=on?('ใส่แล้ว'+(h?' · SHA-256 '+h.slice(0,12)+'…':'')+(S.free[b.k]?' · FreeBIOS (BSD-2) ยืนยันแฮชแล้ว':(refs?' · ยืนยันแฮชแล้ว':' · ยังไม่มีแฮชอ้างอิง'))):(b.req?'ยังไม่ใส่':'ไม่ได้ใส่ (ไม่บังคับ)');
    return '<div class="slot"><span class="led '+(on?'on':'')+'"></span>'
      +'<div class="slot-t"><b>'+b.name+'</b><small>'+st+' · ต้องการ '+b.txt+'</small><small>'+b.what+'</small></div>'
      +'<label class="btn small">'+(on?'เปลี่ยน':'ใส่ไฟล์')+'<input class="sr" type="file" data-bios="'+b.k+'"></label></div>';
  }).join('');
  var ready=biosReady();
  $('note').textContent=ready?'ตู้ BIOS พร้อมแล้วค่ะ':'ฉันต้องการ ARM7 BIOS และ ARM9 BIOS ก่อนเล่นนะคะ';
  var tn=$('testnote');
  if(tn)tn.hidden=!(S.core&&S.coreTest);
  $('shelf').innerHTML=S.roms.length
    ?S.roms.map(function(r){
        var col=SPINE[hash(r.id)%SPINE.length];
        return '<div class="cart" style="--c:'+col+'"><button class="cart-play" type="button" data-play="'+esc(r.id)+'">'
          +'<span class="cart-t">'+esc(r.title)+'</span><span class="cart-m">'+esc(r.code||'----')+' · '+mb(r.size)+' MB</span></button>'
          +'<button class="cart-del" type="button" data-del="'+esc(r.id)+'">เอาออก</button></div>';
      }).join('')
    :'<div class="empty">ชั้นนี้ยังว่างค่ะ<br>ใส่ไฟล์ .nds หรือซิปที่มีตลับได้เลย</div>';
}

function loadRoms(){
  return get('roms').then(function(v){S.roms=Array.isArray(v)?v:[];});
}
function loadHave(){
  S.hash=S.hash||{};
  return Promise.all(BIOS.map(function(b){
    return Promise.all([get('bios:'+b.k),get('biosh:'+b.k),get('biosfree:'+b.k)]).then(function(r){
      S.have[b.k]=!!r[0];
      S.hash[b.k]=r[1]||'';
      S.free[b.k]=!!r[2];
    });
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
    var chk=NDS_CORE.check(window.ndsCore);
    if(!chk.ok){S.core=null;S.coreTest=false;S.coreErr='แกนไม่ครบตามสัญญา: ขาด '+chk.missing.join(', ');return;}
    S.core=window.ndsCore;S.coreTest=chk.isTest;
    return feedBios();
  }).catch(function(e){
    S.core=null;
    S.coreErr=(e&&e.message)?e.message:String(e);
  });
}

function addRom(file){
  return file.arrayBuffer().then(function(buf){return addRomBuf(file.name,buf);});
}
function addRomBuf(fname,buf){
  return Promise.resolve(buf).then(function(buf){
    var u=new Uint8Array(buf);
    if(u.length<0x200){toast('ไฟล์สั้นเกินไปสำหรับตลับ DS ค่ะ');return;}
    var title='',code='';
    for(var i=0;i<12&&u[i];i++)if(u[i]>=0x20&&u[i]<0x7f)title+=String.fromCharCode(u[i]);
    for(var j=12;j<16&&u[j];j++)if(u[j]>=0x20&&u[j]<0x7f)code+=String.fromCharCode(u[j]);
    var id='r'+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36);
    return put('rom:'+id,buf).then(function(){
      S.roms.push({id:id,title:title.trim()||fname,code:code.trim(),size:u.length,name:fname});
      return saveRoms();
    }).then(function(){render();toast('ใส่ตลับ '+(title.trim()||fname)+' แล้วค่ะ');});
  }).catch(function(e){toast('บันทึกไม่สำเร็จ: '+e.message);});
}

/* FreeBIOS: BIOS ทดแทนฟรี (BSD-2, Gilead Kutnick 2013) ไม่ได้มาจาก Nintendo มากับแอปที่ games/nds/bios-free/
   ตรวจขนาดและ SHA-256 ก่อนใส่ทุกครั้ง. ไม่มี Firmware ทดแทนในชุดนี้ (Firmware ไม่บังคับ) */
var FREE_BIOS={
  bios7:{url:'bios-free/drastic_bios_arm7.bin',size:16384,sha256:'80ae613b1cfd4cd56dd49f9e985b9788563388facaf0d0f5f78ea2b185f3f7c5'},
  bios9:{url:'bios-free/drastic_bios_arm9.bin',size:4096,sha256:'39b4a574f4a24465fa4c7c9d2d4c847fdd46133b54528a22a7e198fe3a37e281'}
};
function useFreeBios(){
  var keys=Object.keys(FREE_BIOS);
  return Promise.all(keys.map(function(k){
    var f=FREE_BIOS[k];
    return fetch(f.url,{cache:'no-cache'}).then(function(r){
      if(!r.ok)throw new Error('ไม่พบไฟล์ '+f.url);
      return r.arrayBuffer();
    }).then(function(buf){
      if(buf.byteLength!==f.size)throw new Error(k+' ขนาดไม่ถูกต้อง');
      return sha256Hex(buf).then(function(h){
        if(h!==f.sha256)throw new Error(k+' แฮชไม่ตรง ไฟล์ในแอปอาจเสียหาย');
        return put('bios:'+k,buf).then(function(){return put('biosh:'+k,h);}).then(function(){return put('biosfree:'+k,true);}).then(function(){
          S.have[k]=true;S.hash[k]=h;S.free[k]=true;
          if(S.core){var r=S.core.loadBios(k,new Uint8Array(buf));if(r&&!r.ok)toast(r.msg);}
        });
      });
    });
  })).then(function(){
    render();
    toast('ใส่ FreeBIOS (BSD-2) แล้วค่ะ');
  }).catch(function(e){toast('ใส่ FreeBIOS ไม่สำเร็จ: '+e.message);});
}

/* ใส่ BIOS/firmware: ด่านแรกขนาด ด่านที่สองแฮช (ถ้ามีแฮชอ้างอิง) */
function setBiosBuf(k,buf,fname){
  var b=BIOS.filter(function(x){return x.k===k;})[0];
  if(!b)return Promise.resolve(false);
  if(buf.byteLength!==b.size){
    toast(b.name+' ขนาดไม่ตรง ('+fname+' ได้ '+buf.byteLength+' ไบต์ ต้องการ '+b.size+' ไบต์) ค่ะ');
    return Promise.resolve(false);
  }
  return sha256Hex(buf).then(function(h){
    var ref=KNOWN[k]||[];
    if(ref.length&&ref.indexOf(h)<0){
      toast(b.name+' ไม่ตรงกับแฮชที่รู้จัก ฉันไม่ใส่ไฟล์นี้ค่ะ');
      return false;
    }
    return put('bios:'+k,buf).then(function(){return put('biosh:'+k,h);}).then(function(){return put('biosfree:'+k,false);}).then(function(){
      S.have[k]=true;S.hash[k]=h;S.free[k]=false;
      if(S.core){var r=S.core.loadBios(k,new Uint8Array(buf));if(!r.ok)toast(r.msg);}
      render();
      toast(b.name+(ref.length?' ยืนยันแฮชแล้วค่ะ':' ใส่แล้วค่ะ (ยังไม่มีแฮชให้เทียบ)'));
      return true;
    });
  }).catch(function(e){toast('บันทึกไม่สำเร็จ: '+e.message);return false;});
}

/* วางไฟล์ทั้งหมดในครั้งเดียว: แยกชนิดเอง (ซิป > .nds > ขนาด BIOS) */
function routeFiles(files){
  var list=Array.prototype.slice.call(files||[]);
  return Promise.all(list.map(function(f){
    var n=f.name||'';
    if(/\.zip$/i.test(n)){
      return f.arrayBuffer().then(readZip).then(function(entries){
        if(!entries.length){toast('ซิปนี้ไม่มีตลับหรือ BIOS ที่ใช้ได้ค่ะ');return;}
        return Promise.all(entries.map(function(en){return routeOne(en.name,en.data.buffer);}));
      }).catch(function(e){toast('เปิดซิปไม่ได้: '+e.message);});
    }
    return f.arrayBuffer().then(function(buf){return routeOne(n,buf);});
  }));
}
function routeOne(name,buf){
  var base=String(name).split(/[\\\/]/).pop();
  if(/\.nds$/i.test(base))return addRomBuf(base,buf);
  var b=biosBySize(buf.byteLength);
  if(b)return setBiosBuf(b.k,buf,base);
  toast('ไฟล์ '+base+' ไม่ใช่ .nds, .zip หรือ BIOS ที่รู้จักค่ะ');
  return Promise.resolve(false);
}

/* อ่านซิป (เฉพาะรายการที่ใช้: .nds และ .bin) ด้วย DecompressionStream ของเบราว์เซอร์ ไม่ต้องใช้ไลบรารี */
function readZip(buf){
  var u=new Uint8Array(buf), dv=new DataView(buf);
  var eocd=-1;
  for(var i=u.length-22;i>=Math.max(0,u.length-22-65557);i--){
    if(dv.getUint32(i,true)===0x06054b50){eocd=i;break;}
  }
  if(eocd<0)return Promise.reject(new Error('ไม่พบข้อมูลไฟล์ซิป'));
  var count=dv.getUint16(eocd+10,true), p=dv.getUint32(eocd+16,true);
  var metas=[];
  for(var n=0;n<count;n++){
    if(p+46>u.length||dv.getUint32(p,true)!==0x02014b50)break;
    var nlen=dv.getUint16(p+28,true), xlen=dv.getUint16(p+30,true), clen=dv.getUint16(p+32,true);
    metas.push({
      name:new TextDecoder('utf-8').decode(u.subarray(p+46,p+46+nlen)),
      method:dv.getUint16(p+10,true),
      csize:dv.getUint32(p+20,true),
      loff:dv.getUint32(p+42,true)
    });
    p+=46+nlen+xlen+clen;
  }
  var out=[], total=0, chain=Promise.resolve();
  metas.forEach(function(m){
    chain=chain.then(function(){
      if(/\/$/.test(m.name)||/(^|\/)__MACOSX\//.test(m.name)||m.name.indexOf('..')>=0)return;
      if(!/\.(nds|bin)$/i.test(m.name))return;
      var lp=m.loff;
      if(lp+30>u.length||dv.getUint32(lp,true)!==0x04034b50)throw new Error('ซิปเสียหาย');
      var start=lp+30+dv.getUint16(lp+26,true)+dv.getUint16(lp+28,true);
      var raw=u.subarray(start,start+m.csize);
      var p2;
      if(m.method===0)p2=Promise.resolve(raw.slice());
      else if(m.method===8)p2=inflateRaw(raw);
      else throw new Error('ซิปนี้ใช้การบีบอัดที่ยังไม่รองรับ');
      return p2.then(function(data){
        total+=data.length;
        if(total>MAX_ZIP)throw new Error('ไฟล์ในซิปใหญ่เกินไป');
        out.push({name:m.name,data:data});
      });
    });
  });
  return chain.then(function(){return out;});
}
function inflateRaw(u8){
  if(typeof DecompressionStream!=='function')return Promise.reject(new Error('เครื่องนี้แตกซิปไม่ได้ ใส่ไฟล์ .nds โดยตรงแทนค่ะ'));
  var s=new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(s).arrayBuffer().then(function(b){return new Uint8Array(b);});
}

function tick(t){
  var st=NDS_PLAYER.status();
  if(st!=='running'){
    /* ไม่ได้รันแกน (พัก, กำลังโหลดเซฟ, หรือปิดแล้ว): ไม่นับ FPS */
    S.fpsAt=0;S.fpsN=0;
    $('fps').textContent=st==='paused'?'หยุดอยู่':st==='loading'?'กำลังโหลดเซฟ':'FPS --';
  }else{
    NDS_PLAYER.beforeFrame();
    S.core.runFrame();
    S.img.data.set(S.core.framebuffer());
    NDS_PLAYER.afterFrame();
    S.fpsN++;
    if(!S.fpsAt)S.fpsAt=t;
    if(t-S.fpsAt>=1000){
      S.fps=Math.round(S.fpsN*1000/(t-S.fpsAt));
      S.fpsN=0;S.fpsAt=t;
      $('fps').textContent='FPS '+S.fps;
    }
  }
  S.ctx.putImageData(S.img,0,0);
  S.raf=requestAnimationFrame(tick);
}

function openPlay(r){
  S.playId=r.id;
  $('play-title').textContent=r.title;
  $('fps').textContent='FPS --';
  $('play').classList.add('on');
  NDS_PLAYER.start(S.core,r.title,r.id);
  S.fpsAt=0;S.fpsN=0;
  cancelAnimationFrame(S.raf);
  S.raf=requestAnimationFrame(tick);
}

function closePlay(){
  if(!$('play').classList.contains('on'))return false;
  cancelAnimationFrame(S.raf);
  S.raf=0;
  $('play').classList.remove('on');
  NDS_PLAYER.stop();
  S.playId=null;
  return true;
}

function play(id){
  var r=S.roms.filter(function(x){return x.id===id;})[0];
  if(!r)return;
  if(!biosReady()){toast('ใส่ ARM7 BIOS และ ARM9 BIOS ก่อนนะคะ');return;}
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
  Promise.all([del('rom:'+id),del('save:'+id),del('state:'+id)]).then(function(){
    S.roms=keep;
    return saveRoms();
  }).then(function(){render();toast('เอาออกแล้วค่ะ');})
    .catch(function(e){toast('ลบไม่สำเร็จ: '+e.message);});
}

/* ---------- คลังตลับ: ส่งออก/นำเข้าเป็นไฟล์ JSON (ตลับ + เซฟ + สถานะ + การตั้งค่า). BIOS ไม่รวม ----------
   ผู้ใช้หา BIOS เอง ไม่ควรสร้างสำเนาไฟล์เฟิร์มแวร์ไว้ในไฟล์สำรอง */
var LIB_ID=/^[a-z0-9]{1,40}$/, LIB_MAX_ROM=128*1024*1024;
function bytesToB64(buf){
  var u=new Uint8Array(buf), parts=[], CH=0x8000;
  for(var i=0;i<u.length;i+=CH) parts.push(String.fromCharCode.apply(null,u.subarray(i,i+CH)));
  return btoa(parts.join(''));
}
function b64ToU8(s){
  var bin=atob(s), u=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
  return u;
}
function exportLibrary(){
  return Promise.all(S.roms.map(function(r){
    return Promise.all([get('rom:'+r.id),get('save:'+r.id),get('state:'+r.id)]).then(function(v){
      if(!v[0]) throw new Error('ไม่พบไฟล์ตลับ '+r.title);
      return {meta:r,rom:bytesToB64(v[0]),save:v[1]?bytesToB64(v[1]):null,state:v[2]?bytesToB64(v[2]):null};
    });
  })).then(function(items){
    return get('nds:settings').then(function(st){
      var out={format:'nino-nds-library',v:1,exportedAt:Date.now(),roms:items,settings:st||null};
      return new Blob([JSON.stringify(out)],{type:'application/json'});
    });
  });
}
function importLibrary(file){
  return file.text().then(function(t){
    var obj=JSON.parse(t);
    if(!obj||obj.format!=='nino-nds-library'||!Array.isArray(obj.roms)) throw new Error('ไฟล์นี้ไม่ใช่คลังตลับของ NINO');
    obj.roms.forEach(function(it){
      if(!it||!it.meta||!LIB_ID.test(String(it.meta.id))) throw new Error('รหัสตลับในไฟล์ไม่ถูกต้อง');
      if(typeof it.rom!=='string') throw new Error('ไฟล์ตลับ '+it.meta.id+' เสียหาย');
    });
    var jobs=obj.roms.map(function(it){
      var rom=b64ToU8(it.rom);
      if(rom.length>LIB_MAX_ROM) throw new Error('ตลับใหญ่เกินไป');
      return put('rom:'+it.meta.id,rom.buffer)
        .then(function(){return it.save?put('save:'+it.meta.id,b64ToU8(it.save)):null;})
        .then(function(){return it.state?put('state:'+it.meta.id,b64ToU8(it.state)):null;});
    });
    return Promise.all(jobs).then(function(){
      var byId={};
      S.roms.forEach(function(r){byId[r.id]=r;});
      obj.roms.forEach(function(it){byId[it.meta.id]={id:it.meta.id,title:String(it.meta.title||it.meta.id),code:String(it.meta.code||''),size:Number(it.meta.size)||0,name:String(it.meta.name||'')};});
      S.roms=Object.keys(byId).map(function(k){return byId[k];});
      return saveRoms();
    }).then(function(){
      return obj.settings?put('nds:settings',obj.settings):null;
    }).then(function(){
      render();
      toast('นำเข้าคลังตลับแล้วค่ะ ('+obj.roms.length+' เกม)');
      return obj.roms.length;
    });
  });
}
function inNativeApp(){return NDS_NATIVE.inApp();}
function exportLib(){
  if(inNativeApp()&&!NDS_NATIVE.supported()){toast('แอปรุ่นนี้ยังบันทึกไฟล์ไม่ได้ค่ะ อัปเดตแอปก่อนนะคะ');return;}
  exportLibrary().then(function(blob){
    var n=NDS_NATIVE.save('NINO-nds-library.json','application/json',blob);
    if(n) return n.then(function(r){toast(r.saved?'บันทึกคลังตลับแล้วค่ะ':'ยังไม่ได้บันทึก: '+r.why);});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download='NINO-nds-library.json';
    document.body.appendChild(a); a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1000);
    toast('ส่งออกคลังตลับแล้วค่ะ');
  }).catch(function(e){toast('ส่งออกไม่สำเร็จ: '+e.message);});
}
window.NDS_LIBRARY={exportLibrary:exportLibrary,importLibrary:importLibrary};

function bind(){
  document.addEventListener('click',function(e){
    var t=e.target;
    if(t.closest&&t.closest('#usefree')){useFreeBios();return;}
    if(t.closest&&t.closest('#lib-export')){exportLib();return;}
    var p=t.closest&&t.closest('[data-play]');
    if(p){play(p.getAttribute('data-play'));return;}
    var d=t.closest&&t.closest('[data-del]');
    if(d){remove(d.getAttribute('data-del'));return;}
    var o=t.closest&&t.closest('[data-act="out"]');
    if(o){closePlay();return;}
  });
  document.addEventListener('change',function(e){
    var t=e.target;
    if(!t.files||!t.files.length)return;
    var files=Array.prototype.slice.call(t.files);
    t.value='';
    if(t.id==='add'){routeFiles(files);return;}
    if(t.id==='lib-file'){importLibrary(files[0]).catch(function(e){toast('นำเข้าไม่สำเร็จ: '+e.message);});return;}
    var k=t.getAttribute('data-bios');
    if(k)files[0].arrayBuffer().then(function(buf){return setBiosBuf(k,buf,files[0].name);});
  });
  /* ลากไฟล์มาวางได้ทั้งหน้า (ตลับ ซิป หรือ BIOS หลายไฟล์พร้อมกัน) */
  document.addEventListener('dragover',function(e){
    if(e.dataTransfer&&Array.prototype.indexOf.call(e.dataTransfer.types||[],'Files')>=0)e.preventDefault();
  });
  document.addEventListener('drop',function(e){
    if(!e.dataTransfer||!e.dataTransfer.files||!e.dataTransfer.files.length)return;
    e.preventDefault();
    routeFiles(e.dataTransfer.files);
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
  Promise.all([loadRoms(),loadHave(),loadKnown(),NDS_PLAYER.init({get:get,put:put,toast:toast})]).then(function(){render();return startCore();}).then(function(){render();}).catch(function(e){
    S.coreErr=e&&e.message?e.message:String(e);
    render();
  });
}
init();
})();
