(function () {
  var INFO = {
    HAPPY: { label: 'ดีใจ', color: '#F2C275', desc: 'ตอนดีใจ ขำ ตื่นเต้น อบอุ่น ชื่นชม' },
    SAD: { label: 'เศร้า', color: '#79C0FF', desc: 'ตอนเหงา ผิดหวัง เห็นใจ ปลอบ เงียบลง' },
    SASSY: { label: 'กวน', color: '#F28AB2', desc: 'ตอนแซว ประชด มั่นใจ ขี้เล่น' },
    THINKING: { label: 'คิดวิเคราะห์', color: '#9BE0BC', desc: 'ตอนวิเคราะห์ อธิบายเหตุผล ตั้งสมมติฐาน ลงรายละเอียด' },
    ANGRY: { label: 'หงุดหงิด', color: '#F26D78', desc: 'ตอนหงุดหงิด เข้มงวด ตักเตือน ไม่พอใจ' },
    NEUTRAL: { label: 'ปกติ', color: '#A79BB3', desc: 'ตอนคุยทั่วไป ข้อเท็จจริง ไม่มีอารมณ์เด่น' }
  };
  window.ninoMood = {
    states: ['HAPPY', 'SAD', 'SASSY', 'THINKING', 'ANGRY', 'NEUTRAL'],
    info: function (s) { return INFO[s] || INFO.NEUTRAL; }
  };
})();
