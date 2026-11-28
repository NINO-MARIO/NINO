(function(){
'use strict';
var CB_KEY='nino-roleplay-callback';
var MAX_RETRIES=5,CTX_LEN=6;
function jget(k,d){try{var v=JSON.parse(localStorage.getItem(k)||'null');return v==null?d:v;}catch(e){return d;}}
function jset(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){return false;}}
var state={active:false,pendingTool:null,lastUserMsg:null,ctx:[],pausedAt:null,attempts:0};
function checkpoint(messages){
  if(messages&&messages.length){
    state.ctx=messages.slice(-CTX_LEN);
    var lastU=null;
    for(var i=messages.length-1;i>=0;i--){if(messages[i].role==='user'){lastU=messages[i].content;break;}}
    state.lastUserMsg=lastU?lastU.slice(0,500):null;
  }
  state.active=true;
  jset(CB_KEY,state);
}
function markPending(name,args){
  state.pendingTool={name:name,args:args,ts:Date.now()};
  jset(CB_KEY,state);
}
function clearPending(){
  state.pendingTool=null;
  state.attempts=0;
  jset(CB_KEY,state);
}
function onDisconnect(err){
  state.pausedAt=Date.now();
  state.attempts++;
  jset(CB_KEY,state);
  if(state.attempts<MAX_RETRIES){
    var delay=Math.min(1000*Math.pow(2,state.attempts),30000);
    setTimeout(resume,delay);
    if(window.dispatchEvent){
      window.dispatchEvent(new CustomEvent('nino:cb-pause',{detail:{attempt:state.attempts,max:MAX_RETRIES,delay:delay}}));
    }
  }else{
    state.active=false;
    jset(CB_KEY,state);
    if(window.dispatchEvent){
      window.dispatchEvent(new CustomEvent('nino:cb-fail',{detail:{error:String(err||'unknown')}}));
    }
  }
}
function resume(){
  var saved=jget(CB_KEY,null);
  if(!saved||!saved.active)return null;
  var out={
    context:saved.ctx||[],
    pendingTool:saved.pendingTool||null,
    lastUserMsg:saved.lastUserMsg||null,
    pauseSec:Math.round((Date.now()-(saved.pausedAt||Date.now()))/1000),
    attempts:saved.attempts||0
  };
  if(saved.pendingTool&&window.CodeBrain&&window.CodeBrain.executeTool){
    try{window.CodeBrain.executeTool(saved.pendingTool.name,saved.pendingTool.args);}catch(e){}
  }
  state.active=false;
  state.pendingTool=null;
  state.attempts=0;
  state.pausedAt=null;
  jset(CB_KEY,state);
  if(window.dispatchEvent){
    window.dispatchEvent(new CustomEvent('nino:cb-resume',{detail:out}));
  }
  return out;
}
function hasPending(){
  var s=jget(CB_KEY,null);
  return !!(s&&s.ctx&&s.ctx.length>0&&!s.pendingTool&&!s.active);
}
function getResumePrompt(){
  var s=jget(CB_KEY,null);
  if(!s||!s.ctx||!s.ctx.length)return'';
  var p=['[CALLBACK_RESUME]'];
  if(s.pendingTool)p.push('Tool pending: '+s.pendingTool.name+' '+JSON.stringify(s.pendingTool.args));
  if(s.lastUserMsg)p.push('Last user: '+s.lastUserMsg);
  if(s.pausedAt)p.push('Paused '+Math.round((Date.now()-s.pausedAt)/1000)+'s ago');
  p.push('Continue from saved context. Do not restart.');
  return p.join('\n');
}
window.RoleplayCallback={
  checkpoint:checkpoint,
  markPending:markPending,
  clearPending:clearPending,
  onDisconnect:onDisconnect,
  resume:resume,
  hasPending:hasPending,
  getResumePrompt:getResumePrompt,
  getState:function(){return jget(CB_KEY,null);}
};
})();