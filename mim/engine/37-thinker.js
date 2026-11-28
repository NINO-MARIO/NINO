/* มิ้ม | 37-thinker
 * โหนดผู้คิด: ทุกคำถามผ่านขั้นตอนการคิดก่อนตอบ
 *
 * ลำดับการคิดของคำถาม (think):
 *   1. แยกคำ (think.segment)                 2. ระบุคำที่รู้จักและยังไม่รู้จัก
 *   3. ถามตัวเองถึงคำที่ไม่รู้จัก (บันทึกเป็นช่องว่างความรู้)
 *   4. เชื่อมคำที่รู้จักกับเพื่อนบ้านในกราฟ
 *   5. กระจายการกระตุ้นความหมาย (think.activate) แล้วจัดอันดับ (think.rank)
 *   6. ตอบจากคลังถ้าจับคู่ตรง (think.retrieval), จากการกระตุ้นถ้าชัดพอ, หรือประกอบเส้นทาง (think.compose)
 *   7. โมเดลสำรอง (ถ้าเปิด) แล้วจึงข้อความสำรอง
 *
 * หลังสอนความรู้ใหม่ จะทบทวน (reflect) เพื่อหาความเชื่อมโยงใหม่ที่ต่อจากความรู้เดิม
 *
 * ผลลัพธ์เป็นตัวสร้างกึ่งกฎ (heuristic) เหนือกราฟคำ ไม่ใช่การอนุมานของโมเดลประสาท
 * ตัวเลขเวลาของแต่ละขั้นวัดด้วย NINO.profiler (ดูค่าได้จาก NINO.profiler.summary())
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;
  const Text = NINO.Text;

  // ambiguousMargin: ถ้าผู้สมัครอันดับหนึ่งชนะอันดับสองไม่ถึงค่านี้ ถือว่ากำกวม ไม่ตอบจากการกระตุ้นความหมาย
// RARE_DF: คำที่อยู่ในความรู้ไม่เกินค่านี้ถือว่าเฉพาะเจาะจง (ใช้กับเส้นทางความหมาย)
const RARE_DF = 2;
// คำที่ชี้กลับไปยังสิ่งที่คุยอยู่ก่อนหน้า (ใช้เมื่อไม่มีคำตอบอื่น)
// "มัน" ใช้เป็นคำชี้กลับเฉพาะตำแหน่งที่เป็นสรรพนาม ไม่ใช่ส่วนของคำอื่นอย่าง "ข้าวมันไก่"
const REFERENCE_RE = /อันนั้น|อันนี้|อันไหน|เรื่องนั้น|เรื่องนี้|อย่างนั้น|อย่างนี้|ส่วนนั้น|ส่วนนี้|ตัวนั้น|ตัวนี้|เจ้านั้น|ที่พูด|เมื่อกี้|ก่อนหน้า|ข้างบน|ดังกล่าว|นั่น|นั้น|(?:^|แล้ว|ส่วน|และ|แต่|ถ้า|ก็|ยัง)มัน/;
const OPTIONS = { activation: 0.6, minCover: 0.5, minQCover: 0.6, pathConfidence: 0.15, ambiguousMargin: 0.1 };
// เส้นทางเลือก: ความรู้ที่ใกล้เคียงรองลงมาที่คะแนนถึงเกณฑ์นี้ ใช้เสนอควบคู่คำตอบหลักเมื่อยังไม่มั่นใจ
// ไม่เปลี่ยนคำตอบหลัก และไม่นับเข้าตัวปรับเกณฑ์ (31-calibrate)
const ALT_FLOOR = 0.25;
// ทางเลือกต้องครอบคลุมคำถามจริงอย่างน้อยครึ่งหนึ่งของคำในรายการนั้น กันรายการที่ร่วมแค่คำทั่วไป เช่น "วัน"
const ALT_COVER = 0.5;
// และครอบคลุมคำที่รู้จักของคำถามอย่างน้อยตามสัดส่วนนี้ (กัน "ความรัก" ไปเสนอ "รักนะ")
const ALT_QCOV = 0.6;
// และต้องมีคำที่ร่วมกันอย่างน้อยหนึ่งคำที่เฉพาะพอ (อยู่ในความรู้ไม่เกินจำนวนนี้) เช่น "ไทย" ร่วมได้เกือบทุกเรื่อง
const ALT_RARE_DF = 4;
const GENERIC_DF = 3; // คำที่พบในความรู้ตั้งแต่ 3 รายการขึ้นไปถือว่าเป็นคำทั่วไป ไม่ใช้เป็นหัวข้อ
// คำตอบหลักที่คะแนนถึงค่านี้ถือว่าชัดพอ ไม่แนบเส้นทางเลือก
const ALT_SURE = 0.9;
// การสำรวจคำตอบ: เมื่อมีหลายคำตอบที่ผ่านเกณฑ์เดียวกัน เลือกตามผลตอบรับที่เรียนรู้ (Thompson sampling)
// ไม่ใช้กับคำถามที่ตรงตัวกับความรู้ที่สอนไว้ เพราะคำตอบที่สอนไว้ตรงตัวยังต้องตอบเหมือนเดิมเสมอ
const EXPLORE_BAND = 0.3;       // ผู้สมัครที่คะแนนต่ำกว่าผู้ชนะไม่เกินนี้ ถือว่าเป็นทางเลือกได้
const EXPLORE_FLOOR = 0.5;      // คะแนนขั้นต่ำของทางเลือก
const EXPLORE_TOP_PRIOR = 20;   // ความเชื่อเริ่มต้นของผู้ชนะเดิม Beta(20,1) ทำให้สำรวจราว 5% เมื่อยังไม่มีผลตอบรับ
const FB_CAP = 200;             // ผลตอบรับสูงสุดต่อรายการ เกินนี้ลดลงครึ่งหนึ่งเพื่อให้ปรับตัวได้

// หัวข้อของคำถาม: คำนำหน้าก่อนคำบอกประเภท (มี/คือ/กิน/ใช้ ฯลฯ) ยาว 2-12 ตัวอักษร และไม่มีคำถาม (อะไร/ไหน/ยังไง ฯลฯ)
const SUBJECT_CUT = /มี|คือ|เป็น|ทำ|กิน|อยู่|ใช้|ชอบ|ได้/;
const SUBJECT_NO = /อะไร|ไหน|ยังไง|อย่างไร|ใคร|กี่|เท่า|เมื่อ|ทำไม/;
function subjectOf(q) {
  const t = String(q || '').trim();
  const m = SUBJECT_CUT.exec(t);
  if (!m || m.index < 2) return null;
  const subj = t.slice(0, m.index).trim();
  if (subj.length < 2 || subj.length > 12 || SUBJECT_NO.test(subj)) return null;
  return subj;
}

// ตัวอย่างจาก Beta(a,b) ด้วยการสุ่มแบบ gamma ของจำนวนเต็ม (ไม่ต้องใช้ไลบรารี)
function betaSample(a, b, rng) {
  const gam = k => {
    let s = 0;
    const n = Math.max(1, Math.round(k));
    for (let i = 0; i < n; i++) s -= Math.log(Math.max(rng(), 1e-12));
    return s;
  };
  const x = gam(a);
  const y = gam(b);
  return x / (x + y);
}
const ALT_MAX = 2;
// คำถามที่ถามจำนวน (กี่ เท่าไร) ต้องได้คำตอบที่มีตัวเลขหรือคำบอกจำนวน กันการตอบเรื่องอื่นที่มีคำร่วม
const QUANTITY_Q = /กี่|เท่าไร|เท่าไหร่|เท่าไหร/;
const NUMBER_A = /\d|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ร้อย|พัน|ล้าน/;
// คำถามสูตร ("X ทำยังไง") ต้องมีทุกคำเฉพาะของ X ในรายการที่จะตอบ กันการตอบจากสูตรของเรื่องที่มีคำร่วม
// (รอบ 2026-11-19 ต่อ) ใช้กับคำถามจำนวนด้วย: "ภาคเหนือมีกี่จังหวัด" ต้องมีคำว่าภาคเหนือในรายการที่ตอบ
const RECIPE_Q = /ทำยังไง|ทำไง|ทำอย่างไร|วิธีทำ|กี่|เท่าไร|เท่าไหร่/;
const RECIPE_SKIP = new Set(['ทำ', 'วิธี', 'วิธีทำ', 'มิ้ม', 'คุณ', 'ฉัน', 'กี่', 'เท่าไร', 'เท่าไหร่', 'เท่าไหร']);
function recipeFits(input, content, entry) {
  const q = String(input || '').replace(/\s+/g, '');
  if (!RECIPE_Q.test(q)) return true;
  const text = String(entry && entry.q || '') + String(entry && entry.a || '');
  const words = (content || []).filter(w => w.length >= 2 && !RECIPE_SKIP.has(w) && !QUESTION_PARTICLES.has(w));
  return words.every(w => text.includes(w));
}
function fitsQuestion(input, answer) {
  const q = String(input || '').replace(/\s+/g, '');
  if (!QUANTITY_Q.test(q)) return true;
  return NUMBER_A.test(String(answer || ''));
}
// คำแสดงการถาม/คำประกอบที่ไม่ใช่หัวข้อ (เช่น การ ยังไง) ใช้ตัดออกจากการนับคำเฉพาะของเส้นทางความหมาย
const QUESTION_PARTICLES = new Set(['การ', 'ยังไง', 'อย่างไร', 'อะไร', 'ไหม', 'มั้ย', 'ทำไม', 'ทำไง', 'ที่ไหน', 'ไหน', 'กี่', 'เท่าไร', 'เท่าไหร่', 'หรือ', 'บ้าง', 'ทำยังไง', 'คือ', 'อะไร']);
const ALT_ANSWER_CHARS = 60;

  function step(kind, text) {
    return { kind, text };
  }

  // เลือกเส้นทางเลือกจากการจัดอันดับ (เรียงคะแนนจากมากไปน้อยแล้ว) ตัดรายการที่คำตอบซ้ำกับคำตอบหลัก
  function altsFrom(ranked, chosen) {
    const out = [];
    for (const r of ranked) {
      if (out.length >= ALT_MAX || r.score < ALT_FLOOR) break;
      if (r.cover < ALT_COVER || !r.rare || r.qcov < ALT_QCOV) continue;
      if (chosen && r.entry.a === chosen.a) continue;
      if (out.some(o => o.entry.a === r.entry.a)) continue;
      out.push(r);
    }
    return out;
  }

  function clipText(s, n) {
    const t = String(s);
    return t.length > n ? t.slice(0, n) + '…' : t;
  }

  // บรรทัดของเส้นทางเลือกทีละข้อ (ใช้ทั้งต่อท้ายคำตอบและในคำถามให้เลือก)
  function altLines(alts) {
    return alts.map(x => '• "' + x.entry.q + '" ตอบว่า ' + clipText(x.entry.a, ALT_ANSWER_CHARS)).join('\n');
  }

  function withAlternatives(text, alts) {
    return alts.length ? text + '\n\nหรือถ้าหมายถึง:\n' + altLines(alts) : text;
  }

  function pct(x) {
    return Math.min(100, Math.round(x * 100));
  }

  function pickOne(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  // คำที่ไม่นับเป็นเนื้อหาของคำถาม แม้ยังไม่เคยสอน: คำขอทั่วไป คำขยาย และคำลงท้าย
  // ถ้าไม่มีกลุ่มนี้ คำอย่าง "เลย" หรือ "เล่า" จะทำให้คำถามธรรมดาถูกมองว่ามีเรื่องที่ไม่รู้
  const SOFT_WORDS = new Set([
    'เลย', 'จัง', 'มาก', 'จริง', 'จริงๆ', 'นิด', 'หน่อย', 'ด้วย', 'แหละ', 'ซิ', 'สิ', 'ล่ะ', 'เถอะ', 'ไง',
    'เล่า', 'ฟัง', 'บอก', 'พูด', 'เรื่อง', 'คุย', 'เกี่ยวกับ', 'ให้', 'ช่วย', 'ไหม', 'มั้ย', 'หรือ',
    'เหรอ', 'หรอ', 'อ่ะ', 'อ่า', 'นะ', 'คะ', 'ครับ', 'ค่ะ', 'จ้ะ', 'ป่ะ', 'ดิ', 'เนี่ย', 'เอ่ย',
    // คำถามทั่วไปและคำกริยาเบาๆ ที่พบบ่อยในคำถาม ไม่ใช่เรื่องที่ต้องมีความรู้เฉพาะ
    'ทั้งหมด', 'เท่าไหร่', 'เท่าไร', 'ชื่อ', 'อะไร', 'เอา', 'ใส่', 'เยอะ', 'นับ', 'คำ', 'ว่า', 'ใด', 'ไว้',
    'กี่', 'บ้าง', 'มั้ย', 'เอง', 'ยังไง', 'อย่างไร', 'อธิบาย', 'เล่าให้ฟัง'
  ]);
  function isSoftWord(w) {
    return SOFT_WORDS.has(w) || /^(?:เล่า|บอก|พูด|ฟัง|คุย)/.test(w) || /หน่อย$/.test(w);
  }

  // ต่างกันไม่เกินการแทน เพิ่ม หรือลบหนึ่งตัวอักษร (ใช้กับการพิมพ์ผิดเล็กน้อยเท่านั้น)
  function oneEditAway(a, b) {
    if (a === b) return true;
    const la = a.length;
    const lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0;
    let j = 0;
    let edits = 0;
    while (i < la && j < lb) {
      if (a[i] === b[j]) {
        i++;
        j++;
        continue;
      }
      if (++edits > 1) return false;
      if (la > lb) i++;
      else if (la < lb) j++;
      else {
        i++;
        j++;
      }
    }
    return edits + (la - i) + (lb - j) <= 1;
  }

  class ThinkNode extends NINO.Node {
    constructor(id, bus, store, retrieval, language) {
      super(id, bus);
      this.store = store;
      this.retrieval = retrieval;
      this.language = language;
      this.options = Object.assign({}, OPTIONS);
      this.prof = NINO.profiler;
      this.lexicon = null;
      this.lastStats = null;
      this.rng = Math.random; // ใช้สุ่มเลือกทางเลือก (เทสต์เปลี่ยนเป็นตัวสุ่มที่กำหนดค่าได้)
      // โหนดเชื่อมหลายตัว (ดู 33-links) แต่ละตัวเสนอคำตอบจากมุมของตัวเอง ผู้คิดเลือกข้อเสนอที่คะแนนสูงสุด
      // บริบท: จำรายการความรู้ที่ตอบไปล่าสุด เพื่อให้คำอ้างอิงอย่าง "มันคืออะไร" รู้ว่าหมายถึงเรื่องไหน
      // จำเฉพาะคำตอบจากความรู้ (ไม่จำคำทักทายหรือคำสำรอง) ดูการตั้งค่าได้ที่ think()
      // topics: หัวข้อที่คุยมาล่าสุด 3 เรื่อง (เรื่องล่าสุดอยู่ท้าย) ใช้ตอบคำชี้กลับที่ไม่ได้ตอบด้วยเรื่องล่าสุด
      this.context = { last: null, topic: null, topics: [] };
      this.links = NINO.defaultLinkers ? NINO.defaultLinkers(bus, store, this.context) : [];
      this._graph = null;
      this._gVersion = -1;
      this._gRevision = -1;
      this._docs = [];
      this._wordDocs = new Map(); // คำ -> ตำแหน่งรายการที่มีคำนี้ (เรียงจากน้อยไปมาก)
      this.composer = NINO.Composer ? new NINO.Composer(store, t => this._seg(t)) : null;
    }

    // กราฟคำและดัชนีของความรู้ทั้งหมด
    // ถ้าเพิ่มรายการใหม่ต่อท้ายเท่านั้น จะเพิ่มทีละรายการ (ไม่สร้างใหม่ทั้งชุด)
    // มิฉะนั้นสร้างใหม่ทั้งชุด ทั้งสองทางให้ผลเหมือนกัน เพราะรายการถูกเรียนตามลำดับเดิมเสมอ
    getGraph() {
      const s = this.store;
      if (this._graph && this._gVersion === s.version) return this._graph;
      return this.prof.span('think.rebuild', () => {
        if (this._graph && this._gRevision === s.revision && this._isAppendOnly()) {
          for (let i = this._docs.length; i < s.entries.length; i++) this._addDoc(s.entries[i], false);
        } else {
          this.rebuildAll();
        }
        this._gVersion = s.version;
        this._gRevision = s.revision;
        return this._graph;
      });
    }

    // จริงเมื่อรายการเดิมทุกรายการยังอยู่ที่ตำแหน่งเดิม (ต่างจากนี้คือถูกลบหรือถูกแทนที่)
    _isAppendOnly() {
      const es = this.store.entries;
      if (this._docs.length > es.length) return false;
      for (let i = 0; i < this._docs.length; i++) if (this._docs[i].entry !== es[i]) return false;
      return true;
    }

    // สร้างกราฟใหม่ทั้งชุด: เรียนและแยกคำตามลำดับความรู้ (ลำดับเดียวกับการเพิ่มทีละรายการ)
    rebuildAll() {
      return this.prof.span('think.rebuild_all', () => {
        this.lexicon = new NINO.Lexicon(NINO.BASE_WORDS);
        this._docs = [];
        this._wordDocs = new Map();
        this._graph = new NINO.WordGraph();
        for (const e of this.store.entries) this._addDoc(e, true);
        this._graph._finalize();
        this._gVersion = this.store.version;
        this._gRevision = this.store.revision;
        return this._graph;
      });
    }

    // เรียนคำจากรายการหนึ่ง แยกคำของรายการนั้นด้วยคลังปัจจุบัน แล้วเพิ่มเข้ากราฟ
    _addDoc(e, defer) {
      // หัวข้อของคำถามเป็นคำหนึ่งคำในพจนานุกรมเสมอ เช่น "ทุเรียน" ในคำถาม "ทุเรียนมีรสชาติยังไง"
      // ไม่งั้นการแยกคำจะตัดเป็นส่วนย่อยที่รู้จักอยู่แล้ว เช่น "ทุ" + "เรียน"
      const subj = subjectOf(e.q);
      if (subj) this.lexicon.add(Text.normalize(subj));
      // เรียนคำจากทั้งคำถามและคำตอบ (ลำดับเดิม: คำถามก่อน) แล้วใช้คำที่แยกได้ระหว่างเรียนซ้ำเมื่อไม่มีคำใหม่เลย
      // ข้อควรระวัง: ถ้ามีคำใหม่แม้แต่คำเดียว การแยกระหว่างเรียนอาจไม่ตรงกับคลังสุดท้าย ต้องแยกใหม่ทั้งสองข้อความ
      const lq = this.lexicon.learnTokens(Text.normalize(e.q));
      const la = this.lexicon.learnTokens(Text.normalize(e.a));
      const reuse = lq.learned.length === 0 && la.learned.length === 0;
      const q = reuse ? this._contentOf(lq.words) : this._content(e.q);
      const a = reuse ? this._contentOf(la.words) : this._content(e.a);
      const d = { entry: e, q, a, qu: [...new Set(q)] };
      const i = this._docs.length;
      this._docs.push(d);
      for (const w of new Set([...q, ...a])) {
        const list = this._wordDocs.get(w);
        if (list) list.push(i);
        else this._wordDocs.set(w, [i]);
      }
      this._graph.addDoc(d, defer);
    }

    // คำที่รู้จักในคลังซึ่งต่างจาก w ไม่เกินการแก้หนึ่งตัวอักษร (ใช้แยกการพิมพ์ผิดจากคำที่ไม่รู้จักจริง)
    _nearKnown(w) {
      // คำสั้นเช่น "รัก" หรือ "ชอบ" ต่างกันหนึ่งตัวจากคำอื่นได้บ่อยมาก จึงไม่นับเป็นการพิมพ์ผิด
      if (w.length < 4) return false;
      for (const k of this._wordDocs.keys()) {
        if (k.length >= 4 && oneEditAway(w, k)) return true;
      }
      return false;
    }

    _seg(text) {
      return this.lexicon.segment(Text.normalize(text));
    }

    _content(text) {
      return this._contentOf(this._seg(text).map(t => t.w));
    }

    // คัดคำเนื้อหาจากรายการคำที่แยกแล้ว: ตัดคำสั้นกว่าสองตัวและคำหยุด
    _contentOf(words) {
      return words.filter(w => w.length >= 2 && !NINO.STOP_WORDS.has(w));
    }

    knownWords() {
      return new Set(this.getGraph().df.keys());
    }

    // คำที่เพิ่งเข้ามาในความรู้ ซึ่งไม่มีอยู่ในกราฟก่อนสอน
    newWordsOf(entry, before) {
      this.getGraph();
      const words = new Set([...this._content(entry.q), ...this._content(entry.a)]);
      return [...words].filter(w => !before.has(w));
    }

    // ทางเข้าของการคิด: เรียกขั้นตอนจริงแล้วจำเรื่องที่ตอบไปเป็นบริบทของคำถามถัดไป
    // ห้ามจำคำตอบจากกฎเจตนาหรือคำสำรอง เพราะคำทักทายจะกลายเป็นเรื่องที่คุยอยู่โดยไม่ตั้งใจ
    *think(input) {
      const mapped = NINO.Aliases ? NINO.Aliases.apply(input) : input;
      this._noExplore = REFERENCE_RE.test(mapped) || this.frozen === true;
      let r;
      try {
        r = yield* this._think(mapped);
      } finally {
        this._noExplore = false;
      }
      // ความต่อเนื่องของหัวข้อ: คำถามที่ชี้กลับ (อันนั้น นั่น ...) ที่ไม่ได้ตอบด้วยเรื่องก่อนหน้าโดยตรง
      // ต้องลองอีกครั้งโดยเติมหัวข้อของคำตอบล่าสุด และรับเฉพาะคำตอบที่พูดถึงหัวข้อเดียวกัน
      const stack = this._topicStack();
      const viaContext = !!(r && r.entry && r.entry === this.context.last);
      if (stack.length && REFERENCE_RE.test(mapped) && !viaContext) {
        // ลองจากหัวข้อล่าสุดก่อน แล้วถอยไปหัวข้อก่อนหน้า รับเฉพาะคำตอบที่พูดถึงหัวข้อนั้นจริง
        const stripped = mapped.replace(new RegExp(REFERENCE_RE.source, 'g'), '');
        // คำของคำถามเอง (เช่น "กินกับอะไร" -> "กิน") ต้องปรากฏในคำตอบด้วย กันคำหัวข้อที่เป็นส่วนของคำอื่น
        // (เช่น "เรียน" ใน "ทุเรียน") ทำให้ตอบเรื่องที่ไม่ได้ถาม
        const predicate = this._content(stripped);
        const fits = (c, topic) => {
          if (!c || c.kind !== 'answer' || !c.entry) return false;
          const cc = this._content(c.entry.q);
          const pred = predicate.filter(w => w !== topic);
          return cc.includes(topic) && (pred.length === 0 || pred.some(w => cc.includes(w)));
        };
        let found = null;
        for (let i = stack.length - 1; i >= 0 && !found; i--) {
          const topic = stack[i];
          // คำตอบรอบแรก (ค้นจากคำถามเต็ม) ก็เป็นผู้สมัครด้วย ก่อนลองค้นโดยเติมหัวข้อ
          if (fits(r, topic)) { found = r; break; }
          const r2 = yield* this._think(topic + ' ' + stripped);
          if (fits(r2, topic)) found = r2;
        }
        const latest = stack[stack.length - 1];
        r = found || { kind: 'fallback', text: 'ฉันยังไม่มีข้อมูลเรื่อง' + latest + 'ในส่วนนี้ค่ะ ถ้าอยากสอน พิมพ์ "สอน คำถาม | คำตอบ" ได้เลยนะคะ', meta: 'หัวข้อก่อนหน้า: ' + latest };
      }
      if (r && r.entry) {
        this.context.last = r.entry;
        const t = this._topicOf(r.entry.q);
        if (t) {
          const s = stack.filter(x => x !== t);
          s.push(t);
          while (s.length > 3) s.shift();
          this.context.topics = s;
          this.context.topic = t;
        }
      }
      return r;
    }

    // เลือกคำตอบจากผู้สมัครที่ผ่านเกณฑ์เดียวกันกับผู้ชนะ สุ่มตามผลตอบรับที่เรียนรู้
    _choose(input, ranked, pick) {
      const pool = [pick];
      for (const r of ranked) {
        if (!r || !r.entry || r.entry === pick.entry) continue;
        if (r.score < EXPLORE_FLOOR || pick.score - r.score > EXPLORE_BAND) continue;
        if (!fitsQuestion(input, r.entry.a)) continue;
        pool.push(r);
      }
      // คำถามที่อ้างถึงสิ่งที่คุยก่อนหน้า (อันนั้น นั่น ...) ไม่สำรวจ เพราะความหมายขึ้นกับบริบทที่ต้องตรงหัวข้อ
      // ยังไม่มีผลตอบรับของผู้สมัครเลย ก็ยังไม่สำรวจ ตอบแบบเดิมจนกว่าจะมีข้อมูลให้เรียนรู้
      const informed = pool.some(c => c.entry.fb && c.entry.fb.a + c.entry.fb.b > 0);
      if (this._noExplore || pool.length < 2 || !informed) return pick;
      let best = pick;
      let bestV = -1;
      for (let i = 0; i < pool.length; i++) {
        const fb = pool[i].entry.fb || { a: 0, b: 0 };
        const base = i === 0 ? EXPLORE_TOP_PRIOR : 1;
        const v = betaSample(fb.a + base, fb.b + 1, this.rng);
        if (v > bestV) { bestV = v; best = pool[i]; }
      }
      return best;
    }

    // ผลตอบรับของคำตอบที่เพิ่งให้ไป (ok = ถามต่อโดยไม่แก้, wrong = สอนใหม่หรือลืม) เก็บต่อรายการความรู้
    reward(entry, ok) {
      if (!entry) return;
      const fb = entry.fb || (entry.fb = { a: 0, b: 0 });
      if (ok) fb.a += 1; else fb.b += 1;
      if (fb.a + fb.b > FB_CAP) { fb.a /= 2; fb.b /= 2; }
    }

    // หัวข้อที่คุยมาก่อนหน้า (ใหม่สุดอยู่ท้าย) รองรับบริบทเก่าที่มีแค่ topic เดียว
    _topicStack() {
      if (Array.isArray(this.context.topics) && this.context.topics.length) return this.context.topics.slice();
      return this.context.topic ? [this.context.topic] : [];
    }

    // คำในความรู้ที่มีคำ w อยู่ข้างใน (ไม่นับคำที่เป็นตัวเอง) สูงสุดสองคำ เรียงจากคำสั้นไปยาว
    _containing(w) {
      const out = [];
      for (const k of this._wordDocs.keys()) {
        if (k !== w && k.length > w.length && k.includes(w)) out.push(k);
      }
      return out.sort((a, b) => a.length - b.length).slice(0, 2);
    }

    // หัวข้อของรายการ = คำเนื้อหาที่เจอน้อยที่สุดในความรู้ (เฉพาะเจาะจงที่สุด) ถ้าเท่ากันเลือกคำที่ยาวกว่า
    _topicOf(q) {
      // หัวข้อคือคำที่เฉพาะเจาะจงที่สุดในคำถาม: คำที่ยังไม่อยู่ในดัชนี (เพิ่งสอน) นับเป็นเฉพาะเจาะจงที่สุด
      // คำที่ปรากฏในความรู้หลายรายการ (เช่น "กิน" ในคำถามเรื่องอาหาร) เป็นคำกริยาหรือคำทั่วไป ไม่ใช่หัวข้อ
      const cands = this._content(q).filter(w => w.length >= 2).map(w => {
        const docs = this._wordDocs.get(w);
        return { w, df: docs ? docs.length : 0 };
      });
      const specific = cands.filter(c => c.df < GENERIC_DF);
      const pool = specific.length ? specific : cands;
      let best = null;
      let bestDf = Infinity;
      for (const c of pool) {
        if (best === null || c.df < bestDf || (c.df === bestDf && c.w.length > best.length)) {
          best = c.w;
          bestDf = c.df;
        }
      }
      return best;
    }

    *_think(input) {
      yield step('start', 'เริ่มคิดจากข้อความที่ได้รับ');
      const graph = this.getGraph();
      const tokens = this.prof.span('think.segment', () => this._seg(input));
      const words = tokens.map(t => t.w);
      this.lastStats = { tokens: words.length, unknown: tokens.filter(t => !t.known).length };
      yield step('segment', 'แยกคำ: ' + (words.join(' | ') || 'ไม่มีคำ'));

      const content = [...new Set(words.filter(w => w.length >= 2 && !NINO.STOP_WORDS.has(w)))];
      // คำที่ไม่รู้จักแต่เป็นส่วนของคำที่รู้จักแล้ว (เช่น "กลิ่น" ในคำที่แยกได้ว่า "กลิ่นแรง") นับเป็นรู้จัก
      // โดยใช้คำที่ครอบนั้นเป็นจุดเริ่ม ป้องกันการตอบว่าไม่รู้เพียงเพราะการแยกคำไม่สมบูรณ์
      const known = [];
      const unknown = [];
      for (const w of content) {
        if (graph.has(w)) { known.push(w); continue; }
        const wider = w.length >= 3 ? this._containing(w) : [];
        if (wider.length) known.push(...wider.filter(x => !known.includes(x)));
        else unknown.push(w);
      }

      if (unknown.length) yield step('gap', 'ยังไม่รู้จัก: ' + unknown.join(', '));
      // คำที่ไม่รู้จักซึ่งเป็นเนื้อหาจริง ใช้ตัดสินการเดาทุกขั้น (คำขอทั่วไปไม่นับ)
      const hard = unknown.filter(w => !isSoftWord(w));
      for (const w of unknown.slice(0, 2)) {
        this.store.noteGap(w);
        yield step('question', 'ถามตัวเอง: "' + w + '" หมายถึงอะไร');
      }

      for (const w of known.slice(0, 4)) {
        for (const n of graph.neighbors(w, 2)) {
          yield step('link', w + ' เชื่อมกับ ' + n.w + ' น้ำหนัก ' + n.weight.toFixed(2));
        }
      }

      const seeds = new Map(known.map(w => [w, 1]));
      const act = this.prof.span('think.activate', () => graph.activate(seeds, 2, 0.5));
      yield step('activate', 'กระตุ้นความหมายไป 2 ชั้น ได้คำที่เกี่ยวข้อง ' + Math.max(0, act.size - seeds.size) + ' คำ');

      const ranked = this.prof.span('think.rank', () => this._rank(act, seeds));
      for (const r of ranked.slice(0, 3)) {
        yield step('candidate', 'ผู้สมัคร "' + r.entry.q + '" คะแนน ' + r.score.toFixed(2) + ' ตรงคำ ' + pct(r.cover) + '%');
      }

      // ลำดับการตอบจากความรู้: ตรงตัวก่อน แล้วกฎเจตนา แล้วจึงคล้ายกัน
      // กฎเจตนามาก่อนการจับคู่คล้ายกัน เพราะการจับคู่คล้ายให้คะแนนโบนัสเมื่อคำสั้นอยู่ในประโยคยาว
      // (เช่น "บาย" อยู่ใน "สบายดีไหม" จนตอบลาทั้งที่ถามทักทาย) จึงไม่ให้คำสั้นแย่งคำตอบจากกฎที่ชัดกว่า
      const exact = this.prof.span('think.retrieval', () => this.retrieval.exact(input));
      if (exact) {
        yield step('decide', 'คำถามตรงกับความรู้ที่สอนไว้ จึงใช้คำตอบนั้น');
        return { kind: 'answer', text: exact.entry.a, meta: 'ตรงกับ "' + exact.entry.q + '" 100%', entry: exact.entry };
      }
      const intent = NINO.Intent ? NINO.Intent.match(input) : null;
      if (intent) {
        yield step('decide', 'จับเจตนาได้ (' + intent.id + ') จึงตอบด้วยคำตอบประจำของกฎเจตนา');
        return { kind: 'answer', text: intent.text, meta: 'จากกฎเจตนา', entry: null };
      }

      // โหนดเชื่อม: เสนอความรู้ที่เขียนต่างกันแต่ความหมายหรือเสียงเดียวกัน
      // ชัดกว่าการจับคู่คล้ายกัน จึงมาก่อนขั้นนั้น และไม่ถูกนับเป็นการจับคู่ผิดของตัวปรับเกณฑ์
      const link = this.prof.span('think.link', () => this._propose(input));
      if (link) {
        yield step('link', 'โหนด "' + link.source + '" เสนอ "' + link.entry.q + '" เพราะ' + link.why);
        yield step('decide', 'ใช้คำตอบจากโหนดเชื่อม คะแนน ' + link.score.toFixed(2));
        // คำตอบจากบริบทต้องบอกชื่อเรื่องที่อ้างถึง เพื่อไม่ให้ผู้ใช้เข้าใจว่าระบบรู้เรื่องใหม่โดยไม่ได้ถาม
        const text = link.source === 'context'
          ? 'เรื่องที่เรากำลังคุยคือ "' + link.entry.q + '" ' + link.entry.a
          : link.entry.a;
        return { kind: 'answer', text, meta: 'โหนดเชื่อม (' + link.source + ') ' + pct(link.score) + '%', entry: link.entry };
      }

      // จับคู่คล้ายได้เฉพาะเมื่อคำที่ไม่รู้จักทุกคำเป็นการพิมพ์ผิดเล็กน้อยของคำที่รู้จัก
      // ถ้าเป็นคำที่ไม่รู้จักจริง เช่น ชื่อสิ่งที่ไม่เคยสอน จะไม่ให้คำตอบของเรื่องอื่นที่คำถามตรงบางส่วน
      const typoOnly = hard.every(w => this._nearKnown(w));
      const m0 = typoOnly ? this.prof.span('think.retrieval', () => this.retrieval.match(input)) : null;
      // การจับคู่คล้ายต้องมีคำเฉพาะร่วมกันเป็นคำเต็ม ไม่ใช่แค่ตัวอักษรบางตัว (เช่น "บาย" อยู่ใน "อธิบาย")
      const entryWords = m0 ? this._content(m0.entry.q) : [];
      const specificShared = m0 ? entryWords.some(w => !isSoftWord(w) && words.includes(w)) : false;
      // คำที่ร่วมต้องเป็นคำเฉพาะที่พบในความรู้ไม่กี่รายการ ถ้าเป็นคำที่พบทั่วไป (เช่น "ไทย")
      // จะจับคู่ผิดเรื่องได้ง่าย เช่น "ผัดไทยคืออะไร" ไม่ควรไปตอบเรื่องเมืองหลวงของไทย
      const rareShared = m0 ? entryWords.some(w => !isSoftWord(w) && words.includes(w) && (this._wordDocs.get(w) || []).length <= ALT_RARE_DF) : false;
      // หรือคำในรายการส่วนใหญ่ (อย่างน้อยครึ่งหนึ่งขึ้นไปตามเกณฑ์) ต้องมีในคำถาม โดยเทียบแบบบางส่วนของคำ
      // เพราะการตัดคำอาจแยก "จังหวัด" เป็น "จัง"+"หวัด" หรือ "หนึ่งสัปดาห์" กับ "สัปดาห์"
      const inWords = words.filter(u => u.length >= 2 && !isSoftWord(u));
      const contentW = entryWords.filter(w => w.length >= 2 && !isSoftWord(w));
      const sharedN = contentW.filter(w => inWords.some(u => u.includes(w) || w.includes(u))).length;
      const sharedFrac = contentW.length ? sharedN / contentW.length : 0;
      const m = m0 && specificShared && (rareShared || sharedFrac >= 0.6) ? m0 : null;
      if (m && fitsQuestion(input, m.entry.a)) {
        // ผู้ชนะที่ผ่านเกณฑ์เดียวกันอาจถูกแทนด้วยทางเลือกที่สุ่มตามผลตอบรับที่เรียนรู้ (ดู _choose)
        const pick = this._choose(input, ranked, m);
        yield step('decide', 'คำถามตรงกับความรู้ที่สอนไว้ จึงใช้คำตอบนั้น');
        // fuzzy = จับคู่คล้ายกัน (ไม่ใช่ตรงตัว) ใช้ให้ตัวปรับเกณฑ์รู้ว่าคำตอบนี้อาจพลาด
        // คำตอบคล้ายกันยังอาจพลาด จึงเสนอความรู้รองลงมาที่คะแนนถึงเกณฑ์ไปพร้อมกัน
        const alts = pick.score < ALT_SURE ? altsFrom(ranked, pick.entry) : [];
        if (alts.length) yield step('alt', 'มีเส้นทางเลือก ' + alts.length + ' ทาง เผื่อคำตอบหลักพลาด');
        return { kind: 'answer', text: withAlternatives(pick.entry.a, alts), meta: 'ตรงกับ "' + pick.entry.q + '" ' + pct(pick.score) + '%', entry: pick.entry, fuzzy: true, explored: pick !== m, alts: alts.map(x => x.entry) };
      }

      // ต้องตรงคำในคำถามเดิมอย่างน้อยครึ่งหนึ่ง กันการตอบจากคำที่เชื่อมมาเพียงทางอ้อม
      const top = ranked[0];
      // ห้ามเดาจากคำที่รู้จักบางส่วน: ถ้าคำถามมีคำที่ยังไม่รู้จัก ต้องขอให้สอน ไม่ใช่ตอบจากคำที่ตรงกันบังเอิญ
      // ผู้สมัครที่ชนะกันเพียงเล็กน้อยคือคำถามกำกวม (เช่นคำทั่วไปอย่าง "วัน" ทำให้สองเรื่องคะแนนใกล้กัน) ไม่เดาจากมัน
      const second = ranked[1];
      const ambiguous = !!(second && top && top.score - second.score < this.options.ambiguousMargin);
      // ผู้ชนะต้องมีคำเฉพาะร่วมด้วย ไม่ใช่แค่คำทั่วไปอย่าง "อะไร" หรือ "บ้าง" (ทำให้ "ทำอะไรได้บ้าง" ชนะทุกคำถามที่มีคำนี้)
      if (hard.length === 0 && top && fitsQuestion(input, top.entry.a) && top.rare && top.qcov >= this.options.minQCover && !ambiguous && top.score >= this.options.activation && top.cover >= this.options.minCover) {
        yield step('decide', 'คำสำคัญกระตุ้นความรู้เรื่องนี้เพียงพอ');
        const alts = top.score < ALT_SURE ? altsFrom(ranked, top.entry) : [];
        if (alts.length) yield step('alt', 'มีเส้นทางเลือก ' + alts.length + ' ทาง เผื่อคำตอบหลักพลาด');
        return { kind: 'answer', text: withAlternatives(top.entry.a, alts), meta: 'จากการกระตุ้นความหมาย ' + pct(top.score) + '%', entry: top.entry, alts: alts.map(x => x.entry) };
      }

      // คิดต่อจากเส้นทางก็ต้องไม่มีคำที่ยังไม่รู้จัก เพราะเส้นทางอาจพาไปเรื่องอื่นที่คำถามไม่ได้ถาม
      const comp0 = hard.length === 0
        ? this.prof.span('think.compose', () => this._compose(known, content.filter(w => graph.has(w))))
        : null;
      // คำตอบจากเส้นทางต้องตอบชนิดของคำถามด้วย (เช่น "กี่" ต้องมีตัวเลข)
      const comp = comp0 && fitsQuestion(input, comp0.entry.a) && recipeFits(input, content, comp0.entry) ? comp0 : null;
      if (comp) {
        yield step('path', 'เส้นทางความหมาย: ' + comp.path.join(' → ') + ' ความมั่นใจ ' + comp.conf.toFixed(2));
        yield step('decide', 'คิดต่อจากเส้นทางนี้ได้คำตอบ');
        const alts = altsFrom(ranked, comp.entry);
        return { kind: 'composed', text: withAlternatives(comp.entry.a, alts), meta: 'คิดต่อจากเส้นทาง ' + comp.path.join(' → '), entry: comp.entry, alts: alts.map(x => x.entry) };
      }

      // ผู้เรียบเรียง (47-compose) ไม่อยู่ในลำดับการตอบแล้ว: ประโยคที่ได้ไม่น่าเชื่อถือพอ
      // (ทดสอบแล้วได้ประโยคผิดเรื่อง) ยังใช้ได้ในชุดทดสอบ learn-test โดยเรียกตรงๆ

      // เรียนเองจากบันทึกที่เคยอ่าน: มีคำที่ไม่รู้จักและบันทึกมีนิยามของคำนั้นที่ตรวจผ่าน จึงเรียนแล้วตอบใหม่
      // ไม่เรียนซ้อนในรอบเดียวกัน (กันวนซ้ำ) และไม่แตะความรู้เดิม
      if (hard.length && NINO.SelfStudy && !this._learning) {
        const found = NINO.SelfStudy.findFor(this.store, hard);
        if (found) {
          this.store.teach(found.q, found.a);
          if (this.lexicon && found.subject) this.lexicon.add(Text.normalize(found.subject));
          const ok = NINO.SelfStudy.verify(this, found);
          if (ok) {
            yield step('learn', 'ค้นบันทึกที่เคยอ่านแล้วเรียนเอง: "' + found.q + '" ตรวจกลับผ่าน');
            this._learning = true;
            let r;
            try { r = yield* this._think(input); } finally { this._learning = false; }
            return Object.assign({}, r, { meta: 'เรียนเองจากบันทึกที่อ่าน' + (r.meta ? ' · ' + r.meta : '') });
          }
          this.store.forget(found.q);
          yield step('learn', 'พบนิยามในบันทึก แต่ตรวจกลับไม่ผ่าน จึงไม่เรียน');
        }
      }

      if (this.store.settings.generator) {
        const g = this.prof.span('think.generate', () => this.language.generate(input));
        if (g) {
          yield step('generate', 'ใช้โมเดลสำรองสร้างข้อความ');
          return { kind: 'generated', text: Text.keepThai(g), meta: 'โมเดลสำรอง (ทดลอง)' };
        }
      }

      // ถ้าคำถามอ้างถึงสิ่งที่คุยอยู่ก่อนหน้า แต่ไม่ระบุว่าคือสิ่งใด ให้ถามกลับ ไม่ตอบด้วยเรื่องก่อนหน้า
      // (ตอบด้วยเรื่องก่อนหน้าจะผิดได้ เช่น ถามรสชาติของ "อันนั้น" ทั้งที่เรื่องเดิมคือการกินคู่กับอะไร)
      if (this.context && this.context.last && REFERENCE_RE.test(input)) {
        yield step('decide', 'คำถามอ้างถึงสิ่งที่ไม่ชัด จึงถามกลับ');
        return { kind: 'fallback', text: 'ฉันยังไม่แน่ใจว่าคุณหมายถึงเรื่องไหนค่ะ ช่วยบอกชื่อสิ่งนั้นอีกครั้งได้ไหมคะ', meta: 'ถามกลับ' };
      }
      // ทุกคำในคำถามรู้จักแล้ว แต่ยังไม่มีคำตอบที่ชัดพอ (หรือกำกวม): ให้เลือกจากความรู้ที่ใกล้เคียงแทนการขอให้สอนอย่างเดียว
      // อ่านจากแหล่งที่ติดตั้ง: ถ้าประโยคในแหล่งตรงกับคำถาม ตอบด้วยประโยคนั้นพร้อมชื่อแหล่ง (ไม่เรียนเป็นความรู้)
      if (NINO.Sources) {
        const book = NINO.Sources.openBook(this.store, content.filter(w => !isSoftWord(w)));
        if (book) {
          yield step('source', 'ค้นในแหล่งที่ติดตั้ง: ' + book.source.title);
          return { kind: 'answer', text: book.text, meta: 'อ่านจากแหล่ง: ' + book.source.title, source: book.source.id, reading: true };
        }
      }

      // ไม่มีคำตอบตรง แต่มีเรื่องใกล้เคียงที่รู้: บอกตรงๆ ว่าไม่ตรง แล้วเสนอเรื่องนั้น (ไม่ปล่อยให้เป็นแค่ "ไม่รู้")
      // ใช้เมื่อเส้นทางความหมายให้คำตอบที่ไม่ตรงชนิด หรือผู้สมัครอันดับต้นมีคำร่วมกับคำถามชัดเจน
      // ผู้สมัครที่ต้องมีคำเฉพาะร่วมกับคำถาม (ไม่ใช่แค่คำประกอบอย่าง "อะไร" "บ้าง")
      // เฉพาะคำที่หายาก (อยู่ในรายการไม่เกิน RARE_DF) เพื่อไม่ให้คำทั่วไปอย่าง "วัน" พาไปเรื่องอื่น
      const ownWords = content.filter(w => w.length >= 2 && !QUESTION_PARTICLES.has(w) && !isSoftWord(w) && (this._wordDocs.get(w) || []).length <= RARE_DF);
      const sharesOwn = e => ownWords.some(w => String(e.q).indexOf(w) >= 0);
      const near = ranked.slice(0, 5).find(r => sharesOwn(r.entry) && r.cover >= 0.3);
      const nearEntry = comp0 ? comp0.entry : (near ? near.entry : null);
      if (nearEntry && nearEntry.a && hard.length === 0) {
        yield step('decide', 'ไม่มีคำตอบตรง จึงบอกเรื่องใกล้เคียงที่รู้');
        return { kind: 'related', text: 'ยังไม่มีคำตอบตรงเรื่อง "' + String(input).trim() + '" ค่ะ แต่เรื่องใกล้เคียงที่ฉันรู้คือ "' + nearEntry.q + '" ' + nearEntry.a, meta: 'เรื่องใกล้เคียง (ไม่ใช่คำตอบตรง)', entry: nearEntry };
      }
      const choices = hard.length === 0 ? altsFrom(ranked, null) : [];
      if (choices.length) {
        yield step('alt', 'ยังไม่มั่นใจ จึงเสนอ ' + choices.length + ' เส้นทางให้เลือก');
        return { kind: 'fallback', text: 'ฉันยังไม่แน่ใจว่าคุณหมายถึงเรื่องไหนค่ะ ลองเลือกข้อที่ใกล้เคียงที่สุด หรือถามให้ชัดขึ้นได้ไหมคะ\n' + altLines(choices), meta: 'เส้นทางเลือก', alts: choices.map(x => x.entry) };
      }
      yield step('decide', unknown.length ? 'ยังไม่มีความรู้เรื่องนี้ จึงขอให้สอน' : 'ยังไม่มีเส้นทางความหมายที่พอจะตอบได้');
      return { kind: 'fallback', text: pickOne(NINO.FALLBACKS), meta: '' };
    }

    // ถามทุกโหนดเชื่อม แล้วเลือกข้อเสนอที่คะแนนสูงสุด (null ถ้าไม่มีโหนดใดเสนอ)
    _propose(input) {
      let best = null;
      for (const node of this.links) {
        for (const p of node.propose(input)) {
          if (!best || p.score > best.score) best = p;
        }
      }
      return best;
    }

    // ทบทวนหลังสอน: หาคำที่อยู่ห่างสองชั้นจากคำใหม่ แล้วบันทึกเป็นข้อสังเกต
    *reflect(entry, newWords) {
      const graph = this.getGraph();
      yield step('reflect', newWords.length
        ? 'ทบทวนความรู้ใหม่ คำใหม่: ' + newWords.join(', ')
        : 'ทบทวนความรู้ใหม่ ไม่มีคำใหม่');

      for (const w of newWords) this.store.resolveGap(w);

      const found = this.prof.span('think.reflect', () => {
        const out = [];
        for (const w of newWords) {
          if (!graph.has(w)) continue;
          for (const n of graph.neighbors(w, 5)) {
            for (const m of graph.neighbors(n.w, 5)) {
              if (m.w === w || graph.weight(w, m.w) > 0) continue;
              // คำที่พบทุกที่ (เช่นคำกลางที่เป็นฮับ) ให้ความมั่นใจต่ำ เพื่อลดข้อสังเกตที่ไม่มีความหมาย
              const hub = Math.log(2 + (graph.df.get(n.w) || 1));
              out.push({ a: w, b: m.w, via: n.w, conf: n.weight * m.weight / hub });
            }
          }
        }
        return out;
      });
      found.sort((x, y) => y.conf - x.conf);

      let added = 0;
      for (const f of found) {
        if (added >= 3) break;
        const rec = {
          text: f.a + ' เกี่ยวข้องกับ ' + f.b + ' ผ่าน ' + f.via,
          conf: Math.round(f.conf * 1000) / 1000,
          a: f.a,
          b: f.b,
          via: f.via
        };
        if (this.store.addInsight(rec)) {
          added++;
          yield step('insight', rec.text + ' ความมั่นใจ ' + rec.conf.toFixed(2));
        }
      }
      if (!added) yield step('reflect', 'ยังไม่พบความเชื่อมโยงใหม่ที่ต่อจากความรู้เดิม');
      return { added };
    }

    // จัดอันดับความรู้: score = ค่าเฉลี่ยของคำในคำถามเดิม (คำที่พิมพ์เต็ม 1 คำ, คำที่ถูกกระตุ้นทางอ้อมได้สูงสุดครึ่งหนึ่ง)
    // cover = สัดส่วนคำในคำถามเดิมที่ผู้ใช้พิมพ์จริงๆ
    _rank(act, seeds) {
      // รายการที่ได้คะแนนเป็นบวกต้องมีคำในคำถามอยู่ใน act เท่านั้น จึงไล่เฉพาะรายการเหล่านั้น
      const cand = new Set();
      for (const w of act.keys()) for (const i of this._wordDocs.get(w) || []) cand.add(i);
      const out = [];
      for (const i of [...cand].sort((a, b) => a - b)) {
        const d = this._docs[i];
        const qs = d.qu;
        if (!qs.length) continue;
        let sum = 0;
        let direct = 0;
        let rare = false;
        for (const w of qs) {
          if (seeds.has(w)) {
            sum += 1;
            direct++;
            if ((this._wordDocs.get(w) || []).length <= ALT_RARE_DF) rare = true;
          } else sum += 0.5 * Math.min(1, act.get(w) || 0);
        }
        const score = sum / qs.length;
        // ฝั่งคำถาม: คำที่รู้จักของคำถามกี่เปอร์เซ็นต์ปรากฏในรายการนี้ (ต่างจาก cover ที่วัดฝั่งรายการ)
        // คำทั่วไป (เช่น "เรื่อง") ไม่นับ เพราะทุกคำถามมีได้ จะทำให้คำเฉพาะถูกกลบ
        let inQ = 0;
        let nSpecific = 0;
        for (const w of seeds.keys()) {
          if (isSoftWord(w)) continue;
          nSpecific++;
          if (d.q.includes(w) || d.a.includes(w)) inQ++;
        }
        const qcov = nSpecific ? inQ / nSpecific : 0;
        if (score > 0) out.push({ entry: d.entry, score, cover: direct / qs.length, rare, qcov });
      }
      out.sort((a, b) => b.score - a.score);
      return out;
    }

    // หาเส้นทางสั้นระหว่างคำที่รู้จักสองคำ แล้วเลือกความรู้ที่อยู่บนเส้นทางนั้น
    _compose(known, typed) {
      const graph = this.getGraph();
      const seeds = known.slice(0, 6);
      let best = null;
      for (let i = 0; i < seeds.length; i++) {
        for (let j = i + 1; j < seeds.length; j++) {
          const p = graph.path(seeds[i], seeds[j], 3);
          if (!p || p.length < 3) continue;
          let prod = 1;
          for (let k = 0; k < p.length - 1; k++) prod *= graph.weight(p[k], p[k + 1]);
          const conf = Math.pow(prod, 1 / (p.length - 1));
          if (conf < this.options.pathConfidence) continue;

          // ตัวเลขเป็นทางผ่านที่ไม่มีความหมาย (เช่น "12" ที่เชื่อม "วัน" กับ "ปี") จึงไม่ใช้เป็นจุดผ่าน
          if (p.slice(1, -1).some(w => /\d/.test(w))) continue;
          const interior = new Set(p.slice(1, -1));
          // เฉพาะรายการที่มีคำกลางของเส้นทางอยู่ (รายการอื่นได้ 0 และไม่ถูกเลือกอยู่แล้ว)
          const cand = new Set();
          for (const w of interior) for (const i of this._wordDocs.get(w) || []) cand.add(i);
          let entry = null;
          let hits = 0;
          // คำที่เฉพาะของคำถาม = คำที่อยู่ในความรู้ไม่เกิน RARE_DF รายการ รายการที่ตอบต้องมีคำเฉพาะอย่างน้อยหนึ่งคำ
          // คำถามเช่น ยังไง/อะไร/ไหม ไม่ใช่เรื่องที่ถามถึง จึงไม่นับเป็นคำเฉพาะ (รอบ 2026-11-19)
          // ใช้เฉพาะคำที่ผู้ใช้พิมพ์จริง ไม่รวมคำที่ขยายจากคำที่พิมพ์ (เช่น "ต้มไข่" ขยายไป "ต้มยำ" ซึ่งไม่ได้ถาม)
          const base = typed && typed.length ? typed : known;
          const rareWords = base.filter(w => !QUESTION_PARTICLES.has(w) && (this._wordDocs.get(w) || []).length <= RARE_DF);
          for (const i of [...cand].sort((a, b) => a - b)) {
            const d = this._docs[i];
            // ต้องมีคำที่เฉพาะเจาะจงของคำถาม (อยู่ในความรู้ไม่เกินจำนวนที่กำหนด) ในคำถามของรายการนั้นด้วย
            // กันรายการที่ตรงกันเพียงคำทั่วไปอย่าง "วัน" หรือ "มิ้ม" (ผลวัดใน eval-retrieval.js)
            // ไม่มีคำเฉพาะเลย = ไม่มีหลักฐานพอ จึงไม่ตอบจากเส้นทาง (เดิมช่องนี้เปิดให้ตอบได้ทุกรายการ)
            // และคำเฉพาะทุกคำของคำถามต้องถูกอธิบายด้วยรายการหรือเส้นทาง (ไม่งั้นเส้นทางอาจพาไปเรื่องอื่นที่มีแค่คำเดียวร่วม)
            if (!rareWords.length || !rareWords.some(w => d.q.includes(w))) continue;
            if (!rareWords.every(w => d.q.includes(w) || p.includes(w))) continue;
            const h = new Set([...d.q, ...d.a].filter(w => interior.has(w))).size;
            if (h > hits) { hits = h; entry = d.entry; }
          }
          if (entry && (!best || conf > best.conf)) best = { path: p, conf, entry };
        }
      }
      return best;
    }
  }

  NINO.ThinkNode = ThinkNode;
})(typeof globalThis !== 'undefined' ? globalThis : this);
