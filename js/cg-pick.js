(function () {
  var KEY = 'nino.cg.on';
  var CATS = ['HAPPY', 'SAD', 'SASSY', 'THINKING', 'ANGRY', 'NEUTRAL'];
  var HINT = {
    HAPPY: 'ดีใจ ขำ ชื่นชม อบอุ่น',
    SAD: 'เหงา ผิดหวัง เห็นใจ ปลอบ',
    SASSY: 'แซว ประชด มั่นใจ ขี้เล่น',
    THINKING: 'วิเคราะห์ อธิบายเหตุผล เป็นขั้นตอน',
    ANGRY: 'หงุดหงิด เข้มงวด ตักเตือน',
    NEUTRAL: 'คุยทั่วไป ข้อเท็จจริง ไม่มีอารมณ์เด่น'
  };
  var counts = {};

  function label(c) { return window.ninoMood ? window.ninoMood.info(c).label : c; }

  function strip(text) {
    return String(text || '')
      .replace(/\[\[\s*CG\s*:\s*[A-Za-z]*\s*\]\]/gi, '')
      .replace(/\[\[\s*CG\b[^\]]*$/i, '')
      .replace(/\s+$/, '');
  }

  function block(cnt) {
    var filled = CATS.filter(function (c) { return cnt[c] > 0; });
    if (!filled.length) return '';
    var lines = filled.map(function (c) {
      return '- ' + c + ' (' + label(c) + '): ' + HINT[c] + ' · มี ' + cnt[c] + ' รายการ';
    });
    return '\n\n## ห้องฟิล์ม CG (ผู้ใช้เปิดให้ใช้)\n' +
      'ผู้ใช้เตรียมภาพหรือวิดีโอไว้ตามอารมณ์ดังนี้ เลือกได้เฉพาะหมวดที่ระบุ:\n' +
      lines.join('\n') + '\n' +
      'ท้ายคำตอบทุกครั้งให้ใส่แท็กหนึ่งแท็ก: [[CG:ชื่อหมวด]] เมื่ออารมณ์ของคำตอบตรงกับหมวดนั้น หรือ [[CG:NONE]] เมื่อไม่ควรแสดงภาพ ' +
      'แท็กต้องอยู่ท้ายสุดของคำตอบ ห้ามพิมพ์แท็กนี้ในเนื้อความ และห้ามกล่าวถึงแท็กหรือห้องฟิล์มในคำตอบ\n';
  }

  function take(text, cnt, enabled) {
    var clean = strip(text), tags = [], re = /\[\[\s*CG\s*:\s*([A-Za-z]+)\s*\]\]/gi, m;
    while ((m = re.exec(String(text || '')))) tags.push(m[1].toUpperCase());
    if (!enabled) return { text: clean, cg: '' };
    var last = tags.length ? tags[tags.length - 1] : 'NONE';
    var ok = CATS.indexOf(last) >= 0 && cnt[last] > 0;
    return { text: clean, cg: ok ? last : 'NONE' };
  }

  function on() { return localStorage.getItem(KEY) === '1'; }

  function setOn(v) {
    localStorage.setItem(KEY, v ? '1' : '0');
    if (typeof window.renderMessages === 'function') window.renderMessages();
    window.dispatchEvent(new CustomEvent('nino-cg-pick-changed'));
  }

  function refresh() {
    if (!window.ninoCg) return Promise.resolve();
    return Promise.all(CATS.map(function (c) {
      return window.ninoCg.list(c).then(function (items) { counts[c] = items.length; });
    })).then(function () { return counts; }, function () {});
  }

  window.ninoCgPick = {
    on: on,
    setOn: setOn,
    block: function () { return on() ? block(counts) : ''; },
    take: function (text) { return take(text, counts, on()); },
    strip: strip,
    refresh: refresh,
    counts: function () { return Object.assign({}, counts); },
    pure: { block: block, take: take, strip: strip, CATS: CATS }
  };

  window.addEventListener('nino-cg-changed', refresh);
  refresh();
})();
