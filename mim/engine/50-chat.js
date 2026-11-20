/* มิ้ม | 50-chat
 * โหนดแชต: รับข้อความจาก chat.in แล้วส่งขั้นตอนการคิดเป็นลำดับไปยัง think.*
 * และส่งคำตอบสุดท้ายไปยัง chat.out ลำดับบนบัสคือ think.begin -> think.step* -> think.end -> chat.out
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;
  const Text = NINO.Text;
  const LIMITS = NINO.LIMITS;

  const TEACH_RE = /^(?:สอน|จำ)(?:\s+|\s*[:：]\s*)([\s\S]+?)\s*[|｜]\s*([\s\S]+)$/;
  const FORGET_RE = /^ลืม(?:\s+|\s*[:：]\s*)([\s\S]+)$/;
  const READ_RE = /^(?:อ่าน|เรียนเอง)(?:\s+|\s*[:：]\s*)([\s\S]+)$/;
  const SOURCE_LIST_RE = /^(?:แหล่ง|แหล่งข้อมูล)$/;
  const SOURCE_LOAD_RE = /^โหลดแหล่ง(?:\s+(\S+))?$/;
  const SOURCE_UNLOAD_RE = /^ลบแหล่ง\s+(\S+)$/;
  const SOURCE_SEARCH_RE = /^ค้นแหล่ง\s+(.+)$/;
  const COIN_RE = /^(?:เสนอคำ|สร้างคำใหม่|สร้างคำ)(?:\s+(\S+))?$/;

  // น้ำเสียงเริ่มต้นเป็นผู้หญิงสุภาพ (ลงท้ายค่ะ/คะ) ตามที่เจ้าของเลือก
  // ความซื่อสัตย์: ทุกข้อบอกตรงๆ ว่าไม่รู้ และเชิญให้สอน ไม่เดาคำตอบ
  const FALLBACKS = [
    'ยังไม่มีความรู้เรื่องนี้ค่ะ ลองสอนฉันได้นะคะ โดยพิมพ์ "สอน คำถาม | คำตอบ"',
    'ฉันยังไม่แน่ใจค่ะ ลองถามใหม่ด้วยคำที่ต่างออกไป หรือสอนคำตอบให้ฉันได้เลยนะคะ',
    'ยังไม่เจอคำตอบที่ใกล้เคียงค่ะ ช่วยสอนฉันหน่อยนะคะ',
    'ตอนนี้ฉันยังไม่รู้เรื่องนี้ค่ะ ช่วยสอนฉันหน่อยได้ไหมคะ'
  ];

  const TEACH_MSG = {
    invalid: 'คำถามหรือคำตอบว่างเปล่า หรือมีแต่สัญลักษณ์ค่ะ',
    too_long: 'ข้อความยาวเกินกำหนดค่ะ คำถามไม่เกิน ' + LIMITS.question + ' ตัวอักษร คำตอบไม่เกิน ' + LIMITS.answer + ' ตัวอักษร',
    full: 'ความรู้เต็มแล้วค่ะ สูงสุด ' + LIMITS.entries + ' รายการ'
  };

  function parseTeach(raw) {
    const m = String(raw ?? '').match(TEACH_RE);
    if (!m) return null;
    return { q: m[1].trim(), a: m[2].trim() };
  }

  function parseForget(raw) {
    const m = String(raw ?? '').match(FORGET_RE);
    return m ? m[1].trim() : null;
  }

  class ChatNode extends NINO.Node {
    constructor(id, bus, store, thinker) {
      super(id, bus);
      this.store = store;
      this.thinker = thinker;
      this._seq = 0;
      this.listen('chat.in', text => this.handle(text));
      this.declareOutput('chat.out');
    }

    reply(kind, text, meta) {
      // คำถามที่มิ้มตอบไม่ได้ถูกจดไว้ให้ผู้ใช้สอนต่อ (ดูแท็บสอนของมิ้ม)
      if ((kind === 'fallback' || kind === 'related') && this._asked && this.store && this.store.noteQuestionGap) {
        this.store.noteQuestionGap(this._asked);
        this.store.save();
      }
      this.send('chat.out', { kind, text: Text.stripEmoji(text), meta: meta || '' });
    }

    // ดึงขั้นตอนการคิดทีละขั้นออกจากผู้คิดแล้วส่งเข้าบัส ทำให้หน้าจอสตรีมได้ทันที
    // บันทึกเวลาถึงขั้นแรกและจำนวนขั้นไว้ในบันทึกของรอบนี้ (turn)
    _run(gen, id, turn) {
      let r = gen.next();
      while (!r.done) {
        if (turn.firstStepMs === null) turn.firstStepMs = NINO.now() - turn.t0;
        turn.steps++;
        this.send('think.step', { id, kind: r.value.kind, text: r.value.text });
        r = gen.next();
      }
      return r.value;
    }

    // label: 'ตอบ' หรือ 'สอน' ใช้แยกประเภทของรอบในหน้าค่าวัด
    _thought(gen, label) {
      const id = ++this._seq;
      const turn = { label, t0: NINO.now(), firstStepMs: null, steps: 0, totalMs: 0, stats: null };
      this.send('think.begin', { id });
      try {
        return this._run(gen, id, turn);
      } finally {
        turn.totalMs = NINO.now() - turn.t0;
        turn.stats = this.thinker.lastStats;
        if (turn.firstStepMs === null) turn.firstStepMs = turn.totalMs;
        this.send('think.end', { id });
        NINO.profiler.last = turn;
        NINO.profiler.record('chat.turn', turn.totalMs);
      }
    }

    handle(raw) {
      const text = String(raw ?? '').trim();
      if (!text) return;
      this._asked = text;

      // ก่อนประมวลผลข้อความใหม่ ดูว่าข้อความนี้บอกอะไรเกี่ยวกับคำตอบที่แล้ว (ตัวปรับเกณฑ์)
      this._observe(text);

      const taught = parseTeach(text);
      if (taught) return this._teach(taught);

      const forget = parseForget(text);
      if (forget !== null) return this._forget(forget);

      const read = text.match(READ_RE);
      if (read && NINO.SelfStudy) return this._read(read[1].trim());

      const src = this._sourceCommand(text);
      if (src !== null) return src;

      const coin = this._coinCommand(text);
      if (coin !== null) return coin;

      // ทักษะกฎตายตัว: ความปลอดภัยทำงานเสมอแม้ปิดระบบ ส่วนอื่นทำเมื่อเปิดใช้งาน
      const skill = NINO.Skills ? NINO.Skills.match(text, new Date()) : null;
      if (skill && (skill.id === 'crisis' || this.store.settings.enabled)) {
        this.store.save();
        return this.reply(skill.id, skill.text, 'ทักษะ');
      }

      if (!this.store.settings.enabled) {
        return this.reply('disabled', 'ระบบยังไม่เปิดใช้งานค่ะ กดปุ่มเปิดใช้งานก่อนนะคะ');
      }

      const res = this._thought(this.thinker.think(text), 'ตอบ');
      if (res.entry) this.store.hit(res.entry);
      this._last = res.fuzzy && res.entry ? { entryQ: res.entry.q } : null;
      this.store.save();
      // ที่มาของคำตอบ (แหล่งที่ติดตั้งไว้) ต่อท้ายคำตอบให้ตรวจได้
      const cite = NINO.Sources ? NINO.Sources.describe(this.store, res) : '';
      const meta = [res.meta, cite].filter(Boolean).join(' · ');
      this.reply(res.kind, res.text, meta);
    }

    // สัญญาณจากพฤติกรรมหลังคำตอบแบบคล้ายกัน:
    //   สอนคำถามอื่น หรือ ลืมทันที  -> ตอบผิด (wrong)
    //   ถามเรื่องใหม่ต่อโดยไม่แก้ไข -> ยอมรับ (ok)
    // สอนคำถามเดิมซ้ำถือว่าไม่ใช่สัญญาณ เพราะไม่ได้บอกว่าคำตอบผิด
    _observe(text) {
      const last = this._last;
      this._last = null;
      if (!last) return;
      const taught = parseTeach(text);
      const forget = parseForget(text);
      const norm = NINO.Text.normalize;
      if (taught) {
        if (norm(taught.q) !== norm(last.entryQ)) NINO.Calibrator.feedback(this.store, 'wrong');
      } else if (forget !== null) {
        NINO.Calibrator.feedback(this.store, 'wrong');
      } else {
        NINO.Calibrator.feedback(this.store, 'ok');
      }
    }

    _teach(t) {
      const before = this.thinker.knownWords();
      // สอนหนึ่งครั้งได้รูปคำถามใกล้เคียงเพิ่มด้วย (39-learn) ไม่เขียนทับความรู้เดิม
      const learned = NINO.Learn
        ? NINO.Learn.teach(this.store, t.q, t.a)
        : { status: this.store.teach(t.q, t.a), derived: [] };
      const r = learned.status;
      if (TEACH_MSG[r]) return this.reply('error', TEACH_MSG[r]);

      const entry = this.store.find(t.q);
      const newWords = this.thinker.newWordsOf(entry, before);
      this.thinker.lastStats = null;
      this._thought(this.thinker.reflect(entry, newWords), 'สอน');
      this.store.save();

      const isNew = r === 'new';
      this.reply(
        isNew ? 'taught' : 'updated',
        (isNew ? 'จำแล้ว' : 'อัปเดตคำตอบแล้ว') + '\nถาม: ' + t.q + '\nตอบ: ' + t.a +
          (learned.derived.length ? '\nขยายความรู้ให้ถามได้อีก ' + learned.derived.length + ' แบบ' : ''),
        'ความรู้ทั้งหมด ' + this.store.entries.length + ' รายการ'
      );
    }

    // คำสั่งแหล่งข้อมูล: แหล่ง / โหลดแหล่ง [id] / ลบแหล่ง <id> / ค้นแหล่ง <คำ>
    // คืน null ถ้าไม่ใช่คำสั่งแหล่ง
    // "เสนอคำ <คำราก>": ประกอบคำใหม่จากคำที่รู้จักแล้วด้วยกฎ แล้วบอกชัดว่าเป็นคำที่เสนอเอง
    _coinCommand(text) {
      const m = text.match(COIN_RE);
      if (!m || !NINO.Coin) return null;
      const arg = (m[1] || '').trim();
      if (!arg) {
        return this.reply('answer', 'พิมพ์ "เสนอคำ คำราก" ได้เลยค่ะ เช่น "เสนอคำ ดนตรี" มิ้มจะประกอบคำใหม่จากคำนั้นตามกฎ และบอกว่าเป็นคำที่เสนอเองค่ะ');
      }
      const lex = this.thinker.lexicon;
      const word = NINO.Text.normalize(arg);
      if (!lex || !NINO.Coin.isRoot(lex, word)) {
        return this.reply('answer', 'มิ้มยังไม่รู้จักคำว่า "' + arg + '" ค่ะ ให้สอนความหมายก่อน หรืออ่านข้อความที่มีคำนี้ แล้วมิ้มจะประกอบคำจากมันได้');
      }
      const taken = w => !!(this.store.find(w) || this.store.find(w + 'คืออะไร'));
      const list = NINO.Coin.propose(lex, word, taken);
      return this.reply('answer', NINO.Coin.describe(list, word), 'คำที่เสนอเอง (กฎการประกอบคำ)');
    }

    _sourceCommand(text) {
      if (!NINO.Sources) return null;
      if (SOURCE_LIST_RE.test(text)) {
        const rows = NINO.Sources.listing(this.store);
        if (!rows.length) return this.reply('answer', 'ยังไม่มีแหล่งข้อมูลที่ลงทะเบียนไว้ค่ะ');
        const lines = rows.map(r => '• ' + r.id + ' · ' + r.title + ' · ' +
          (r.loaded ? 'ติดตั้งแล้ว (เรียน ' + r.learned + ' ข้าม ' + r.skipped + ')' : 'ยังไม่ติดตั้ง') +
          ' · ' + NINO.Sources.trustLabel(r.trust));
        return this.reply('answer', 'แหล่งข้อมูลที่มี:\n' + lines.join('\n'),
          'พิมพ์ "โหลดแหล่ง <id>" เพื่อติดตั้ง หรือ "ลบแหล่ง <id>" เพื่อถอน');
      }
      let m = text.match(SOURCE_LOAD_RE);
      if (m) {
        const ids = m[1] ? [m[1]] : NINO.Sources.listing(this.store).filter(r => !r.loaded).map(r => r.id);
        if (!ids.length) return this.reply('answer', 'ติดตั้งครบทุกแหล่งแล้วค่ะ');
        const out = ids.map(id => NINO.Sources.load(this.store, this.thinker, id));
        const ok = out.filter(r => !r.error);
        const lines = out.map(r => r.error
          ? '• ' + r.id + ': ' + r.error
          : '• ' + r.title + ': เรียนนิยามได้ ' + r.learned.length + ' เรื่อง ข้าม ' + r.skipped.length + ' · ' + NINO.Sources.trustLabel(r.trust));
        return this.reply(ok.length ? 'taught' : 'error', lines.join('\n'),
          'ตอบจากแหล่งที่ติดตั้งจะบอกชื่อแหล่งเสมอ');
      }
      m = text.match(SOURCE_UNLOAD_RE);
      if (m) {
        const r = NINO.Sources.unload(this.store, m[1]);
        if (r.error) return this.reply('error', r.error);
        this.store.save();
        return this.reply('forgot', 'ถอนแหล่ง "' + r.id + '" แล้ว ลบความรู้ที่มาจากแหล่งนี้ ' + r.removed + ' รายการ');
      }
      m = text.match(SOURCE_SEARCH_RE);
      if (m) {
        const hits = NINO.Sources.search(m[1].trim(), 5);
        if (!hits.length) return this.reply('answer', 'ไม่พบ "' + m[1].trim() + '" ในแหล่งที่ลงทะเบียนค่ะ');
        const lines = hits.map(h => '• ' + h.line + '\n   (' + h.source.title + (NINO.Sources.isLoaded(this.store, h.source.id) ? '' : ', ยังไม่ติดตั้ง') + ')');
        return this.reply('answer', lines.join('\n'));
      }
      return null;
    }

    // อ่านข้อความ: เก็บเป็นบันทึกและเรียนนิยามที่ตรวจผ่านเอง ไม่ต้องพิมพ์ "สอน คำถาม | คำตอบ"
    _read(text) {
      const res = NINO.SelfStudy.ingest(this.store, this.thinker, text);
      const lines = [];
      if (res.learned.length) {
        lines.push('เรียนเองได้ ' + res.learned.length + ' เรื่องค่ะ:');
        for (const l of res.learned.slice(0, 6)) lines.push('• ' + l.q);
      } else {
        lines.push('ยังไม่พบนิยามที่เรียนได้จากข้อความนี้ค่ะ');
      }
      if (res.skipped.length) {
        lines.push('ข้ามไป ' + res.skipped.length + ' รายการ (' + res.skipped[0].reason + ')');
      }
      this.reply(res.learned.length ? 'taught' : 'error', lines.join('\n'),
        'บันทึกที่อ่านไว้ ' + this.store.notes.length + ' ข้อความ · ความรู้ทั้งหมด ' + this.store.entries.length + ' รายการ');
    }

    _forget(q) {
      if (this.store.forget(q)) {
        this.store.save();
        return this.reply('forgot', 'ลืม "' + q + '" แล้ว', 'ความรู้ทั้งหมด ' + this.store.entries.length + ' รายการ');
      }
      return this.reply('error', 'ไม่พบความรู้ที่ชื่อ "' + q + '"');
    }
  }

  NINO.ChatNode = ChatNode;
  NINO.parseTeach = parseTeach;
  NINO.parseForget = parseForget;
  NINO.FALLBACKS = FALLBACKS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
