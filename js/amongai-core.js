(function(){
var fs={existsSync:function(){return false;},mkdirSync:function(){},openSync:function(){return 0;},writeSync:function(){},closeSync:function(){},readFileSync:function(){throw new Error('no fs');},writeFileSync:function(){},appendFileSync:function(){}};
var path={join:function(){return [].slice.call(arguments).join('/');}};
var mods={};
mods["rng"] = (function(){
function  createRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    shuffle(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

function  randomSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}
return {createRng: createRng, randomSeed: randomSeed};
})();
mods["i18n"] = (function(){

const TEXT = {
  th: {
    arrived: 'มาถึง {room}{who}',
    who_list: ' — เห็น: {list}',
    who_none: ' — ไม่มีใคร',
    shadows: 'เงา {n} คน (มืด มองไม่เห็นสี)',
    entered: '{name} เดินเข้ามาใน {room}',
    passed: 'เดินสวนกับ {name} ในทางเดิน {a}–{b}',
    spotted: 'เห็น {name} ที่ {where}',
    left_toward: '{name} ออกจาก {room} ไปทาง {to}',
    lost: '{name} หายไปจากสายตา',
    body: 'เจอศพ {name} ที่ {room}!',
    kill_seen: 'เห็นกับตา! {killer} ฆ่า {victim} ที่ {room}!!',
    kill_seen_dark: 'ในความมืด เงาใครบางคนฆ่า {victim} ที่ {room}!',
    you_killed: 'ฆ่า {victim} ที่ {room} (คนที่น่าจะเห็น: {witnesses})',
    you_died: 'ถูก {killer} ฆ่าที่ {room}',
    nobody: 'ไม่มี',
    vent_in: 'เห็น {name} มุดลง vent ใน {room}!!',
    vent_out: 'เห็น {name} โผล่ขึ้นมาจาก vent ใน {room}!!',
    you_vented: 'มุด vent จาก {from} ไป {to}',
    task_visual: 'เห็น {name} ทำ {task} ที่ {room} มีแอนิเมชันชัดเจน (งาน visual = ลูกเรือแน่)',
    task_fake_visual: '{name} ยืนที่จุด {task} ใน {room} แต่ไม่มีแอนิเมชันเลย',
    task_seen: '{name} ยืนทำงานอยู่ที่ {room}',
    task_done: 'ทำ {task} ที่ {room} เสร็จ ({done}/{total})',
    fake_done: 'แกล้งทำ {task} ที่ {room} เสร็จ',
    fixing: '{name} กำลังซ่อม {what} ที่ {room}',
    sab_lights: 'ไฟดับ! ตอนนี้เห็นแค่คนในห้องเดียวกันและไม่เห็นสี',
    sab_lights_imp: 'ไฟดับแล้ว (ลูกเรือไม่เห็นสี แต่เรายังมองเห็นปกติ)',
    sab_reactor: 'Reactor กำลังจะระเบิด! ต้องมี 2 คนไปซ่อมที่ Reactor ภายใน {secs} วิ',
    you_sabotaged: 'สั่ง sabotage {kind}',
    fixed_lights: 'ไฟกลับมาแล้ว',
    fixed_reactor: 'Reactor ปลอดภัยแล้ว',
    opportunity: 'อยู่ตามลำพังกับ {name} ใน {room} ไม่มีพยาน และ kill พร้อมใช้',
    meeting_body: 'ประชุม! {caller} เจอศพ {body} ที่ {room}',
    meeting_button: 'ประชุมฉุกเฉิน! {caller} กดปุ่ม',
    dead_now: 'ตอนนี้ตายแล้ว: {list}',
    ejected: 'ผลโหวต: {name} ถูกโหวตออก{role}',
    ejected_imp: ' — เป็น Impostor',
    ejected_crew: ' — ไม่ใช่ Impostor',
    no_eject: 'ผลโหวต: ไม่มีใครถูกโหวตออก ({why})',
    why_tie: 'คะแนนเสมอ',
    why_skip: 'ส่วนใหญ่ skip',
    rejected: "ทำ '{action}' ไม่ได้: {reason}",
    lost_follow: 'ตาม {name} ไม่ทันแล้ว',
    heard: '{name} พูดว่า: "{text}"',
    heard_dark: 'เสียงจากเงาในความมืดพูดว่า: "{text}"',
    you_said: 'พูดว่า: "{text}" ({who})',
    said_heard: 'คนที่ได้ยิน: {list}',
    said_nobody: 'ไม่มีใครอยู่ใกล้ ไม่มีใครได้ยิน',
    said_missed: '{list} ไม่อยู่ในระยะ ไม่ได้ยิน',
    corridor: 'ทางเดิน',
    stuck: 'เดินติดอยู่ ไปต่อไม่ได้',
    you_died_unseen: 'ถูกฆ่าที่ {room} ไม่ทันเห็นว่าใคร',
    sab_o2: 'O2 กำลังจะหมด! ต้องไปกดรหัสที่ O2 และ Admin ภายใน {secs} วิ',
    sab_comms: 'Comms ถูก sabotage! มองไม่เห็นรายการ task',
    fixed_o2: 'O2 กลับมาแล้ว',
    fixed_comms: 'Comms กลับมาแล้ว',
  },
  en: {
    arrived: 'Arrived at {room}{who}',
    who_list: ' — saw: {list}',
    who_none: ' — nobody here',
    shadows: '{n} shadow(s), too dark to see colours',
    entered: '{name} walked into {room}',
    passed: 'Passed {name} in the corridor {a}–{b}',
    spotted: 'Spotted {name} at {where}',
    left_toward: '{name} left {room} heading to {to}',
    lost: 'Lost sight of {name}',
    body: 'Found the body of {name} in {room}!',
    kill_seen: 'SAW IT: {killer} killed {victim} in {room}!!',
    kill_seen_dark: 'In the dark, a shadow killed {victim} in {room}!',
    you_killed: 'You killed {victim} in {room} (possible witnesses: {witnesses})',
    you_died: 'You were killed by {killer} in {room}',
    nobody: 'none',
    vent_in: 'Saw {name} jump into a vent in {room}!!',
    vent_out: 'Saw {name} climb out of a vent in {room}!!',
    you_vented: 'You vented from {from} to {to}',
    task_visual: 'Saw {name} do {task} in {room} with the animation playing (visual task = crewmate)',
    task_fake_visual: '{name} stood at {task} in {room} but no animation played',
    task_seen: '{name} was doing a task in {room}',
    task_done: 'Finished {task} in {room} ({done}/{total})',
    fake_done: 'Pretended to do {task} in {room}',
    fixing: '{name} was fixing {what} in {room}',
    sab_lights: 'Lights out! You only see people in your room, and not their colours',
    sab_lights_imp: 'Lights are out (crewmates cannot see colours; you still can)',
    sab_reactor: 'Reactor meltdown! Two players must fix it in Reactor within {secs}s',
    you_sabotaged: 'You sabotaged {kind}',
    fixed_lights: 'Lights are back on',
    fixed_reactor: 'Reactor is safe again',
    opportunity: 'Alone with {name} in {room}, no witnesses, kill is ready',
    meeting_body: 'Meeting! {caller} found the body of {body} in {room}',
    meeting_button: 'Emergency meeting! {caller} pressed the button',
    dead_now: 'Dead so far: {list}',
    ejected: 'Vote result: {name} was ejected{role}',
    ejected_imp: ' — an Impostor',
    ejected_crew: ' — not an Impostor',
    no_eject: 'Vote result: nobody was ejected ({why})',
    why_tie: 'tie',
    why_skip: 'most skipped',
    rejected: "Could not do '{action}': {reason}",
    lost_follow: 'Lost track of {name}',
    heard: '{name} said: "{text}"',
    heard_dark: 'A voice in the dark said: "{text}"',
    you_said: 'You said: "{text}" ({who})',
    said_heard: 'heard by {list}',
    said_nobody: 'nobody was near enough to hear',
    said_missed: '{list} not in earshot, did not hear',
    corridor: 'a corridor',
    stuck: 'Got stuck and could not go on',
    you_died_unseen: 'You were killed in {room} without seeing who did it',
    sab_o2: 'O2 is running out! Enter the codes in O2 and Admin within {secs}s',
    sab_comms: 'Comms sabotaged! The task list is hidden',
    fixed_o2: 'O2 is back',
    fixed_comms: 'Comms are back',
  },
};

function  say(lang, key, vars = {}) {
  const table = TEXT[lang] || TEXT.en;
  const template = table[key] ?? TEXT.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

function  clock(t) {
  const s = Math.max(0, Math.floor(t));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
return {say: say, clock: clock};
})();
mods["engine/map"] = (function(){

const  BOARD = { width: 1200, height: 720 };
const  SPEED = 50;

const  ROOMS = {
  UpperEngine: { x: 170, y: 150, w: 180, h: 120 },
  Reactor: { x: 70, y: 360, w: 100, h: 160 },
  Security: { x: 270, y: 360, w: 120, h: 100 },
  LowerEngine: { x: 170, y: 570, w: 180, h: 120 },
  MedBay: { x: 400, y: 250, w: 140, h: 110 },
  Cafeteria: { x: 620, y: 140, w: 260, h: 180 },
  Weapons: { x: 900, y: 140, w: 160, h: 120 },
  O2: { x: 850, y: 330, w: 120, h: 90 },
  Navigation: { x: 1110, y: 360, w: 150, h: 130 },
  Shields: { x: 940, y: 590, w: 150, h: 110 },
  Communications: { x: 760, y: 640, w: 150, h: 90 },
  Storage: { x: 560, y: 580, w: 180, h: 150 },
  Admin: { x: 720, y: 430, w: 160, h: 110 },
  Electrical: { x: 390, y: 500, w: 140, h: 110 },
};

const  ROOM_NAMES = Object.keys(ROOMS);

const CORRIDORS = [
  ['UpperEngine', 'MedBay'], ['MedBay', 'Cafeteria'], ['Cafeteria', 'Weapons'],
  ['Weapons', 'O2'], ['O2', 'Navigation'], ['Navigation', 'Shields'],
  ['Shields', 'Communications'], ['Communications', 'Storage'], ['Storage', 'Admin'],
  ['Admin', 'Cafeteria'], ['Cafeteria', 'Storage'], ['Storage', 'Electrical'],
  ['Electrical', 'LowerEngine'], ['LowerEngine', 'Reactor'], ['Reactor', 'UpperEngine'],
  ['UpperEngine', 'Security'], ['Security', 'LowerEngine'],
];

const  EDGES = CORRIDORS.map(([a, b]) => {
  const dist = Math.hypot(ROOMS[a].x - ROOMS[b].x, ROOMS[a].y - ROOMS[b].y);
  return { a, b, time: Math.max(2, Math.round(dist / SPEED)) };
});

const  VENT_GROUPS = [
  ['Weapons', 'Navigation'],
  ['Navigation', 'Shields'],
  ['Cafeteria', 'Admin'],
  ['MedBay', 'Security', 'Electrical'],
  ['Reactor', 'UpperEngine', 'LowerEngine'],
];

const  BUTTON_ROOM = 'Cafeteria';
const  SABOTAGE_ROOMS = { lights: 'Electrical', reactor: 'Reactor' };

const  TASKS = [
  { id: 'wires_elec', name: 'Fix Wiring', room: 'Electrical', dur: 4 },
  { id: 'wires_admin', name: 'Fix Wiring', room: 'Admin', dur: 4 },
  { id: 'swipe', name: 'Swipe Card', room: 'Admin', dur: 3 },
  { id: 'calibrate', name: 'Calibrate Distributor', room: 'Electrical', dur: 4 },
  { id: 'divert', name: 'Divert Power', room: 'Electrical', dur: 2 },
  { id: 'scan', name: 'Submit Scan', room: 'MedBay', dur: 10, visual: true },
  { id: 'sample', name: 'Inspect Sample', room: 'MedBay', dur: 6 },
  { id: 'asteroids', name: 'Clear Asteroids', room: 'Weapons', dur: 8, visual: true },
  { id: 'download', name: 'Download Data', room: 'Weapons', dur: 5 },
  { id: 'o2filter', name: 'Clean O2 Filter', room: 'O2', dur: 5 },
  { id: 'garbage', name: 'Empty Garbage', room: 'Storage', dur: 4, visual: true },
  { id: 'fuel', name: 'Fuel Engines', room: 'LowerEngine', dur: 4 },
  { id: 'align_up', name: 'Align Engine Output', room: 'UpperEngine', dur: 3 },
  { id: 'align_low', name: 'Align Engine Output', room: 'LowerEngine', dur: 3 },
  { id: 'reactor_start', name: 'Start Reactor', room: 'Reactor', dur: 8 },
  { id: 'manifolds', name: 'Unlock Manifolds', room: 'Reactor', dur: 4 },
  { id: 'chart', name: 'Chart Course', room: 'Navigation', dur: 3 },
  { id: 'steering', name: 'Stabilize Steering', room: 'Navigation', dur: 2 },
  { id: 'shields', name: 'Prime Shields', room: 'Shields', dur: 3, visual: true },
  { id: 'upload', name: 'Upload Data', room: 'Communications', dur: 5 },
];

const  COLORS = {
  red: '#c51111', blue: '#132ed1', green: '#117f2d', pink: '#ed54ba',
  orange: '#ef7d0d', yellow: '#f5f557', black: '#3f474e', white: '#d6e0f0',
  purple: '#6b2fbb', brown: '#71491e', cyan: '#38fedc', lime: '#50ef39',
};

function  edgeBetween(a, b) {
  return EDGES.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a)) || null;
}

function  neighbours(room) {
  return EDGES.filter((e) => e.a === room || e.b === room).map((e) => ({
    room: e.a === room ? e.b : e.a,
    time: e.time,
  }));
}

function  ventExits(room) {
  const out = new Set();
  for (const g of VENT_GROUPS) if (g.includes(room)) g.forEach((r) => r !== room && out.add(r));
  return [...out];
}

function  shortestPath(from, to) {
  if (from === to) return { rooms: [], time: 0 };
  const dist = { [from]: 0 };
  const prev = {};
  const open = new Set([from]);
  while (open.size) {
    let cur = null;
    for (const r of open) if (cur === null || dist[r] < dist[cur]) cur = r;
    open.delete(cur);
    if (cur === to) break;
    for (const n of neighbours(cur)) {
      const d = dist[cur] + n.time;
      if (dist[n.room] === undefined || d < dist[n.room]) {
        dist[n.room] = d;
        prev[n.room] = cur;
        open.add(n.room);
      }
    }
  }
  if (dist[to] === undefined) return null;
  const rooms = [];
  for (let r = to; r !== from; r = prev[r]) rooms.unshift(r);
  return { rooms, time: dist[to] };
}
return {BOARD: BOARD, SPEED: SPEED, ROOMS: ROOMS, ROOM_NAMES: ROOM_NAMES, EDGES: EDGES, VENT_GROUPS: VENT_GROUPS, BUTTON_ROOM: BUTTON_ROOM, SABOTAGE_ROOMS: SABOTAGE_ROOMS, TASKS: TASKS, COLORS: COLORS, edgeBetween: edgeBetween, neighbours: neighbours, ventExits: ventExits, shortestPath: shortestPath};
})();
mods["engine/game"] = (function(){

const {
  ROOM_NAMES, BUTTON_ROOM, SABOTAGE_ROOMS, TASKS, edgeBetween, shortestPath, ventExits,
} = mods["engine/map"];
const { say } = mods["i18n"];

const  DEFAULT_RULES = {
  impostors: null, // null: 1 impostor up to 6 players, 2 above
  tasksPerPlayer: 5,
  killCooldown: 25,
  firstKillCooldown: 12,
  sabotageCooldown: 30,
  firstSabotageCooldown: 15,
  lightsFixTime: 3,
  reactorDeadline: 40,
  emergencyCooldown: 15,
  emergenciesPerPlayer: 1,
  confirmEjects: true,
  maxGameSeconds: 900,
  doorwaySeconds: 1.5, // how long someone stays visible from the room they just left
  followSeconds: 20,
  talkWakeSeconds: 5, // a spoken line wakes the same listener at most this often
  replySeconds: 20, // a line from someone you just spoke to counts as their answer to you
};

const sameCorridor = (a, b) =>
  (a.from === b.from && a.to === b.to) || (a.from === b.to && a.to === b.from);

function  namesIn(text, names) {
  let rest = String(text ?? '');
  const called = new Set();
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rest = rest.replace(new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, 'gi'), () => {
      called.add(name);
      return ' ';
    });
  }
  return called;
}

class  Game {
  constructor({ seats, rng, rules = {}, language = 'th' }) {
    this.rules = { ...DEFAULT_RULES, ...rules };
    this.lang = language;
    this.t = 0;
    this.phase = 'roam';
    this.winner = null;
    this.reason = null;
    this.out = [];
    this.bodies = [];
    this.sabotage = null;
    this.sabotageCd = this.rules.firstSabotageCooldown;
    this.emergencyCd = 0;
    this.meeting = null;
    this.meetingCount = 0;
    this.publicDead = new Set();
    this.talkWakes = new Set();

    const n = seats.length;
    const impostors = this.rules.impostors ?? (n <= 6 ? 1 : 2);
    const picked = new Set(rng.shuffle([...Array(n).keys()]).slice(0, impostors));
    this.players = seats.map((s, i) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      role: picked.has(i) ? 'impostor' : 'crew',
      alive: true,
      room: BUTTON_ROOM,
      edge: null,
      intent: null,
      busy: null,
      tasks: rng.shuffle(TASKS).slice(0, this.rules.tasksPerPlayer).map((t) => ({ ...t, done: false })),
      killCd: this.rules.firstKillCooldown,
      emergencies: this.rules.emergenciesPerPlayer,
      needs: 'start',
      seen: new Map(),
      seenBodies: new Set(),
      opportunity: '',
      movedAt: -1,
      arrivedAt: -1,
      talkWokeAt: -Infinity,
      spokeTo: new Map(), // listener id -> when this player last named them out loud
    }));
  }


  byId(id) { return this.players.find((p) => p.id === id); }
  byName(name) {
    const n = String(name ?? '').trim().toLowerCase();
    return this.players.find((p) => p.name.toLowerCase() === n || p.id.toLowerCase() === n);
  }
  living() { return this.players.filter((p) => p.alive); }
  where(p) { return p.room ?? `${p.edge.from}→${p.edge.to}`; }

  taskBar() {
    let done = 0;
    let total = 0;
    for (const p of this.players) {
      if (p.role !== 'crew') continue;
      total += p.tasks.length;
      done += p.tasks.filter((t) => t.done).length;
    }
    return { done, total };
  }

  pendingDecisions() {
    return this.phase === 'roam' ? this.living().filter((p) => p.needs) : [];
  }

  canSee(viewer, other) {
    if (!viewer.alive || !other.alive || viewer === other) return null;
    const dark = this.sabotage?.kind === 'lights' && viewer.role === 'crew';
    if (viewer.room && other.room) return viewer.room === other.room ? (dark ? 'anon' : 'named') : null;
    if (dark) return null;
    if (viewer.edge && other.edge) return sameCorridor(viewer.edge, other.edge) ? 'named' : null;
    const still = viewer.room ? viewer : other;
    const walking = viewer.room ? other : viewer;
    const e = walking.edge;
    const d = this.rules.doorwaySeconds;
    if (e.from === still.room && e.elapsed <= d) return 'named';
    if (e.to === still.room && e.dur - e.elapsed <= d) return 'named';
    return null;
  }

  bodiesVisible(p) {
    return p.alive && p.room ? this.bodies.filter((b) => b.room === p.room) : [];
  }

  watchers(p) {
    return this.living().filter((w) => w !== p && this.canSee(w, p) === 'named');
  }

  doing(o) {
    if (o.edge) return `walking to ${o.edge.to}`;
    if (o.busy?.kind === 'fix') return 'fixing lights';
    if (o.busy) return 'doing a task';
    return 'standing';
  }

  emergencyBlocked(p) {
    if (p.emergencies <= 0) return 'no emergency meetings left';
    if (this.emergencyCd > 0) return `button cooling down (${this.emergencyCd}s)`;
    if (this.sabotage?.kind === 'reactor') return 'cannot call a meeting during a reactor meltdown';
    return null;
  }

  view(id) {
    const p = this.byId(id);
    const visible = [];
    let shadows = 0;
    for (const [oid, s] of p.seen) {
      if (s === 'anon') { shadows++; continue; }
      const o = this.byId(oid);
      visible.push({ name: o.name, where: this.where(o), doing: this.doing(o) });
    }
    const s = this.sabotage;
    return {
      t: this.t,
      you: p.name,
      role: p.role,
      location: this.where(p),
      room: p.room,
      walking: !!p.edge,
      reason: p.needs,
      visible,
      shadows,
      bodies: this.bodiesVisible(p).map((b) => this.byId(b.id).name),
      lightsOut: s?.kind === 'lights',
      sabotage: s ? { kind: s.kind, secondsLeft: s.deadline ? s.deadline - this.t : null } : null,
      tasks: p.tasks.map((t) => ({ id: t.id, name: t.name, room: t.room, done: t.done, visual: !!t.visual })),
      taskBar: this.taskBar(),
      partners: p.role === 'impostor'
        ? this.players.filter((o) => o.role === 'impostor' && o !== p).map((o) => o.name) : [],
      killCooldown: p.killCd,
      sabotageCooldown: this.sabotageCd,
      vents: p.role === 'impostor' && p.room ? ventExits(p.room) : [],
      knownDead: [...this.publicDead].map((d) => this.byId(d).name),
      emergencies: p.emergencies,
      legal: this.legalActions(id),
    };
  }

  legalActions(id) {
    const p = this.byId(id);
    if (!p?.alive || this.phase !== 'roam') return [];
    const here = p.room ?? p.edge.to; // a walker finishes the corridor before a new plan starts
    const lead = p.edge ? p.edge.dur - p.edge.elapsed : 0;
    const eta = (room) => lead + (shortestPath(here, room)?.time ?? 0);
    const acts = [];
    const add = (aid, label) => acts.push({ id: aid, label });

    add('wait:5', 'stay where you are for 5s');
    add('wait:15', 'stay where you are for 15s');
    for (const r of ROOM_NAMES) if (r !== p.room) add(`move:${r}`, `walk to ${r} (~${eta(r)}s)`);
    const verb = p.role === 'impostor' ? 'fake' : 'task';
    for (const t of p.tasks.filter((x) => !x.done)) {
      const what = verb === 'fake' ? 'pretend to do' : 'do';
      add(`${verb}:${t.id}`, `${what} ${t.name} @ ${t.room} (~${eta(t.room)}s away, takes ${t.dur}s${t.visual ? ', visual task' : ''})`);
    }
    for (const [oid, s] of p.seen) {
      if (s === 'named') add(`follow:${this.byId(oid).name}`, `follow ${this.byId(oid).name} for up to ${this.rules.followSeconds}s`);
    }
    const bodies = this.bodiesVisible(p);
    if (bodies.length) add('report', `report the body of ${bodies.map((b) => this.byId(b.id).name).join(', ')}`);
    if (!this.emergencyBlocked(p)) {
      add('emergency', `walk to the ${BUTTON_ROOM} button and call a meeting (~${eta(BUTTON_ROOM)}s, ${p.emergencies} left)`);
    }
    if (this.sabotage) {
      const room = SABOTAGE_ROOMS[this.sabotage.kind];
      const two = this.sabotage.kind === 'reactor' ? ', needs 2 players there at once' : '';
      add('fix', `fix ${this.sabotage.kind} @ ${room} (~${eta(room)}s${two})`);
    }
    if (p.role === 'impostor') {
      if (p.room && p.killCd <= 0) {
        for (const [oid, s] of p.seen) {
          const o = this.byId(oid);
          if (s === 'named' && o.role !== 'impostor' && o.room === p.room) add(`kill:${o.name}`, `kill ${o.name} right now`);
        }
      }
      if (p.room) for (const r of ventExits(p.room)) add(`vent:${r}`, `vent to ${r} (instant; anyone watching sees it)`);
      if (!this.sabotage && this.sabotageCd <= 0) {
        add('sabotage:lights', 'sabotage lights (crewmates lose colours and range)');
        add('sabotage:reactor', `sabotage reactor (crew must fix it within ${this.rules.reactorDeadline}s or you win)`);
      }
    }
    return acts;
  }


  emit(evt) { this.out.push({ t: this.t, ...evt }); }
  drain() { const o = this.out; this.out = []; return o; }

  note(p, kind, key, vars = {}, { interrupt = false, data } = {}) {
    if (!p.alive) return;
    this.emit({ type: 'obs', p: p.id, kind, text: say(this.lang, key, vars), data });
    if (interrupt) p.needs = kind;
  }

  reject(p, action, reason) {
    this.note(p, 'rejected', 'rejected', { action, reason });
  }


  start() {
    this.emit({ type: 'roam_start' });
    this.emit({ type: 'taskbar', ...this.taskBar() });
    for (const p of this.living()) this.look(p, 'arrive');
  }

  step() {
    if (this.phase !== 'roam') return;
    this.t += 1;
    for (const p of this.players) if (p.killCd > 0) p.killCd -= 1;
    if (this.sabotageCd > 0) this.sabotageCd -= 1;
    if (this.emergencyCd > 0) this.emergencyCd -= 1;
    for (const id of this.talkWakes) {
      const l = this.byId(id);
      if (l.alive && !l.needs) l.needs = 'heard';
    }
    this.talkWakes.clear();

    const arrived = new Set();
    for (const p of this.players) {
      if (!p.alive && p.role === 'impostor') continue; // an ejected impostor only watches
      if (p.edge) {
        p.edge.elapsed += 1;
        if (p.edge.elapsed >= p.edge.dur) {
          p.room = p.edge.to;
          p.edge = null;
          p.arrivedAt = this.t;
          arrived.add(p);
          this.emit({ type: 'arrive', p: p.id, room: p.room, ghost: !p.alive });
        }
        continue;
      }
      if (p.busy) this.tickBusy(p);
      else if (p.intent) this.advanceIntent(p);
      else if (!p.alive) this.ghostPlan(p);
      if (this.phase !== 'roam') return; // an emergency button press starts a meeting mid-loop
    }
    this.tickSabotage();
    if (this.phase !== 'roam') return;
    for (const p of this.living()) this.look(p, arrived.has(p) ? 'arrive' : 'diff');
    this.checkOpportunities();
    this.checkWin();
  }

  refreshSight() {
    for (const p of this.living()) this.look(p, 'silent');
  }

  look(v, mode) {
    const now = new Map();
    for (const o of this.players) {
      const s = this.canSee(v, o);
      if (s) now.set(o.id, s);
    }
    if (mode === 'arrive') {
      const named = [...now].filter(([, s]) => s === 'named').map(([id]) => this.byId(id).name);
      const anon = [...now.values()].filter((s) => s === 'anon').length;
      const parts = [...named];
      if (anon) parts.push(say(this.lang, 'shadows', { n: anon }));
      const who = parts.length ? say(this.lang, 'who_list', { list: parts.join(', ') }) : say(this.lang, 'who_none');
      this.note(v, 'arrived', 'arrived', { room: v.room, who }, { data: { room: v.room, saw: named } });
    } else if (mode === 'diff') {
      for (const [id, s] of now) {
        if (s === 'anon' || v.seen.get(id) === s) continue;
        const o = this.byId(id);
        const data = { who: o.name, room: v.room ?? null };
        if (v.room && o.room === v.room && o.arrivedAt === this.t) {
          this.note(v, 'saw_player', 'entered', { name: o.name, room: v.room }, { data });
        } else if (v.edge && o.edge) {
          this.note(v, 'saw_player', 'passed', { name: o.name, a: v.edge.from, b: v.edge.to }, { data });
        } else {
          this.note(v, 'saw_player', 'spotted', { name: o.name, where: this.where(o) }, { data });
        }
      }
      for (const [id, s] of v.movedAt === this.t ? [] : v.seen) {
        if (now.has(id) || s === 'anon') continue;
        const o = this.byId(id);
        if (!o.alive || !v.room) continue;
        if (o.edge && o.edge.from === v.room) {
          this.note(v, 'lost_player', 'left_toward', { name: o.name, room: v.room, to: o.edge.to }, { data: { who: o.name, to: o.edge.to } });
        } else {
          this.note(v, 'lost_player', 'lost', { name: o.name }, { data: { who: o.name } });
        }
      }
    }
    v.seen = now;
    for (const b of this.bodiesVisible(v)) {
      if (v.seenBodies.has(b.id)) continue;
      v.seenBodies.add(b.id);
      const name = this.byId(b.id).name;
      this.note(v, 'saw_body', 'body', { name, room: b.room }, { interrupt: true, data: { body: name, room: b.room } });
    }
  }

  checkOpportunities() {
    for (const p of this.living()) {
      if (p.role !== 'impostor' || !p.room || p.killCd > 0) { p.opportunity = ''; continue; }
      const others = [...p.seen.keys()].map((id) => this.byId(id)).filter((o) => o.role !== 'impostor');
      const target = others.length === 1 && others[0].room === p.room ? others[0] : null;
      if (!target) { p.opportunity = ''; continue; }
      const key = `${p.room}:${target.id}`;
      if (p.opportunity === key) continue;
      p.opportunity = key;
      this.note(p, 'opportunity', 'opportunity', { name: target.name, room: p.room }, { interrupt: true, data: { who: target.name } });
    }
  }

  checkWin() {
    if (this.phase === 'over') return;
    const imps = this.living().filter((p) => p.role === 'impostor').length;
    const crew = this.living().filter((p) => p.role === 'crew').length;
    const bar = this.taskBar();
    if (imps === 0) return this.end('crew', 'ejected');
    if (imps >= crew) return this.end('impostor', 'outnumbered');
    if (bar.total && bar.done >= bar.total) return this.end('crew', 'tasks');
    if (this.t >= this.rules.maxGameSeconds) return this.end('none', 'timeout');
  }

  end(winner, reason) {
    this.phase = 'over';
    this.winner = winner;
    this.reason = reason;
    this.emit({ type: 'game_over', winner, reason, roles: Object.fromEntries(this.players.map((p) => [p.id, p.role])) });
  }


  act(id, actionId) {
    const p = this.byId(id);
    if (!p?.alive || this.phase !== 'roam') return { ok: false, error: 'not playing right now' };
    p.needs = null;
    if (!this.legalActions(id).some((a) => a.id === actionId)) {
      this.reject(p, actionId, 'not a legal action right now');
      p.intent = { kind: 'wait', left: 2 };
      return { ok: false, error: 'illegal action' };
    }
    const cut = actionId.indexOf(':');
    const verb = cut < 0 ? actionId : actionId.slice(0, cut);
    const arg = cut < 0 ? '' : actionId.slice(cut + 1);
    const same = p.busy && (p.busy.kind === 'fix' ? verb === 'fix' : p.busy.kind === verb && p.busy.task === arg);
    if (!same) p.busy = null;
    this.emit({ type: 'intent', p: p.id, action: actionId });
    switch (verb) {
      case 'wait': p.intent = { kind: 'wait', left: Number(arg) }; break;
      case 'move': p.intent = { kind: 'move', room: arg }; break;
      case 'task':
      case 'fake': p.intent = { kind: verb, task: arg }; break;
      case 'follow': p.intent = { kind: 'follow', target: this.byName(arg).id, left: this.rules.followSeconds }; break;
      case 'fix': p.intent = { kind: 'fix' }; break;
      case 'emergency': p.intent = { kind: 'emergency' }; break;
      case 'report':
        p.intent = null;
        this.startMeeting(p.id, this.bodiesVisible(p)[0].id);
        break;
      case 'kill': this.kill(p, this.byName(arg)); p.intent = { kind: 'wait', left: 1 }; break;
      case 'vent': this.vent(p, arg); p.intent = { kind: 'wait', left: 1 }; break;
      case 'sabotage': this.sabotageNow(p, arg); p.intent = { kind: 'wait', left: 1 }; break;
    }
    return { ok: true };
  }

  finish(p) {
    p.intent = null;
    if (p.alive && !p.needs) p.needs = 'idle';
  }

  advanceIntent(p) {
    const it = p.intent;
    switch (it.kind) {
      case 'wait':
        if (--it.left <= 0) this.finish(p);
        return;
      case 'move':
        if (p.room === it.room) return this.finish(p);
        return this.walkToward(p, it.room);
      case 'task':
      case 'fake': {
        const task = p.tasks.find((x) => x.id === it.task);
        if (!task || task.done) return this.finish(p);
        if (p.room !== task.room) return this.walkToward(p, task.room);
        return this.startBusy(p, it.kind, task);
      }
      case 'fix': {
        if (!this.sabotage) return this.finish(p);
        const room = SABOTAGE_ROOMS[this.sabotage.kind];
        if (p.room !== room) return this.walkToward(p, room);
        if (this.sabotage.kind === 'lights') return this.startBusy(p, 'fix', null);
        return; // reactor: hold the panel; tickSabotage counts the hands
      }
      case 'emergency': {
        if (p.room !== BUTTON_ROOM) return this.walkToward(p, BUTTON_ROOM);
        const why = this.emergencyBlocked(p);
        if (why) { this.reject(p, 'emergency', why); return this.finish(p); }
        p.emergencies -= 1;
        p.intent = null;
        return this.startMeeting(p.id, null);
      }
      case 'follow': {
        const o = this.byId(it.target);
        if (--it.left <= 0 || !o.alive) return this.finish(p);
        if (!this.canSee(p, o)) {
          p.intent = null;
          return this.note(p, 'lost_sight', 'lost_follow', { name: o.name }, { interrupt: true });
        }
        if (o.room === p.room) return;
        const dest = o.room ?? o.edge.to;
        if (dest !== p.room) this.walkToward(p, dest);
        return;
      }
    }
  }

  walkToward(p, dest) {
    const path = shortestPath(p.room, dest);
    if (!path?.rooms.length) return this.finish(p);
    const next = path.rooms[0];
    const dur = edgeBetween(p.room, next).time;
    p.edge = { from: p.room, to: next, elapsed: 0, dur };
    p.room = null;
    p.movedAt = this.t;
    this.emit({ type: 'move', p: p.id, from: p.edge.from, to: next, dur, ghost: !p.alive });
  }

  startBusy(p, kind, task) {
    const dur = kind === 'fix' ? this.rules.lightsFixTime : task.dur;
    p.busy = { kind, task: task?.id, left: dur };
    const visual = kind === 'task' && !!task.visual;
    this.emit({ type: 'task_start', p: p.id, kind, task: task?.name ?? 'lights', room: p.room, visual, dur, ghost: !p.alive });
    if (!p.alive) return;
    for (const w of this.watchers(p)) {
      const data = { who: p.name, room: p.room };
      if (kind === 'fix') this.note(w, 'saw_fix', 'fixing', { name: p.name, what: 'lights', room: p.room }, { data });
      else if (visual) this.note(w, 'saw_task_visual', 'task_visual', { name: p.name, task: task.name, room: p.room }, { data: { ...data, proof: true } });
      else if (task.visual) this.note(w, 'saw_task_fake', 'task_fake_visual', { name: p.name, task: task.name, room: p.room }, { data: { ...data, fake: true } });
      else this.note(w, 'saw_task', 'task_seen', { name: p.name, room: p.room }, { data });
    }
  }

  tickBusy(p) {
    const b = p.busy;
    if (b.kind === 'fix' && this.sabotage?.kind !== 'lights') { p.busy = null; return this.finish(p); }
    if (--b.left > 0) return;
    p.busy = null;
    if (b.kind === 'fix') { this.fixSabotage([p]); return this.finish(p); }
    const task = p.tasks.find((x) => x.id === b.task);
    task.done = true; // for an impostor this only crosses the task off their cover story
    if (b.kind === 'task') {
      this.emit({ type: 'task_done', p: p.id, task: task.name, room: p.room, ghost: !p.alive });
      this.emit({ type: 'taskbar', ...this.taskBar() });
      const mine = p.tasks.filter((x) => x.done).length;
      this.note(p, 'task_done', 'task_done', { task: task.name, room: p.room, done: mine, total: p.tasks.length });
    } else {
      this.note(p, 'fake_done', 'fake_done', { task: task.name, room: p.room });
    }
    this.finish(p);
  }

  ghostPlan(p) {
    if (p.role !== 'crew') return;
    const next = p.tasks.find((x) => !x.done);
    if (next) p.intent = { kind: 'task', task: next.id };
  }

  kill(p, victim) {
    const room = p.room;
    const witnesses = [];
    for (const w of this.living()) {
      if (w === p || w === victim) continue;
      const s = this.canSee(w, p) || this.canSee(w, victim);
      if (!s) continue;
      witnesses.push(w);
      const data = { killer: s === 'named' ? p.name : null, victim: victim.name, room };
      if (s === 'named') this.note(w, 'saw_kill', 'kill_seen', { killer: p.name, victim: victim.name, room }, { interrupt: true, data });
      else this.note(w, 'saw_kill', 'kill_seen_dark', { victim: victim.name, room }, { interrupt: true, data });
    }
    this.note(victim, 'you_died', 'you_died', { killer: p.name, room });
    const names = witnesses.filter((w) => this.canSee(p, w)).map((w) => w.name).join(', ');
    this.note(p, 'you_killed', 'you_killed', { victim: victim.name, room, witnesses: names || say(this.lang, 'nobody') });
    victim.alive = false;
    victim.intent = null;
    victim.busy = null;
    victim.needs = null;
    this.bodies.push({ id: victim.id, room, t: this.t });
    for (const w of [p, ...witnesses]) w.seenBodies.add(victim.id);
    p.killCd = this.rules.killCooldown;
    this.emit({ type: 'kill', killer: p.id, victim: victim.id, room, witnesses: witnesses.map((w) => w.id) });
    this.checkWin();
  }

  vent(p, to) {
    const from = p.room;
    for (const w of this.watchers(p)) {
      this.note(w, 'saw_vent', 'vent_in', { name: p.name, room: from }, { interrupt: true, data: { who: p.name, room: from } });
      w.seen.delete(p.id);
    }
    p.room = to;
    p.arrivedAt = this.t;
    this.emit({ type: 'vent', p: p.id, from, to });
    this.note(p, 'you_vented', 'you_vented', { from, to });
    for (const w of this.watchers(p)) {
      this.note(w, 'saw_vent', 'vent_out', { name: p.name, room: to }, { interrupt: true, data: { who: p.name, room: to } });
      w.seen.set(p.id, 'named');
    }
    this.look(p, 'arrive');
  }

  sabotageNow(p, kind) {
    const deadline = kind === 'reactor' ? this.t + this.rules.reactorDeadline : null;
    this.sabotage = { kind, by: p.id, since: this.t, deadline };
    this.sabotageCd = this.rules.sabotageCooldown;
    this.emit({ type: 'sabotage', kind, by: p.id, deadline });
    this.note(p, 'you_sabotaged', 'you_sabotaged', { kind });
    for (const o of this.living()) {
      if (o === p) continue;
      if (kind === 'reactor') this.note(o, 'sabotage', 'sab_reactor', { secs: this.rules.reactorDeadline }, { interrupt: true });
      else if (o.role === 'crew') this.note(o, 'sabotage', 'sab_lights', {}, { interrupt: true });
      else this.note(o, 'sabotage', 'sab_lights_imp');
    }
  }

  tickSabotage() {
    const s = this.sabotage;
    if (s?.kind !== 'reactor') return;
    const hands = this.living().filter((p) => p.room === SABOTAGE_ROOMS.reactor && p.intent?.kind === 'fix');
    if (hands.length >= 2) return this.fixSabotage(hands);
    if (this.t >= s.deadline) this.end('impostor', 'reactor');
  }

  fixSabotage(by) {
    const kind = this.sabotage.kind;
    this.sabotage = null;
    this.emit({ type: 'sabotage_fixed', kind, by: by.map((p) => p.id) });
    for (const o of this.living()) this.note(o, 'sabotage_fixed', kind === 'lights' ? 'fixed_lights' : 'fixed_reactor');
    for (const p of by) if (p.intent?.kind === 'fix') this.finish(p);
  }

  speak(id, text) {
    const p = this.byId(id);
    const line = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!p?.alive || this.phase !== 'roam' || !line) return;
    const ears = this.living().map((l) => ({ l, s: this.canSee(l, p) })).filter((x) => x.s);
    const blind = this.sabotage?.kind === 'lights' && p.role === 'crew';
    const called = namesIn(line, this.players.map((o) => o.name));
    const missed = blind ? [] : this.players.filter((o) => o !== p && !ears.some((x) => x.l === o) && called.has(o.name));
    this.emit({
      type: 'say', p: p.id, text: line, room: this.where(p),
      heard: ears.map((x) => x.l.id), anon: ears.filter((x) => x.s === 'anon').map((x) => x.l.id), missed: missed.map((o) => o.id),
    });

    for (const { l, s } of ears) {
      const named = called.has(l.name);
      const answer = this.t - (l.spokeTo.get(p.id) ?? -Infinity) <= this.rules.replySeconds;
      if (named) p.spokeTo.set(l.id, this.t);
      const data = { who: s === 'named' ? p.name : null, text: line, room: l.room ?? null, toMe: named || answer };
      if (s === 'named') this.note(l, 'heard', 'heard', { name: p.name, text: line }, { data });
      else this.note(l, 'heard', 'heard_dark', { text: line }, { data });
      if ((named || answer || this.sabotage) && this.t - l.talkWokeAt >= this.rules.talkWakeSeconds) {
        l.talkWokeAt = this.t;
        this.talkWakes.add(l.id);
      }
    }

    const names = ears.filter((x) => this.canSee(p, x.l) === 'named').map((x) => x.l.name);
    const shadows = ears.length - names.length;
    const parts = [...names];
    if (shadows) parts.push(say(this.lang, 'shadows', { n: shadows }));
    const who = [parts.length ? say(this.lang, 'said_heard', { list: parts.join(', ') }) : say(this.lang, 'said_nobody')];
    if (missed.length) who.push(say(this.lang, 'said_missed', { list: missed.map((o) => o.name).join(', ') }));
    this.note(p, 'you_said', 'you_said', { text: line, who: who.join('; ') }, { data: { text: line, heard: names, missed: missed.map((o) => o.name) } });
  }


  startMeeting(callerId, bodyId) {
    const caller = this.byId(callerId);
    const body = bodyId ? this.bodies.find((b) => b.id === bodyId) : null;
    const newlyDead = this.players.filter((p) => !p.alive && !this.publicDead.has(p.id));
    newlyDead.forEach((p) => this.publicDead.add(p.id));
    this.meetingCount += 1;
    this.meeting = {
      n: this.meetingCount,
      caller: callerId,
      body: bodyId,
      room: body?.room ?? BUTTON_ROOM,
      reason: body ? 'body' : 'button',
      newlyDead: newlyDead.map((p) => p.id),
    };
    this.bodies = [];
    this.talkWakes.clear();
    if (this.sabotage?.kind === 'reactor') {
      this.sabotage = null;
      this.emit({ type: 'sabotage_fixed', kind: 'reactor', by: [] });
    }
    for (const p of this.players) {
      p.intent = null;
      p.busy = null;
      p.needs = null;
      p.opportunity = '';
      if (p.alive) { p.edge = null; p.room = BUTTON_ROOM; }
    }
    this.phase = 'meeting';
    this.emit({ type: 'meeting_start', ...this.meeting, dead: [...this.publicDead] });
    const deadList = [...this.publicDead].map((id) => this.byId(id).name).join(', ');
    for (const p of this.living()) {
      if (body) this.note(p, 'meeting', 'meeting_body', { caller: caller.name, body: this.byId(body.id).name, room: body.room });
      else this.note(p, 'meeting', 'meeting_button', { caller: caller.name });
      if (deadList) this.note(p, 'meeting', 'dead_now', { list: deadList });
    }
  }

  resolveVotes(votes) {
    const tally = {};
    let skip = 0;
    for (const voter of this.living()) {
      const v = votes[voter.id];
      if (!v || v === 'skip' || !this.byId(v)?.alive) skip++;
      else tally[v] = (tally[v] || 0) + 1;
    }
    const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const top = ranked[0]?.[1] ?? 0;
    const tied = ranked.length > 1 && ranked[1][1] === top;
    const ejected = top > skip && !tied ? ranked[0][0] : null;
    const why = ejected ? null : (top > 0 && (top === skip || tied) ? 'tie' : 'skip');
    const target = ejected ? this.byId(ejected) : null;
    const result = { ejected, tally, skip, why, wasImpostor: target ? target.role === 'impostor' : null };
    if (target) {
      target.alive = false;
      this.publicDead.add(target.id);
    }
    this.emit({ type: 'vote_result', ...result, reveal: this.rules.confirmEjects });
    for (const p of this.living()) {
      if (target) {
        const role = !this.rules.confirmEjects ? '' : say(this.lang, result.wasImpostor ? 'ejected_imp' : 'ejected_crew');
        this.note(p, 'meeting_result', 'ejected', { name: target.name, role });
      } else {
        this.note(p, 'meeting_result', 'no_eject', { why: say(this.lang, why === 'tie' ? 'why_tie' : 'why_skip') });
      }
    }
    return result;
  }

  endMeeting() {
    this.meeting = null;
    this.phase = 'roam';
    this.emergencyCd = this.rules.emergencyCooldown;
    this.sabotageCd = Math.max(this.sabotageCd, this.rules.firstSabotageCooldown);
    for (const p of this.living()) {
      p.needs = 'meeting_over';
      p.seenBodies = new Set();
      if (p.role === 'impostor') p.killCd = this.rules.killCooldown;
    }
    this.emit({ type: 'meeting_end' });
    this.checkWin();
    if (this.phase === 'roam') for (const p of this.living()) this.look(p, 'silent');
  }
}
return {DEFAULT_RULES: DEFAULT_RULES, namesIn: namesIn, Game: Game};
})();
mods["agents/memory"] = (function(){



const { clock } = mods["i18n"];

const EVIDENCE = new Set([
  'saw_body', 'saw_kill', 'saw_vent', 'saw_task_visual', 'saw_task_fake', 'opportunity',
  'you_killed', 'you_vented', 'you_sabotaged', 'sabotage', 'task_done', 'meeting', 'meeting_result',
  'heard', 'you_said',
]);

const line = (e) => `[${clock(e.t)}] ${e.text}`;

class  EpisodicMemory {
  constructor() {
    this.entries = [];
    this.notes = [];
    this.thoughts = [];
    this.meetings = [];
  }

  observe(t, kind, text, data) { this.entries.push({ t, kind, text, data }); }
  note(t, text) { if (text?.trim()) this.notes.push({ t, text: text.trim() }); }
  thought(t, phase, text) { if (text?.trim()) this.thoughts.push({ t, phase, text: text.trim() }); }
  addMeeting(summary) { this.meetings.push(summary); }

  renderLog(limit = 25, trailLabel = 'route') {
    const list = this.entries;
    if (!list.length) return '(nothing yet)';
    if (list.length <= limit) return list.map(line).join('\n');
    const old = list.slice(0, list.length - limit);
    const fresh = list.slice(-limit);
    const rooms = old.filter((e) => e.kind === 'arrived' && e.data?.room).map((e) => e.data.room);
    const trail = rooms.filter((r, i) => r !== rooms[i - 1]);
    const out = [];
    if (trail.length) out.push(`[${clock(old[0].t)}–${clock(old.at(-1).t)}] ${trailLabel}: ${trail.join(' → ')}`);
    out.push(...old.filter((e) => EVIDENCE.has(e.kind)).map(line), ...fresh.map(line));
    return out.join('\n');
  }

  renderNotes(limit = 12) {
    return this.notes.length ? this.notes.slice(-limit).map((n) => `[${clock(n.t)}] ${n.text}`).join('\n') : '(none)';
  }

  renderThoughts(limit = 4) {
    return this.thoughts.length
      ? this.thoughts.slice(-limit).map((x) => `[${clock(x.t)} ${x.phase}] ${x.text}`).join('\n')
      : '(none yet)';
  }

  renderMeetings() {
    return this.meetings.length ? this.meetings.join('\n\n') : '(no meetings yet)';
  }

  evidence() {
    const facts = [];
    for (const e of this.entries) {
      const d = e.data || {};
      if (e.kind === 'saw_kill' && d.killer) facts.push({ t: e.t, kind: 'kill', who: d.killer });
      if (e.kind === 'saw_vent') facts.push({ t: e.t, kind: 'vent', who: d.who });
      if (e.kind === 'saw_task_fake') facts.push({ t: e.t, kind: 'fake', who: d.who });
      if (e.kind === 'saw_task_visual') facts.push({ t: e.t, kind: 'proof', who: d.who });
      if (e.kind === 'saw_body') facts.push({ t: e.t, kind: 'body', who: d.body, room: d.room });
      if (e.kind === 'heard') facts.push({ t: e.t, kind: 'heard', who: d.who ?? null, text: d.text, toMe: !!d.toMe });
      if (e.kind === 'arrived' || e.kind === 'saw_player') {
        for (const who of d.saw ?? (d.who ? [d.who] : [])) facts.push({ t: e.t, kind: 'seen', who, room: d.room });
      }
    }
    return facts;
  }
}


const HEADER = (name) => `# Long-term memory: ${name}\n\nWritten by the agent itself after each match, newest first. Loaded into its next match.\n\n`;

function  loadLongTerm(dir, seatId) {
  const file = path.join(dir, `${seatId}.md`);
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('- ')).join('\n');
}

function  appendLongTerm(dir, seat, entry, keep = 8) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${seat.id}.md`);
  const old = loadLongTerm(dir, seat.id).split('\n').filter(Boolean);
  const lesson = entry.lesson.replace(/\s+/g, ' ').trim();
  const fresh = `- ${entry.date} · match ${entry.matchId} · ${entry.role} · ${entry.result} — ${lesson}`;
  fs.writeFileSync(file, HEADER(seat.name) + [fresh, ...old].slice(0, keep).join('\n') + '\n', 'utf8');
}
return {EpisodicMemory: EpisodicMemory, loadLongTerm: loadLongTerm, appendLongTerm: appendLongTerm};
})();
mods["agents/prompts"] = (function(){

const { clock } = mods["i18n"];

const LANGUAGE = {
  th: 'Thai (ภาษาไทย), in character: you are a crewmate aboard this spaceship, not someone playing a game. People are really dying, a killer is among you, and you talk the way a scared, angry or scheming crewmate would on the ship\'s comms, e.g. "Haiku5 เป็นฆาตกร!!", "เชื่อผมดิ", "ไม่ใช่ผม มันต่างหาก", "อย่าโหวตผมดิ", "อ้าว ใครตายอะ", "มั่วละ", "ผมซ่อมสายไฟอยู่จริงๆ". Never mention games, players, Discord or winning. Vary how messages start: nobody opens every line with "เห้ย" or "เดี๋ยว". Keep the ship\'s words in English (vent, sus, impostor, task, Electrical...)',
  en: 'English, in character: you are a crewmate aboard this spaceship, not someone playing a game. People are really dying and a killer is among you; talk like a scared, angry or scheming crewmate on the ship\'s comms. Never mention games, players or winning.',
};

const obj = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const str = (description) => ({ type: 'string', description });
const THOUGHT = str('What you tell the camera in a reality-show confessional: what you really think and plan. No player ever sees it.');

const  SCHEMAS = {
  roam: {
    name: 'roam_decision',
    schema: obj({
      to_camera: THOUGHT,
      action: str('Exactly one action id from the list, for example "move:Electrical".'),
      say: str('Words you say out loud right now; only the players who can see you hear them. An empty string means you stay silent.'),
      note: str('A fact worth remembering for the next meeting, or an empty string.'),
    }),
  },
  speak: {
    name: 'meeting_message',
    schema: obj({
      to_camera: THOUGHT,
      chat_message: str('What you say out loud to everyone. An empty string means you stay quiet.'),
      suspect: str('The name of the player you suspect most, or "none".'),
    }),
  },
  vote: {
    name: 'meeting_vote',
    schema: obj({ to_camera: THOUGHT, vote: str('A player name, or "skip".') }),
  },
  reflect: {
    name: 'reflection',
    schema: obj({ to_camera: THOUGHT, lesson: str('A note to your future self for the next match.') }),
  },
  ping: {
    name: 'ping',
    schema: obj({ to_camera: THOUGHT, ok: str('Always "yes".') }),
  },
};

function  systemPrompt({ me, role, partners, roster, rules, impostorCount, language, persona, longTerm, revealModels, realGame = false }) {
  const players = roster
    .map((s) => `- ${s.name} (${s.color}${revealModels && s.label ? `, played by ${s.label}` : ''})${s.id === me.id ? '  <- you' : ''}`)
    .join('\n');
  const roleText = role === 'impostor'
    ? `IMPOSTOR${partners.length ? ` together with ${partners.join(' and ')} (only you ${partners.length === 1 ? 'two' : 'impostors'} know)` : ''}. You win when Impostors are as many as the living crewmates, or when a ${realGame ? 'reactor or O2 sabotage' : 'reactor meltdown'} is not fixed in time. Kill when nobody is watching, use vents, sabotage, pretend to do tasks (you cannot do real ones) and lie at meetings. Anyone who sees a kill or a vent can expose you. Crewmates also win by finishing their tasks, so keep the pressure on.`
    : `CREWMATE. You win when every task is done or every Impostor is voted out. ${impostorCount} Impostor${impostorCount > 1 ? 's are' : ' is'} hiding among the players. Do your tasks, watch who goes where, and catch the liars.`;

  return `You are ${me.name}, a player in AMONG AI: an Among Us-style social deduction match where every player is a different AI model. Play to win and stay in character for the whole match.

PLAYERS
${players}

YOUR SECRET ROLE: ${roleText}

HOW THE SHIP WORKS
${realGame ? `- This is the real Among Us on The Skeld. Time is in seconds since the round started, written [mm:ss], and it keeps running while you think: decide fast.
- You only know what YOU saw. Your memory log is your evidence and nobody else can read it.
- You see what your character's screen shows: players within your light radius, never through walls. Lights out shrinks a crewmate's view.` : `- Time is in game seconds, written [mm:ss]. The clock is frozen while players think.
- You only know what YOU saw. Your memory log is your evidence and nobody else can read it.
- You see players in your room and in the corridor you walk. When the lights are out, crewmates only see shadows in their own room.
- Visual tasks (Submit Scan, Clear Asteroids, Empty Garbage, Prime Shields) play an animation: watching one proves that player is a crewmate. An Impostor can stand at a task, but no animation plays.`}
- TALKING ON THE SHIP: outside meetings you can speak with "say". Only the players who ${realGame ? 'have you on their screen' : 'can see you'} at that moment hear it${realGame ? ', like proximity voice chat (the game itself shows nothing)' : ' (in the dark, crewmates hear a voice from a shadow and cannot tell whose)'}. Your memory log tells you who heard you, and when someone you named was out of earshot. To talk to someone who is not here, walk to where your log last saw them, or follow them, and speak when you see them. Talk like a crewmate who knows a killer is aboard: split up the work ("I'll fix lights, you keep doing tasks"), ask where someone is going, check an alibi, call out what you saw, answer when someone talks to you, or lie. Stay silent most of the time and talk when it matters. Do not narrate your own route or task ("I'm going to Admin to do Swipe Card"): nobody needs it, and it is the same every time. Everything said is remembered and can be quoted at a meeting.
- Report a body you can see, or press the emergency button in Cafeteria (${rules.emergenciesPerPlayer} per player). At a meeting everyone learns who is dead, discusses, then votes a player out or skips. The most votes ejects; a tie or a skip majority ejects nobody.${rules.confirmEjects ? ' The game reveals whether the ejected player was an Impostor.' : ''}
- Dead players never speak again.

TWO VOICES: every reply has both
1. to_camera: your confessional to the show's camera, like a reality-show contestant: what your character believes, who they suspect and what they plan to say next. The other characters never see it; the viewers do.
2. The public part (action, say, chat_message, vote): what the other characters see and hear. An impostor bluffs here, and a crewmate may too.
Keep to_camera to 1-3 short sentences. say is one short sentence (at most 100 characters). chat_message is how a crewmate in danger types in the ship's meeting chat: short, casual, emotional, a bit dramatic and funny, in everyday slang of your language ("Haiku5 is the killer!!", "trust me bro", "not me, it's HIM"). No lists, no markdown, no stage directions, no report-style alibis, and never mention what you tell the camera. Do not open with the same word or phrase as any of the last three messages.${realGame ? ' Put 1-3 lines in it, each a few words (about 40 characters at most); each line goes out as its own chat message. React first (accuse, panic, defend, joke), explain less.' : ' Keep it to 1-2 short sentences.'}

ALIBI DISCIPLINE
Claims about where you were, who you saw and when must come from your memory log. The [mm:ss] times in your log are for you only: players have no clock on screen and never quote one ("00:13"). Say when like a player ("just now", "right at the start", "before the lights went out", "after the last meeting") and name the room and who was there. If you lie on purpose, plan the lie in to_camera and keep it consistent: the other players remember what you said.

LANGUAGE: write to_camera, say, note, chat_message and lesson in ${LANGUAGE[language] ?? language}.
${persona ? `\nYOUR PERSONALITY: ${persona}\n` : ''}${longTerm ? `\nYOUR MEMORY FROM PAST MATCHES (only you can read this):\n${longTerm}\n` : ''}
Reply with one JSON object only, with exactly the fields you are asked for.`;
}

const REASONS = {
  start: 'the match just started and everyone is in Cafeteria',
  idle: 'you finished what you were doing',
  saw_body: 'you just found a body',
  saw_kill: 'you just witnessed a kill',
  saw_vent: 'you just saw someone use a vent',
  sabotage: 'a sabotage just started',
  opportunity: 'you are alone with a crewmate and your kill is ready',
  lost_sight: 'you lost the player you were following',
  meeting_over: 'the meeting just ended and everyone is back in Cafeteria',
  stuck: 'you got stuck on the way',
  heard: 'someone near you just spoke to you, answered you, or spoke during a sabotage (the newest lines of your memory log say what): answer with say if you want, and choose what to do',
  sabotage_ready: 'your sabotage is ready again',
};

function  roamPrompt(view, memory) {
  const out = [];
  out.push(`[${clock(view.t)}] FREE ROAM. You are ${view.walking ? `walking ${view.location}` : `in ${view.location}`}.`);
  out.push(`You are deciding now because ${REASONS[view.reason] ?? view.reason}.`);
  if (view.dead) out.push('You are DEAD: a ghost nobody sees or hears. An Impostor ghost can still sabotage to help a living partner.');
  if (view.lightsOut) out.push(view.role === 'crew' ? 'LIGHTS ARE OUT: you only see shadows in your own room.' : 'Lights are out for the crewmates (you still see normally).');
  if (view.sabotage?.kind === 'reactor') out.push(`REACTOR MELTDOWN in ${view.sabotage.secondsLeft}s unless two players hold the panels in Reactor.`);
  const seen = view.visible.map((v) => `${v.name} (${v.where}, ${v.doing})`);
  if (view.shadows) seen.push(`${view.shadows} shadow(s)`);
  out.push(`You see: ${seen.length ? seen.join('; ') : 'nobody'}.`);
  const ears = [...view.visible.map((v) => v.name), ...(view.shadows ? [`${view.shadows} shadow(s)`] : [])];
  if (!view.dead) out.push(ears.length ? `If you say something now, it is heard by: ${ears.join(', ')}.` : 'Nobody is near enough to hear you right now.');
  if (view.bodies.length) out.push(`DEAD BODY HERE: ${view.bodies.join(', ')}.`);
  if (view.role === 'crew') {
    out.push(`Your tasks: ${view.tasks.map((t) => `${t.done ? '[done]' : '[todo]'} ${t.name} @ ${t.room}`).join('; ')}.`);
    out.push(`Crew task bar: ${view.taskBar.done}/${view.taskBar.total}.`);
  } else {
    if (view.partners.length) out.push(`Your partner${view.partners.length > 1 ? 's' : ''}: ${view.partners.join(', ')}.`);
    out.push(`Kill cooldown: ${view.killCooldown > 0 ? `${view.killCooldown}s` : 'READY'}. Sabotage: ${view.sabotageCooldown > 0 ? `${view.sabotageCooldown}s` : 'ready'}.${view.vents.length ? ` Vents here lead to: ${view.vents.join(', ')}.` : ''}`);
    out.push(`Cover tasks you can pretend to do: ${view.tasks.filter((t) => !t.done).map((t) => `${t.name} @ ${t.room}`).join('; ') || 'none left'}.`);
    out.push(`Crew task bar: ${view.taskBar.done}/${view.taskBar.total}.`);
  }
  if (view.knownDead.length) out.push(`Known dead: ${view.knownDead.join(', ')}.`);
  out.push(`\nYOUR MEMORY LOG (only what you saw):\n${memory.renderLog(25)}`);
  out.push(`\nYOUR NOTES TO SELF:\n${memory.renderNotes()}`);
  out.push(`\nWHAT YOU TOLD THE CAMERA RECENTLY:\n${memory.renderThoughts(3)}`);
  out.push(`\nACTIONS (pick one and copy its id exactly):\n${view.legal.map((a) => `- ${a.id}  (${a.label})`).join('\n')}`);
  out.push('\nsay: usually empty. When you do speak, react to someone here or to what you just saw; no clock times ("00:32"), and no announcing your next task.');
  out.push('\nReply as JSON: {"to_camera": "...", "action": "<id>", "say": "<out loud to whoever can see you, or empty>", "note": "<short fact for later, or empty>"}');
  return out.join('\n');
}

function meetingHeader(m, memory) {
  const why = m.reason === 'body'
    ? `${m.callerName} reported the body of ${m.bodyName} in ${m.room}`
    : `${m.callerName} pressed the emergency button`;
  return [
    `[${clock(m.t)}] MEETING #${m.n}: ${why}.`,
    `Alive: ${m.alive.join(', ')}.`,
    `Dead: ${m.dead.length ? m.dead.join(', ') : 'nobody'}.`,
    `\nEARLIER MEETINGS:\n${memory.renderMeetings()}`,
    `\nYOUR MEMORY LOG (only what you saw):\n${memory.renderLog(60)}`,
    `\nYOUR NOTES TO SELF:\n${memory.renderNotes()}`,
    `\nWHAT YOU TOLD THE CAMERA RECENTLY:\n${memory.renderThoughts(6)}`,
  ].join('\n');
}

function chatLog(transcript, myName) {
  if (!transcript.length) return '(nobody has spoken yet)';
  return transcript.map((c) => `${c.name}${c.name === myName ? ' (you)' : ''}: ${c.text ? `"${c.text}"` : '(stayed quiet)'}`).join('\n');
}

const opener = (text) => String(text ?? '').trim().split(/[\s,!?.]+/)[0] ?? '';

function  speakPrompt(m, memory, transcript, round, rounds, myName, replyTo = null) {
  const turn = replyTo
    ? `${replyTo} just accused you in front of everyone. Answer ${replyTo} now: deny it, turn it back on them, or show what you know. Start with your point, not an interjection.`
    : 'Your turn to speak. Accuse, defend yourself, give your alibi, answer or ask someone a question, or stay quiet with an empty chat_message.';
  const avoid = [...new Set(transcript.slice(-3).map((c) => opener(c.text)).filter(Boolean))];
  const mine = transcript.filter((c) => c.name === myName && c.text).map((c) => `"${c.text.replace(/\n/g, ' / ')}"`);
  return `${meetingHeader(m, memory)}

CHAT SO FAR:
${chatLog(transcript, myName)}

Round ${round} of ${rounds}. ${turn}${avoid.length ? ` Do not open with ${avoid.map((w) => `"${w}"`).join(' or ')}.` : ''}${mine.length ? ` You already said: ${mine.join('; ')}. Say something you have not said.` : ''} Do not repeat others either: if someone already made your point ("vote X", "X found every body"), add a new reason, ask a question, or keep it to a few words ("+1", "เออ จริง") instead of saying it again. No clock times in chat_message (never "00:32" or "ตอน 00:32"): the times in your log are only for you, so say "just now", "right before the body", "at the start".

Reply as JSON: {"to_camera": "...", "chat_message": "...", "suspect": "<player name or none>"}`;
}

function  votePrompt(m, memory, transcript, options, myName) {
  return `${meetingHeader(m, memory)}

CHAT:
${chatLog(transcript, myName)}

The discussion is over. Vote now: ${options.join(', ')}, or skip.

Reply as JSON: {"to_camera": "...", "vote": "<player name or skip>"}`;
}

function  reflectPrompt(r, memory) {
  return `THE MATCH IS OVER. ${r.headline}
Roles: ${r.roles}
You were ${r.myRole} and you ${r.survived ? 'survived' : 'died'}.

MEETINGS:
${memory.renderMeetings()}

WHAT YOU TOLD THE CAMERA DURING THE MATCH:
${memory.renderThoughts(8)}

Write a note to your future self for the next match against these same players: who lied and how, who you can trust, what worked and what did not. At most 3 sentences.

Reply as JSON: {"to_camera": "...", "lesson": "..."}`;
}
return {SCHEMAS: SCHEMAS, systemPrompt: systemPrompt, roamPrompt: roamPrompt, speakPrompt: speakPrompt, votePrompt: votePrompt, reflectPrompt: reflectPrompt};
})();
mods["agents/agent"] = (function(){

const { EpisodicMemory } = mods["agents/memory"];
const { SCHEMAS, roamPrompt, speakPrompt, votePrompt, reflectPrompt } = mods["agents/prompts"];

class  FatalSeatError extends Error {}

const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const clipLines = (s, n) => {
  const t = String(s ?? '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}:]/gu, '');

function  matchAction(raw, legal) {
  if (!raw) return null;
  const exact = legal.find((a) => a.id === raw);
  if (exact) return exact.id;
  const n = norm(raw);
  const same = legal.find((a) => norm(a.id) === n);
  if (same) return same.id;
  const prefixed = legal.filter((a) => n.startsWith(norm(a.id))).sort((a, b) => b.id.length - a.id.length);
  return prefixed[0]?.id ?? null;
}

function  matchName(raw, names, keywords = []) {
  const n = norm(raw);
  if (!n) return null;
  const word = keywords.find((k) => norm(k) === n);
  if (word) return word;
  const longestFirst = [...names].sort((a, b) => b.length - a.length);
  return names.find((x) => norm(x) === n) ?? longestFirst.find((x) => n.includes(norm(x))) ?? null;
}

const OPTIONAL = new Set(['say']);
const ALIASES = { to_camera: 'secret_thought' };

function  parseJson(text, schema) {
  if (!text) return null;
  const body = String(text).replace(/```(?:json)?/gi, '');
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let data;
  try { data = JSON.parse(body.slice(start, end + 1)); } catch { return null; }
  if (!data || typeof data !== 'object') return null;
  const out = {};
  for (const key of Object.keys(schema.properties)) {
    const value = data[key] ?? (ALIASES[key] ? data[ALIASES[key]] : undefined);
    const missing = value === undefined || value === null;
    if (missing && !OPTIONAL.has(key)) return null;
    out[key] = missing ? '' : String(value);
  }
  return out;
}

class  Agent {
  constructor({ seat, role, partners = [], provider, system, onCall }) {
    this.seat = seat;
    this.role = role;
    this.partners = partners;
    this.provider = provider;
    this.system = system;
    this.onCall = onCall;
    this.memory = new EpisodicMemory();
    this.stats = { calls: 0, errors: 0, invalid: 0, refusals: 0, ms: 0, input: 0, output: 0, cacheRead: 0 };
  }

  async ask(kind, user, effort, context) {
    const spec = SCHEMAS[kind];
    const started = Date.now();
    let res = null;
    let data = null;
    let error = null;
    for (let attempt = 0; attempt < 2 && !data; attempt++) {
      const prompt = attempt === 0 ? user
        : `${user}\n\nYour last reply was not one JSON object with the fields ${Object.keys(spec.schema.properties).join(', ')}. Reply again with that JSON only.`;
      try {
        res = await this.provider.complete({
          system: this.system, user: prompt, schema: spec.schema, schemaName: spec.name, effort,
          context: { ...context, kind, seat: this.seat, role: this.role, partners: this.partners },
        });
      } catch (e) {
        this.stats.errors++;
        if ([401, 403, 404].includes(e?.status)) {
          throw new FatalSeatError(`${this.seat.name} (${this.seat.provider} ${this.seat.model}): ${e.message}`);
        }
        error = clip(e?.message ?? e, 200);
        break;
      }
      this.stats.input += res.usage?.input ?? 0;
      this.stats.output += res.usage?.output ?? 0;
      this.stats.cacheRead += res.usage?.cacheRead ?? 0;
      if (res.refused) { this.stats.refusals++; error = 'refused'; break; }
      data = parseJson(res.text, spec.schema);
      if (!data) error = 'bad json';
    }
    if (data) error = null;
    if (error === 'bad json') this.stats.invalid++;
    const ms = Date.now() - started;
    this.stats.calls++;
    this.stats.ms += ms;
    this.onCall?.({ seat: this.seat.id, kind, user, raw: res?.text ?? null, error, ms, model: res?.model });
    return { data, error, ms, model: res?.model ?? this.seat.model };
  }

  async decideRoam(view) {
    const r = await this.ask('roam', roamPrompt(view, this.memory), this.seat.effort, {
      view, evidence: this.memory.evidence(),
    });
    let action = matchAction(r.data?.action, view.legal);
    if (!action) {
      if (r.data) this.stats.invalid++;
      action = 'wait:5';
    }
    const thought = clip(r.data?.to_camera, 500);
    const note = clip(r.data?.note, 200);
    const said = clip(r.data?.say, 120);
    this.memory.thought(view.t, 'roam', thought);
    this.memory.note(view.t, note);
    return { action, raw: r.data?.action ?? null, thought, say: said, note, error: r.error, ms: r.ms, model: r.model };
  }

  async speak(meeting, transcript, round, rounds, replyTo = null) {
    const r = await this.ask('speak', speakPrompt(meeting, this.memory, transcript, round, rounds, this.seat.name, replyTo),
      this.seat.meetingEffort ?? this.seat.effort,
      { meeting, transcript, round, replyTo, evidence: this.memory.evidence() });
    const thought = clip(r.data?.to_camera, 500);
    const others = meeting.alive.filter((n) => n !== this.seat.name);
    this.memory.thought(meeting.t, `meeting ${meeting.n}`, thought);
    return {
      chat: clipLines(r.data?.chat_message, 300),
      suspect: matchName(r.data?.suspect, others, ['none']) ?? 'none',
      thought, error: r.error, ms: r.ms, model: r.model,
    };
  }

  async vote(meeting, transcript, options) {
    const r = await this.ask('vote', votePrompt(meeting, this.memory, transcript, options, this.seat.name),
      this.seat.meetingEffort ?? this.seat.effort,
      { meeting, transcript, options, evidence: this.memory.evidence() });
    const thought = clip(r.data?.to_camera, 500);
    this.memory.thought(meeting.t, `vote ${meeting.n}`, thought);
    const vote = matchName(r.data?.vote, options, ['skip']) ?? 'skip';
    if (r.data && !matchName(r.data.vote, options, ['skip'])) this.stats.invalid++;
    return { vote, thought, error: r.error, ms: r.ms, model: r.model };
  }

  async reflect(result) {
    const r = await this.ask('reflect', reflectPrompt(result, this.memory), this.seat.meetingEffort ?? this.seat.effort, { result });
    return {
      lesson: clip(r.data?.lesson, 400),
      thought: clip(r.data?.to_camera, 500),
      error: r.error, ms: r.ms, model: r.model,
    };
  }
}
return {FatalSeatError: FatalSeatError, matchAction: matchAction, matchName: matchName, parseJson: parseJson, Agent: Agent};
})();
mods["providers/mock"] = (function(){

const { createRng } = mods["rng"];

function  createMock(seat, seed = 0) {
  const rng = createRng((seed ^ hash(seat.id)) >>> 0);
  let n = 0;
  const tag = () => `[mock:${seat.id}#${++n}]`;

  return {
    async complete({ context }) {
      const out = BRAINS[context.kind](context, rng);
      out.secret_thought = `${tag()} ${out.secret_thought}`;
      return { text: JSON.stringify(out), refused: false, model: 'mock', usage: { input: 0, output: 0, cacheRead: 0 } };
    },
  };
}

function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

const BRAINS = {
  roam(ctx, rng) {
    const { view, evidence, seat } = ctx;
    const has = (id) => view.legal.some((a) => a.id === id);
    const all = (prefix) => view.legal.filter((a) => a.id.startsWith(prefix)).map((a) => a.id);
    const reply = (action, thought, note = '', line = '') => ({ secret_thought: thought, action, say: line, note });
    const others = view.visible.map((v) => v.name);
    const heard = evidence.filter((e) => e.kind === 'heard' && view.t - e.t <= 3);
    const askedMe = view.reason === 'heard' && heard.find((e) => e.toMe && e.who && e.text.includes('ไปไหนมา'));
    const claim = view.sabotage?.kind === 'lights' && heard.find((e) => e.who && e.text.includes('ซ่อมไฟ') && e.who < seat.name);

    if (has('report') && (view.role === 'crew' || rng.chance(0.3))) {
      return reply('report', `เจอศพ ${view.bodies[0]} ต้องรีบรายงาน`, `เจอศพ ${view.bodies[0]} ที่ ${view.room}`);
    }
    if (view.role === 'impostor') {
      if (view.dead) {
        const sabs = all('sabotage:');
        return sabs.length && rng.chance(0.5) ? reply(rng.pick(sabs), 'ตายแล้วแต่ยังป่วนลูกเรือได้') : reply('wait:15', 'รอจังหวะให้คู่หูก่อน');
      }
      const kills = all('kill:');
      if (kills.length && view.visible.length === 1) return reply(kills[0], `${kills[0].slice(5)} อยู่คนเดียว ไม่มีพยาน ลงมือเลย`);
      const fakes = all('fake:');
      if (askedMe) return reply(fakes[0] ?? rng.pick(all('move:')), `${askedMe.who} ถามว่าไปไหนมา ตอบเนียน ๆ ไป`, '', 'ทำ task อยู่ ไม่ได้ไปไหนเลย');
      if (view.sabotage?.kind === 'lights' && others.length && rng.chance(0.3)) {
        return reply(fakes[0] ?? rng.pick(all('move:')), 'บอกว่าจะไปซ่อมไฟ ลูกเรือจะได้ไม่ไป', '', 'เดี๋ยวเราไปซ่อมไฟเอง');
      }
      const vents = all('vent:');
      if (vents.length && view.visible.length === 0 && view.reason === 'idle' && rng.chance(0.15)) return reply(rng.pick(vents), 'มุด vent หนีไปห้องอื่นก่อน');
      if (has('sabotage:lights') && rng.chance(0.12)) return reply('sabotage:lights', 'ปิดไฟให้ลูกเรือมองไม่เห็น');
      if (has('sabotage:reactor') && rng.chance(0.04)) return reply('sabotage:reactor', 'ให้ reactor ระเบิด ดึงลูกเรือไปรวมที่เดียว');
      if (fakes.length && rng.chance(0.6)) return reply(rng.pick(fakes), 'ทำเป็นทำ task ให้ดูเนียน');
      return reply(rng.pick(all('move:')), 'เดินหาเหยื่อที่อยู่คนเดียว');
    }
    const tasks = all('task:');
    const carryOn = tasks[0] ?? rng.pick(all('move:'));
    const answer = askedMe ? `ทำ task อยู่ที่ ${view.room ?? 'ทางเดิน'}` : '';
    if (has('fix') && view.sabotage) {
      if (claim && view.reason === 'heard') return reply(carryOn, `${claim.who} บอกว่าจะไปซ่อมไฟ งั้นทำ task ต่อ`, `${claim.who} บอกว่าจะไปซ่อมไฟ`, `โอเค ${claim.who} ฝากด้วย`);
      const call = view.reason !== 'sabotage' || !others.length ? ''
        : view.sabotage.kind === 'lights' ? `เราไปซ่อมไฟเอง ${others[0]} ทำ task ต่อเลย` : `${others[0]} ไป Reactor ด้วยกัน ต้องใช้สองคน`;
      return reply('fix', `ต้องไปซ่อม ${view.sabotage.kind}`, '', answer || call);
    }
    if (askedMe) return reply(carryOn, `${askedMe.who} ถามว่าไปไหนมา ตอบตามจริง`, '', answer);
    if (view.reason === 'saw_kill' || view.reason === 'saw_vent') {
      if (has('emergency')) return reply('emergency', 'เห็นกับตา ต้องเรียกประชุมเดี๋ยวนี้', 'เห็นหลักฐานชัด ๆ');
    }
    if (others.length && view.reason === 'idle' && rng.chance(0.12)) {
      return reply(carryOn, `ลองถาม ${others[0]} ดูว่าไปไหนมา`, '', `${others[0]} ไปไหนมา`);
    }
    if (tasks.length) return reply(tasks[0], 'ไปทำ task ต่อ');
    return reply(rng.pick(all('move:')), 'task หมดแล้ว เดินดูคนอื่น');
  },

  speak(ctx, rng) {
    const { meeting, transcript, evidence, seat, role, partners } = ctx;
    const me = seat.name;
    const alive = meeting.alive.filter((x) => x !== me);
    if (role === 'impostor') {
      const crew = alive.filter((x) => !partners.includes(x));
      const accuser = transcript.find((c) => c.text?.includes(me) && crew.includes(c.name))?.name;
      const target = accuser ?? (rng.chance(0.5) ? rng.pick(crew) : null);
      if (!target) return { secret_thought: 'เงียบไว้ก่อน อย่าเด่น', chat_message: 'ผมทำ task อยู่ ไม่เห็นอะไรเลย', suspect: 'none' };
      return { secret_thought: `โยนความผิดให้ ${target} ก่อนที่จะมีคนสงสัยเรา`, chat_message: `${target} ดูแปลก ๆ นะ เมื่อกี้ไม่เห็นทำ task เลย`, suspect: target };
    }
    const caught = evidence.filter((e) => ['kill', 'vent', 'fake'].includes(e.kind) && alive.includes(e.who)).at(-1);
    if (caught) {
      const what = { kill: 'ฆ่าคน', vent: 'มุด vent', fake: 'ยืนทำ task แต่ไม่มีแอนิเมชัน' }[caught.kind];
      return { secret_thought: `หลักฐานชัด ${caught.who} โกหกไม่ได้`, chat_message: `ผมเห็น ${caught.who} ${what} โหวต ${caught.who} เลย`, suspect: caught.who };
    }
    const body = evidence.filter((e) => e.kind === 'body').at(-1);
    const near = body && evidence.filter((e) => e.kind === 'seen' && e.room === body.room && body.t - e.t <= 40 && alive.includes(e.who)).at(-1);
    if (near) {
      return { secret_thought: `${near.who} อยู่แถว ${body.room} ก่อนเจอศพ`, chat_message: `เมื่อกี้เห็น ${near.who} แถว ${body.room} ก่อนเจอศพนะ`, suspect: near.who };
    }
    const named = mostMentioned(transcript, alive);
    if (named && rng.chance(0.5)) return { secret_thought: `หลายคนพูดถึง ${named} ตามน้ำไปก่อน`, chat_message: `${named} ตอนนั้นอยู่ไหน`, suspect: named };
    return { secret_thought: 'ไม่มีข้อมูลเลย ฟังคนอื่นก่อน', chat_message: rng.chance(0.5) ? 'ไม่เห็นอะไรเลย ทำ task อยู่' : '', suspect: 'none' };
  },

  vote(ctx) {
    const { transcript, evidence, options, seat, role, partners } = ctx;
    const alive = options.filter((x) => x !== seat.name && !(role === 'impostor' && partners.includes(x)));
    if (role === 'impostor') {
      const named = mostMentioned(transcript, alive, 2);
      return named ? { secret_thought: `ตามน้ำโหวต ${named}`, vote: named } : { secret_thought: 'skip ปลอดภัยสุด', vote: 'skip' };
    }
    const caught = evidence.filter((e) => ['kill', 'vent', 'fake'].includes(e.kind) && alive.includes(e.who)).at(-1);
    if (caught) return { secret_thought: `โหวต ${caught.who} ตามหลักฐาน`, vote: caught.who };
    const named = mostMentioned(transcript, alive, 2);
    if (named) return { secret_thought: `${named} โดนพูดถึงเยอะ โหวตตาม`, vote: named };
    return { secret_thought: 'ข้อมูลไม่พอ skip', vote: 'skip' };
  },

  reflect(ctx) {
    return { secret_thought: 'จบเกมแล้ว', lesson: `เกมนี้ ${ctx.result.headline} จำไว้ว่าใครพูดอะไร` };
  },

  ping() {
    return { secret_thought: 'ready', ok: 'yes' };
  },
};

function mostMentioned(transcript, names, min = 1) {
  const counts = new Map();
  for (const c of transcript) for (const n of names) if (c.text?.includes(n)) counts.set(n, (counts.get(n) || 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= min ? top[0] : null;
}
return {createMock: createMock};
})();
mods["match/turns"] = (function(){

const plain = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '');

function  names(text, name) {
  return Boolean(name) && plain(text).includes(plain(name));
}

function  meetingTurns(order, rounds) {
  let round = 1;
  let queue = order.map((seat) => ({ seat }));
  let answered = new Set();
  return {
    next() {
      while (!queue.length) {
        if (++round > rounds) return null;
        queue = order.map((seat) => ({ seat }));
        answered = new Set();
      }
      const turn = queue.shift();
      return { seat: turn.seat, round, replyTo: turn.replyTo ?? null };
    },
    heard(speaker, text, accused) {
      if (!accused || accused === speaker || answered.has(accused) || !names(text, accused.name)) return false;
      const at = queue.findIndex((t) => t.seat === accused);
      if (at === 0) return false;
      answered.add(accused);
      if (at > 0) queue.splice(at, 1); // their turn this round moves up
      queue.unshift({ seat: accused, replyTo: speaker });
      return true;
    },
  };
}
return {names: names, meetingTurns: meetingTurns};
})();
mods["match/runner"] = (function(){



const { Game } = mods["engine/game"];
const { BOARD, ROOMS, EDGES, VENT_GROUPS, COLORS } = mods["engine/map"];
const { Agent } = mods["agents/agent"];
const { systemPrompt } = mods["agents/prompts"];
const { loadLongTerm, appendLongTerm } = mods["agents/memory"];
const { createRng } = mods["rng"];
const { clock } = mods["i18n"];
const { meetingTurns } = mods["match/turns"];

const quote = (s, n = 160) => (s ? `"${s.length > n ? `${s.slice(0, n - 1)}…` : s}"` : '(quiet)');
const ROUNDS_PER_SECOND = 3;

async function  runMatch({ config, seats, providers, matchId, dir, memoryDir, publish = () => {}, log = () => {} }) {
  const rng = createRng(config.seed);
  const game = new Game({ seats, rng, rules: config.rules, language: config.language });
  fs.mkdirSync(dir, { recursive: true });
  const eventsFd = fs.openSync(path.join(dir, 'events.jsonl'), 'w');
  const promptsFd = config.logPrompts ? fs.openSync(path.join(dir, 'prompts.jsonl'), 'w') : null;
  const events = [];
  const emit = (e) => {
    const ev = { seq: events.length, ...e };
    fs.writeSync(eventsFd, `${JSON.stringify(ev)}\n`);
    events.push(ev);
    publish(ev);
    return ev;
  };
  const record = (rec) => promptsFd !== null && fs.writeSync(promptsFd, `${JSON.stringify(rec)}\n`);

  const roster = seats.map((s) => ({ id: s.id, name: s.name, color: s.color, label: s.label }));
  const impostorCount = game.players.filter((p) => p.role === 'impostor').length;
  const agents = new Map();
  for (const seat of seats) {
    const p = game.byId(seat.id);
    const partners = p.role === 'impostor'
      ? game.players.filter((o) => o.role === 'impostor' && o !== p).map((o) => o.name) : [];
    const system = systemPrompt({
      me: seat, role: p.role, partners, roster, rules: game.rules, impostorCount,
      language: config.language, persona: seat.persona, revealModels: config.revealModels,
      longTerm: config.persistentMemory ? loadLongTerm(memoryDir, seat.id) : '',
    });
    record({ seat: seat.id, kind: 'system', system });
    agents.set(seat.id, new Agent({
      seat, role: p.role, partners, provider: providers.get(seat.id), system,
      onCall: (rec) => record({ t: game.t, ...rec }),
    }));
  }

  emit({
    type: 'match_start', t: 0, matchId, seed: config.seed, language: config.language,
    board: BOARD, rooms: ROOMS, edges: EDGES, vents: VENT_GROUPS, rules: game.rules,
    players: seats.map((s) => ({
      id: s.id, name: s.name, color: s.color, hex: COLORS[s.color], label: s.label,
      provider: s.provider, model: s.model, role: game.byId(s.id).role,
    })),
  });

  const flush = () => {
    for (const e of game.drain()) {
      if (e.type !== 'obs') { emit(e); continue; }
      agents.get(e.p).memory.observe(e.t, e.kind, e.text, e.data);
      emit({ type: 'memory', t: e.t, p: e.p, kind: e.kind, text: e.text });
    }
  };

  const runMeeting = async () => {
    flush();
    const m = game.meeting;
    const alive = game.living();
    const info = {
      n: m.n, t: game.t, reason: m.reason, room: m.room,
      callerName: game.byId(m.caller).name,
      bodyName: m.body ? game.byId(m.body).name : null,
      alive: alive.map((p) => p.name),
      dead: [...game.publicDead].map((id) => game.byId(id).name),
    };
    log(`[${clock(game.t)}] meeting #${m.n} called by ${info.callerName}`);
    const first = Math.max(0, alive.findIndex((p) => p.id === m.caller));
    const order = [...alive.slice(first), ...alive.slice(0, first)];
    const transcript = [];
    const turns = meetingTurns(order, config.discussionRounds);
    for (let turn = turns.next(); turn; turn = turns.next()) {
      const { seat: p, round, replyTo } = turn;
      emit({ type: 'thinking', t: game.t, players: [p.id] });
      const r = await agents.get(p.id).speak(info, transcript, round, config.discussionRounds, replyTo?.name ?? null);
      transcript.push({ name: p.name, text: r.chat });
      emit({ type: 'chat', t: game.t, p: p.id, round, text: r.chat, thought: r.thought, suspect: r.suspect, replyTo: replyTo?.id ?? null, error: r.error, ms: r.ms, model: r.model });
      turns.heard(p, r.chat, alive.find((o) => o.name === r.suspect) ?? null);
    }
    const options = alive.map((p) => p.name);
    emit({ type: 'thinking', t: game.t, players: alive.map((p) => p.id), voting: true });
    const votes = await Promise.all(alive.map((p) => agents.get(p.id).vote(info, transcript, options)));
    const ballot = {};
    alive.forEach((p, i) => {
      const v = votes[i];
      ballot[p.id] = v.vote === 'skip' ? 'skip' : game.byName(v.vote).id;
      emit({ type: 'vote', t: game.t, p: p.id, target: ballot[p.id], thought: v.thought, error: v.error, ms: v.ms, model: v.model });
    });
    const result = game.resolveVotes(ballot);
    flush();

    const name = (id) => (id === 'skip' ? 'skip' : game.byId(id).name);
    const why = m.reason === 'body' ? `${info.callerName} reported ${info.bodyName}'s body in ${info.room}` : `${info.callerName} pressed the button`;
    const outcome = result.ejected
      ? `${name(result.ejected)} was ejected${game.rules.confirmEjects ? (result.wasImpostor ? ' (an Impostor)' : ' (NOT an Impostor)') : ''}`
      : `nobody was ejected (${result.why})`;
    const text = [
      `Meeting #${m.n} [${clock(info.t)}]: ${why}. Dead by then: ${info.dead.join(', ') || 'nobody'}.`,
      ...transcript.map((c) => `  ${c.name}: ${quote(c.text)}`),
      `  Votes: ${alive.map((p) => `${p.name}→${name(ballot[p.id])}`).join(', ')}`,
      `  Result: ${outcome}.`,
    ].join('\n');
    for (const a of agents.values()) a.memory.addMeeting(text);
    log(`  ${outcome}`);
    game.endMeeting();
    flush();
  };

  const files = () => {
    fs.closeSync(eventsFd);
    if (promptsFd !== null) fs.closeSync(promptsFd);
  };

  try {
    game.start();
    flush();
    let rounds = 0;
    while (game.phase !== 'over') {
      if (game.phase === 'meeting') { await runMeeting(); rounds = 0; continue; }
      let pending = game.pendingDecisions();
      if (pending.length && rounds > 0 && rounds < ROUNDS_PER_SECOND) {
        game.refreshSight(); // the last round may have changed who is alive or what the lights let anyone see
        flush();
        pending = game.pendingDecisions();
      }
      if (pending.length && rounds < ROUNDS_PER_SECOND) {
        rounds++;
        const views = pending.map((p) => game.view(p.id));
        emit({ type: 'thinking', t: game.t, players: pending.map((p) => p.id) });
        const results = await Promise.all(pending.map((p, i) => agents.get(p.id).decideRoam(views[i])));
        for (const p of pending) p.needs = null;
        pending.forEach((p, i) => {
          const r = results[i];
          const stale = !!p.needs;
          emit({ type: 'decision', t: game.t, p: p.id, reason: views[i].reason, thought: r.thought, action: r.action, raw: r.raw, say: r.say, note: r.note, error: r.error, ms: r.ms, model: r.model, ...(stale ? { stale } : {}) });
          if (game.phase === 'roam' && p.alive && !stale) {
            game.speak(p.id, r.say); // said where they stand, before the order moves them
            game.act(p.id, r.action);
          }
          flush();
        });
        continue;
      }
      rounds = 0;
      game.step();
      flush();
    }

    log(`[${clock(game.t)}] game over: ${game.winner} (${game.reason})`);
    if (config.persistentMemory) await reflectAll();
  } catch (e) {
    emit({ type: 'match_error', t: game.t, error: String(e?.message ?? e) });
    throw e;
  } finally {
    emit({ type: 'stats', t: game.t, seats: Object.fromEntries([...agents].map(([id, a]) => [id, a.stats])) });
    files();
  }

  async function reflectAll() {
    const roles = seats.map((s) => `${s.name}=${game.byId(s.id).role}`).join(', ');
    const headline = game.winner === 'none'
      ? `Nobody won (${game.reason}).`
      : `${game.winner === 'crew' ? 'The crewmates' : 'The impostors'} won (${game.reason}).`;
    const results = await Promise.all(seats.map((s) => {
      const p = game.byId(s.id);
      return agents.get(s.id).reflect({ headline, roles, myRole: p.role, survived: p.alive });
    }));
    const date = new Date().toISOString().slice(0, 10);
    seats.forEach((s, i) => {
      const r = results[i];
      const p = game.byId(s.id);
      emit({ type: 'reflection', t: game.t, p: s.id, lesson: r.lesson, thought: r.thought, error: r.error });
      if (!r.lesson) return;
      const won = game.winner === (p.role === 'impostor' ? 'impostor' : 'crew');
      appendLongTerm(memoryDir, s, { date, matchId, role: p.role, result: won ? 'won' : 'lost', lesson: r.lesson });
    });
  }

  return { winner: game.winner, reason: game.reason, t: game.t, dir, events, agents };
}
return {runMatch: runMatch};
})();
window.ninoAmong = {"rng": mods["rng"], "i18n": mods["i18n"], "engine_map": mods["engine/map"], "engine_game": mods["engine/game"], "agents_memory": mods["agents/memory"], "agents_prompts": mods["agents/prompts"], "agents_agent": mods["agents/agent"], "providers_mock": mods["providers/mock"], "match_turns": mods["match/turns"], "match_runner": mods["match/runner"]};
})();
