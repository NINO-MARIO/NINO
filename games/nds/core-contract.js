/* สัญญาระหว่างหน้าห้อง NDS กับแกนจำลอง (wasm). แกนทุกตัวต้อง export สิ่งใน REQUIRED
   ถ้าขาดแม้แต่ตัวเดียว หน้าห้องจะไม่เริ่มใช้แกนนั้น (ดู CORE-CONTRACT.md)
   OPTIONAL ยังไม่ถูกใช้ในหน้าห้อง แต่ประกาศไว้เพื่อให้แกนจริงรองรับในอนาคต */
var NDS_CORE = {
  FRAME_BYTES: 256 * 384 * 4,
  /* audioBuffer() คืน Int16Array สเตอริโอแบบสลับช่อง (L,R,L,R...) ที่อัตรา AUDIO_RATE */
  AUDIO_RATE: 32768,
  AUDIO_CHANNELS: 2,
  REQUIRED: ['version', 'loadBios', 'loadRom', 'runFrame', 'framebuffer'],
  OPTIONAL: ['status', 'setKeys', 'audioBuffer', 'reset', 'setTouch', 'saveData', 'loadSaveData', 'skipBios', 'saveState', 'loadState'],
  /* คืน {ok, missing, optional, isTest}. isTest = แกนทดสอบ (phase0a หรือชื่อที่มีคำว่า TEST) */
  check: function (core) {
    if (!core) return { ok: false, missing: ['แกน'], optional: NDS_CORE.OPTIONAL.slice(), isTest: false };
    var missing = NDS_CORE.REQUIRED.filter(function (k) { return core[k] === undefined || core[k] === null; });
    if (typeof core.version !== 'string') {
      if (missing.indexOf('version') < 0) missing.push('version (ต้องเป็นข้อความ)');
    }
    var optional = NDS_CORE.OPTIONAL.filter(function (k) { return core[k] === undefined || core[k] === null; });
    var v = String(core.version || '');
    return { ok: missing.length === 0, missing: missing, optional: optional, isTest: /phase0a|TEST/i.test(v) };
  }
};
