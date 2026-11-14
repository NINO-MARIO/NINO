(function(){
var AC='#00d9ff';
/* Roleplay card. A block wrapped in <!--?key--> ... <!--/?--> is kept only when the model sent a value for that key. */
var T=`<div style="background: linear-gradient(145deg, #001f3f, #003366); border: 2px solid #00d9ff; border-radius: 12px; padding: 15px; font-family: 'Consolas', monospace; text-align: center; box-shadow: 0 0 20px rgba(0, 217, 255, 0.4); margin-bottom: 15px;\">
    <div style="margin-bottom: 10px;">
        {{@AVATAR}}
        <span style="color: #00d9ff; font-size: 12px; font-weight: bold; text-shadow: 0 0 8px rgba(0, 217, 255, 0.8);">● [{{ชื่อตัวละคร}}✓] พร้อมสนทนา✓</span>
    </div>
    <div style="display: flex; justify-content: space-between; font-size: 9px; color: #00d9ff; font-weight: bold; letter-spacing: 1px; margin-bottom: 8px; border-top: 1px solid rgba(0, 217, 255, 0.4); padding-top: 10px;">
        <span style="text-shadow: 0 0 5px #00d9ff;">● SYSTEM_ONLINE | {{เวลา}}</span>
        <!--?stamp--><span>STAMP_{{สภาพอากาศ}}</span><!--/?-->
    </div>
    <!--?pro--><div style="border-top: 1px double rgba(0, 217, 255, 0.5); padding-top: 8px; margin-top: 8px; color: #e0ffff; font-size: 11px; text-shadow: 0 0 5px rgba(0, 255, 255, 0.6); font-style: italic;\">\"{{คำโปรยบรรยากาศ}}\"</div><!--/?-->
    <div style="font-family: 'Consolas', monospace; font-size: 12px; color: #e0e0e0; background: rgba(0, 10, 30, 0.6); padding: 8px; border-radius: 0 0 12px 12px; border: 1px solid rgba(0, 217, 255, 0.3); border-top: none;\">
        <!--?hpmp--><div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <!--?hp--><span style="color: #00d9ff; text-shadow: 0 0 1px #00d9ff; letter-spacing: 1px;">HP: <span style="display: inline-block; width: 30px; text-align: right;">{{HP}}</span><!--?hpmax-->/{{HP_MAX}}<!--/?--></span><!--/?-->
            <!--?mp--><span style="color: #00d9ff; text-shadow: 0 0 1px #00d9ff; letter-spacing: 1px;">MP: <span style="display: inline-block; width: 45px; text-align: right;">{{MP}}</span><!--?mpmax-->/{{MP_MAX}}<!--/?--></span><!--/?-->
        </div><!--/?-->
        <!--?hunger--><div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <!--?hu--><span style="color: #00d9ff; font-size: 10px; text-shadow: 0 0 1px #00d9ff; letter-spacing: 1px;">ความหิว: <span style="display: inline-block; width: 28px; text-align: right;">{{ความหิว}}</span>%</span><!--/?-->
            <!--?ft--><span style="color: #00d9ff; font-size: 10px; text-shadow: 0 0 1px #00d9ff; letter-spacing: 1px;">อ่อนล้า: <span style="display: inline-block; width: 28px; text-align: right;">{{ความอ่อนล้า}}</span>%</span><!--/?-->
        </div><!--/?-->
        <!--?loss--><div style="margin-top: 8px; padding-top: 5px; border-top: 1px dashed rgba(255,255,255,0.1); font-size: 10px; color: #888;">
            <span style="color: #00d9ff;">⚠ TIME_LOSS_LOG:</span> <span style="color: #888;">{{กิจกรรมที่ใช้เวลา}}</span> <!--?lossn-->➜ <span style="color: #888;">{{จำนวน}}</span> <span style="color: #888;">นาที</span><!--/?-->
        </div><!--/?-->
        <!--?step--><div style="margin-top: 5px; font-size: 8px; color: #888; text-align: center;">
            <span>[ Step: {{ระยะทาง}} เมตร ]</span>
        </div><!--/?-->
        <div style="font-family: 'Consolas', monospace; font-size: 10px; color: #00d9ff; background: rgba(0, 20, 50, 0.5); padding: 5px 12px; border-radius: 0 0 12px 12px; border: 1px solid rgba(0, 217, 255, 0.3); border-top: 1px dashed rgba(0, 217, 255, 0.5); display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;"><!--?stl--><div style="color: #a0c0d0;">STATUS: <span style="color: #00ffff; font-weight: bold;">LOG: {{ชื่อสถานะ}}</span></div><!--/?--><div style="text-align: right;">จริง {{@REAL}}<!--?sday--> · <span style="background: #00d9ff; color: #001; padding: 1px 4px; border-radius: 2px; font-weight: bold;">วันในเรื่อง DAY {{วันที่}}</span><!--/?--></div></div>
    </div>
</div>

<!--?body--><div style="margin-top: 10px; padding: 15px; background: #0a0a0a; border: 2px solid #00d9ff; border-radius: 15px; box-shadow: 0 0 30px rgba(0, 217, 255, 0.3); font-family: 'Consolas', monospace; position: relative; overflow: hidden;">
    <h3 style="color: #00d9ff; font-size: 18px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 2px; text-shadow: 0 0 10px #00d9ff;">[เหตุการณ์ปัจจุบัน]</h3>
    <div style="color:#f3e8ff; margin-top:5px; position: relative; z-index: 1; line-height: 1.6;">
        {{@BODY}}
    </div>
</div><!--/?-->

<!--?loc--><div style="margin-top: 10px; padding: 15px; background: #0a0a0a; border: 2px solid #00d9ff; border-radius: 15px; box-shadow: 0 0 30px rgba(0, 217, 255, 0.3); font-family: 'Consolas', monospace; position: relative; overflow: hidden;">
    <h3 style="color: #00d9ff; font-size: 18px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 2px; text-shadow: 0 0 10px #00d9ff;">[สถานที่ปัจจุบัน]</h3>
    <div style="color: #f3e8ff; margin-top: 5px; line-height: 1.4;">
        <b>เวลา: {{เวลา}}<!--?lday--> | วันที่ {{วันที่}}<!--/?--></b><br>
        <!--?weather-->- อากาศ: {{สภาพอากาศ}}<br><!--/?-->
        <!--?env-->- สภาพแวดล้อม: {{รายละเอียดสภาพแวดล้อม}}<br><!--/?-->
        <!--?atmo-->- คำอธิบาย: {{คำอธิบายบรรยากาศ}}<!--/?-->
    </div>
</div><!--/?-->

<div style="background: linear-gradient(135deg, #0a0a0a, #1a1a2e); border: 2px solid #00d9ff; border-radius: 10px; padding: 10px; font-family: 'Consolas', monospace; text-align: center; margin-top: 20px;">
    <span style="color: #00d9ff; font-size: 10px; text-shadow: 0 0 10px #00d9ff, 0 0 10px #a020f0; font-weight: bold; letter-spacing: 2px;">
        <!--?nq--><div style="margin-bottom: 4px;">
            <span style="color:#e879f9; font-weight:normal; font-size: 10px;">{{ชื่อตัวละคร}}:</span>
            <span style="font-style: italic;">\"{{คำคม/ข้อคิดจากนิโนะตามสถานการณ์}}\"</span>
        </div><!--/?-->
        <!--?rq--><div style="margin-bottom: 8px;">
            <span style="color:#e879f9; font-weight:normal; font-size: 10px;">{{ชื่อบุคคลอ้างอิง}}:</span>
            <span style="font-style: italic;">\"{{คำคม/ข้อคิดประกอบสถานการณ์}}\"</span>
        </div><!--/?-->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px;"><!--?o1--><div class="opt-btn" data-choice="1" style="background: rgba(216, 180, 254, 0.2); border: 1px solid #00ffff; color: #00ffff; padding: 10px; border-radius: 4px; text-align: center; cursor: pointer; transition: all 0.2s; font-size: 12px; min-height: 44px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">1. {{ตัวเลือกที่ 1}}</div><!--/?--><!--?o2--><div class="opt-btn" data-choice="2" style="background: rgba(216, 180, 254, 0.2); border: 1px solid #00ffff; color: #00ffff; padding: 10px; border-radius: 4px; text-align: center; cursor: pointer; transition: all 0.2s; font-size: 12px; min-height: 44px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">2. {{ตัวเลือกที่ 2}}</div><!--/?--><!--?o3--><div class="opt-btn" data-choice="3" style="background: rgba(216, 180, 254, 0.2); border: 1px solid #00ffff; color: #00ffff; padding: 10px; border-radius: 4px; text-align: center; cursor: pointer; transition: all 0.2s; font-size: 12px; min-height: 44px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">3. {{ตัวเลือกที่ 3}}</div><!--/?--><!--?o4--><div class="opt-btn" data-choice="4" style="background: rgba(216, 180, 254, 0.2); border: 1px solid #00ffff; color: #00ffff; padding: 10px; border-radius: 4px; text-align: center; cursor: pointer; transition: all 0.2s; font-size: 12px; min-height: 44px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">4. {{ตัวเลือกที่ 4}}</div><!--/?--><div class="opt-btn shop-btn" data-choice="5" style="grid-column: span 2; background: rgba(255, 140, 0, 0.1); border: 1px solid #ff8c00; color: #ff8c00; padding: 10px; border-radius: 4px; text-align: center; cursor: pointer; transition: all 0.2s; font-size: 12px;">5. {{@OPT5}}</div></div></span>
</div>

<!--?sys--><div style="padding: 20px; background: #0a0a0a; border: 1px solid #00ffff; border-bottom: 5px solid #00ffff; border-radius: 12px; font-family: 'Consolas', monospace; font-size: 13px; color: #00ffff; margin-top: 15px;">
    <p>⚠️ <b>SYSTEM_LOG:</b> {{บันทึกระบบตามสถานการณ์}}</p>
</div><!--/?-->

<!--?speech--><div style="background: linear-gradient(135deg, rgba(44, 62, 80, 0.9) 0%, rgba(0, 0, 0, 0.9) 100%); padding: 20px; border-radius: 15px; border: 1px solid #87CEEB; box-shadow: 0 4px 15px rgba(0,0,0,0.3); text-shadow: none; margin-top: 20px;">
    <p style="color: #a5d8ff; font-style: italic; margin: 0; line-height: 1.8;">
        <span style="color: #a5d8ff;">({{อารมณ์/ท่าทีของนิโนะ}})</span><br>
        <span style="font-size: 19px; color: #ffffff; text-shadow: 0 0 10px rgba(255,255,255,0.5);">\"{{บทพูดของนิโนะตามสถานการณ์}}\"</span>
    </p>
</div><!--/?-->

<!--?gesture--><br>
<span style="font-size: 9px; color: #776655;">
( {{คำบรรยายท่าทางปิดท้ายของนิโนะ}} )
</span><!--/?-->`;
T=T.replace(/>[ \t]*\n[ \t]*</g,'><').replace(/\n[ \t]*/g,' ').replace(/> </g,'> <');
var AVATAR='';
var KEYS=['ความหิว','อ่อนล้า','ความอ่อนล้า','ระยะทาง','พบ','ตัวเลือก5','สถานะ','เวลา','วัน','อากาศ','คำโปรย','HP','MP','หิว','ล้า','เสียเวลา','ระยะ','สถานการณ์','NPC','เสียง','ท่า','พูด','จบฉาก','สภาพแวดล้อม','บรรยากาศ','คำคมนิโนะ','คำคมอ้างอิง','ตัวเลือก1','ตัวเลือก2','ตัวเลือก3','ตัวเลือก4','ระบบ','อารมณ์','นิโนะพูด','ปิดท้าย'];
var ALIAS={'ความหิว':'หิว','อ่อนล้า':'ล้า','ความอ่อนล้า':'ล้า','ระยะทาง':'ระยะ'};
var KRE=new RegExp('^\\s*('+KEYS.join('|')+')\\s*[:：]\\s*(.*)$');
var OPEN='[[CARD]]',CLOSE='[[/CARD]]';
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function parse(block){
var ents=[],cur=null;
String(block||'').split('\n').forEach(function(line){
var m=KRE.exec(line);
if(m){cur={k:ALIAS[m[1]]||m[1],v:m[2]};ents.push(cur);}
else if(cur&&line.trim())cur.v+=' '+line.trim();
});
/* "-", "—" or "–" written by the model mean "nothing here", never a value to print */
ents.forEach(function(e){if(/^\s*[-–—]+\s*$/.test(e.v))e.v='';});
return ents;
}
/* Values the template already wraps or labels: drop the quotes and units the model also wrote. */
function tidy(v){return String(v==null?'':v).trim().replace(/^[\"“”「『]+|[\"“”」』]+$/g,'').trim();}
function unit(v,re){return String(v==null?'':v).trim().replace(re,'').trim();}
function fmt(v){
var e=esc(v);
e=e.replace(/\*\s*\*/g,'');
e=e.replace(/\*\s*([^*\n]+?)\s*\*/g,'<i>$1</i>');
return e.replace(/\*/g,'');
}
function first(ents,k){for(var i=0;i<ents.length;i++)if(ents[i].k===k)return ents[i].v.trim();return'';}
function pair(v){var a=String(v||'').split('/');return[(a[0]||'').trim()||'-',(a[1]||'').trim()||'-'];}
function bar(v){var a=String(v||'').split('|');return[(a[0]||'').trim()||'-',(a.slice(1).join('|')||'').trim()||'-'];}
function realStamp(ts){var d=new Date(ts||Date.now());var dt=d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});return dt+' '+('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);}
function nowHm(){var d=new Date();return('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);}
/* Solid circle when the user has not set a character picture; never a remote image. */
function avatarEl(src,size,inline){
var s=String(size||45),m=inline?'0':'0 auto 5px auto';
if(src)return'<img src="'+esc(src)+'" alt="" style="width:'+s+'px;height:'+s+'px;border-radius:50%;object-fit:cover;border:2px solid '+AC+';display:block;margin:'+m+';">';
return'<span data-avatar="solid" aria-hidden="true" style="display:block;width:'+s+'px;height:'+s+'px;border-radius:50%;background:'+AC+';box-shadow:0 0 10px '+AC+';margin:'+m+';"></span>';
}
function body(ents){
var h='';
ents.forEach(function(e){
var v=tidy(e.v);
if(!v)return;
if(e.k==='สถานการณ์'){var p=v.split('|'),em='',ds=v;if(p.length>1&&p[0].trim().length<=6){em=p[0].trim();ds=p.slice(1).join('|').trim();}h+='<b>'+fmt(em)+' สถานการณ์:</b> '+fmt(ds)+'<br><br>';}
else if(e.k==='NPC'||e.k==='พบ'){if(!/^(ไม่มี|ไม่พบ|ไม่มีใคร|-)$/.test(v))h+='<span style="color:#9BE0BC;">พบ:</span> '+fmt(v)+'<br><br>';}
else if(e.k==='เสียง')h+='<b style="color:#00ffff;">['+fmt(v)+']</b><br><br>';
else if(e.k==='ท่า'||e.k==='จบฉาก')h+='<i>'+fmt(v)+'</i><br><br>';
else if(e.k==='พูด'){var q=v.split('|').map(function(x){return x.trim();});var nm=q[0]||'',ge=q.length>2?q[1]:'',tx=tidy(q.length>2?q.slice(2).join(' | '):(q[1]||''));h+='<b>'+fmt(nm)+':</b> '+(ge?'('+fmt(ge)+') ':'')+'"'+fmt(tx)+'"<br><br>';}
});
return h.replace(/(<br>)+$/,'');
}
/* Code-mode body: only the story line, without roleplay stage directions. */
function codeBody(ents){
var out='';
ents.forEach(function(e){
if(e.k!=='สถานการณ์')return;
var v=e.v.trim();if(!v)return;
var p=v.split('|'),ds=v;if(p.length>1&&p[0].trim().length<=6)ds=p.slice(1).join('|').trim();
if(ds)out+='<div>'+esc(ds)+'</div>';
});
return out;
}
/* Innermost sections first, so a section can contain other sections without its end marker being mistaken for theirs. */
function sec(tpl,on){var t=tpl,re=/<!--\?(\w+)-->((?:(?!<!--\?)[\s\S])*?)<!--\/\?-->/;while(re.test(t))t=t.replace(re,function(_,k,inner){return on[k]?inner:'';});return t;}
function roleplayHtml(ents,ctx){
var name=(ctx.name||'').trim()||'NINO';
var g=function(k,d){var v=first(ents,k);return v||(d==null?'-':d);};
var hp=pair(first(ents,'HP')),mp=pair(first(ents,'MP')),tl=bar(first(ents,'เสียเวลา')),q2=bar(first(ents,'คำคมอ้างอิง'));
tl[1]=unit(tl[1],/\s*นาที\s*$/);var stepV=unit(first(ents,'ระยะ'),/\s*(เมตร|ม\.)\s*$/);
var hungerV=unit(first(ents,'หิว'),/\s*%\s*$/),fatigueV=unit(first(ents,'ล้า'),/\s*%\s*$/);
var time=g('เวลา',nowHm()),weather=g('อากาศ');
var bodyHtml=body(ents);
var on={
stamp:!!first(ents,'อากาศ'),pro:!!first(ents,'คำโปรย'),hpmp:!!(first(ents,'HP')||first(ents,'MP')),
hunger:!!(first(ents,'หิว')||first(ents,'ล้า')),loss:!!first(ents,'เสียเวลา'),step:!!first(ents,'ระยะ'),
status:!!(first(ents,'สถานะ')||first(ents,'วัน')),body:!!bodyHtml,
loc:!!(first(ents,'อากาศ')||first(ents,'สภาพแวดล้อม')||first(ents,'บรรยากาศ')),
weather:!!first(ents,'อากาศ'),env:!!first(ents,'สภาพแวดล้อม'),atmo:!!first(ents,'บรรยากาศ'),
nq:!!first(ents,'คำคมนิโนะ'),rq:!!first(ents,'คำคมอ้างอิง'),sys:!!first(ents,'ระบบ'),
speech:!!(first(ents,'นิโนะพูด')||first(ents,'อารมณ์')),gesture:!!first(ents,'ปิดท้าย'),o1:!!first(ents,'ตัวเลือก1'),o2:!!first(ents,'ตัวเลือก2'),o3:!!first(ents,'ตัวเลือก3'),o4:!!first(ents,'ตัวเลือก4'),sday:!!first(ents,'วัน'),mp:!!first(ents,'MP'),hp:!!first(ents,'HP'),hpmax:!!(hp[1]&&hp[1]!=='-'),mpmax:!!(mp[1]&&mp[1]!=='-'),lossn:!!(tl[1]&&tl[1]!=='-'),lday:!!first(ents,'วัน'),hu:!!first(ents,'หิว'),ft:!!first(ents,'ล้า'),stl:!!first(ents,'สถานะ')
};
var map={'ชื่อตัวละคร':name,'@REAL':realStamp(ctx.ts),'ตัวเลือกที่ 4':g('ตัวเลือก4'),'เวลา':time,'สภาพอากาศ':weather,'คำโปรยบรรยากาศ':g('คำโปรย'),'HP':hp[0],'HP_MAX':hp[1],'MP':mp[0],'MP_MAX':mp[1],'ความหิว':hungerV||'-','ความอ่อนล้า':fatigueV||'-','กิจกรรมที่ใช้เวลา':tl[0],'จำนวน':tl[1]||'-','ระยะทาง':stepV||'-','ชื่อสถานะ':g('สถานะ'),'วันที่':g('วัน'),'รายละเอียดสภาพแวดล้อม':g('สภาพแวดล้อม'),'คำอธิบายบรรยากาศ':g('บรรยากาศ'),'คำคม/ข้อคิดจากนิโนะตามสถานการณ์':tidy(g('คำคมนิโนะ')),'ชื่อบุคคลอ้างอิง':q2[0]==='-'?'-':q2[0],'คำคม/ข้อคิดประกอบสถานการณ์':tidy(q2[1]),'ตัวเลือกที่ 1':g('ตัวเลือก1'),'ตัวเลือกที่ 2':g('ตัวเลือก2'),'ตัวเลือกที่ 3':g('ตัวเลือก3'),'บันทึกระบบตามสถานการณ์':g('ระบบ'),'อารมณ์/ท่าทีของนิโนะ':g('อารมณ์'),'บทพูดของนิโนะตามสถานการณ์':tidy(g('นิโนะพูด')),'คำบรรยายท่าทางปิดท้ายของนิโนะ':g('ปิดท้าย')};
var tpl=sec(T,on);
var out=tpl.replace(/\{\{([^}]+)\}\}/g,function(_,k){
if(k==='@AVATAR')return avatarEl(ctx.avatar,45,false);
if(k==='@BODY')return bodyHtml;
if(k==='@OPT5')return esc(first(ents,'ตัวเลือก5')||name+' SHOP');
return fmt(map[k]==null?'-':map[k]);
});
return out;
}
/* Code-mode card: status line, the story line, system log and up to three choices. No RPG stats, no shop. */
function codeHtml(ents,ctx){
var name=(ctx.name||'').trim()||'NINO';
var st=first(ents,'สถานะ'),env=first(ents,'สภาพแวดล้อม'),sys=first(ents,'ระบบ'),story=codeBody(ents);
var CELL='background:rgba(0,217,255,0.08);border:1px solid #00d9ff;color:#e0ffff;padding:7px 10px;border-radius:6px;cursor:pointer;font-size:12px;line-height:1.4;min-height:36px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;';
var opts='';
[1,2,3,4].forEach(function(n){var t=first(ents,'ตัวเลือก'+n);if(t)opts+='<div class="opt-btn" data-choice="'+n+'" style="'+CELL+'">'+n+'. '+esc(t)+'</div>';});
opts+='<div class="opt-btn shop-btn" data-choice="5" style="grid-column:span 2;background:rgba(255,140,0,0.1);border:1px solid #ff8c00;color:#ff8c00;padding:7px 10px;border-radius:6px;cursor:pointer;font-size:12px;line-height:1.4;text-align:center;">5. '+esc(first(ents,'ตัวเลือก5')||name+' SHOP')+'</div>';
var h='<div style="background:#0a0a0a;border:1px solid #00d9ff;border-left:3px solid #00d9ff;border-radius:10px;padding:10px 12px;font-family:Consolas,monospace;color:#e0ffff;box-shadow:0 0 12px rgba(0,217,255,0.2);">';
h+='<div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#00d9ff;letter-spacing:1px;flex-wrap:wrap;">'+avatarEl(ctx.avatar,22,true)+'<span style="font-weight:bold;">● '+esc(name)+'</span>'+(st?'<span style="color:#a0c0d0;">'+esc(st)+'</span>':'')+'<span style="margin-left:auto;color:#a0c0d0;font-size:10px;">จริง '+esc(realStamp(ctx.ts))+'</span></div>';
if(story)h+='<div style="margin-top:8px;color:#f3e8ff;font-size:12px;line-height:1.6;">'+story+'</div>';
if(env)h+='<div style="margin-top:6px;font-size:11px;color:#a0c0d0;">ส่วนที่เกี่ยวข้อง: '+esc(env)+'</div>';
if(sys)h+='<div style="margin-top:8px;padding-top:6px;border-top:1px dashed rgba(0,217,255,0.4);font-size:11px;color:#00ffff;">SYSTEM_LOG: '+esc(sys)+'</div>';
h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px;">'+opts+'</div>';
return h+'</div>';
}
var FEAT_RE=/\[\[(CODE|TABLE|WEB|PLAN)(?:[ \t]+([^\]\n]{0,24}))?\]\]([\s\S]*?)\[\[\/\1\]\]/g;
function hasFeat(t){return /\[\[(CODE|TABLE|WEB|PLAN)(?:[ \t][^\]\n]{0,24})?\]\][\s\S]*?\[\[\/\1\]\]/.test(String(t||''));}
function copyBtn(text,label){label=label||'คัดลอก';return'<button type="button" data-copy="'+esc(text)+'" data-label="'+esc(label)+'" style="font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid rgba(0,217,255,0.5);background:transparent;color:#7fe7ff;cursor:pointer;font-family:inherit;">'+esc(label)+'</button>';}
function featHtml(kind,arg,body){
var lines=String(body||'').replace(/^\n+|\s+$/g,'').split('\n');
if(kind==='CODE'){
var code=lines.join('\n');
return'<div style="margin:8px 0;border:1px solid rgba(0,217,255,0.35);border-radius:10px;overflow:hidden;background:#0a0a0a;"><div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:rgba(0,217,255,0.08);font-family:Consolas,monospace;font-size:10px;color:#7fe7ff;"><span>'+esc(arg||'code')+'</span>'+copyBtn(code,'คัดลอกโค้ด')+'</div><pre style="margin:0;padding:10px;overflow-x:auto;white-space:pre;font-size:11px;line-height:1.5;color:#E9E2EE;font-family:Consolas,monospace;">'+esc(code)+'</pre></div>';
}
if(kind==='TABLE'){
var rows=lines.filter(function(l){return l.trim()&&!/^[\s|:\-]+$/.test(l);}).map(function(l){return l.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(function(c){return c.trim();});});
if(!rows.length)return'';
var th=rows[0].map(function(c){return'<th style="text-align:left;padding:6px 8px;border-bottom:1px solid rgba(242,138,178,0.4);color:#F28AB2;font-weight:600;white-space:nowrap;">'+esc(c)+'</th>';}).join('');
var tb=rows.slice(1).map(function(r){return'<tr>'+r.map(function(c){return'<td style="padding:6px 8px;border-bottom:1px solid #2A2236;color:#E9E2EE;vertical-align:top;">'+esc(c)+'</td>';}).join('')+'</tr>';}).join('');
return'<div style="margin:8px 0;overflow-x:auto;border-radius:10px;border:1px solid #3A3145;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr>'+th+'</tr></thead><tbody>'+tb+'</tbody></table></div>';
}
if(kind==='WEB'){
var items=lines.filter(function(l){return l.trim();}).map(function(l){var p=l.split('|').map(function(x){return x.trim();});return{title:p[0]||'',url:p[1]||'',note:p.slice(2).join(' | ')};});
if(!items.length)return'';
var li=items.map(function(it){
var ok=/^https?:\/\/\S+$/i.test(it.url);
var host='';try{host=ok?new URL(it.url).hostname:'';}catch(e){}
return'<div style="padding:8px 0;border-top:1px solid #2A2236;"><div style="color:#E9E2EE;font-size:12px;">'+esc(it.title||host||'แหล่ง')+'</div>'+(host?'<div style="font-size:10px;color:#7fe7ff;margin-top:2px;">'+esc(host)+'</div>':'')+(it.note?'<div style="font-size:11px;color:#A79BB3;margin-top:4px;line-height:1.5;">ผลการอ่าน: '+esc(it.note)+'</div>':'')+(ok?'<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;"><a href="'+esc(it.url)+'" target="_blank" rel="noopener noreferrer" style="font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid rgba(242,138,178,0.6);color:#F28AB2;text-decoration:none;">เปิดลิงก์</a>'+copyBtn(it.url,'คัดลอกลิงก์')+'</div>':'')+'</div>';
}).join('');
return'<details style="margin:8px 0;border:1px solid #3A3145;border-radius:10px;padding:8px 10px;background:#17121F;"><summary style="cursor:pointer;color:#C9A8F5;font-size:12px;">แหล่งอ้างอิง '+items.length+' รายการ · แตะเพื่อดู</summary>'+li+'</details>';
}
if(kind==='PLAN'){
var rowsH=lines.filter(function(l){return l.trim();}).map(function(l){var m=/^\s*\[( |x|X)\]\s*(.*)$/.exec(l);var done=!!m&&m[1]!==' ';var t=m?m[2]:l.trim();return'<div style="display:flex;gap:8px;align-items:flex-start;padding:4px 0;font-size:12px;color:'+(done?'#8FD3B0':'#E9E2EE')+';"><span style="display:inline-block;width:14px;height:14px;flex-shrink:0;margin-top:2px;border:1.5px solid '+(done?'#8FD3B0':'#6E6279')+';border-radius:3px;background:'+(done?'rgba(143,211,176,0.25)':'transparent')+';"></span><span style="'+(done?'text-decoration:line-through;':'')+'">'+esc(t)+'</span></div>';}).join('');
return'<div style="margin:8px 0;padding:8px 10px;border:1px solid #3A3145;border-radius:10px;background:#17121F;">'+rowsH+'</div>';
}
return'';
}
/* Text outside a card: feature blocks are drawn as their own pieces; the rest goes to the caller's plain renderer. */
function renderFeat(text,plain){
var out='',pos=0,m;FEAT_RE.lastIndex=0;
while((m=FEAT_RE.exec(text))){
var before=text.slice(pos,m.index).trim();if(before)out+=plain(before);
out+=featHtml(m[1],(m[2]||'').trim(),m[3]);
pos=FEAT_RE.lastIndex;
}
var rest=text.slice(pos).trim();if(rest)out+=plain(rest);
return out;
}
document.addEventListener('click',function(e){
var b=e.target&&e.target.closest&&e.target.closest('[data-copy]');
if(!b)return;e.preventDefault();
var t=b.getAttribute('data-copy')||'',label=b.getAttribute('data-label')||'คัดลอก';
var done=function(){b.textContent='คัดลอกแล้ว';setTimeout(function(){b.textContent=label;},1400);};
if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(done,done);else done();
});
function cardHtml(block,ctx){
ctx=ctx||{};
var ents=parse(block);
var inner=ctx.mode==='code'?codeHtml(ents,ctx):roleplayHtml(ents,ctx);
return'<div class="nino-hud" style="white-space:normal;text-align:left;line-height:normal">'+inner+'</div>';
}
function has(t){return String(t||'').indexOf(OPEN)>=0;}
function clean(t){return String(t||'').replace(/\s*\[\[END\]\]\s*/g,'').replace(/\s*\[\[\/?CARD\]\]\s*$/,'');}
function stopped(t){return /\[\[END\]\]/.test(String(t||''));}
/* One chat card per message the person sent. Whatever the model writes after that (auto-continue, length extension, a second turn)
   is not another card: the story lines of a later card become plain text, its HUD fields and options are dropped. */
function proseFromCard(block,mode){
var ents=parse(block),out=[];
ents.forEach(function(e){
var v=tidy(e.v);if(!v)return;
if(e.k==='สถานการณ์'){var p=v.split('|'),ds=v;if(p.length>1&&p[0].trim().length<=6)ds=p.slice(1).join('|').trim();if(ds)out.push(ds);}
else if(e.k==='ระบบ'){if(mode==='code')out.push('SYSTEM_LOG: '+v);}
else if(mode==='code')return;
else if(e.k==='ท่า'||e.k==='จบฉาก'||e.k==='ปิดท้าย')out.push('*'+v+'*');
else if(e.k==='พูด'){var q=v.split('|').map(function(x){return x.trim();});var nm=q[0]||'',ge=q.length>2?q[1]:'',tx=tidy(q.length>2?q.slice(2).join(' | '):(q[1]||''));out.push(nm+': '+(ge?'('+ge+') ':'')+'\"'+tx+'\"');}
else if(e.k==='นิโนะพูด')out.push('\"'+v+'\"');
else if(e.k==='เสียง')out.push('['+v+']');
});
return out.join('\n\n');
}
function oneCard(text,mode){
text=String(text||'');
var a=text.indexOf(OPEN);
if(a<0)return text;
var b=text.indexOf(CLOSE,a+OPEN.length);
if(b<0)return text;
var head=text.slice(0,b+CLOSE.length),rest=text.slice(b+CLOSE.length),out='';
while(true){
var c=rest.indexOf(OPEN);
if(c<0){out+=rest;break;}
out+=rest.slice(0,c);
var d=rest.indexOf(CLOSE,c+OPEN.length),blk=d<0?rest.slice(c+OPEN.length):rest.slice(c+OPEN.length,d);
var pr=proseFromCard(blk,mode);
if(pr)out+=(out&&!/\n$/.test(out)?'\n\n':'')+pr;
if(d<0)break;
rest=rest.slice(d+CLOSE.length);
}
return head+out;
}
function mixed(text,plain,ctx){
text=String(text||'').replace(/\s*\[\[END\]\]\s*/g,'');
var out='',pos=0,cards=0;
while(true){
var a=text.indexOf(OPEN,pos);
if(a<0){out+=renderFeat(text.slice(pos).trim(),plain);break;}
var before=text.slice(pos,a).trim();
if(before)out+=renderFeat(before,plain);
var b=text.indexOf(CLOSE,a+OPEN.length),blk=b<0?text.slice(a+OPEN.length):text.slice(a+OPEN.length,b);
if(cards===0)out+=cardHtml(blk,ctx);
else{var pr=proseFromCard(blk,ctx&&ctx.mode);if(pr)out+=renderFeat(pr,plain);}
cards++;
if(b<0)break;
pos=b+CLOSE.length;
}
return out;
}
function spec(mode){
var keys='สถานะ, เวลา, วัน, อากาศ, คำโปรย, HP (เช่น 90/100), MP, หิว, ล้า, เสียเวลา (กิจกรรม | นาที), ระยะ, สถานการณ์ (อิโมจิ | คำอธิบาย), พบ (ชื่อคนที่เจอ เช่น ฉัน; ไม่มีคนก็ไม่ต้องใส่), เสียง, สภาพแวดล้อม, บรรยากาศ, คำคมนิโนะ, คำคมอ้างอิง (ชื่อ | ข้อความ), ตัวเลือก1, ตัวเลือก2, ตัวเลือก3, ตัวเลือก4 (สั้นพอดีช่อง ไม่เกิน 10 คำ), ตัวเลือก5 (ยาวได้ เต็มแถว ไม่ใส่ = NINO SHOP), ระบบ, อารมณ์, นิโนะพูด, ปิดท้าย';
var s='\n## RESPONSE FORMAT (NINO_CARD)\n';
if(mode==='code'){
s+='ข้อความที่ผู้ใช้ต้องอ่าน (final, คำถาม ask_user, สรุปงาน) ให้ใส่เป็นการ์ดเดียว: [[CARD]] ... [[/CARD]] ใน JSON string ใช้ \\n ขึ้นบรรทัดใหม่ ห้ามใส่เครื่องหมายคำพูดคู่ในค่า ข้อความสั้นระหว่างทำงาน (มี tool_call) ไม่ต้องทำการ์ด\n';
s+='การ์ดโหมดโค้ดสั้นและใช้แค่ช่องนี้: สถานะ (เช่น เสร็จแล้ว / รอคำตอบ), สถานการณ์ (สิ่งที่เพิ่งทำจริงหรือผลเครื่องมือ), สภาพแวดล้อม (ไฟล์หรือส่วนของแอปที่เกี่ยวข้อง), ระบบ (ผล diff/commit/diagnose จริง ห้ามแต่ง), ตัวเลือก1-3 (ขั้นถัดไปที่เสนอให้ผู้ใช้กด ใส่เฉพาะที่มีจริง), ตัวเลือก4 (ไม่ใส่ = NINO SHOP). ห้ามใส่ HP, MP, หิว, ล้า, อากาศ, เวลา, NPC\n';
}else{
s+='รูปแบบนี้ใช้แทน "ข้อความธรรมชาติ" ด้านบน: ทุกคำตอบของตัวละครในโรลเพลย์ใส่เป็นการ์ดเดียว [[CARD]] ... [[/CARD]] ไม่ต้องมีข้อความนอกการ์ด (ยกเว้นแท็ก SENSORY_CUE และ tool tag ถ้ามี)\n';
}
s+='รูปแบบ: หนึ่งบรรทัดต่อหนึ่งช่อง "ชื่อช่อง: ค่า" บรรทัดที่ไม่ขึ้นต้นด้วยชื่อช่องจะต่อท้ายช่องก่อนหน้า ห้ามเขียน HTML ระบบวาดการ์ดให้เอง ห้ามใส่เครื่องหมายคำพูดคู่ล้อมบทพูด\n';
s+='ช่อง: '+(mode==='code'?'สถานะ, สถานการณ์, สภาพแวดล้อม, ระบบ, ตัวเลือก1, ตัวเลือก2, ตัวเลือก3, ตัวเลือก4, ตัวเลือก5':keys)+'\n';
s+='การ์ดเป็นหนึ่งใบต่อหนึ่งข้อความที่ผู้ใช้ส่ง ห้ามเปิด [[CARD]] ซ้อนหรือเปิดใหม่หลังปิดแล้ว ส่วนที่เขียนต่อ (ระบบสั่งให้ต่ออัตโนมัติ) ห้ามมีการ์ด ให้เขียนเป็นข้อความธรรมดา หรือใช้ฟีเจอร์ด้านล่าง ระบบจะตัดการ์ดใบที่สองทิ้งให้เหลือแค่ข้อความ\n';
s+='ฟีเจอร์นอกการ์ด (ใช้เมื่อเหมาะสมเท่านั้น): [[CODE ภาษา]]...[[/CODE]] โค้ดพร้อมปุ่มคัดลอก · [[TABLE]] บรรทัดละแถว ช่องคั่นด้วย | บรรทัดแรกเป็นหัวตาราง · [[PLAN]] บรรทัดละ [ ] หรือ [x] แล้วตามด้วยงาน · [[WEB]] บรรทัดละ หัวข้อ | URL | ผลการอ่านสั้น (แตะแล้วเห็นลิงก์และปุ่มคัดลอก)\n';
if(mode!=='code')s+='เนื้อเรื่องเขียนต่อกันตามลำดับด้วยช่องซ้ำได้: ท่า: คำบรรยายท่าทาง · พูด: ชื่อ | ท่าทาง | บทพูด (หรือ ชื่อ | บทพูด) · จบฉาก: บรรยายปิดฉาก\n';
s+='หยุดเอง: เมื่อคุณเห็นว่าพูดหรือทำครบแล้ว ให้จบทันที'+(mode==='code'?' ตอบ "stop":true (หรือ "done":true ถ้าเสร็จงาน) ระบบจะไม่บังคับให้ทำต่อ':' โดยต่อท้ายด้วย [[END]] ระบบจะไม่บังคับความยาวและไม่เรียกซ้ำ')+' ไม่ต้องเขียนยืดให้ถึงเป้าความยาว\n';
return s;
}
var KEYS_ALL=KEYS;
document.addEventListener('click',function(e){
var o=e.target&&e.target.closest&&e.target.closest('.nino-hud .opt-btn');
if(!o)return;
var n=o.getAttribute('data-choice'),label=o.textContent.replace(/^\s*\d+\.\s*/,'').trim(),i=document.getElementById('prompt-input'),b=document.getElementById('btn-send');
if(!i||!b)return;
i.value='เลือกข้อ '+n+': '+label;
i.dispatchEvent(new Event('input',{bubbles:true}));
if(b.disabled){i.focus();return;}
b.click();
});
window.ninoHud={oneCard:oneCard,prose:proseFromCard,has:has,hasFeat:hasFeat,clean:clean,stopped:stopped,mixed:mixed,card:cardHtml,parse:parse,spec:spec,KEYS:KEYS_ALL};
})();
