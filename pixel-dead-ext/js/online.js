/* Pixel Dead v2 - online.js : HostSession, ClientSession, Mirror (pure logic, no DOM, testable in Node with a fake Net) */
(function (root) {
'use strict';
const PD = root.PD;
const SNAP_DT = .05, PEND_CAP = 200, SILENT = 8, MAXP = 8;
const later = (fn, ms) => { const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; };
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d || 0);
const noop = () => {};

/* =====================================================================
   HostSession: owns the roster and the authoritative Sim, talks to PD.Net (or a fake)
   ===================================================================== */
function HostSession(net, me) {
  const S = this;
  S.net = net; S.id = 'p1'; S.mode = 'endless'; S.map = PD.MODES.endless.map; S.sim = null; S.over = null; S.overSent = false; S.closed = false; S.clock = 0;
  S.me = { id: 'p1', name: PD.cleanName(me && me.name), look: PD.cleanLook(me && me.look) };
  S.roster = [S.me];
  S.cl = {};          // per client runtime state: {pend, snapT, seen}
  S.rejected = {};    // pids that were told to go away
  S.botFill = 0;      // 0 = no bots, else the target TOTAL player count (bots fill the empty seats when the game starts)
  S.chatLog = []; S.chatT = {}; S.now = () => Date.now(); S.onchat = null;
  S.defer = later;    // overridable (tests)
  S.onroster = S.onjoin = S.onleave = S.onover = null;
  net.accepting = true;
  net.onopen = pid => S._open(pid);
  net.onclose = (pid, why) => S._close(pid, why);
  net.onmsg = (pid, m) => S._msg(pid, m);
}
PD.HostSession = HostSession;
const H = HostSession.prototype;

H.list = function () { return this.roster.map(r => ({ id: r.id, name: r.name, look: r.look })); };
H.entry = function (pid) { return this.roster.find(r => r.id === pid) || null; };
H.sendTo = function (pid, obj, reliable) { if (pid !== 'p1') this.net.send(pid, obj, reliable !== false); };
H.bc = function (obj, reliable) { for (const r of this.roster) if (r.id !== 'p1') this.net.send(r.id, obj, reliable !== false); };
H.rosterMsg = function () { return { t: 'roster', list: this.list(), mode: this.mode, map: this.map, bots: this.botsToAdd() }; };
H.changed = function () { this.bc(this.rosterMsg(), true); if (this.onroster) this.onroster(this.roster); };
/* bots fill empty seats up to botFill (and at least the mode minimum), never past MAXP total */
H.botsToAdd = function () {
  const m = PD.MODES[this.mode]; if (!this.botFill || !m || this.sim) return 0;
  return Math.max(0, Math.min(MAXP, Math.max(this.botFill | 0, m.min)) - this.roster.length);
};
H.setBots = function (n) {
  n = n | 0; if (n !== 0 && (n < 2 || n > MAXP)) n = n < 2 ? 0 : MAXP; if (this.closed || this.sim || n === this.botFill) return false;
  this.botFill = n; this.changed(); return true;
};
H.canStart = function () { const m = PD.MODES[this.mode]; return !this.closed && !this.sim && !!m && this.roster.length + this.botsToAdd() >= m.min && this.roster.length <= MAXP; };
H.setMode = function (m) {
  if (this.sim || this.closed || !PD.MODES[m] || m === 'single' || m === this.mode) return false;
  this.mode = m; this.map = PD.pickMap(m, this.map); this.changed(); return true;
};
H.setMap = function (k) {
  const md = PD.MODES[this.mode]; if (this.sim || this.closed || !md || md.maps.indexOf(k) < 0 || k === this.map) return false;
  this.map = k; this.changed(); return true;
};
H.reject = function (pid, why) {
  this.sendTo(pid, { t: 'reject', why }, true);
  if (this.rejected[pid]) return; this.rejected[pid] = 1;
  this.defer(() => { delete this.rejected[pid]; if (!this.entry(pid)) this.net.drop(pid); }, 250);
};
H._open = function (pid) {
  if (this.closed) return;
  if (this.sim) this.reject(pid, 'That game has already started. Ask the host to go back to the lobby.');
  else if (this.roster.length >= MAXP) this.reject(pid, 'That room is full.');
};
H._msg = function (pid, m) {
  if (this.closed || !m || typeof m !== 'object') return;
  if (m.t === 'hello') return this._hello(pid, m);
  const e = this.entry(pid), c = this.cl[pid]; if (!e || !c) return;
  if (m.t === 'in') { c.seen = this.clock; if (this.sim) this.sim.setInput(pid, m); }
  else if (m.t === 'act') { c.seen = this.clock; if (this.sim && (m.k === 'rl' || m.k === 'use' || m.k === 'sw' || m.k === 'ab' || m.k === 'bm' || m.k === 'bsel')) this.sim.act(pid, m.k, m.v); }
  else if (m.t === 'bye') { this._leave(pid, 'left'); this.net.drop(pid); }
  else if (m.t === 'chat') { c.seen = this.clock; this._chat(pid, m.s); }
  else if (m.t === 'ping') { c.seen = this.clock; this.sendTo(pid, { t: 'pong', n: num(m.n) }, false); }
};
/* ---------- text chat: host cleans, rate limits (4 per 5 s per sender), broadcasts, keeps the last 40 ---------- */
H._chat = function (pid, text) {
  if (typeof text !== 'string') return false;
  const e = this.entry(pid), s = PD.cleanChat(text); if (!e || !s) return false;
  const now = this.now(), q = (this.chatT[pid] || []).filter(t => now - t < 5000);
  if (q.length >= 4) { this.chatT[pid] = q; if (pid !== 'p1') this.sendTo(pid, { t: 'chat', id: '', name: '', s: 'Slow down.', sys: 1 }, true); return false; }
  q.push(now); this.chatT[pid] = q;
  const msg = { t: 'chat', id: pid, name: e.name, s }; this.chatLog.push(msg); if (this.chatLog.length > 40) this.chatLog.shift();
  this.bc(msg, true); if (this.onchat) this.onchat(msg); return true;
};
H.chat = function (text) { return this.closed ? false : this._chat('p1', text); };
H._hello = function (pid, m) {
  if (pid === 'p1') return;
  const ex = this.entry(pid);
  if (m.v !== 2) return this.reject(pid, 'Your game version does not match the host. Update the extension and try again.');
  if (this.sim && !ex) return this.reject(pid, 'That game has already started. Ask the host to go back to the lobby.');
  if (!ex && this.roster.length >= MAXP) return this.reject(pid, 'That room is full.');
  const name = PD.cleanName(m.name), look = PD.cleanLook(m.look);
  if (ex) { ex.name = name; ex.look = look; }
  else { this.roster.push({ id: pid, name, look }); this.cl[pid] = { pend: [], snapT: 0, seen: this.clock }; }
  this.sendTo(pid, { t: 'welcome', id: pid, mode: this.mode, map: this.map, roster: this.list(), bots: this.botsToAdd(), chat: this.chatLog.slice(-12) }, true);
  this.changed();
  if (!ex && this.onjoin) this.onjoin(this.entry(pid));
};
H._leave = function (pid, why) {
  const i = this.roster.findIndex(r => r.id === pid); if (i < 0) return false;
  const e = this.roster.splice(i, 1)[0]; delete this.cl[pid]; delete this.chatT[pid];
  if (this.sim) this.sim.removePlayer(pid);
  this.changed(); if (this.onleave) this.onleave(e, why); return true;
};
H._close = function (pid, why) { if (!this.closed) this._leave(pid, why || 'closed'); };
H._drop = function (pid, why) { this.sendTo(pid, { t: 'bye', why }, true); this._leave(pid, why); this.net.drop(pid); };

H.start = function () {
  if (!this.canStart()) return null;
  const seed = 1 + Math.floor(Math.random() * 2147483000), players = this.list(), nb = this.botsToAdd();
  for (let i = 0; i < nb; i++) players.push({ id: 'b' + (i + 1), name: 'Bot ' + PD.BOTNAMES[i % PD.BOTNAMES.length], look: PD.randomLook(), bot: 1 });
  this.sim = new PD.Sim({ mode: this.mode, map: this.map, seed, online: true, players });
  this.over = null; this.overSent = false;
  for (const pid in this.cl) { const c = this.cl[pid]; c.pend = []; c.snapT = 0; c.seen = this.clock; }
  this.net.accepting = false;
  this.bc({ t: 'start', mode: this.mode, map: this.sim.mapKind, seed, players: this.sim.players.map(p => ({ id: p.id, name: p.name, look: p.look, bot: p.bot ? 1 : 0 })) }, true);
  return this.sim;
};
/* call every frame AFTER sim.update and BEFORE main clears sim.rel / sim.ev. Never clears rel/ev (only evNet). */
H.step = function (dt) {
  const sim = this.sim; if (this.closed || !sim) return;
  this.clock += dt;
  const pids = Object.keys(this.cl);
  // 1. network events -> per client pending lists (filtered by distance / ownership)
  if (sim.evNet.length) {
    for (const pid of pids) {
      const c = this.cl[pid], f = sim.filterEvents(sim.evNet, pid);
      for (const e of f) c.pend.push(e);
      if (c.pend.length > PEND_CAP) c.pend.splice(0, c.pend.length - PEND_CAP);
    }
    sim.evNet.length = 0;
  }
  // 2. reliable events (banner / feed / tile)
  if (sim.rel.length) for (const e of sim.rel) this.bc(e, true);
  // 3. snapshots, 20 Hz per client, unreliable
  for (const pid of pids) {
    const c = this.cl[pid]; if (!c) continue;
    c.snapT += dt; if (c.snapT < SNAP_DT - 1e-9) continue; c.snapT = Math.min(c.snapT - SNAP_DT, SNAP_DT);
    if (!sim.pmap[pid]) continue;
    const s = sim.snapFor(pid, c.pend); c.pend = [];
    if (s.e.length > 60 && JSON.stringify(s).length > 15000) s.e = s.e.slice(-30);
    this.net.send(pid, s, false);
  }
  // 4. game over, once
  if (sim.over && !this.overSent) { this.overSent = true; this.over = sim.over; this.bc({ t: 'over', over: sim.over }, true); if (this.onover) this.onover(sim.over); }
  // 5. silent clients
  if (!sim.over) for (const pid of pids) { const c = this.cl[pid]; if (c && this.clock - c.seen > SILENT) this._drop(pid, 'timeout'); }
};
H.toLobby = function () {
  if (this.closed || !this.sim) return false;
  this.sim = null; this.over = null; this.overSent = false;
  for (const pid in this.cl) { this.cl[pid].pend = []; this.cl[pid].snapT = 0; }
  this.net.accepting = true; this.bc({ t: 'lobby' }, true); this.changed(); return true;
};
H.close = function () {
  if (this.closed) return; this.chatLog = []; this.chatT = {}; this.bc({ t: 'bye', why: 'The host closed the room.' }, true);
  this.closed = true; this.sim = null; const net = this.net;
  net.onopen = net.onclose = net.onmsg = noop; net.accepting = true; net.close();
};

/* =====================================================================
   ClientSession
   ===================================================================== */
function ClientSession(net, me, opts) {
  const S = this;
  S.net = net; S.me = { name: PD.cleanName(me && me.name), look: PD.cleanLook(me && me.look) };
  S.id = null; S.mode = 'endless'; S.map = PD.MODES.endless.map; S.roster = []; S.mirror = null; S.over = null; S.joined = false; S.closed = false; S.rejected = false; S.helloSent = false;
  S.fc = 0; S.lastIn = -1e9; S.now = () => Date.now(); S.bots = 0; S.chatLog = []; S.rtt = -1; S.lastPing = -1e9; S.pingN = 0; S.pingAt = {}; S.onchat = null;
  S.onroster = S.onstart = S.onlobby = S.onover = S.onreject = S.onbye = S.onclose = null;
  net.onopen = pid => { if (pid === 'h') S._hello(); };
  net.onclose = (pid, why) => { if (pid === 'h') S._lost(why); };
  net.onmsg = (pid, m) => { if (pid === 'h') S._msg(m); };
  if (opts && opts.open) S._hello();   // channel was already open before this session was created
}
PD.ClientSession = ClientSession;
const C = ClientSession.prototype;
C._hello = function () { if (this.helloSent || this.closed) return; this.helloSent = true; this.net.send('h', { t: 'hello', v: 2, name: this.me.name, look: this.me.look }, true); };
C._lost = function (why) { if (this.closed) return; this.closed = true; if (this.onclose) this.onclose(why || 'closed'); };
C._msg = function (m) {
  if (this.closed || !m || typeof m !== 'object') return;
  switch (m.t) {
    case 'welcome': this.id = m.id; this.mode = m.mode; this.map = PD.pickMap(m.mode, m.map); this.roster = m.roster || []; this.bots = m.bots | 0; this.joined = true;
      if (this.onroster) this.onroster(this.roster, this.mode, this.map, this.bots);
      if (Array.isArray(m.chat)) for (const c of m.chat) this._chatIn(c, 1);
      break;
    case 'roster': this.roster = m.list || []; this.bots = m.bots | 0; if (m.mode) { this.mode = m.mode; this.map = PD.pickMap(m.mode, m.map); } if (this.onroster) this.onroster(this.roster, this.mode, this.map, this.bots); break;
    case 'reject': this.rejected = true; this.closed = true; if (this.onreject) this.onreject(String(m.why || 'The host refused the connection.')); break;
    case 'start':
      this.mode = m.mode; this.over = null;
      this.mirror = new PD.Mirror({ mode: m.mode, map: m.map, seed: m.seed, players: m.players, meId: this.id });
      if (this.onstart) this.onstart(this.mirror); break;
    case 'lobby': this.mirror = null; this.over = null; if (this.onlobby) this.onlobby(); break;
    case 'banner': case 'feed': if (this.mirror) this.mirror.rel.push(m); break;
    case 'tile': if (this.mirror) this.mirror.tile(m.x, m.y, m.v); break;
    case 'chat': this._chatIn(m, 0); break;
    case 'pong': { const t0 = this.pingAt[m.n | 0]; if (t0 != null) { delete this.pingAt[m.n | 0]; const r = this.now() - t0; this.rtt = this.rtt < 0 ? r : this.rtt * .6 + r * .4; } break; }
    case 'over': this.over = m.over; if (this.onover) this.onover(m.over); break;
    case 'bye': this.closed = true; if (this.onbye) this.onbye(String(m.why || 'The host left.')); break;
    case 's': if (this.mirror) this.mirror.applySnap(m); break;
  }
};
/* rate limited to ~30 Hz; returns true when a packet was sent */
C._chatIn = function (m, old) {
  if (!m || typeof m !== 'object') return;
  const msg = { id: String(m.id || '').slice(0, 4), name: m.sys ? '' : PD.cleanName(m.name), s: PD.cleanChat(m.s), sys: m.sys ? 1 : 0, old: old ? 1 : 0 }; if (!msg.s) return;
  this.chatLog.push(msg); if (this.chatLog.length > 40) this.chatLog.shift(); if (this.onchat) this.onchat(msg);
};
C.chat = function (text) { if (typeof text !== 'string') return false; const s = PD.cleanChat(text); if (this.closed || !this.joined || !s) return false; this.net.send('h', { t: 'chat', s }, true); return true; };
/* round trip time, sampled every 2 s over the unreliable lane */
C.ping = function () { const t = this.now(); if (this.closed || t - this.lastPing < 2000) return false; this.lastPing = t; const n = ++this.pingN; this.pingAt[n] = t; delete this.pingAt[n - 5]; this.net.send('h', { t: 'ping', n }, false); return true; };
C.sendInput = function (inp) {
  if (this.closed || !this.mirror) return false;
  const t = this.now(); if (t - this.lastIn < 1000 / 30 - 1) return false; this.lastIn = t;
  inp = inp || {};
  this.net.send('h', { t: 'in', mx: Math.round(num(inp.mx) * 100) / 100, my: Math.round(num(inp.my) * 100) / 100, a: Math.round(num(inp.a) * 100) / 100, f: inp.f ? 1 : 0, fc: inp.fc | 0, sp: inp.sp ? 1 : 0, f2: inp.f2 ? 1 : 0, ad: Math.round(Math.max(0, Math.min(400, num(inp.ad)))) }, false);
  return true;
};
C.act = function (k, v) { if (this.closed) return false; this.net.send('h', { t: 'act', k, v: v == null ? 0 : v }, true); return true; };
C.leave = function () {
  if (!this.closed) { this.closed = true; this.net.send('h', { t: 'bye' }, true); }
  const net = this.net; net.onopen = net.onclose = net.onmsg = noop; net.close();
};

/* =====================================================================
   Mirror: client-side view of the world built from snapshots
   ===================================================================== */
const ZERO = { mx: 0, my: 0, sp: 0 };
function Mirror(o) {
  this.mode = o.mode; this.seed = o.seed | 0; this.meId = o.meId;
  this.mapKind = PD.pickMap(o.mode, o.map); this.map = PD.genMap(this.mapKind, this.seed, o.mode === 'hide');
  this.info = {}; for (const p of o.players || []) this.info[p.id] = { name: PD.cleanName(p.name), look: PD.cleanLook(p.look), bot: p.bot ? 1 : 0 };
  this.pl = {}; this.plist = []; this.zm = {}; this.zs = []; this.projs = []; this.eprojs = []; this.pickups = []; this.turrets = []; this.clouds = []; this.blocks = [];
  this.hv = null; this.g = { m: o.mode, r: 0, lf: 0, it: 0, tm: 0, wt: 0, bs: 0, pu: { x2: 0, insta: 0, freeze: 0 }, kl: 0, ph: '', pt: 0, tl: 0, sn: 0, lim: 0, sk: 0, hd: 0, sc: [] };
  this.ev = []; this.rel = []; this.t = 0; this.lastTm = -1; this.nsnap = 0; this.stamp = 0; this.flag = p => p.fl;
}
PD.Mirror = Mirror;
const M = Mirror.prototype;

M.me = function () { const p = this.pl[this.meId]; return p && p.vis ? p : null; };
M.tile = function (x, y, v) { PD.setTile(this.map, x | 0, y | 0, v | 0); };
M.applySnap = function (s) {
  if (!s || s.t !== 's') return false;
  if (s.tm != null && s.tm < this.lastTm) return false;     // stale (unordered channel)
  if (s.tm != null) this.lastTm = s.tm; this.nsnap++;
  const stamp = ++this.stamp, list = [];
  for (const a of s.p || []) {
    const id = a[0], x = a[1], y = a[2], ang = a[3], fl = a[5] | 0; let p = this.pl[id]; const was = !!(p && p.vis), wasAlive = was && (p.fl & 1);
    if (!p) { const inf = this.info[id] || {}; p = this.pl[id] = { id, name: inf.name || String(id), look: inf.look || PD.defaultLook(), x, y, tx: x, ty: y, ang, tang: ang, ph: 0, fl: 0, hp: 100, wid: 0, swing: 0, stam: 100, exh: false, spd: 1, sprint: false, vis: false, seen: 0 }; }
    p.vis = true; p.seen = stamp; p.hp = a[4]; p.fl = fl; p.wid = a[6] || 0; p.swing = fl & 128 ? .18 : 0; p.tang = ang; p.tx = x; p.ty = y;
    if (id === this.meId) {
      const ex = x - p.x, ey = y - p.y, err = Math.hypot(ex, ey);
      if (!was || !wasAlive !== !(fl & 1) || err > 40) { p.x = x; p.y = y; }
      else if (err > 12) { p.x += ex * .15; p.y += ey * .15; }
    } else if (!was) { p.x = x; p.y = y; p.ang = ang; }
    list.push(p);
  }
  for (const id in this.pl) if (this.pl[id].seen !== stamp) this.pl[id].vis = false;
  this.plist = list;
  const me = this.pl[this.meId];
  if (s.h) {
    this.hv = Object.assign({}, s.h);
    if (me) {
      if (s.h.spd != null) me.spd = s.h.spd;
      if (s.h.stam != null && Math.abs(s.h.stam - me.stam) > 20) { me.stam = s.h.stam; if (me.stam > 25) me.exh = false; else if (me.stam <= 0) me.exh = true; }
    }
  }
  if (s.g) this.g = s.g;
  // zombies
  const nz = {}, zs = [];
  for (const a of s.z || []) {
    const id = a[0], type = a[1], fl = a[6] | 0; let z = this.zm[id];
    if (!z) { const B = PD.BOSSES[type], Z = PD.ZT[type] || PD.ZT.walker; z = { id, type, boss: !!B, r: (B || Z).r, x: a[2], y: a[3], ang: a[4], ph: (id * 1.7) % 6.28, ai: { st: '' } }; }
    z.tx = a[2]; z.ty = a[3]; z.tang = a[4]; z.hpf = a[5] / 255; z.fl = fl; z.flash = fl & 32 ? .1 : 0; z.armor = !!(fl & 8); z.ai.st = fl & 16 ? 'wind' : '';
    nz[id] = z; zs.push(z);
  }
  this.zm = nz; this.zs = zs;
  this.projs = (s.pr || []).map(a => ({ kind: a[0], x: a[1], y: a[2], vx: a[3], vy: a[4] }));
  this.eprojs = (s.ep || []).map(a => ({ kind: a[0], x: a[1], y: a[2], vx: a[3], vy: a[4], r: a[5] }));
  this.pickups = (s.pk || []).map(a => ({ id: a[0], kind: a[1], x: a[2], y: a[3], life: a[4] }));
  this.turrets = (s.tu || []).map(a => ({ x: a[0], y: a[1], ang: a[2] }));
  this.clouds = (s.cl || []).map(a => ({ x: a[0], y: a[1], r: a[2], life: a[3] }));
  this.blocks = (s.bl || []).map(a => ({ x: a[0], y: a[1], f: a[2] / 255 }));
  if (s.e && s.e.length) { for (const e of s.e) this.ev.push(e); if (this.ev.length > 400) this.ev.splice(0, this.ev.length - 400); }
  return true;
};
/* per frame: predict own player with the same movement code as the host, smooth everything else */
M.predict = function (dt, inp) {
  dt = Math.max(0, Math.min(dt, .1)); this.t += dt;
  const k = 1 - Math.exp(-dt * 15), me = this.pl[this.meId];
  if (me && me.vis && (me.fl & 1)) {
    PD.movePlayer(this.map, me, inp ? { mx: inp.mx, my: inp.my, sp: inp.sp } : ZERO, dt);
    if (inp && inp.a != null) me.ang = inp.a;
  } else if (me && me.vis) { me.x = me.tx; me.y = me.ty; me.ang = me.tang; }
  for (const p of this.plist) {
    if (p === me) continue;
    const dx = (p.tx - p.x) * k, dy = (p.ty - p.y) * k; p.x += dx; p.y += dy; p.ph += Math.hypot(dx, dy) * .28; p.ang += PD.angDiff(p.tang, p.ang) * k;
  }
  for (const z of this.zs) { const dx = (z.tx - z.x) * k, dy = (z.ty - z.y) * k; z.x += dx; z.y += dy; z.ph += Math.hypot(dx, dy) * .28; z.ang += PD.angDiff(z.tang, z.ang) * k; }
  for (const q of this.projs) { q.x += q.vx * dt; q.y += q.vy * dt; }
  for (const q of this.eprojs) { q.x += q.vx * dt; q.y += q.vy * dt; }
  for (const q of this.pickups) q.life -= dt;
  for (const q of this.clouds) q.life -= dt;
  return me && me.vis ? me : null;
};
M.view = function () {
  const me = this.pl[this.meId]; if (this.hv && me) this.hv.stam = me.stam;
  return { map: this.map, meId: this.meId, players: this.plist, flag: this.flag, zs: this.zs, projs: this.projs, eprojs: this.eprojs, pickups: this.pickups, turrets: this.turrets, clouds: this.clouds, blocks: this.blocks, h: this.hv, g: this.g, t: this.t, ev: this.ev };
};
})(typeof window !== 'undefined' ? window : globalThis);
