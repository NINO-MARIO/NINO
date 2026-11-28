/* มิ้ม | 00-core
 * แกนกลาง: Bus (ระบบส่งข้อความระหว่างโหนด), Node (หน่วยประมวลผล), Graph (ผังการเชื่อมโหนด)
 * ทุกโหนดคุยกันผ่านหัวข้อ (topic) เท่านั้น ไม่เรียกตรงข้ามกัน เพื่อให้ถอด/เปลี่ยน/เพิ่มโหนดได้โดยไม่กระทบส่วนอื่น
 */
(function (root) {
  'use strict';
  var NINO = root.NINO || (root.NINO = {});
  NINO.VERSION = '0.9.1';

  class Bus {
    constructor() {
      this.handlers = new Map();
    }
    on(topic, fn) {
      if (!this.handlers.has(topic)) this.handlers.set(topic, []);
      this.handlers.get(topic).push(fn);
      return () => this.off(topic, fn);
    }
    off(topic, fn) {
      const list = this.handlers.get(topic);
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    }
    emit(topic, payload) {
      const list = (this.handlers.get(topic) || []).slice();
      for (const fn of list) {
        try {
          fn(payload);
        } catch (err) {
          if (topic !== 'error') this.emit('error', { topic, err });
          else console.error(err);
        }
      }
    }
  }

  class Node {
    constructor(id, bus) {
      this.id = id;
      this.bus = bus || null;
      this.inputs = [];
      this.outputs = [];
      this._subs = [];
    }
    // ประกาศการเชื่อมต่อตั้งแต่ตอนสร้างโหนด เพื่อให้ Graph.describe() เห็นผังครบเสมอ
    declareOutput(topic) {
      if (!this.outputs.includes(topic)) this.outputs.push(topic);
    }
    listen(topic, fn) {
      if (!this.inputs.includes(topic)) this.inputs.push(topic);
      this._subs.push(this.bus.on(topic, fn));
    }
    send(topic, payload) {
      this.declareOutput(topic);
      this.bus.emit(topic, payload);
    }
    dispose() {
      this._subs.forEach(off => off());
      this._subs = [];
    }
  }

  class Graph {
    constructor() {
      this.bus = new Bus();
      this._nodes = new Map();
    }
    add(node) {
      if (this._nodes.has(node.id)) throw new Error('รหัสโหนดซ้ำ: ' + node.id);
      this._nodes.set(node.id, node);
      return node;
    }
    get(id) {
      return this._nodes.get(id) || null;
    }
    describe() {
      return [...this._nodes.values()].map(n => ({ id: n.id, in: n.inputs.slice(), out: n.outputs.slice() }));
    }
  }

  NINO.Bus = Bus;
  NINO.Node = Node;
  NINO.Graph = Graph;
})(typeof globalThis !== 'undefined' ? globalThis : this);
