(function(){
var MAX_CALLS=300;
var MAX_FAILS=8;
var HUMAN_NAME='คุณ';
var NAMES=['อาร์ม','มิ้นท์','ตั้ม','เบียร์','ฟ้า','แบงค์','ปลา','ออม','ปอนด์','นุ่น'];
var COLOR_KEYS=['red','blue','green','pink','orange','yellow','black','white','purple','brown'];
var WIN={crew:'ลูกเรือชนะ',impostor:'ฆาตกรชนะ',none:'ไม่มีใครชนะ'};
var WHY={ejected:'โหวตออกไปแล้ว',tasks:'ลูกเรือทำงานครบแล้ว',outnumbered:'ฆาตกรมีคนเท่ากับหรือมากกว่าลูกเรือ',reactor:'Reactor ระเบิด',timeout:'หมดเวลา'};
var SABO={lights:'ไฟดับ',reactor:'Reactor'};
var ACT={wait:'รอ',move:'ไปที่',task:'ทำงาน',fake:'แกล้งทำงาน',follow:'ตาม',kill:'ฆ่า',vent:'มุดไป',sabotage:'ก่อกวน',fix:'ซ่อม',report:'รายงานศพ',emergency:'กดปุ่มประชุม'};
var DELAY={move:70,arrive:0,vent:500,task_done:220,kill:1000,say:900,chat:950,meeting_start:1000,vote_result:1300,meeting_end:350,sabotage:700,sabotage_fixed:400,game_over:1600,decision:0};
var SKIP={thinking:1,stats:1,reflection:1,intent:1,taskbar:1,task_start:1,obs:1,vote:1,roam_start:1,match_error:1};
var NOTE={
  mock:'กฎสำเร็จรูป: ไม่ใช้โมเดลและไม่เสียโควต้า ผู้เล่นทุกตัวเล่นด้วยกฎง่ายๆ เหมาะกับดูการเล่นและลำดับเหตุการณ์ บุคลิกของตัวละครจะใช้เมื่อเลือกโมเดลของ NINO เท่านั้น',
  nino:'โมเดลที่ NINO ตั้งไว้เป็นคนคิดทุกตัว เกมหนึ่งใช้หลายร้อยครั้ง จำกัดไว้ที่ '+MAX_CALLS+' ครั้งต่อเกม'
};
var CSS='#namong{position:fixed;inset:0;z-index:2147483090;background:#14111A;color:#E9E2EE;overflow:auto;-webkit-overflow-scrolling:touch;padding:calc(env(safe-area-inset-top,0px) + 8px) 12px calc(env(safe-area-inset-bottom,0px) + 16px);font-size:13px;display:none;flex-direction:column;gap:8px}#namong.on{display:flex}#namong>*{flex:none}#namong .nm-top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}#namong button{background:#272030;border:1px solid #3A3145;color:#FBF7FD;border-radius:8px;padding:8px 10px;font-size:13px;min-height:36px}#namong button.p{background:#D9558A;border-color:#D9558A}#namong button:disabled{opacity:.4}#namong button.pick{text-align:left;background:#1F1A29}#namong button.pick.sel{border-color:#D9558A;background:#3a1f33}#namong select,#namong input[type=text],#namong textarea{background:#272030;border:1px solid #3A3145;color:#FBF7FD;border-radius:8px;padding:8px;font-size:15px;min-height:36px;box-sizing:border-box}#namong textarea{width:100%;min-height:60px;resize:vertical}#namong .nm-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}#namong .nm-note{margin:0;color:#A99BB8;line-height:1.45}#namong .nm-card{background:#1B1624;border:1px solid #3A3145;border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px}#namong .nm-card h4{margin:0;font-size:14px;color:#F5D76E}#namong .nm-small{color:#A99BB8;font-size:12px;line-height:1.45}#namong .nm-btns{display:flex;flex-wrap:wrap;gap:6px}#namong .nm-btns button{display:flex;flex-direction:column;align-items:flex-start;text-align:left;max-width:100%}#namong .nm-btns small{color:#8F80A3;font-size:11px;font-weight:400}#namong .nm-joywrap{display:flex;align-items:center;gap:12px}#namong .nm-joy{position:relative;width:150px;height:150px;border-radius:50%;background:#211B2A;border:2px solid #3A3145;touch-action:none;user-select:none;-webkit-user-select:none;flex:none}#namong .nm-knob{position:absolute;left:47px;top:47px;width:56px;height:56px;border-radius:50%;background:#D9558A;opacity:.9;pointer-events:none}#namong .nm-joyhint{color:#E9E2EE;font-size:13px;line-height:1.4}#namong #nm-map{width:100%;height:auto;border-radius:12px;border:1px solid #3A3145;background:#14111A}#namong #nm-roles{display:flex;flex-wrap:wrap;gap:6px}#namong .nm-chip{display:flex;align-items:center;gap:6px;background:#211B2A;border:1px solid #3A3145;border-radius:999px;padding:4px 10px}#namong .nm-dot{width:12px;height:12px;border-radius:50%;border:1px solid #000}#namong .nm-chip.dead{opacity:.45;text-decoration:line-through}#namong .nm-chip.imp{border-color:#ff5a5a}#namong #nm-feed{height:260px;overflow:auto;background:#1B1624;border:1px solid #3A3145;border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:4px;font-size:13px;line-height:1.45}#namong .nm-l{word-break:break-word}#namong .nm-tm{color:#7D7090;margin-right:6px;font-variant-numeric:tabular-nums}#namong .kill{color:#ff7a7a}#namong .meet{color:#F5D76E}#namong .chat{color:#BFE7FF}#namong .think{color:#B69CD9;font-style:italic}#namong .warn{color:#FFB86B}#namong .end{color:#9BFFB0;font-weight:600}#namong .err{color:#ff9a9a}#namong .sys{color:#A99BB8}#namong.nm-full{padding:0}#btn-amongai{font-size:14px}';
var cur=null, st=null, queue=[], pumping=false, speed=1, ui=null, chars=[];

function $(i){return document.getElementById(i);}
function core(){return window.ninoAmong&&window.ninoAmong.match_runner?window.ninoAmong:null;}
function msg(t){if(typeof toast==='function')toast(t);else alert(t);}
function fatal(text){var e=new Error(text);e.status=403;return e;}
function clip(s,n){s=String(s==null?'':s);return s.length>n?s.slice(0,n):s;}
function clockOf(t){return typeof t==='number'&&core()?core().i18n.clock(t):'';}
function nameOf(id){var p=st&&st.players[id];return p?p.name:String(id);}

async function askNino(sys,usr){
  var N=window.ninoLocal,ep=N&&N.endpoint&&N.endpoint.cfg&&N.endpoint.cfg();
  if(ep&&ep.url&&N.key&&N.key.isOn&&N.key.isOn()){
    return N.endpoint.clean(await N.endpoint.generate({messages:[{role:'system',content:sys},{role:'user',content:usr}],json:true,maxTokens:700,temp:0.8}));
  }
  if(typeof geminiGenerate!=='function')throw new Error('ยังไม่ได้ต่อโมเดล');
  return await geminiGenerate({systemInstruction:sys,contents:[{role:'user',parts:[{text:usr}]}],jsonMode:true,temperature:0.8});
}

function ninoBrain(state){
  return {complete:async function(a){
    if(state.stop)throw fatal('หยุดแล้ว');
    if(state.calls>=MAX_CALLS)throw fatal('ถึงเพดาน '+MAX_CALLS+' ครั้งต่อเกม หยุดเพื่อกันโควต้าหมด');
    state.calls++;
    var sys=a.system+'\n\nReply with one JSON object only, with exactly these fields: '+Object.keys(a.schema.properties).join(', ')+'.';
    var text=null,lastErr=null;
    for(var i=0;i<2&&text===null;i++){
      try{text=await askNino(sys,a.user);}
      catch(err){lastErr=err;if(i===0)await new Promise(function(r){setTimeout(r,1500);});}
    }
    if(text===null){
      var m=(lastErr&&lastErr.message)||'ไม่ทราบสาเหตุ';
      if(/API Key|ยังไม่ได้ต่อโมเดล/.test(m))throw fatal('ยังไม่ได้ตั้งค่าโมเดลของ NINO: '+m);
      state.fails=(state.fails||0)+1;
      if(state.fails>=MAX_FAILS)throw fatal('เรียกโมเดลไม่สำเร็จติดกัน '+MAX_FAILS+' ครั้ง: '+m);
      if(state.fails===1)lineRaw('warn','','โมเดลไม่ตอบ ('+clip(m,80)+') ผู้เล่นที่ขอคำตอบจะรอไปก่อน และระบบจะลองต่อ');
      throw new Error(m);
    }
    state.fails=0;
    return {text:String(text),refused:false,model:'nino',usage:{input:0,output:0,cacheRead:0}};
  }};
}

function mockBrain(state,seat,seed){
  var m=core().providers_mock.createMock(seat,seed);
  return {complete:function(a){
    if(state.stop)return Promise.reject(fatal('หยุดแล้ว'));
    return m.complete(a);
  }};
}

function humanBrain(state){
  return {complete:function(a){
    if(state.stop)return Promise.reject(fatal('หยุดแล้ว'));
    return new Promise(function(resolve,reject){
      state.pending={kind:a.context.kind,ctx:a.context,resolve:resolve,reject:reject};
      renderMe();
    }).then(function(obj){
      return {text:JSON.stringify(obj),refused:false,model:'human',usage:{input:0,output:0,cacheRead:0}};
    });
  }};
}

function answer(obj){
  var p=cur&&cur.pending;
  if(!p)return;
  cur.pending=null;
  p.resolve(obj);
  renderMe();
}

function abortPending(state){
  var p=state.pending;
  if(!p)return;
  state.pending=null;
  p.reject(fatal('หยุดแล้ว'));
}

function personaOf(c){
  return [c.description,c.persona,c.scenario,c.examples?'ตัวอย่างการพูด: '+c.examples:''].filter(Boolean).join('\n').slice(0,900);
}

function makeSeats(n,mode,humanOn,picked){
  var seats=[],used={},k=0;
  for(var i=0;i<n;i++){
    var isHuman=humanOn&&i===0;
    var seat={id:'s'+(i+1),color:COLOR_KEYS[i]};
    if(isHuman){
      seat.name=HUMAN_NAME;seat.label=HUMAN_NAME;seat.provider='human';seat.model='human';
    }else{
      var c=picked.length?picked[k%picked.length]:null;
      k++;
      var nm=c?clip(c.name,12):NAMES[i];
      if(used[nm]){used[nm]++;nm=nm+' '+used[nm];}else used[nm]=1;
      seat.name=nm;
      seat.label=c?c.name:(mode==='nino'?'NINO':'กฎสำเร็จรูป');
      seat.provider=mode;
      seat.model=mode==='nino'?'default':'mock';
      if(c)seat.persona=personaOf(c);
    }
    seats.push(seat);
  }
  return seats;
}

function pump(){
  if(pumping)return;
  pumping=true;
  tick();
}

function tick(){
  var e=queue.shift();
  if(!e){
    pumping=false;
    if(cur&&!cur.running)setBusy(false);
    return;
  }
  apply(e);
  var d=(DELAY[e.type]!=null?DELAY[e.type]:250)/speed;
  setTimeout(tick,d);
}

function onEvent(e){
  if(SKIP[e.type])return;
  if(e.type==='memory'){
    if(!cur||!cur.human||e.p!==cur.human)return;
  }
  if(cur&&cur.human){
    apply(e);
    return;
  }
  queue.push(e);
  pump();
}

function lineRaw(cls,t,text){
  var f=$('nm-feed');
  if(!f)return;
  var near=f.scrollTop+f.clientHeight>=f.scrollHeight-40;
  var li=document.createElement('div');
  li.className='nm-l '+(cls||'');
  if(t){var s=document.createElement('span');s.className='nm-tm';s.textContent=t;li.appendChild(s);}
  li.appendChild(document.createTextNode(text));
  f.appendChild(li);
  while(f.childNodes.length>400)f.removeChild(f.firstChild);
  if(near)f.scrollTop=f.scrollHeight;
}

function shows(e){
  var H=st.human;
  if(!H)return true;
  switch(e.type){
    case 'match_start':case 'meeting_start':case 'meeting_end':case 'vote_result':case 'chat':case 'sabotage':case 'sabotage_fixed':case 'game_over':return true;
    case 'say':return e.p===H||(e.heard||[]).indexOf(H)>=0||(e.anon||[]).indexOf(H)>=0;
    case 'kill':return e.killer===H||e.victim===H||(e.witnesses||[]).indexOf(H)>=0;
    case 'vent':case 'move':case 'arrive':case 'task_done':case 'decision':return e.p===H;
    default:return false;
  }
}

function apply(e){
  if(!st)return;
  if(typeof e.t==='number')st.t=e.t;
  var P=st.players,H=st.human,M=core().engine_map;
  var tm=clockOf(e.t);
  var show=shows(e);
  switch(e.type){
    case 'match_start':
      st.players={};
      e.players.forEach(function(p){
        st.players[p.id]={id:p.id,name:p.name,hex:p.hex,room:M.BUTTON_ROOM,from:null,to:null,start:0,dur:0,moving:false,alive:true,role:null};
      });
      lineRaw('sys','','เริ่มเกม ผู้เล่น '+e.players.length+' คน บทบาทของคนอื่นถูกซ่อนจนกว่าเกมจะจบ');
      break;
    case 'move':
      if(P[e.p]){P[e.p].moving=true;P[e.p].from=e.from;P[e.p].to=e.to;P[e.p].start=e.t;P[e.p].dur=e.dur||1;}
      break;
    case 'arrive':
      if(P[e.p]){P[e.p].moving=false;P[e.p].room=e.room;}
      break;
    case 'vent':
      if(P[e.p]){P[e.p].moving=false;P[e.p].room=e.to;}
      if(show)lineRaw('warn',tm,nameOf(e.p)+' มุด vent จาก '+e.from+' ไป '+e.to);
      break;
    case 'task_done':
      if(show)lineRaw('',tm,nameOf(e.p)+' ทำ '+e.task+' เสร็จที่ '+e.room);
      break;
    case 'say':
      if(show)lineRaw('',tm,nameOf(e.p)+' ('+e.room+'): '+e.text);
      break;
    case 'chat':
      if(e.text&&show)lineRaw('chat',tm,nameOf(e.p)+': '+e.text);
      if(!H&&ui&&ui.thoughts.checked&&e.thought)lineRaw('think',tm,nameOf(e.p)+' คิดลับ: '+e.thought);
      break;
    case 'decision':
      if(show&&ui&&ui.thoughts.checked&&e.thought)lineRaw('think',tm,nameOf(e.p)+' คิดลับ: '+e.thought);
      break;
    case 'memory':
      if(H&&e.p===H){
        st.mem.push((tm?tm+' ':'')+e.text);
        if(st.mem.length>80)st.mem.shift();
        renderMem();
      }
      break;
    case 'kill':
      if(P[e.victim])P[e.victim].alive=false;
      if(show&&(!H||e.killer===H||e.victim===H||(e.witnesses||[]).indexOf(H)>=0))st.known[e.victim]=true;
      if(show)lineRaw('kill',tm,nameOf(e.killer)+' ฆ่า '+nameOf(e.victim)+' ที่ '+e.room);
      break;
    case 'meeting_start':
      Object.keys(P).forEach(function(id){if(P[id].alive){P[id].moving=false;P[id].room=M.BUTTON_ROOM;}});
      (e.dead||[]).forEach(function(id){st.known[id]=true;});
      if(e.reason==='body')lineRaw('meet',tm,'ประชุม #'+e.n+': '+nameOf(e.caller)+' พบศพ '+nameOf(e.body)+' ที่ '+e.room);
      else lineRaw('meet',tm,'ประชุมฉุกเฉิน: '+nameOf(e.caller)+' กดปุ่ม');
      break;
    case 'vote_result':
      if(e.ejected){
        if(P[e.ejected])P[e.ejected].alive=false;
        st.known[e.ejected]=true;
        var tag=e.reveal?(e.wasImpostor?' (เป็นฆาตกร)':' (ไม่ใช่ฆาตกร)'):'';
        lineRaw('meet',tm,'ผลโหวต: '+nameOf(e.ejected)+' ถูกโหวตออก'+tag);
      }else{
        lineRaw('meet',tm,'ผลโหวต: ไม่มีใครถูกโหวตออก');
      }
      break;
    case 'sabotage':
      st.sabotage=e.kind;
      lineRaw('warn',tm,nameOf(e.by)+' สั่ง sabotage: '+(SABO[e.kind]||e.kind));
      break;
    case 'sabotage_fixed':
      st.sabotage=null;
      lineRaw('warn',tm,'ซ่อม '+(SABO[e.kind]||e.kind)+' แล้ว');
      break;
    case 'game_over':
      st.over=true;st.winner=e.winner;st.roles=e.roles;
      Object.keys(e.roles||{}).forEach(function(id){if(P[id])P[id].role=e.roles[id];});
      Object.keys(P).forEach(function(id){if(!P[id].alive)st.known[id]=true;});
      lineRaw('end',tm,(WIN[e.winner]||e.winner)+' ('+(WHY[e.reason]||e.reason)+')');
      var imps=Object.keys(e.roles||{}).filter(function(id){return e.roles[id]==='impostor';}).map(nameOf);
      lineRaw('end','','ฆาตกรคือ '+imps.join(', '));
      break;
    default:
      break;
  }
  render();
}

function render(){
  status();
  chips();
  draw();
  if(st&&st.human)renderMe();
}

function status(){
  var el=$('nm-status');
  if(!el||!st)return;
  var ids=Object.keys(st.players);
  var alive=ids.filter(function(id){return st.human?!st.known[id]:st.players[id].alive;}).length;
  var label=st.over?(WIN[st.winner]||'จบเกม'):(cur&&cur.running?(cur.pending?'รอคุณตัดสินใจ':'กำลังเล่น'):'พร้อมเริ่ม');
  el.textContent=label+' · เวลาเกม '+clockOf(st.t)+' · มีชีวิต '+alive+'/'+ids.length+(st.sabotage?' · มี sabotage':'');
}

function chips(){
  var box=$('nm-roles');
  if(!box||!st)return;
  box.textContent='';
  Object.keys(st.players).forEach(function(id){
    var p=st.players[id];
    var dead=st.human?!!st.known[id]:!p.alive;
    var c=document.createElement('span');
    c.className='nm-chip'+(dead?' dead':'')+(st.over&&p.role==='impostor'?' imp':'')+(id===st.human?' me':'');
    var d=document.createElement('span');
    d.className='nm-dot';
    d.style.background=p.hex||'#888';
    c.appendChild(d);
    var label=p.name+(id===st.human?' (คุณ)':'');
    if(st.over&&p.role)label+=p.role==='impostor'?' (ฆาตกร)':' (ลูกเรือ)';
    c.appendChild(document.createTextNode(label));
    box.appendChild(c);
  });
}

function draw(){
  var cv=$('nm-map');
  if(!cv||!core())return;
  var g=cv.getContext('2d');
  var M=core().engine_map;
  g.fillStyle='#14111A';
  g.fillRect(0,0,1200,720);
  g.strokeStyle='#3A3145';
  g.lineWidth=10;
  g.lineCap='round';
  M.EDGES.forEach(function(ed){
    var a=M.ROOMS[ed.a],b=M.ROOMS[ed.b];
    g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke();
  });
  var mine=st&&st.human?st.players[st.human]:null;
  Object.keys(M.ROOMS).forEach(function(k){
    var r=M.ROOMS[k];
    var hot=st&&st.sabotage&&((st.sabotage==='lights'&&k==='Electrical')||(st.sabotage==='reactor'&&k==='Reactor'));
    var here=mine&&mine.room===k;
    g.fillStyle=hot?'#4a2a1e':(here?'#34283f':'#272030');
    g.strokeStyle=hot?'#ff9a4a':(here?'#D9558A':'#5b4d6b');
    g.lineWidth=3;
    g.fillRect(r.x-r.w/2,r.y-r.h/2,r.w,r.h);
    g.strokeRect(r.x-r.w/2,r.y-r.h/2,r.w,r.h);
    g.fillStyle='#A99BB8';
    g.font='20px sans-serif';
    g.textAlign='center';
    g.fillText(k,r.x,r.y-r.h/2+24);
  });
  if(!st)return;
  var ids=Object.keys(st.players);
  var visible=ids.filter(function(id){
    if(!st.human)return true;
    var p=st.players[id];
    if(id===st.human)return true;
    if(mine.moving||p.moving)return false;
    return p.room===mine.room;
  });
  var groups={};
  visible.forEach(function(id){
    var p=st.players[id];
    if(p.moving)return;
    (groups[p.room]=groups[p.room]||[]).push(id);
  });
  visible.forEach(function(id){
    var p=st.players[id];
    var x,y;
    if(p.moving&&p.from&&p.to){
      var f=Math.min(1,Math.max(0,(st.t-p.start)/p.dur));
      var a=M.ROOMS[p.from],b=M.ROOMS[p.to];
      x=a.x+(b.x-a.x)*f;y=a.y+(b.y-a.y)*f;
    }else{
      var r=M.ROOMS[p.room];
      if(!r)return;
      var list=groups[p.room]||[id];
      var i=list.indexOf(id),n=list.length,cols=Math.min(3,n);
      var row=Math.floor(i/cols),col=i%cols;
      x=r.x+(col-(cols-1)/2)*46;
      y=r.y+row*46+(r.h>=120?0:14);
    }
    var dead=st.human?!!st.known[id]:!p.alive;
    g.globalAlpha=dead?0.4:1;
    g.beginPath();g.arc(x,y,18,0,Math.PI*2);
    g.fillStyle=p.hex||'#888';g.fill();
    var imp=st.over&&p.role==='impostor';
    g.lineWidth=imp?5:3;
    g.strokeStyle=imp?'#ff3b3b':'#000';
    g.stroke();
    if(dead){g.strokeStyle='#ffffff';g.lineWidth=3;g.beginPath();g.moveTo(x-9,y-9);g.lineTo(x+9,y+9);g.moveTo(x+9,y-9);g.lineTo(x-9,y+9);g.stroke();}
    g.globalAlpha=1;
    g.fillStyle='#E9E2EE';g.font='18px sans-serif';g.textAlign='center';
    g.fillText(p.name,x,y+36);
  });
}

function actLabel(a){
  var k=a.id.split(':')[0],v=a.id.slice(k.length+1);
  if(k==='wait')return 'รอ '+v+' วินาที';
  if(k==='task'||k==='fake'){
    var m=/(?:do|pretend to do) (.+?) @ (\S+)/.exec(a.label||'');
    return (k==='task'?'ทำงาน: ':'แกล้งทำงาน: ')+(m?m[1]+' @ '+m[2]:v);
  }
  if(k==='report')return 'รายงานศพ';
  if(k==='emergency')return 'กดปุ่มประชุม';
  if(k==='fix')return 'ซ่อม '+(SABO[v]||v);
  return (ACT[k]||k)+(v?' '+v:'');
}

function renderMem(){
  var box=$('nm-mem-list');
  if(!box||!st)return;
  box.textContent='';
  st.mem.slice(-40).forEach(function(t){
    var d=document.createElement('div');
    d.className='nm-small';
    d.textContent=t;
    box.appendChild(d);
  });
  box.scrollTop=box.scrollHeight;
}

function renderMe(){
  var card=$('nm-me');
  if(!card)return;
  var p=cur&&cur.pending;
  var mem=$('nm-mem');
  if(mem)mem.style.display=st&&st.human?'flex':'none';
  if(!st||!st.human||!p){
    card.style.display='none';
    if(st&&st.over&&st.human){card.style.display='flex';card.textContent='';var h0=document.createElement('h4');h0.textContent='จบเกมแล้ว';card.appendChild(h0);}
    return;
  }
  card.style.display='flex';
  card.textContent='';
  var ctx=p.ctx;
  if(p.kind==='roam')buildRoam(card,ctx,p);
  else if(p.kind==='speak')buildSpeak(card,ctx);
  else if(p.kind==='vote')buildVote(card,ctx);
  else answer({to_camera:'',note:'',say:'',action:'wait:5'});
}

function h(tag,cls,text){
  var el=document.createElement(tag);
  if(cls)el.className=cls;
  if(text!=null)el.textContent=text;
  return el;
}

function buildRoam(card,ctx,p){
  var view=ctx.view||{};
  var legal=view.legal||[];
  var me=st.players[st.human]||{};
  card.appendChild(h('h4','','ถึงตาคุณ'));
  card.appendChild(h('div','nm-small','บทบาท: '+(view.role==='impostor'?'ฆาตกร'+(view.partners&&view.partners.length?' (ร่วมกับ '+view.partners.join(', ')+')':''):'ลูกเรือ')+' · อยู่ที่ '+(view.location||me.room||'-')+' · งาน '+(view.taskBar?view.taskBar.done+'/'+view.taskBar.total:'-')));
  var seen=(view.visible||[]).map(function(v){return v.name+' @ '+v.where+(v.doing?' ('+v.doing+')':'');});
  card.appendChild(h('div','nm-small','คนที่เห็นตอนนี้: '+(seen.length?seen.join(' · '):'ไม่มี')+(view.shadows?' · เงา '+view.shadows+' คน':'')));
  if(view.bodies&&view.bodies.length)card.appendChild(h('div','nm-small','ศพที่เห็น: '+view.bodies.join(', ')));
  if(view.sabotage)card.appendChild(h('div','nm-small','sabotage: '+(SABO[view.sabotage.kind]||view.sabotage.kind)+(view.sabotage.secondsLeft!=null?' เหลือ '+view.sabotage.secondsLeft+' วินาที':'')));
  var room=view.room||me.room;
  var moves=legal.filter(function(a){return a.id.indexOf('move:')===0;});
  var targets=[];
  if(room&&core()){
    var M=core().engine_map;
    var rc=M.ROOMS[room];
    if(rc)moves.forEach(function(a){
      var t=a.id.slice(5),tc=M.ROOMS[t];
      if(tc)targets.push({id:a.id,room:t,ang:Math.atan2(tc.y-rc.y,tc.x-rc.x)});
    });
  }
  if(targets.length)card.appendChild(joystick(targets,p));
  var say=h('input','');
  say.type='text';say.maxLength=120;say.placeholder='พูดออกเสียง (ไม่บังคับ)';
  say.id='nm-say';
  card.appendChild(say);
  var btns=h('div','nm-btns');
  var rest=legal.filter(function(a){return a.id.indexOf('move:')!==0;});
  if(!legal.length){
    card.appendChild(h('div','nm-small','ตอนนี้ไม่มีคำสั่งให้เลือก ระบบจะรอให้'));
    setTimeout(function(){if(cur&&cur.pending===p)answer({to_camera:'',note:'',say:'',action:'wait:5'});},600);
    return;
  }
  rest.forEach(function(a){
    var b=h('button','');
    b.type='button';
    b.appendChild(h('span','',actLabel(a)));
    b.addEventListener('click',function(){answer({to_camera:'',note:'',say:say.value.trim().slice(0,120),action:a.id});});
    btns.appendChild(b);
  });
  if(moves.length){
    var mv=h('button','',targets.length?'ไปห้องอื่น (เลือกจากรายการ)':'');
    mv.type='button';
    mv.appendChild(h('span','','ไปห้องอื่น'));
    mv.addEventListener('click',function(){
      var sel=btns.querySelector('.nm-moves');
      if(sel){sel.remove();return;}
      var box=h('div','nm-btns nm-moves');
      moves.forEach(function(a){
        var bb=h('button','');bb.type='button';
        bb.appendChild(h('span','',actLabel(a)));
        bb.addEventListener('click',function(){answer({to_camera:'',note:'',say:say.value.trim().slice(0,120),action:a.id});});
        box.appendChild(bb);
      });
      btns.appendChild(box);
    });
    btns.appendChild(mv);
  }
  card.appendChild(btns);
}

function joystick(targets,p){
  var wrap=h('div','nm-joywrap');
  var pad=h('div','nm-joy');
  var knob=h('div','nm-knob');
  pad.appendChild(knob);
  var hint=h('div','nm-joyhint','ลากจอยสติ๊กไปทางที่ต้องการ แล้วปล่อยเพื่อเดิน');
  wrap.appendChild(pad);
  wrap.appendChild(hint);
  var active=false,cx=0,cy=0,R=75,cand=null;
  function pick(dx,dy){
    var mag=Math.hypot(dx,dy);
    if(mag<R*0.35)return null;
    var ang=Math.atan2(dy,dx),best=null,bd=9;
    targets.forEach(function(t){
      var d=Math.abs(Math.atan2(Math.sin(ang-t.ang),Math.cos(ang-t.ang)));
      if(d<bd){bd=d;best=t;}
    });
    return bd<0.7?best:null;
  }
  function move(ev){
    var dx=ev.clientX-cx,dy=ev.clientY-cy;
    var m=Math.hypot(dx,dy),k=m>R*0.7?(R*0.7)/m:1;
    knob.style.transform='translate('+(dx*k)+'px,'+(dy*k)+'px)';
    cand=pick(dx,dy);
    hint.textContent=cand?'ไปที่ '+cand.room+' แล้วปล่อย':'ลากให้ไกลขึ้นเพื่อเลือกทิศ';
  }
  function reset(){
    active=false;cand=null;knob.style.transform='';
  }
  pad.addEventListener('pointerdown',function(ev){
    if(!cur||cur.pending!==p)return;
    active=true;
    try{pad.setPointerCapture(ev.pointerId);}catch(e){}
    var r=pad.getBoundingClientRect();
    cx=r.left+r.width/2;cy=r.top+r.height/2;R=r.width/2;
    move(ev);
  });
  pad.addEventListener('pointermove',function(ev){if(active)move(ev);});
  pad.addEventListener('pointerup',function(){
    if(!active)return;
    var t=cand;
    reset();
    if(t&&cur&&cur.pending===p){
      var say=$('nm-say');
      answer({to_camera:'',note:'',say:say?say.value.trim().slice(0,120):'',action:t.id});
    }else{
      hint.textContent='ลากจอยสติ๊กไปทางที่ต้องการ แล้วปล่อยเพื่อเดิน';
    }
  });
  pad.addEventListener('pointercancel',function(){reset();hint.textContent='ยกเลิกการเลือกทิศ';});
  return wrap;
}

function buildSpeak(card,ctx){
  var m=ctx.meeting||{};
  card.appendChild(h('h4','','ประชุม #'+(m.n||'')+' · เรียกโดย '+(m.callerName||'-')+(m.bodyName?' พบศพ '+m.bodyName+(m.room?' ที่ '+m.room:''):' กดปุ่ม')));
  var tr=h('div','nm-card');
  tr.style.maxHeight='160px';tr.style.overflow='auto';
  (ctx.transcript||[]).slice(-30).forEach(function(c){
    tr.appendChild(h('div','nm-small',c.name+': '+(c.text||'')));
  });
  if(!(ctx.transcript||[]).length)tr.appendChild(h('div','nm-small','ยังไม่มีใครพูด'));
  card.appendChild(tr);
  var ta=h('textarea','');
  ta.maxLength=300;ta.placeholder='พูดกับทุกคนในที่ประชุม';ta.id='nm-chatin';
  card.appendChild(ta);
  var sel=h('select','');sel.id='nm-sus';
  var me=st.players[st.human];
  var opts=[{v:'none',t:'ไม่สงสัยใคร'}];
  (m.alive||[]).forEach(function(nme){if(!me||nme!==me.name)opts.push({v:nme,t:'สงสัย '+nme});});
  opts.forEach(function(o){var op=h('option','',o.t);op.value=o.v;sel.appendChild(op);});
  card.appendChild(sel);
  var send=h('button','p','ส่งข้อความ');
  send.type='button';
  send.addEventListener('click',function(){
    answer({to_camera:'',chat_message:ta.value.trim().slice(0,300),suspect:sel.value});
  });
  card.appendChild(send);
}

function buildVote(card,ctx){
  var m=ctx.meeting||{};
  card.appendChild(h('h4','','ถึงเวลาโหวต (ประชุม #'+(m.n||'')+')'));
  var tr=h('div','nm-card');
  tr.style.maxHeight='120px';tr.style.overflow='auto';
  (ctx.transcript||[]).slice(-20).forEach(function(c){tr.appendChild(h('div','nm-small',c.name+': '+(c.text||'')));});
  card.appendChild(tr);
  var btns=h('div','nm-btns');
  (ctx.options||[]).forEach(function(nme){
    var b=h('button','',nme);b.type='button';
    b.addEventListener('click',function(){answer({to_camera:'',vote:nme});});
    btns.appendChild(b);
  });
  var skip=h('button','','ข้าม');skip.type='button';
  skip.addEventListener('click',function(){answer({to_camera:'',vote:'skip'});});
  btns.appendChild(skip);
  card.appendChild(btns);
}

function setBusy(b){
  if(!ui)return;
  ui.start.disabled=b;
  ui.stop.disabled=!b;
}

function start(){
  var c=core();
  if(!c){msg('โมดูล Among AI ยังไม่โหลด ลองรีเฟรชแอป');return;}
  if(cur&&cur.running)return;
  var n=+ui.count.value,mode=ui.brain.value;
  var humanOn=ui.human.checked;
  if(humanOn&&n<4)n=4;
  var picked=chars.filter(function(ch){return ui.pick[ch.id]&&ui.pick[ch.id].checked;});
  var seats=makeSeats(n,mode,humanOn,picked);
  var humanId=humanOn?seats[0].id:null;
  var state={stop:false,calls:0,fails:0,running:true,human:humanId,pending:null};
  var seed=Math.floor(Math.random()*2147483647);
  var providers=new Map();
  seats.forEach(function(s){
    if(s.provider==='human')providers.set(s.id,humanBrain(state));
    else providers.set(s.id,mode==='nino'?ninoBrain(state):mockBrain(state,s,seed));
  });
  var config={seed:seed,rules:{},language:'th',discussionRounds:2,revealModels:false,persistentMemory:false,logPrompts:false};
  cur=state;
  queue=[];
  st={t:0,players:{},over:false,winner:null,roles:null,sabotage:null,human:humanId,known:{},mem:[]};
  $('nm-feed').textContent='';
  $('nm-mem-list').textContent='';
  render();
  setBusy(true);
  c.match_runner.runMatch({config:config,seats:seats,providers:providers,matchId:'nino-'+Date.now(),dir:'match',memoryDir:'memory',publish:onEvent,log:function(){}})
    .then(function(){finish(state,null);},function(err){finish(state,err);});
}

function finish(state,err){
  state.running=false;
  state.pending=null;
  if(!pumping&&!queue.length)setBusy(false);
  if(err)lineRaw('err','',(state.stop?'หยุดเกมแล้ว':'เกมหยุดกลางทาง: ')+(err.message||String(err)));
  if(st)render();
}

function stopGame(){
  if(!cur||!cur.running)return;
  cur.stop=true;
  abortPending(cur);
}

function open(){
  build();
  ui.root.classList.add('on');
  loadChars();
}

function close(){
  if(!ui)return;
  ui.root.classList.remove('on');
  stopGame();
  queue=[];
}

async function fetchChars(){
  try{
    if(typeof loadCharacters==='function')return await loadCharacters();
  }catch(e){}
  try{return typeof allCharacters!=='undefined'?allCharacters:[];}catch(e){return [];}
}

async function loadChars(){
  var list=await fetchChars();
  chars=(list||[]).filter(function(c){return c&&c.id&&c.name;});
  var box=ui.chars;
  box.textContent='';
  var active=null;
  try{active=typeof currentCharacter!=='undefined'&&currentCharacter&&!currentCharacter.isDefault?currentCharacter.id:null;}catch(e){}
  ui.pick={};
  if(!chars.length){box.appendChild(h('div','nm-small','ยังไม่มีตัวละครในแชท เกมจะใช้ชื่อและบุคลิกเริ่มต้น'));return;}
  chars.forEach(function(c){
    var lab=h('label','nm-row');
    var cb=h('input','');cb.type='checkbox';cb.checked=c.id===active;
    ui.pick[c.id]=cb;
    lab.appendChild(cb);
    lab.appendChild(h('span','',c.name+(c.description?' · '+clip(c.description,40):'')));
    box.appendChild(lab);
  });
}

function toggleFull(){
  var el=ui.root;
  if(document.fullscreenElement){
    if(document.exitFullscreen)document.exitFullscreen().catch(function(){});
    return;
  }
  if(el.requestFullscreen){
    el.requestFullscreen().catch(function(){el.classList.toggle('nm-full');});
  }else{
    el.classList.toggle('nm-full');
  }
}

function build(){
  if(ui)return;
  var style=document.createElement('style');
  style.textContent=CSS;
  document.head.appendChild(style);
  var root=document.createElement('div');
  root.id='namong';
  root.innerHTML='<div class="nm-top"><b>Among AI</b><span id="nm-status"></span><span class="nm-row"><button id="nm-full" type="button">เต็มจอ</button><button id="nm-close" type="button">ปิด</button></span></div>'
    +'<div class="nm-row"><label>ผู้เล่น <select id="nm-count"></select></label>'
    +'<label>สมองผู้เล่นอื่น <select id="nm-brain"><option value="mock">กฎสำเร็จรูป</option><option value="nino">โมเดลของ NINO</option></select></label>'
    +'<label class="nm-row"><input type="checkbox" id="nm-human"> ฉันเล่นด้วย</label></div>'
    +'<div class="nm-card"><h4>ตัวละครจากแชท (บุคลิกจะถูกใส่ให้ผู้เล่น AI)</h4><div id="nm-chars"></div></div>'
    +'<div class="nm-row"><button id="nm-start" class="p" type="button">เริ่มเกม</button><button id="nm-stop" type="button" disabled>หยุด</button><button id="nm-speed" type="button">1x</button></div>'
    +'<p class="nm-note" id="nm-note"></p>'
    +'<div id="nm-me" class="nm-card" style="display:none"></div>'
    +'<div id="nm-mem" class="nm-card" style="display:none"><h4>สิ่งที่คุณเห็น</h4><div id="nm-mem-list"></div></div>'
    +'<label class="nm-row"><input type="checkbox" id="nm-thoughts"> แสดงความคิดลับของผู้เล่น AI (ผู้ชม)</label>'
    +'<canvas id="nm-map" width="1200" height="720"></canvas>'
    +'<div id="nm-roles"></div><div id="nm-feed"></div>';
  document.body.appendChild(root);
  ui={
    root:root,
    count:$('nm-count'),brain:$('nm-brain'),human:$('nm-human'),start:$('nm-start'),stop:$('nm-stop'),
    speed:$('nm-speed'),note:$('nm-note'),thoughts:$('nm-thoughts'),chars:$('nm-chars'),pick:{}
  };
  for(var k=4;k<=10;k++){
    var o=document.createElement('option');
    o.value=String(k);o.textContent=k+' คน';
    if(k===6)o.selected=true;
    ui.count.appendChild(o);
  }
  var noteNow=function(){ui.note.textContent=NOTE[ui.brain.value]||'';};
  ui.brain.addEventListener('change',noteNow);
  noteNow();
  ui.human.addEventListener('change',function(){ui.thoughts.disabled=ui.human.checked;});
  ui.start.addEventListener('click',start);
  ui.stop.addEventListener('click',stopGame);
  ui.speed.addEventListener('click',function(){
    speed=speed===1?2:speed===2?4:1;
    ui.speed.textContent=speed+'x';
  });
  $('nm-full').addEventListener('click',toggleFull);
  $('nm-close').addEventListener('click',close);
  setBusy(false);
  draw();
}

function dock(){
  if($('btn-amongai'))return;
  var sc=$('btn-scenes');
  if(!sc||!sc.parentNode)return;
  var b=document.createElement('button');
  b.id='btn-amongai';
  b.type='button';
  b.className='nino-iconbtn';
  b.setAttribute('aria-label','Among AI');
  b.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 21v-9a5 5 0 0 1 10 0v9z"/><rect x="9" y="8" width="6" height="3" rx="1.5"/></svg>';
  b.addEventListener('click',open);
  sc.parentNode.insertBefore(b,sc.nextSibling);
}

function run(){dock();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true});
window.ninoAmongUI={open:open,close:close};
})();
