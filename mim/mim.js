/* มิ้ม | ป็อปอัพ Local AI ภายในแอป NINO
 * ตัวควบคุมหน้าจอ: สร้างกล่องป็อปอัพตอนเปิดครั้งแรก ต่อเข้ากับเครื่องยนต์ใน mim/engine
 * แล้วแสดงข้อความด้วยคลาสชุดเดียวกับแชตหลัก เพื่อให้ดูเป็นส่วนเดียวกับแอป
 *
 * ข้อกำหนด (ดูคู่มือ mim/MANUAL_TH.md):
 *  - มิ้มเองไม่เรียกเครือข่าย ยกเว้นพี่นาเดียร์ (mim/nadia.js) ที่ส่งคำถามผ่านฟังก์ชันของแอป
 *    เฉพาะตอนที่ผู้ใช้เปิดโหมดเองและพิมพ์ถาม และใช้ API ที่ผู้ใช้ตั้งค่าไว้เท่านั้น
 *  - ค่าเริ่มต้นตอบจากความรู้ที่ผู้ใช้สอนและชุดความรู้เริ่มต้น ไม่มีโมเดลภาษาในเครื่อง
 *  - คำตอบจาก API ต้องถูกจำเองก่อนจึงเข้าคลังความรู้ออฟไลน์
 *  - ความรู้เก็บที่คีย์ localStorage เดิม nino_local_ai_* (ห้ามเปลี่ยนชื่อคีย์)
 *  - ข้อความทั้งหมดใส่ด้วย textContent (ไม่แทรก HTML จากผู้ใช้)
 *  - ไม่มีอิโมจิ
 */
(function () {
  'use strict';

  const state = { root: null, booted: false, open: false, chat: null, bus: null, store: null, lastQ: '', teachOpen: false };

  function E() {
    // เครื่องยนต์ของ มิ้ม ใช้ชื่อออบเจกต์ NINO ภายในไฟล์ของ mim/engine เท่านั้น
    return window.NINO;
  }

  // โมดูลพี่นาเดียร์ หากโหลดไม่ได้ ให้ทำงานแบบออฟไลน์อย่างเดียว
  function NADIA() {
    return window.NINO_NADIA || {
      NAME: 'พี่นาเดียร์',
      status: function () { return { on: false, consentAt: 0 }; },
      setOn: function () { return { on: false, consentAt: 0 }; },
      ask: function () { return Promise.resolve({ ok: false, error: 'ยังไม่ได้โหลดโมดูลนาเดียร์' }); },
      teach: function () { return { status: 'invalid', derived: [] }; }
    };
  }

  function $(id) {
    return document.getElementById(id);
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function online() {
    return navigator.onLine !== false;
  }

  // ตรวจว่าแอปหลักตั้งค่า API ไว้แล้วหรือยัง (ไม่อ่านคีย์เอง ใช้ฟังก์ชันของแอป)
  function apiReady() {
    try {
      return typeof window.getCfg === 'function' &&
        typeof window.providerHasKey === 'function' &&
        !!window.providerHasKey(window.getCfg());
    } catch (e) {
      return false;
    }
  }

  function apiLabel() {
    try {
      const cfg = window.getCfg();
      return typeof window.providerLabel === 'function' ? window.providerLabel(cfg.provider) : String(cfg.provider || '');
    } catch (e) {
      return '';
    }
  }

  // ชื่อที่แสดงของระบบ: ใช้ชื่อมิ้มเสมอ (ไม่แก้ข้อมูลที่เก็บ)
  function nameOf(text) {
    const L = E() && E().Learn;
    return L ? L.displayName(text) : String(text ?? '');
  }

  // ฟอนต์สไตล์เรโทสำหรับหัวป็อปอัพ โหลดตอนเปิดครั้งแรกเท่านั้น ถ้าโหลดไม่ได้ใช้ฟอนต์สำรองของแอป
  function loadFonts() {
    try {
      if ($('mim-fonts')) return;
      const l = document.createElement('link');
      l.id = 'mim-fonts';
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@500;700&family=Chakra+Petch:wght@400;600&display=swap';
      document.head.appendChild(l);
    } catch (e) {
      // ออฟไลน์หรือถูกบล็อก: ใช้ฟอนต์สำรอง ไม่ทำให้ป็อปอัพพัง
    }
  }

  function template() {
    return '' +
      '<div class="mim-win" role="dialog" aria-modal="true" aria-labelledby="mim-title">' +
      '  <header class="mim-head">' +
      '    <div class="mim-brand">' +
      '      <span id="mim-title" class="mim-title">มิ้ม</span>' +
      '      <span class="mim-sub">ออฟไลน์เป็นหลัก เปิดพี่นาเดียร์เพื่อใช้ API ที่ตั้งไว้</span>' +
      '    </div>' +
      '    <div class="mim-acts">' +
      '      <button type="button" class="mim-btn" id="mim-export">ส่งออก</button>' +
      '      <button type="button" class="mim-btn" id="mim-import">นำเข้า</button>' +
      '      <button type="button" class="mim-x" id="mim-close" aria-label="ปิด">×</button>' +
      '    </div>' +
      '  </header>' +
      '  <div class="mim-bar" id="mim-bar">' +
      '    <span id="mim-status" class="mim-status"></span>' +
      '    <span class="mim-bar-acts">' +
      '      <button type="button" class="mim-btn mim-nadia" id="mim-nadia" aria-pressed="false">นาเดียร์: ปิด</button>' +
      '      <button type="button" class="mim-btn mim-primary" id="mim-enable" hidden>เปิดใช้งาน</button>' +
      '    </span>' +
      '  </div>' +
      '  <div id="mim-msgs" class="mim-msgs" aria-live="polite"></div>' +
      '  <div class="mim-teach" id="mim-teach" hidden>' +
      '    <div class="mim-teach-label">สอนมิ้ม: พิมพ์คำถาม แล้วกดปุ่มคำตอบ ระบบจะใส่ | ให้เอง</div>' +
      '    <div class="mim-gaps" id="mim-gaps" hidden></div>' +
      '    <div class="mim-tray" id="mim-tray" hidden></div>' +
      '    <div class="mim-teach-box">' +
      '      <div class="mim-teach-mirror" id="mim-teach-mirror" aria-hidden="true"></div>' +
      '      <textarea id="mim-teach-input" class="mim-teach-input" rows="2" spellcheck="false" placeholder="คำถาม"></textarea>' +
      '    </div>' +
      '  </div>' +
      '  <form class="mim-compose" id="mim-form">' +
      '    <button type="button" class="mim-btn mim-qa" id="mim-qa">คำถาม</button>' +
      '    <textarea id="mim-input" rows="1" placeholder="พิมพ์ถามมิ้ม (Ctrl+Enter = ส่ง)"></textarea>' +
      '    <button type="submit" class="mim-send" id="mim-send">ส่ง</button>' +
      '    <button type="button" class="mim-btn" id="mim-classroom" title="ส่งข้อความที่พิมพ์ไปเป็นหัวข้อในห้องเรียน">ห้องเรียน</button>' +
      '  </form>' +
      '  <input type="file" id="mim-file" accept=".txt,text/plain" hidden>' +
      '</div>';
  }

  function build() {
    if (state.root) return;
    const root = el('div', 'mim-overlay');
    root.id = 'mim-root';
    root.hidden = true;
    root.innerHTML = template();
    document.body.appendChild(root);
    state.root = root;

    $('mim-close').addEventListener('click', close);
    root.addEventListener('click', function (e) {
      if (e.target === root) close();
    });
    $('mim-form').addEventListener('submit', function (e) {
      e.preventDefault();
      if (state.teachOpen) sendTeach();
      else send();
    });
    $('mim-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        send();
      }
    });
    $('mim-teach-input').addEventListener('input', renderMirror);
    $('mim-teach-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sendTeach();
      }
    });
    $('mim-qa').addEventListener('click', onQaButton);
    $('mim-classroom').addEventListener('click', function () {
      const C = window.ninoClassroom;
      if (C && C.openWith) C.openWith($('mim-input').value.trim());
    });
    // ปุ่มพิมพ์ทั้งหมดในป็อปอัพต้องไม่ทะลุไปถึงทางลัดของแชตหลัก (เช่น Ctrl+Enter ส่งข้อความของ Code/Roleplay)
    // Escape จัดการตรงนี้ก่อนหยุดการทะลุ เพราะตัวจัดการ Escape ที่ document จะไม่ได้รับเหตุการณ์แล้ว
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
      e.stopPropagation();
    });
    $('mim-enable').addEventListener('click', enable);
    $('mim-nadia').addEventListener('click', toggleNadia);
    $('mim-export').addEventListener('click', exportText);
    $('mim-import').addEventListener('click', function () {
      $('mim-file').click();
    });
    $('mim-file').addEventListener('change', importText);
  }

  // เครื่องยนต์เริ่มทำงานตอนเปิดครั้งแรก เพื่อไม่ให้หน้าแรกของแอปช้าลง
  function boot() {
    if (state.booted) return;
    const N = E();
    const bus = new N.Bus();
    const graph = new N.Graph();
    const store = new N.KnowledgeStore().load();
    const retrieval = graph.add(new N.RetrievalNode('retrieval', bus, store));
    const language = graph.add(new N.LanguageNode('language', bus, store));
    const thinker = graph.add(new N.ThinkNode('thinker', bus, store, retrieval, language));
    const chatNode = graph.add(new N.ChatNode('chat', bus, store, thinker));
    chatNode.drafter = draftWithLocalModel;

    if (store.ensureSeed(N.SEED_KNOWLEDGE)) store.save();
    // ชุดความรู้เริ่มต้น: เติมเฉพาะคำถามที่ยังไม่มี และบันทึกรุ่นไว้ จึงไม่เขียนทับความรู้ของผู้ใช้
    const packBefore = store.settings.packVersion;
    if (N.Learn && window.NINO_PACK_TH) N.Learn.ensurePack(store, window.NINO_PACK_TH);
    if (store.settings.packVersion !== packBefore) store.save();

    bus.on('chat.out', function (m) {
      // โหมด 1: เฉพาะเมื่อมิ้มตอบไม่ได้ ให้โมเดลในเครื่องตอบจากความรู้ของมิ้มที่ยกมาให้ (ตรวจแล้ว ความรู้ทั้งหมดต้องมาจากคลังของมิ้มจึงแสดง)
      if (m.kind === 'fallback' && window.NINOMimLLM && NINOMimLLM.enabled() && state.lastQ) {
        const q = state.lastQ;
        const waiting = bubble('nino', 'มิ้มกำลังถามโมเดลในเครื่องค่ะ...', '', null, 'mim');
        NINOMimLLM.answer(state.store, q).then(function (r) {
          waiting.remove();
          // ผู้ใช้ยืนยันเองก่อนมิ้มจำ: ปุ่มจะจำคำถามนี้พร้อมคำตอบที่สอนไว้ในคลังเดิม ไม่จำข้อความของโมเดล
          if (r.ok && r.source === 'verbatim') bubble('nino', r.text, 'โหมด 1 · คำตอบที่มิ้มสอนไว้โดยตรง (โมเดลใช้ไม่ได้รอบนี้) · 100% จากคลังของมิ้ม', { learn: { q: q, entry: r.entry } }, 'mim');
          else if (r.ok) bubble('nino', r.text, 'โหมด 1 · โมเดลเรียบเรียงจากความรู้ของมิ้ม ' + r.facts.length + ' รายการ · 100% จากคลังของมิ้ม', { learn: { q: q, entry: r.entry } }, 'mim');
          else bubble('nino', m.text, 'โหมด 1 ใช้ไม่ได้: ' + r.reason, { fix: state.lastQ, fixLabel: 'สอนเรื่องนี้', web: state.lastQ }, 'mim');
          refreshBar();
        });
        return;
      }
      // คำตอบที่ผิดแก้ได้ และคำถามที่ตอบไม่ได้สอนต่อได้จากฟองเดียวกัน
      const fixable = (m.kind === 'answer' || m.kind === 'composed') && state.lastQ;
      const teachable = (m.kind === 'fallback' || m.kind === 'related') && state.lastQ;
      const webable = m.kind === 'fallback' && state.lastQ;
      let extra = teachable ? { fix: state.lastQ, fixLabel: 'สอนเรื่องนี้', web: webable ? state.lastQ : '' } : null;
      if (fixable) extra = { fix: state.lastQ };
      // คำตอบจากความรู้ของมิ้มมีปุ่มตอบถูก/ไม่ถูก เพื่อให้ผู้ใช้บอกผลได้โดยตรง
      if (m.entryQ) extra = Object.assign(extra || {}, { feedback: m.entryQ });
      bubble('nino', m.text, m.meta, extra, 'mim');
      refreshBar();
    });
    bus.on('error', function (e) {
      const msg = e && e.err && e.err.message ? e.err.message : 'ไม่ทราบสาเหตุ';
      bubble('nino', 'เกิดข้อผิดพลาด: ' + msg, '', null, 'mim');
    });

    state.bus = bus;
    state.store = store;
    state.booted = true;

    bubble('nino', 'สวัสดีค่ะ นี่คือมิ้ม ระบบตอบคำถามที่ทำงานในเครื่องของคุณ ไม่ใช้โมเดลภาษาและไม่เรียกบริการภายนอก ถ้าอยากสอนฉัน กดปุ่มคำถาม พิมพ์คำถาม แล้วกดคำตอบค่ะ ถ้าอยากให้พี่นาเดียร์ช่วยตอบด้วย กดปุ่มนาเดียร์ได้ค่ะ', '', null, 'mim');
  }

  // ร่างคำตอบของคำถามที่มิ้มตอบไม่ได้ด้วยโมเดลในเครื่อง ถ้าโมเดลไม่พร้อมหรือไม่แน่ใจ คืน null
  const DRAFT_SYSTEM = 'ตอบคำถามเป็นภาษาไทยสั้นๆ ไม่เกิน 3 ประโยค ตอบเฉพาะสิ่งที่แน่ใจ ถ้าไม่แน่ใจให้ตอบว่า ไม่แน่ใจ';
  function draftWithLocalModel(q) {
    const L = window.NINOLocalLLM;
    if (!L || typeof L.isReady !== 'function' || !L.isReady() || typeof L.generate !== 'function') return Promise.resolve(null);
    return L.generate({ systemInstruction: DRAFT_SYSTEM, contents: [{ role: 'user', parts: [{ text: q }] }], maxTokens: 160 })
      .then(function (t) { const s = String(t || '').trim(); return s && s.indexOf('ไม่แน่ใจ') < 0 ? s : null; });
  }

  // ปุ่มเลื่อนกลับไปต้นข้อความของมิ้ม: ให้ขอบบนของฟองนี้ขึ้นมาอยู่บนสุดของกล่องข้อความ
  // เลื่อนแบบนุ่มนวล ถ้าผู้ใช้ตั้งค่าลดการเคลื่อนไหวไว้ จะเลื่อนทันที
  function toTopButton(wrap) {
    const btn = el('button', 'mim-to-top');
    btn.type = 'button';
    btn.title = 'ขึ้นไปยังข้อความนี้';
    btn.setAttribute('aria-label', 'เลื่อนขึ้นไปยังข้อความนี้');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 14l6-6 6 6"/><path d="M6 19l6-6 6 6" opacity=".45"/></svg>';
    btn.addEventListener('click', function () {
      const msgs = $('mim-msgs');
      if (!msgs || !wrap.isConnected) return;
      const top = Math.max(0, wrap.getBoundingClientRect().top - msgs.getBoundingClientRect().top + msgs.scrollTop - 8);
      const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (reduce || typeof msgs.scrollTo !== 'function') msgs.scrollTop = top;
      else msgs.scrollTo({ top: top, behavior: 'smooth' });
      btn.classList.remove('flash');
      void btn.offsetWidth; // เริ่มแอนิเมชันวงแสงใหม่ทุกครั้งที่กด
      btn.classList.add('flash');
    });
    return btn;
  }

  // extra.teach = { q, a } ใส่ปุ่ม "จำคำตอบนี้" ให้คำตอบจากนาเดียร์ (จำได้เมื่อผู้ใช้กดเองเท่านั้น)
  // extra.fix = คำถาม ใส่ปุ่ม "ผิด ช่วยแก้" ให้เปิดช่องสอนพร้อมคำถามเดิม
  // source = 'mim' | 'nadia' ใช้เลือกป้ายชื่อที่หัวฟอง
  function bubble(role, text, meta, extra, source) {
    const msgs = $('mim-msgs');
    const wrap = el('div', 'flex flex-col ' + (role === 'user' ? 'items-end' : 'items-start'));
    // สไตล์ของฟองข้อความอยู่ใน mim.css เองทั้งหมด เพื่อไม่ต้องพึ่ง Tailwind (ใช้ได้แม้ออฟไลน์)
    let box;
    if (role === 'user') {
      box = el('div', 'mim-bub mim-bub-user', text);
    } else {
      box = el('div', 'mim-bub mim-bub-nino');
      const isNadia = source === 'nadia';
      box.appendChild(el('span', 'mim-chip ' + (isNadia ? 'mim-chip-nadia' : 'mim-chip-mim'), isNadia ? NADIA().NAME : 'มิ้ม'));
      box.appendChild(el('div', 'mim-bub-text', nameOf(text)));
      if (meta) box.appendChild(el('div', 'mim-bub-meta', meta));
      const acts = el('div', 'mim-bub-acts');
      if (extra && extra.teach) acts.appendChild(teachButton(extra.teach));
      if (extra && extra.learn) acts.appendChild(learnButton(extra.learn));
      if (extra && extra.fix) acts.appendChild(fixButton(extra.fix, extra.fixLabel));
      if (extra && extra.web && webOn()) acts.appendChild(webButton(extra.web));
      if (extra && extra.feedback) feedbackButtons(extra.feedback).forEach(b => acts.appendChild(b));
      if (acts.childNodes.length) box.appendChild(acts);
      // ทุกคำตอบของมิ้มมีปุ่มเลื่อนกลับมาที่ต้นข้อความนี้ อยู่มุมขวาล่างของฟอง
      const foot = el('div', 'mim-bub-foot');
      foot.appendChild(toTopButton(wrap));
      box.appendChild(foot);
    }
    wrap.appendChild(box);
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
    return wrap;
  }

  const TEACH_RESULT = {
    'new': 'จำแล้วค่ะ ต่อไปมิ้มจะตอบเรื่องนี้ได้แม้ออฟไลน์',
    'updated': 'อัปเดตความรู้เดิมให้เป็นคำตอบนี้แล้วค่ะ',
    'full': 'ความรู้เต็มแล้วค่ะ ลบรายการเก่าบางส่วนก่อนได้ไหมคะ',
    'too_long': 'ข้อความยาวเกินกำหนดค่ะ จึงยังจำไม่ได้',
    'invalid': 'คำถามหรือคำตอบว่างเปล่า จึงยังจำไม่ได้ค่ะ'
  };

  function teachButton(pair) {
    const btn = el('button', 'mim-bub-act mim-bub-teach', 'จำคำตอบนี้');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      if (!state.store) return;
      const r = NADIA().teach(state.store, pair.q, pair.a);
      btn.disabled = true;
      btn.textContent = r.status === 'new' ? 'จำแล้ว' : (r.status === 'updated' ? 'อัปเดตแล้ว' : 'จำไม่ได้');
      bubble('nino', TEACH_RESULT[r.status] || 'จำไม่ได้ค่ะ', '', null, 'mim');
      refreshBar();
    });
    return btn;
  }

  // ปุ่มยืนยันของโหมด 1: มิ้มจำคำถามที่ผู้ใช้ถาม โดยใช้คำตอบที่สอนไว้เดิมของรายการนั้น ไม่ใช่ข้อความของโมเดล
  // ผลคือคำถามรูปนี้ครั้งหน้ามิ้มตอบเองได้ โดยไม่ต้องเรียกโมเดล
  function learnButton(pair) {
    const btn = el('button', 'mim-bub-act mim-bub-teach', 'ใช่ ตอบตรง ให้มิ้มจำ');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      if (!state.store || !pair.entry || !pair.entry.a) return;
      const r = E().Learn.teach(state.store, pair.q, pair.entry.a);
      btn.disabled = true;
      btn.textContent = r.status === 'new' ? 'จำแล้ว' : (r.status === 'updated' ? 'อัปเดตแล้ว' : 'จำไม่ได้');
      const msg = r.status === 'new' ? 'มิ้มจำคำถามนี้แล้วค่ะ ครั้งหน้าจะตอบเองได้โดยไม่ต้องใช้โมเดล' : (TEACH_RESULT[r.status] || 'จำไม่ได้ค่ะ');
      bubble('nino', msg, '', null, 'mim');
      refreshBar();
    });
    return btn;
  }

  // ปุ่มตอบถูก / ไม่ถูกของคำตอบหนึ่งข้อ ส่งผลไปที่ ChatNode ทางบัส กดได้ครั้งเดียวต่อคำตอบ
  function feedbackButtons(q) {
    const yes = el('button', 'mim-bub-act mim-bub-verdict mim-bub-verdict-yes', 'ตอบถูก');
    const no = el('button', 'mim-bub-act mim-bub-verdict mim-bub-verdict-no', 'ไม่ถูก');
    yes.type = 'button';
    no.type = 'button';
    function send(ok, chosen) {
      if (!state.bus) return;
      state.bus.emit('chat.feedback', { q: q, ok: ok });
      yes.disabled = true;
      no.disabled = true;
      chosen.textContent = 'บันทึกแล้ว';
    }
    yes.addEventListener('click', () => send(true, yes));
    no.addEventListener('click', () => send(false, no));
    return [yes, no];
  }

  function fixButton(question, label) {
    const btn = el('button', 'mim-bub-act mim-bub-fix', label || 'ผิด ช่วยแก้');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      openTeach(question + ' | ');
    });
    return btn;
  }

  // ---- ช่องสอน: คำถามเป็นสีชมพู คำตอบเป็นสีทอง คั่นด้วย | ----

  function splitTeach(v) {
    const i = v.indexOf('|');
    if (i < 0) return { q: v, sep: false, a: '' };
    return { q: v.slice(0, i), sep: true, a: v.slice(i + 1) };
  }

  // ทับซ้อนสีบนช่องพิมพ์ (ข้อความในช่องพิมพ์โปร่งใส แสดงสีจากชั้นนี้แทน)
  function renderMirror() {
    const input = $('mim-teach-input');
    const mirror = $('mim-teach-mirror');
    const parts = splitTeach(input.value);
    mirror.textContent = '';
    if (parts.q) mirror.appendChild(el('span', 'mim-tq', parts.q));
    if (parts.sep) mirror.appendChild(el('span', 'mim-tsep', '|'));
    if (parts.a) mirror.appendChild(el('span', 'mim-ta', parts.a));
    // ปลายบรรทัดว่างต้องมีความสูงจริงเพื่อให้ตำแหน่งตรงกับช่องพิมพ์
    mirror.appendChild(document.createTextNode(' '));
    syncMirrorScroll();
  }

  function syncMirrorScroll() {
    const input = $('mim-teach-input');
    const mirror = $('mim-teach-mirror');
    mirror.scrollTop = input.scrollTop;
  }

  // ปุ่มคำถาม: เปิดช่องสอน แล้วกดซ้ำเพื่อใส่คำตอบ (คั่น | ให้เอง) และกดอีกครั้งเพื่อปิด
  function onQaButton() {
    if (!state.teachOpen) {
      openTeach('');
      return;
    }
    const input = $('mim-teach-input');
    if (input.value.indexOf('|') < 0) {
      input.value = input.value.replace(/\s+$/, '') + ' | ';
      renderMirror();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      refreshQa();
      return;
    }
    closeTeach();
  }

  // ค้นเว็บหาคำตอบ: เฉพาะตอนผู้ใช้เปิดสวิตช์ค้นเว็บไว้ ผลเข้าถาดรอยืนยัน ไม่เข้าความรู้เอง
  function webOn() {
    return Boolean(window.ninoWeb && typeof window.ninoWeb.on === 'function' && window.ninoWeb.on() && E().WebCand);
  }

  function webButton(question) {
    const btn = el('button', 'mim-bub-act mim-bub-web', 'ค้นเว็บหาคำตอบ');
    btn.type = 'button';
    btn.addEventListener('click', function () { lookupWeb(question, btn); });
    return btn;
  }

  async function lookupWeb(question, btn) {
    if (!state.store || !webOn()) {
      bubble('nino', 'การค้นเว็บปิดอยู่ เปิดสวิตช์ค้นเว็บก่อนค่ะ', '', null, 'mim');
      return;
    }
    const N = E();
    btn.disabled = true;
    btn.textContent = 'กำลังค้นเว็บ...';
    let results = [];
    let errs = [];
    try {
      results = await window.ninoWeb.search(question, { wiki: true, perSource: 6 });
      errs = Array.isArray(results && results.errs) ? results.errs : [];
    } catch (e) {
      errs = [String((e && e.message) || e).slice(0, 160)];
    }
    const found = N.WebCand.candidates(question, results);
    const added = N.WebCand.queue(state.store, found);
    state.store.save();
    btn.disabled = false;
    btn.textContent = 'ค้นเว็บอีกครั้ง';
    if (!found.length) {
      const why = errs.length ? ' (' + errs[0] + ')' : '';
      bubble('nino', 'ค้นเว็บแล้วไม่พบประโยคนิยามที่ตรงกับคำถามนี้' + why + ' มิ้มจึงยังไม่จำอะไรเพิ่มค่ะ', '', null, 'mim');
    } else if (!added) {
      bubble('nino', 'ผลค้นเว็บเรื่องนี้มีอยู่ในความรู้หรือในรายการรอยืนยันแล้วค่ะ', '', null, 'mim');
    } else {
      bubble('nino', 'พบ ' + found.length + ' ข้อจากเว็บ แต่ยังไม่ได้จำค่ะ กดปุ่มคำถาม (สอนมิ้ม) เพื่อดูรายการ "รอยืนยันจากเว็บ" แล้วกดยืนยันหรือทิ้งเองทีละข้อ', '', null, 'mim');
    }
    renderTray();
    refreshBar();
  }

  function renderTray() {
    const box = $('mim-tray');
    if (!box) return;
    const N = E();
    const rows = state.store && N.WebCand ? N.WebCand.list(state.store) : [];
    box.textContent = '';
    box.hidden = rows.length === 0;
    if (!rows.length) return;
    const head = el('div', 'mim-tray-head');
    head.appendChild(el('div', 'mim-teach-label', 'รอยืนยันจากเว็บ (ยังไม่ได้จำ ต้องกดยืนยันเองทุกข้อ):'));
    const all = el('button', 'mim-bub-act mim-bub-teach', 'ยืนยันทั้งหมด');
    all.type = 'button';
    all.addEventListener('click', function () {
      rows.forEach(function (c) { N.WebCand.confirm(state.store, c.id); });
      bubble('nino', 'ยืนยันผู้สมัครทั้งหมดแล้วค่ะ รายการที่มีความรู้เดิมจะไม่ถูกเขียนทับ', '', null, 'mim');
      renderTray();
      refreshBar();
    });
    head.appendChild(all);
    box.appendChild(head);
    rows.forEach(function (c) {
      const row = el('div', 'mim-tray-row');
      row.appendChild(el('div', 'mim-tray-q', c.q));
      row.appendChild(el('div', 'mim-tray-a', c.a));
      const where = (c.title || c.host || c.src) + (c.url ? ' · ' + c.url : '');
      row.appendChild(el('div', 'mim-tray-meta', 'แหล่ง: ' + where + ' · ' + N.Sources.trustLabel(c.trust)));
      const acts = el('div', 'mim-bub-acts');
      const ok = el('button', 'mim-bub-act mim-bub-teach', 'ยืนยัน จำไว้');
      ok.type = 'button';
      ok.addEventListener('click', function () { confirmCand(c.id); });
      const no = el('button', 'mim-bub-act', 'ทิ้ง');
      no.type = 'button';
      no.addEventListener('click', function () { N.WebCand.dismiss(state.store, c.id); renderTray(); });
      acts.appendChild(ok);
      acts.appendChild(no);
      row.appendChild(acts);
      box.appendChild(row);
    });
  }

  function confirmCand(id) {
    const r = E().WebCand.confirm(state.store, id);
    let msg = TEACH_RESULT[r.status] || 'จำไม่ได้ค่ะ';
    if (r.status === 'new') msg = 'จำแล้วค่ะ (จากเว็บ ยืนยันโดยคุณ) ต่อไปมิ้มตอบเรื่องนี้ได้เองแม้ออฟไลน์';
    if (r.status === 'exists') msg = 'มีความรู้เรื่องนี้อยู่แล้ว จึงไม่เขียนทับค่ะ';
    bubble('nino', msg, '', null, 'mim');
    renderTray();
    refreshBar();
  }

  // รายการคำถามล่าสุดที่มิ้มตอบไม่ได้ กดเพื่อเติมช่องสอนพร้อมคำถามนั้น
  function renderGaps() {
    const box = $('mim-gaps');
    if (!box) return;
    const list = (state.store && Array.isArray(state.store.qgaps) ? state.store.qgaps : []).slice(-5).reverse();
    box.textContent = '';
    box.hidden = list.length === 0;
    if (!list.length) return;
    box.appendChild(el('div', 'mim-teach-label', 'คำถามล่าสุดที่มิ้มยังตอบไม่ได้ (กดเพื่อสอน):'));
    list.forEach(function (q) {
      const btn = el('button', 'mim-bub-act mim-gap-chip', q);
      btn.type = 'button';
      btn.addEventListener('click', function () { openTeach(q + ' | '); });
      box.appendChild(btn);
    });
  }

  function openTeach(value) {
    const row = $('mim-teach');
    const input = $('mim-teach-input');
    state.teachOpen = true;
    row.hidden = false;
    input.value = value;
    renderGaps();
    renderTray();
    renderMirror();
    refreshQa();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function closeTeach() {
    state.teachOpen = false;
    $('mim-teach').hidden = true;
    $('mim-teach-input').value = '';
    renderMirror();
    refreshQa();
    $('mim-input').focus();
  }

  // ข้อความบนปุ่มเปลี่ยนตามขั้น: คำถาม -> คำตอบ -> ปิดสอน
  function refreshQa() {
    const btn = $('mim-qa');
    if (!state.teachOpen) {
      btn.textContent = 'คำถาม';
      btn.classList.remove('on');
    } else if ($('mim-teach-input').value.indexOf('|') < 0) {
      btn.textContent = 'คำตอบ';
      btn.classList.add('on');
    } else {
      btn.textContent = 'ปิดสอน';
      btn.classList.add('on');
    }
  }

  function sendTeach() {
    const input = $('mim-teach-input');
    const parts = splitTeach(input.value);
    const q = parts.q.trim();
    const a = parts.a.trim();
    if (!parts.sep) {
      bubble('nino', 'ใส่คำตอบก่อนนะคะ กดปุ่มคำตอบเพื่อให้ระบบใส่ | ให้ หรือพิมพ์ | เองก็ได้ค่ะ', '', null, 'mim');
      return;
    }
    if (!q || !a) {
      bubble('nino', 'ต้องมีทั้งคำถามและคำตอบค่ะ', '', null, 'mim');
      return;
    }
    const line = 'สอน ' + q + ' | ' + a;
    bubble('user', line, '');
    closeTeach();
    // ChatNode รับคำสั่งสอนทางบัส แล้วตอบยืนยันทาง chat.out
    state.lastQ = '';
    state.bus.emit('chat.in', line);
  }

  function refreshBar() {
    if (!state.store) return;
    const on = !!state.store.settings.enabled;
    const nadia = NADIA().status().on;
    let text;
    if (nadia) {
      const label = apiLabel();
      text = 'ออนไลน์ · ' + NADIA().NAME + (label ? ' (' + label + ')' : '');
      if (!online()) text += ' · ตอนนี้ไม่มีเครือข่าย จะใช้มิ้มออฟไลน์แทน';
    } else {
      text = 'ออฟไลน์ · มิ้ม';
    }
    text += on ? ' · พร้อมใช้งาน' : ' · ยังไม่เปิดใช้งาน กดปุ่มเพื่อเริ่มใช้';
    $('mim-status').textContent = text;
    $('mim-enable').hidden = on;

    const nbtn = $('mim-nadia');
    nbtn.textContent = nadia ? 'นาเดียร์: เปิด' : 'นาเดียร์: ปิด';
    nbtn.classList.toggle('on', nadia);
    nbtn.setAttribute('aria-pressed', nadia ? 'true' : 'false');
  }

  function enable() {
    state.store.settings.enabled = true;
    state.store.save();
    refreshBar();
    bubble('nino', 'เปิดใช้งานแล้วค่ะ ลองถามได้เลย', '', null, 'mim');
  }

  function toggleNadia() {
    if (!state.booted) return;
    const s = NADIA().status();
    if (s.on) {
      NADIA().setOn(false);
      refreshBar();
      bubble('nino', 'ปิดพี่นาเดียร์แล้วค่ะ กลับมาตอบแบบออฟไลน์ด้วยความรู้ของมิ้มเอง', '', null, 'mim');
      return;
    }
    if (!apiReady()) {
      bubble('nino', 'ยังไม่ได้ตั้งค่า API ในแอปค่ะ ไปตั้งค่า API (เช่น Gemini) ในหน้าตั้งค่าก่อน แล้วค่อยกดนาเดียร์อีกครั้ง ระหว่างนี้มิ้มยังตอบแบบออฟไลน์ได้ค่ะ', '', null, 'mim');
      return;
    }
    const ok = window.confirm('เปิดพี่นาเดียร์\n\nคำถามที่คุณพิมพ์และความรู้ที่เกี่ยวข้องจะถูกส่งไปยัง API ที่ตั้งไว้ในแอป เฉพาะตอนที่พิมพ์ถามเท่านั้น ปิดได้ทุกเมื่อ\n\nยืนยันไหม');
    if (!ok) return;
    NADIA().setOn(true);
    refreshBar();
    bubble('nino', NADIA().NAME + ' เข้าเวรแล้วค่ะ คำถามจะไปถึง ' + (apiLabel() || 'API ที่ตั้งไว้') + ' และคำตอบจาก API จะยังไม่ยืนยัน จนกว่าคุณจะกดจำคำตอบนั้นเอง', '', null, 'mim');
  }

  function send() {
    const input = $('mim-input');
    const text = input.value.trim();
    if (!text || !state.booted) return;
    input.value = '';
    bubble('user', text, '');
    state.lastQ = text;
    if (NADIA().status().on) {
      if (online() && apiReady() && typeof window.geminiGenerate === 'function') {
        askNadia(text);
      } else {
        bubble('nino', online()
          ? 'ตอนนี้ยังไม่ได้ตั้งค่า API ในแอป จึงใช้มิ้มออฟไลน์ตอบค่ะ'
          : 'ตอนนี้ไม่มีเครือข่าย จึงใช้มิ้มออฟไลน์ตอบค่ะ', '', null, 'mim');
        state.bus.emit('chat.in', text);
      }
    } else {
      // ChatNode รับข้อความทางบัส ตอบกลับทาง chat.out ซึ่งแสดงผลด้านบน
      state.bus.emit('chat.in', text);
    }
    input.focus();
  }

  // ถามพี่นาเดียร์ ถ้าใช้ไม่ได้ให้กลับไปใช้มิ้มออฟไลน์ทันที และบอกผู้ใช้ว่าทำไม
  function askNadia(text) {
    const waiting = bubble('nino', NADIA().NAME + ' กำลังตอบ...', '', null, 'nadia');
    NADIA().ask({ question: text, store: state.store, generate: function (a) { return window.geminiGenerate(Object.assign({}, a, { noLocal: true })); } }).then(function (r) {
      waiting.remove();
      if (r.ok) {
        bubble('nino', r.text,
          NADIA().NAME + ' · ผ่าน API ที่ตั้งไว้ · ยังไม่ยืนยัน · อ้างความรู้ ' + r.usedKnowledge + ' รายการ',
          { teach: { q: text, a: r.text } }, 'nadia');
      } else {
        bubble('nino', NADIA().NAME + ' ตอบไม่ได้ตอนนี้ (' + r.error + ') จึงใช้มิ้มออฟไลน์ตอบแทนค่ะ', '', null, 'nadia');
        state.bus.emit('chat.in', text);
      }
      refreshBar();
    });
  }

  function exportText() {
    if (!state.booted) return;
    const text = E().TextPipe.generate(state.store.entries);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mim-knowledge-' + new Date().toISOString().slice(0, 10) + '.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    bubble('nino', 'ส่งออกความรู้ ' + state.store.entries.length + ' รายการเป็นไฟล์ข้อความแล้วค่ะ', '', null, 'mim');
  }

  function importText(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || !state.booted) return;
    const reader = new FileReader();
    reader.onload = function () {
      const r = E().TextPipe.ingest(state.store, String(reader.result || ''));
      state.store.save();
      refreshBar();
      const c = r.counts || {};
      bubble('nino',
        'นำเข้าแล้วค่ะ เพิ่มใหม่ ' + (c.new || 0) + ' รายการ อัปเดต ' + (c.updated || 0) +
        ' ไม่ถูกต้อง ' + (c.invalid || 0) + ' บรรทัดที่อ่านไม่ได้ ' + (r.errors ? r.errors.length : 0) + ' บรรทัด', '', null, 'mim');
    };
    reader.readAsText(file);
  }

  function open() {
    build();
    loadFonts();
    boot();
    state.root.hidden = false;
    state.open = true;
    refreshBar();
    refreshQa();
    const btn = $('mode-mim');
    if (btn) btn.classList.add('active');
    // ปิดสถานะเลือกของโหมดเดิม ให้เห็นว่าตอนนี้อยู่ในมิ้ม
    ['mode-code', 'mode-roleplay'].forEach(function (id) {
      const b = $(id);
      if (b) b.classList.remove('active');
    });
    $('mim-input').focus();
  }

  function close() {
    if (!state.root) return;
    state.root.hidden = true;
    state.open = false;
    const btn = $('mode-mim');
    if (btn) btn.classList.remove('active');
    // คืนสถานะปุ่มโหมดให้ตรงกับโหมดจริงของตัวละคร
    if (typeof window.updateModeToggle === 'function') window.updateModeToggle();
  }

  function toggle() {
    if (state.open) close();
    else open();
  }

  window.NINO_MIM = {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: function () { return state.open; }
  };
})();
