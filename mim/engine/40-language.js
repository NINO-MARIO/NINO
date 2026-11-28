/* มิ้ม | 40-language
 * โหนดภาษา: ช่องเสียบโมเดล (adapter) ตัวปัจจุบันเป็น n-gram ระดับตัวอักษร ทดลองเท่านั้น
 *
 * สัญญาของ adapter (ต้องมีทุกข้อ):
 *   id: string
 *   ready(): boolean
 *   train(texts: string[]): void
 *   generate(prompt: string, rng: () => number, maxChars: number): string | null
 *
 * ผลลัพธ์ต้องเป็นภาษาไทยล้วน: ตัวอักษรที่ไม่ใช่ไทยจะถูกคัดออกก่อนส่งให้ผู้ใช้
 */
(function (root) {
  'use strict';
  const NINO = root.NINO;
  const Text = NINO.Text;

  const MAX_CORPUS = 2000;
  const MAX_CHARS = 160;

  function pick(row, rng) {
    let total = 0;
    for (const c of row.values()) total += c;
    let r = rng() * total;
    for (const [ch, c] of row) {
      r -= c;
      if (r < 0) return ch;
    }
    return row.keys().next().value;
  }

  class NgramModel {
    constructor(order) {
      this.id = 'ngram-th';
      this.order = order || 3;
      this.tables = [];
      this.corpusSize = 0;
    }

    ready() {
      return this.corpusSize > 0;
    }

    train(texts) {
      const order = this.order;
      const tables = [];
      for (let k = 0; k <= order; k++) tables.push(new Map());

      let used = 0;
      for (const raw of texts.slice(-MAX_CORPUS)) {
        const s = Text.keepThai(raw);
        if (!s) continue;
        const seq = '\n' + s + '\n';
        used++;
        for (let i = 1; i < seq.length; i++) {
          const next = seq[i];
          for (let k = 0; k <= order && k <= i; k++) {
            const ctx = k === 0 ? '' : seq.slice(i - k, i);
            let row = tables[k].get(ctx);
            if (!row) {
              row = new Map();
              tables[k].set(ctx, row);
            }
            row.set(next, (row.get(next) || 0) + 1);
          }
        }
      }
      this.tables = tables;
      this.corpusSize = used;
    }

    _sample(seq, rng) {
      for (let k = Math.min(this.order, seq.length); k >= 1; k--) {
        const row = this.tables[k].get(seq.slice(-k));
        if (row) return pick(row, rng);
      }
      return null;
    }

    generate(prompt, rng, maxChars) {
      if (!this.ready()) return null;
      const tail = Text.keepThai(prompt).replace(/\s+/g, '');

      // ต้องรู้จักท้ายคำถามอย่างน้อยหนึ่งตัวอักษร ไม่งั้นไม่ตอบ (กันการสุ่มมั่ว)
      let seq = null;
      for (let k = Math.min(this.order, tail.length); k >= 1; k--) {
        const ctx = tail.slice(-k);
        if (this.tables[k].has(ctx)) { seq = ctx; break; }
      }
      if (seq === null) return null;

      let out = '';
      while (out.length < maxChars) {
        const next = this._sample(seq, rng);
        if (next === null || next === '\n') break;
        out += next;
        seq += next;
        if (seq.length > this.order) seq = seq.slice(-this.order);
      }
      out = out.trim();
      return out.length >= 4 ? out : null;
    }
  }

  class LanguageNode extends NINO.Node {
    constructor(id, bus, store, opts) {
      super(id, bus);
      this.store = store;
      this.rng = (opts && opts.rng) || Math.random;
      this.active = new NgramModel(3);
      this._trainedVersion = -1;
    }

    // เปลี่ยนโมเดลที่ใช้งานอยู่ (ใช้เมื่อมี adapter ใหม่ เช่นโมเดลประสาท)
    use(adapter) {
      if (!adapter || typeof adapter.generate !== 'function' || typeof adapter.train !== 'function') {
        throw new Error('adapter ไม่ครบตามสัญญา');
      }
      this.active = adapter;
      this._trainedVersion = -1;
    }

    generate(question) {
      if (!this.store.settings.generator) return null;
      if (this._trainedVersion !== this.store.version) {
        this.active.train(this.store.entries.map(e => e.a));
        this._trainedVersion = this.store.version;
      }
      if (!this.active.ready()) return null;
      return this.active.generate(question, this.rng, MAX_CHARS);
    }
  }

  NINO.NgramModel = NgramModel;
  NINO.LanguageNode = LanguageNode;
})(typeof globalThis !== 'undefined' ? globalThis : this);
