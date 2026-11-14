(function(){
var RE=/[\u{1F300}-\u{1FAFF}\u{2705}\u{274C}\u{26A0}\u{2753}\u{2757}\u{2728}\u{2B50}\u{23F0}\u{23F3}\u{231B}\u{FE0F}\u{200D}]/gu;
function strip(s){return typeof s==='string'?s.replace(RE,'').replace(/[ \t]{2,}/g,' '):s;}
var g=window.geminiGenerate;
if(typeof g==='function'){
window.geminiGenerate=async function(a){
var si=a&&a.systemInstruction;if(si&&String(typeof si==='string'?si:JSON.stringify(si)).indexOf('NINO_CARD')>=0)return g.call(this,a);
if(a&&typeof a.onChunk==='function'){var oc=a.onChunk;a=Object.assign({},a,{onChunk:function(d){return oc(strip(d));}});}
var out=await g.call(this,a);
return strip(out);
};
}
window.ninoNoEmoji={strip:strip,test:function(s){RE.lastIndex=0;return RE.test(String(s||''));}};
})();
