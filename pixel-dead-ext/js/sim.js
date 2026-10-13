/* Pixel Dead v2 - sim.js : authoritative simulation (single / endless / arena / pvp / hide) */
(function (root) {
'use strict';
const PD = root.PD, T = PD.T, TL = PD.TILE, WDEF = PD.WDEF, ZT = PD.ZT, BOSSES = PD.BOSSES, PUDEF = PD.PUDEF;
const PR = 5, rnd = PD.rnd, clamp = PD.clamp;

/* ---------- shared player movement (host + client prediction) ---------- */
PD.movePlayer = function (map, p, inp, dt) {
  let mx = inp.mx || 0, my = inp.my || 0; const l = Math.hypot(mx, my), moving = l > .01;
  if (moving) { mx /= l; my /= l; }
  const want = !!inp.sp && moving && p.stam > 0 && !p.exh;
  if (want) { p.stam = Math.max(0, p.stam - 35 * dt); if (p.stam <= 0) p.exh = true; }
  else { p.stam = Math.min(100, p.stam + 22 * dt); if (p.exh && p.stam > 25) p.exh = false; }
  p.sprint = want;
  const sp = 72 * (p.spd == null ? 1 : p.spd) * (want ? 1.45 : 1);
  if (moving && sp > 0) { const d = PD.moveCircle(map, p, mx * sp * dt, my * sp * dt, PR); p.ph = (p.ph || 0) + d * .28; }
  p.mv = moving;
};

const mkW = id => ({ id, mag: WDEF[id].mag, res: WDEF[id].res });
PD.mkW = mkW;

function Sim(o) {
  this.mode = o.mode; this.online = !!o.online; this.seed = o.seed | 0;
  this.pve = this.mode === 'single' || this.mode === 'endless' || this.mode === 'arena';
  this.pvp = this.mode === 'pvp'; this.hide = this.mode === 'hide';
  if (!this.pve && !this.pvp && !this.hide) throw new Error('unknown mode: ' + this.mode);
  this.puPool = this.pve ? PD.PUPOOL.pve : this.pvp ? PD.PUPOOL.pvp : PD.PUPOOL.hide;
  this.mapKind = PD.pickMap(this.mode, o.map); this.map = PD.genMap(this.mapKind, this.seed, this.hide);
  this.players = []; this.pmap = {};
  this.zs = []; this.projs = []; this.eprojs = []; this.pickups = []; this.turrets = []; this.clouds = [];
  this.ev = []; this.evNet = []; this.rel = [];
  this.blk = new Map(); this.nodes = new Map(); this.regrow = []; this.map.nb = 0;   // player walls (tile index -> {hp, mhp, o, base, t}), pickaxe progress, regrowing resources
  this.t = 0; this.nid = 1; this.over = null; this.fields = {};
  this.g = { round: 0, inter: 3, toSpawn: 0, spawnT: 0, kills: 0, pu: { x2: 0, insta: 0, freeze: 0 }, boss: null, waveT: 55, dropT: 8, hpPause: 0, bossN: 0, bossT: 75, itemT: 3, ph: '', phT: 0, scanT: 0, tl: 0, lim: 0 };
  (o.players || []).forEach(pl => this.addPlayer(pl));
  if (this.pvp) { this.g.round = 5; this.g.tl = 360; this.g.lim = 20; this.players.forEach(p => this.spawnApart(p)); this.banner('FIRST TO 20 KILLS', '#e8e2cf'); }
  else if (this.hide) this.startHide();
  else this.banner(this.mode === 'arena' ? 'ARENA RUSH' : 'SURVIVE', '#e8e2cf');
}
PD.Sim = Sim;
const P = Sim.prototype;

P.emit = function (e) { this.ev.push(e); if (this.online) this.evNet.push(e); };
P.banner = function (s, c) { this.rel.push({ t: 'banner', s, c: c || '#e8e2cf' }); };
P.feed = function (s) { this.rel.push({ t: 'feed', s }); };
P.snd = function (s, x, y) { this.emit({ t: 'snd', s, x, y }); };

/* ---------- players ---------- */
P.addPlayer = function (pl) {
  const p = {
    id: pl.id, name: PD.cleanName(pl.name), look: PD.cleanLook(pl.look), x: 0, y: 0, ang: 0, ph: 0,
    hp: 100, maxhp: 100, sh: 0, pts: 500, score: 0, k: 0, d: 0, alive: true, stam: 100, exh: false, spd: 1, sprint: false,
    weapons: this.hide ? [] : [mkW('m1911'), mkW('pick')], wood: PD.BUILD.START.wood, stone: PD.BUILD.START.stone, build: 0, bsel: 0, bcd: 0, lg: 0, cur: 0, cd: 0, reload: 0, pull: 0, lastFc: 0, regenT: 0, hurt: 0, swing: 0,
    pu: { speed: 0, rapid: 0, cloak: 0 }, cb: 0, cbT: 0, streak: 0, st: 0, prot: 0, atkT: 0, r: PR, seeker: 0, stun: 0, ab: 0, resp: 0, bot: pl.bot && PD.newBot ? PD.newBot() : null,
    inp: { mx: 0, my: 0, a: 0, f: 0, fc: 0, sp: 0, f2: 0, ad: 0 },
  };
  const s = this.map.start, n = this.players.length, a = n * 2.1;
  p.x = s.x + Math.cos(a) * (n ? 18 : 0); p.y = s.y + Math.sin(a) * (n ? 18 : 0);
  PD.resolveCircle(this.map, p, PR);
  Object.defineProperty(p, 'dead', { get() { return !this.alive; } });
  this.players.push(p); this.pmap[p.id] = p; return p;
};
P.spotFar = function (avoid, minD) {
  const m = this.map, pool = m.spawns.concat(m.itemSpots); let best = null, bd = -1;
  for (let i = 0; i < 16; i++) {
    const s = PD.pick(pool); if (!s) break; let d = 1e9; for (const q of avoid) d = Math.min(d, PD.dist(q.x, q.y, s.x, s.y));
    if (d > bd) { bd = d; best = s; } if (d >= (minD || 0) && i >= 3) break;
  }
  return best || m.start;
};
P.spawnApart = function (p) {
  const s = this.spotFar(this.players.filter(q => q !== p), 500); p.x = s.x; p.y = s.y; PD.resolveCircle(this.map, p, PR);
};
P.respawnPvp = function (p) {
  const s = this.spotFar(this.players.filter(q => q !== p && q.alive), 450);
  p.alive = true; p.hp = p.maxhp; p.sh = 0; p.stam = 100; p.exh = false; p.weapons = [mkW('m1911'), mkW('pick')]; p.cur = 0; p.reload = 0; p.cd = 0; p.build = 0; p.wood = PD.BUILD.START.wood; p.stone = PD.BUILD.START.stone;
  p.pu = { speed: 0, rapid: 0, cloak: 0 }; p.x = s.x; p.y = s.y; PD.resolveCircle(this.map, p, PR); p.prot = 2.5; p.regenT = 0;
  this.emit({ t: 'tp', x: p.x, y: p.y });
};
P.removePlayer = function (id) {
  const p = this.pmap[id]; if (!p) return; this.players = this.players.filter(q => q !== p); delete this.pmap[id]; delete this.fields[id]; delete this.fields['bf' + id];
  if (this.pvp && this.players.length < 2) this.endPvp();
  if (this.hide && this.players.length && !this.players.some(q => q.seeker)) { const h = PD.pick(this.players); h.seeker = 1; this.feed(h.name + ' is now a seeker'); }
  this.checkOver();
};
P.setInput = function (id, inp) {
  const p = this.pmap[id]; if (!p) return;
  if (inp.fc !== p.lastFc) { p.lastFc = inp.fc; p.pull = .15; }
  p.inp.mx = clamp(+inp.mx || 0, -1, 1); p.inp.my = clamp(+inp.my || 0, -1, 1); p.inp.a = +inp.a || 0; p.inp.f = inp.f ? 1 : 0; p.inp.sp = inp.sp ? 1 : 0; p.inp.f2 = inp.f2 ? 1 : 0; p.inp.ad = clamp(+inp.ad || 0, 0, 400);
};
P.alive = function () { return this.players.filter(p => p.alive); };
function nearestAlive(sim, x, y) {
  let b = null, bd = 1e9;
  for (const p of sim.players) if (p.alive && !(p.pu.cloak > 0)) { const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y); if (d < bd) { bd = d; b = p; } }
  return b ? { p: b, d: Math.sqrt(bd) } : null;
}
P.addPts = function (p, n) {
  if (this.hide) return;
  if (this.g.pu.x2 > 0) n *= 2;
  if (this.mode === 'arena') n *= 1 + Math.min(4, Math.floor(p.streak / 3));
  p.pts += n; p.score += n;
};
P.hurtP = function (p, dmg, kx, ky, by) {
  if (!p.alive || p.prot > 0) return;
  if (p.sh > 0) { const a = Math.min(p.sh, dmg); p.sh -= a; dmg -= a; }
  if (dmg <= 0) return;
  p.hp -= dmg; p.hurt = .35; p.regenT = this.pvp ? 6 : 5; this.emit({ t: 'hurt', id: p.id });
  if (by && by !== p) this.emit({ t: 'hit', x: p.x, y: p.y, a: Math.atan2(p.y - by.y, p.x - by.x), k: 0 });
  if (kx || ky) PD.moveCircle(this.map, p, kx, ky, PR);
  if (p.hp <= 0) {
    p.hp = 0; p.alive = false; p.build = 0; p.d++; p.streak = 0; this.emit({ t: 'kill', x: p.x, y: p.y, b: 0, pl: 1 }); this.snd('down', p.x, p.y);
    if (this.pvp) {
      p.resp = 3;
      if (by && by !== p) { by.k++; this.addPts(by, 150); by.streak++; this.feed(by.name + ' downed ' + p.name); } else this.feed(p.name + ' went down');
      this.checkPvpEnd();
    } else this.feed(p.name + ' went down');
    this.checkOver();
  }
};
P.checkOver = function () {
  if (this.over || !this.players.length) return;
  if (!this.pve) { if (this.hide) this.checkHide(); return; }
  if (!this.players.some(p => p.alive)) {
    this.over = { mode: this.mode, round: this.g.round, kills: this.g.kills, time: this.t, players: this.resultRows() };
  }
};
P.resultRows = function () { return this.players.map(p => ({ id: p.id, name: p.name, k: p.k, d: p.d, score: Math.floor(p.score), seeker: p.seeker ? 1 : 0, bot: p.bot ? 1 : 0 })); };
/* damage dispatcher: zombies/bosses take full damage, other players (PvP) take x0.6 */
P.dmg = function (e, dmg, p, k) {
  if (e.type) return this.hurtZ(e, dmg, p, k);
  this.hurtP(e, dmg * .6, 0, 0, p); if (p) this.addPts(p, 10);
};
P.targetsFor = function (p) {
  if (!this.pvp) return this.zs;
  const l = this.zs.slice(); for (const q of this.players) if (q !== p && q.alive) l.push(q); return l;
};
/* ---- PvP end ---- */
P.checkPvpEnd = function () { if (!this.over && this.players.some(p => p.k >= this.g.lim)) this.endPvp(); };
P.endPvp = function () {
  if (this.over) return; const rows = this.players.slice().sort((a, b) => b.k - a.k || a.d - b.d);
  this.over = { mode: 'pvp', winner: rows[0] ? rows[0].id : null, round: 0, kills: this.g.kills, time: this.t, players: this.resultRows() };
};
/* ---- Hide and seek ---- */
P.startHide = function () {
  const g = this.g, n = this.players.length, ns = Math.max(1, Math.floor(n / 4)), order = this.players.slice().sort(() => Math.random() - .5);
  g.ph = 'hide'; g.phT = 25; g.tl = 180;
  order.forEach((p, i) => { p.seeker = i < ns ? 1 : 0; });
  const seekers = this.players.filter(p => p.seeker);
  seekers.forEach((p, i) => { p.x = this.map.start.x + Math.cos(i * 2.1) * 14; p.y = this.map.start.y + Math.sin(i * 2.1) * 14; PD.resolveCircle(this.map, p, PR); });
  for (const p of this.players) if (!p.seeker) { const s = this.spotFar(seekers.concat(this.players.filter(q => !q.seeker && q !== p && q.x)), 600); p.x = s.x; p.y = s.y; PD.resolveCircle(this.map, p, PR); }
  this.banner('HIDE! SEEKERS ARE BLIND', '#8fe8ff');
};
P.inBush = function (p) { return PD.tileAt(this.map, Math.floor(p.x / T), Math.floor(p.y / T)) === TL.BUSH; };
P.canSee = function (me, q) {
  if (!this.hide || me === q || !me.seeker || q.seeker) return true;
  if (this.g.ph === 'hide') return false;
  if (this.g.scanT > 0) return true;
  let r = this.inBush(q) ? 30 : 150; if (q.pu.cloak > 0) r *= .4;
  return PD.dist(me.x, me.y, q.x, q.y) <= r;
};
P.ability = function (p) {
  if (!this.hide || !p.seeker || p.ab > 0 || this.g.ph !== 'seek' || p.stun > 0) return;
  p.ab = 25; this.g.scanT = 3; this.banner('SEEKER SCAN!', '#ff3b3b'); this.snd('roar', p.x, p.y);
};
P.tag = function (s, h) {
  if (h.sh > 0) { h.sh = 0; s.stun = 1.5; h.prot = 1; this.emit({ t: 'txt', x: h.x, y: h.y - 14, s: 'BLOCKED', c: '#7fa6ff' }); this.snd('deny', h.x, h.y); return; }
  h.seeker = 1; h.stun = 1.5; h.d++; s.k++; s.score += 25;
  this.emit({ t: 'pu', x: h.x, y: h.y }); this.snd('hurt', h.x, h.y); this.feed(h.name + ' was found by ' + s.name); this.checkHide();
};
P.checkHide = function () { if (!this.over && this.g.ph === 'seek' && this.players.length && !this.players.some(p => !p.seeker)) this.endHide('seekers'); };
P.endHide = function (winner) {
  if (this.over) return; if (winner === 'hiders') for (const p of this.players) if (!p.seeker) p.score += 50;
  this.over = { mode: 'hide', winner, round: 0, kills: 0, time: this.t, players: this.resultRows() };
};
P.updHide = function (dt) {
  const g = this.g; g.scanT = Math.max(0, g.scanT - dt);
  if (g.ph === 'hide') { g.phT -= dt; if (g.phT <= 0) { g.ph = 'seek'; g.phT = 0; this.banner('SEEKERS RELEASED', '#ff3b3b'); this.snd('roar'); } }
  else g.tl -= dt;
  for (const p of this.players) { p.stun = Math.max(0, p.stun - dt); p.ab = Math.max(0, p.ab - dt); if (!p.seeker) p.score += dt; }
  if (g.ph === 'seek') {
    for (const s of this.players) {
      if (!s.seeker || s.stun > 0) continue;
      for (const h of this.players) if (!h.seeker && h.prot <= 0 && PD.dist(s.x, s.y, h.x, h.y) < 11) { this.tag(s, h); if (s.stun > 0) break; }
    }
    if (g.tl <= 0) this.endHide('hiders');
  }
};
P.giveWeapon = function (p, id) {
  if (!p.weapons.length) return -1;
  const own = p.weapons.findIndex(w => w.id === id), d = WDEF[id];
  if (own >= 0) { p.weapons[own].res = d.res; p.weapons[own].mag = d.mag; return own; }
  const guns = p.weapons.length - 1;                                   // the pickaxe is always the last slot and is never replaced
  if (guns < PD.MAXGUNS) { p.weapons.splice(guns, 0, mkW(id)); p.cur = guns; }
  else { const at = p.cur < guns ? p.cur : (p.lg < guns ? p.lg : 0); p.weapons[at] = mkW(id); p.cur = at; }
  p.reload = 0; return p.cur;
};
P.act = function (id, kind, v) {
  const p = this.pmap[id]; if (!p || !p.alive) return;
  if (kind === 'ab') return this.ability(p);
  if (!p.weapons.length) return;
  if (kind === 'bm') { p.build = p.build ? 0 : 1; p.bcd = .15; this.snd('sw', p.x, p.y); return; }
  if (kind === 'bsel') { p.bsel = (v | 0) === 1 ? 1 : 0; return; }
  if (kind === 'rl') this.startReload(p);
  else if (kind === 'sw') { v = v | 0; if (v >= 0 && v < p.weapons.length && (v !== p.cur || p.build)) { p.build = 0; p.cur = v; p.reload = 0; p.cd = Math.max(p.cd, .2); if (v < p.weapons.length - 1) p.lg = v; this.snd('sw', p.x, p.y); } }
  else if (kind === 'use') this.use(p);
};
P.startReload = function (p) {
  const w = p.weapons[p.cur], d = WDEF[w.id];
  if (d.kind === 'melee') return;
  if (p.reload > 0 || w.mag >= d.mag || w.res <= 0) return;
  p.reload = d.reload; this.snd('reload', p.x, p.y);
};
P.nearPrompt = function (p) {
  if (this.hide) return '';
  for (const b of this.map.wallbuys) if (PD.dist(p.x, p.y, b.x, b.y) < 30) { const d = WDEF[b.id], own = p.weapons.some(w => w.id === b.id); return 'E: ' + d.name + ' ' + (own ? (d.cost >> 1) + ' AMMO' : d.cost); }
  for (const b of this.map.boxes) if (PD.dist(p.x, p.y, b.x, b.y) < 28) return 'E: MYSTERY BOX ' + this.boxCost();
  return '';
};
P.boxCost = function () { return this.mode === 'arena' ? 500 : this.pvp ? 700 : 950; };
P.use = function (p) {
  if (this.hide) return;
  const m = this.map;
  for (const b of m.wallbuys) if (PD.dist(p.x, p.y, b.x, b.y) < 30) {
    const d = WDEF[b.id], own = p.weapons.findIndex(w => w.id === b.id);
    if (own >= 0) { const c = d.cost >> 1; if (p.pts >= c && p.weapons[own].res < d.res) { p.pts -= c; p.weapons[own].res = d.res; p.weapons[own].mag = d.mag; this.snd('buy', p.x, p.y); } else this.snd('deny', p.x, p.y); }
    else if (p.pts >= d.cost) { p.pts -= d.cost; this.giveWeapon(p, b.id); this.snd('buy', p.x, p.y); }
    else this.snd('deny', p.x, p.y);
    return;
  }
  for (const b of m.boxes) if (PD.dist(p.x, p.y, b.x, b.y) < 28) {
    const c = this.boxCost(); if (p.pts < c) { this.snd('deny', p.x, p.y); return; }
    const pool = PD.WBOX.filter(i => !p.weapons.some(w => w.id === i)); if (!pool.length) return;
    const id = PD.pick(pool); p.pts -= c; this.giveWeapon(p, id); this.snd('buy', p.x, p.y);
    this.emit({ t: 'txt', x: b.x, y: b.y - 12, s: WDEF[id].name, c: '#ffd24a' }); return;
  }
};

/* ---------- building, mining, repairing ---------- */
P.setT = function (tx, ty, v) { PD.setTile(this.map, tx, ty, v); this.rel.push({ t: 'tile', x: tx, y: ty, v }); };
P.addMat = function (p, mat, n) { p[mat] = Math.min(PD.BUILD.MATMAX, (p[mat] || 0) + n); };
P.matTxt = function (p, s, c) { this.emit({ t: 'txt', x: p.x, y: p.y - 16, s, c: c || '#e8e2cf' }); };
P.hurtBlock = function (tx, ty, dmg) {
  const m = this.map, i = ty * m.w + tx, b = this.blk.get(i); if (!b) return false;
  b.hp -= dmg; const cx = tx * T + 8, cy = ty * T + 8; this.emit({ t: 'spark', x: cx, y: cy });
  if (b.hp <= 0) { this.blk.delete(i); m.nb = Math.max(0, m.nb - 1); this.setT(tx, ty, b.base); this.emit({ t: 'brk', x: cx, y: cy, c: b.t }); this.snd('smash', cx, cy); }
  return true;
};
P.ents = function () { const l = this.zs.slice(); for (const q of this.players) if (q.alive) l.push(q); return l; };
P.updBuild = function (p, dt) {
  p.bcd = Math.max(0, p.bcd - dt); if (p.bcd > 0) return;
  const inp = p.inp, m = this.map;
  if (!inp.f && !inp.f2) return;
  const tg = PD.buildTarget(p.x, p.y, p.x + Math.cos(p.ang) * inp.ad, p.y + Math.sin(p.ang) * inp.ad), tx = tg.tx, ty = tg.ty, i = ty * m.w + tx;
  if (inp.f2) {                                    // right mouse: take down a wall (in PvP only your own)
    const b = this.blk.get(i); p.bcd = .15; if (!b || (this.pvp && b.o !== p.id)) return;
    const B = PD.BLOCKS.find(q => q.id === b.t); this.blk.delete(i); m.nb = Math.max(0, m.nb - 1); this.setT(tx, ty, b.base);
    this.addMat(p, B.mat, B.cost >> 1); this.snd('build', tx * T + 8, ty * T + 8); return;
  }
  const B = PD.BLOCKS[p.bsel];
  if (p[B.mat] < B.cost) { p.bcd = .5; this.matTxt(p, 'NEED ' + B.cost + ' ' + B.name, '#ff6a5a'); this.snd('deny', p.x, p.y); return; }
  if (PD.buildCheck(m, tx, ty, this.ents())) { p.bcd = .12; return; }
  p[B.mat] -= B.cost; const base = m.tiles[i];
  this.blk.set(i, { hp: B.hp, mhp: B.hp, o: p.id, base, t: B.id }); m.nb++;
  this.setT(tx, ty, B.id); p.bcd = .12; this.snd('build', tx * T + 8, ty * T + 8); this.emit({ t: 'spark', x: tx * T + 8, y: ty * T + 8 });
};
/* swing that hit no enemy: look at the tiles in front of the player */
P.pickTile = function (p) {
  for (const dist of [12, 18, 24]) {
    const tx = Math.floor((p.x + Math.cos(p.ang) * dist) / T), ty = Math.floor((p.y + Math.sin(p.ang) * dist) / T);
    if (this.touchTile(p, tx, ty)) return true;
  }
  return false;
};
P.touchTile = function (p, tx, ty) {
  const m = this.map, i = ty * m.w + tx, b = this.blk.get(i), cx = tx * T + 8, cy = ty * T + 8;
  if (b) {
    const B = PD.BLOCKS.find(q => q.id === b.t);
    if (this.pvp && b.o !== p.id) { this.hurtBlock(tx, ty, 30); this.snd('mine', cx, cy); return true; }       // raiding someone else's wall
    if (b.hp >= b.mhp) return false;
    if (p[B.mat] < 1) { this.matTxt(p, 'NEED ' + B.name, '#ff6a5a'); this.snd('deny', p.x, p.y); return true; }
    p[B.mat]--; b.hp = Math.min(b.mhp, b.hp + b.mhp * .35); this.snd('build', cx, cy); this.emit({ t: 'txt', x: cx, y: cy - 10, s: '+HP', c: '#7be26a' }); return true;
  }
  const t = PD.tileAt(m, tx, ty), nd = PD.NODES[t]; if (!nd) return false;
  if (Math.min(tx, ty, m.w - 1 - tx, m.h - 1 - ty) <= (m.arena ? 4 : 3)) return false;
  for (const q of m.wallbuys) if (q.tx === tx && q.ty === ty) return false;
  let h = this.nodes.has(i) ? this.nodes.get(i) : nd.need; h--;
  this.emit({ t: 'spark', x: cx, y: cy }); this.snd('mine', cx, cy);
  if (h > 0) { this.nodes.set(i, h); return true; }
  this.nodes.delete(i);
  const to = nd.ground ? this.groundUnder(tx, ty) : nd.to;       // crates leave whatever ground is around them, not always a floor
  this.setT(tx, ty, to); this.emit({ t: 'brk', x: cx, y: cy, c: t });
  if (nd.mat) { this.addMat(p, nd.mat, nd.n); this.matTxt(p, '+' + nd.n + ' ' + nd.mat.toUpperCase(), nd.mat === 'wood' ? '#d9a05a' : '#c8ced6'); }
  if (nd.ammo && Math.random() < nd.ammoP) this.giveAmmo(p, nd.ammo, cx, cy);
  if (nd.regrow) this.regrow.push({ i, to, v: t, t: nd.regrow });
  return true;
};
/* most common walkable ground around a tile (what is left when a crate is broken) */
P.groundUnder = function (tx, ty) {
  const m = this.map, c = {}; let best = TL.FLOOR, bn = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    if (!i && !j) continue; const t = PD.tileAt(m, tx + i, ty + j); if (PD.SOLID[t] || t === TL.DOOR) continue;
    c[t] = (c[t] || 0) + 1; if (c[t] > bn) { bn = c[t]; best = t; }
  }
  return best;
};
/* restock reserve ammo of every gun the player carries: frac of the gun's full reserve (at least one magazine for big fractions) */
P.giveAmmo = function (p, frac, x, y) {
  let any = false;
  for (const w of p.weapons) {
    const d = WDEF[w.id]; if (d.kind === 'melee') continue;
    const add = Math.max(1, Math.ceil(d.res * frac)), nr = Math.min(d.res, w.res + add); if (nr > w.res) any = true; w.res = nr;
  }
  this.snd('buy', x, y);
  this.emit({ t: 'txt', x, y: y - 12, s: any ? '+AMMO' : 'AMMO FULL', c: any ? '#6fc3ff' : '#8a867a' });
};
P.updRegrow = function (dt) {
  const m = this.map; let any = false;
  for (const r of this.regrow) {
    r.t -= dt; if (r.t > 0) continue;
    if (m.tiles[r.i] !== r.to || this.blk.has(r.i)) { r.done = 1; any = true; continue; }
    const x = r.i % m.w, y = (r.i / m.w) | 0;
    if (PD.tileBusy(m, x, y, this.ents())) { r.t = 6; continue; }
    this.setT(x, y, r.v); r.done = 1; any = true;
  }
  if (any) this.regrow = this.regrow.filter(r => !r.done);
};

/* ---------- damage to enemies ---------- */
P.hurtZ = function (z, dmg, p, k) {
  if (z.dead) return;
  const g = this.g;
  if (z.boss) { if (z.type === 'jugg' && z.armor) dmg *= .4; if (g.pu.insta > 0) dmg *= 1.5; }
  else if (g.pu.insta > 0) dmg = z.hp + 1;
  z.hp -= dmg; z.flash = .1;
  this.emit({ t: 'hit', x: z.x, y: z.y, a: p ? Math.atan2(z.y - p.y, z.x - p.x) : 0, k: k || 0 });
  if (p) this.addPts(p, 10);
  if (z.type === 'jugg' && z.armor && z.hp < z.mhp * .5) { z.armor = false; z.sp *= 1.6; this.banner('ARMOR BROKEN', '#ff3b3b'); this.snd('roar', z.x, z.y); }
  if (z.hp <= 0) this.killZ(z, p);
};
P.killZ = function (z, p, quiet) {
  if (z.dead) return; z.dead = true;
  const isB = !!z.boss;
  this.emit({ t: 'kill', x: z.x, y: z.y, b: isB ? 1 : 0 });
  if (p) { p.k += this.pvp ? (isB ? 3 : 0) : 1; p.streak++; p.cbT = 3; this.addPts(p, isB ? 500 : 50); }
  this.g.kills++;
  if (z.type === 'bloater') { this.explode(z.x, z.y, 40, 35, null, true); }
  if (isB) {
    this.g.boss = null; this.banner(BOSSES[z.type].name + ' DEFEATED', '#7fa650'); this.snd('boom', z.x, z.y);
    if (this.pvp && p) { this.feed(p.name + ' slew the boss (+3)'); this.checkPvpEnd(); }
    if (z.type === 'bloat') {
      this.explode(z.x, z.y, 80, 40, null, true);
      for (let i = 0; i < 6; i++) { const a = i * 1.05; this.spawnZ('bloater', z.x + Math.cos(a) * 24, z.y + Math.sin(a) * 24); this.clouds.push({ x: z.x + Math.cos(a) * 30, y: z.y + Math.sin(a) * 30, r: 22, life: 6 }); }
    }
    for (let i = 0; i < 2; i++) this.dropPU(z.x + rnd(-14, 14), z.y + rnd(-14, 14));
    this.dropWP(z.x, z.y + 14);
  } else if (!quiet) {
    const pe = this.mode === 'arena' ? .07 : .05;
    if (Math.random() < pe) this.dropPU(z.x, z.y); else if (Math.random() < .02) this.dropWP(z.x, z.y);
  }
};
P.dropPU = function (x, y) { this.pickups.push({ id: this.nid++, kind: 'pu:' + PD.pick(this.puPool), x, y, life: 25 }); };
P.dropWP = function (x, y) { this.pickups.push({ id: this.nid++, kind: 'wp:' + PD.pick(PD.WBOX), x, y, life: 25 }); };
P.explode = function (x, y, r, dmg, owner, hostile) {
  this.emit({ t: 'boom', x, y, r });
  if (this.blk.size && (hostile || (this.pvp && owner))) for (const [i, b] of this.blk) {
    const bx = (i % this.map.w) * T + 8, by = ((i / this.map.w) | 0) * T + 8;
    if (PD.dist(x, y, bx, by) < r + 8 && (hostile || b.o !== owner.id)) this.hurtBlock(i % this.map.w, (i / this.map.w) | 0, dmg * (hostile ? .8 : .5));
  }
  for (const z of this.zs) if (!z.dead && !(hostile && !z.boss && false)) {
    const d = PD.dist(x, y, z.x, z.y); if (d < r + z.r && !hostile) this.hurtZ(z, dmg * (1 - .4 * clamp(d / r, 0, 1)), owner, 1);
  }
  for (const p of this.players) {
    if (!p.alive) continue; const d = PD.dist(x, y, p.x, p.y); if (d > r + PR) continue;
    if (hostile) this.hurtP(p, dmg * (1 - .4 * clamp(d / r, 0, 1)), (p.x - x) / (d || 1) * 8, (p.y - y) / (d || 1) * 8);
    else if (owner === p) this.hurtP(p, dmg * .4 * (1 - d / r));
    else if (this.pvp && owner) this.hurtP(p, dmg * .6 * (1 - .4 * clamp(d / r, 0, 1)), 0, 0, owner);
  }
};

/* ---------- shooting ---------- */
function rayHits(list, ox, oy, a, L) {
  const dx = Math.cos(a), dy = Math.sin(a), out = [];
  for (const e of list) {
    if (e.dead) continue; const rx = e.x - ox, ry = e.y - oy, t = rx * dx + ry * dy;
    if (t < -e.r || t > L + e.r) continue;
    if (Math.abs(rx * dy - ry * dx) <= e.r + 1.5) out.push({ e, t });
  }
  return out.sort((a, b) => a.t - b.t);
}
P.fire = function (p, w, d) {
  const ox = p.x + Math.cos(p.ang) * 6, oy = p.y + Math.sin(p.ang) * 6, m = this.map, tl = this.targetsFor(p);
  if (d.kind === 'melee') {
    p.swing = .18; p.cd = d.rate; this.emit({ t: 'swing', x: p.x, y: p.y, a: p.ang, s: p.id }); this.snd('swing', p.x, p.y);
    let hit = 0;
    for (const z of tl) {
      if (z.dead) continue; const dx = z.x - p.x, dy = z.y - p.y, dd = Math.hypot(dx, dy);
      if (dd > d.range + z.r + 4) continue;
      if (Math.abs(PD.angDiff(Math.atan2(dy, dx), p.ang)) <= d.arc / 2) { this.dmg(z, d.dmg, p, 2); hit++; }
    }
    if (!hit) this.pickTile(p);
    return;
  }
  w.mag--; p.cd = d.rate / (p.pu.rapid > 0 ? 1.7 : 1);
  p.cb = 0;
  if (d.kind === 'hit' || d.kind === 'beam') {
    const pellets = d.pellets;
    for (let i = 0; i < pellets; i++) {
      const a = p.ang + (Math.random() - .5) * 2 * d.spread, L = Math.min(d.range, PD.rayTiles(m, ox, oy, Math.cos(a), Math.sin(a), d.range));
      const hits = rayHits(tl, ox, oy, a, L); let n = 0;
      for (const h of hits) { if (n >= d.pierce) break; this.dmg(h.e, d.dmg, p, 0); n++; }
      let len = L; if (hits.length && d.pierce <= 1 && hits[0]) len = Math.max(4, Math.min(L, hits[0].t));
      this.emit({ t: 'shot', x: ox, y: oy, a, l: len, w: w.id, s: p.id });
    }
    this.snd('shot:' + w.id, p.x, p.y);
  } else if (d.kind === 'flame') {
    this.emit({ t: 'flame', x: ox, y: oy, a: p.ang });
    for (const z of tl) {
      if (z.dead) continue; const dx = z.x - p.x, dy = z.y - p.y, dd = Math.hypot(dx, dy);
      if (dd > d.range + z.r || Math.abs(PD.angDiff(Math.atan2(dy, dx), p.ang)) > .38) continue;
      if (!PD.hasLOS(m, p.x, p.y, z.x, z.y)) continue;
      this.dmg(z, d.dmg, p, 3); if (z.type) z.burn = d.burn;
    }
    this.snd('shot:flamer', p.x, p.y);
  } else if (d.kind === 'tesla') {
    let best = null, bd = d.range;
    for (const z of tl) { if (z.dead) continue; const dd = PD.dist(p.x, p.y, z.x, z.y); if (dd < bd && Math.abs(PD.angDiff(Math.atan2(z.y - p.y, z.x - p.x), p.ang)) < .9 && PD.hasLOS(m, p.x, p.y, z.x, z.y)) { bd = dd; best = z; } }
    const pts = [[ox, oy]];
    if (best) {
      const hit = new Set(); let cur = best;
      for (let i = 0; i < d.chain && cur; i++) {
        hit.add(cur); pts.push([cur.x, cur.y]); this.dmg(cur, d.dmg * (1 - i * .15), p, 4);
        let nx = null, nd = 60; for (const z of tl) if (!z.dead && !hit.has(z)) { const dd = PD.dist(cur.x, cur.y, z.x, z.y); if (dd < nd) { nd = dd; nx = z; } }
        cur = nx;
      }
    } else pts.push([ox + Math.cos(p.ang) * 40, oy + Math.sin(p.ang) * 40]);
    this.emit({ t: 'zap', p: pts }); this.snd('shot:tesla', p.x, p.y);
  } else if (d.kind === 'proj') {
    const a = p.ang + (Math.random() - .5) * 2 * d.spread, sp = d.speed;
    this.projs.push({ id: this.nid++, x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: w.id, life: d.fuse || d.range / sp, o: p.id, pierce: d.pierce, hit: [], kind: d.plasma ? 'plasma' : d.fuse ? 'gl' : 'rpg' });
    this.snd('shot:' + w.id, p.x, p.y);
  }
  if (w.mag <= 0 && w.res > 0) this.startReload(p);
};

/* ---------- zombies ---------- */
P.spawnZ = function (type, x, y, hpMul) {
  const t = ZT[type], r = this.g.round, np = Math.max(1, this.players.length);
  const hp = PD.zHP(Math.max(1, r)) * t.hp * rnd(.9, 1.1) * (1 + .35 * (np - 1)) * (hpMul || 1);
  const z = { id: this.nid++, type, x, y, ang: 0, r: t.r, hp, mhp: hp, hpf: 1, sp: Math.min(t.sp + 1.2 * (Math.max(1, r) - 1), t.sp * 1.9, 62), fl: 0, atk: 0, ph: Math.random() * 6, burn: 0, bt: 0, flash: 0, mv: 0, stuck: 0, wander: 0, shootT: rnd(1, 2.5) };
  this.zs.push(z); return z;
};
P.chooseType = function () {
  const r = this.g.round; let tot = 0; const c = [];
  for (const k in ZT) if (ZT[k].from <= r) { c.push(k); tot += ZT[k].w; }
  let x = Math.random() * tot; for (const k of c) { x -= ZT[k].w; if (x <= 0) return k; } return 'walker';
};
P.spawnPos = function () {
  const m = this.map, al = this.alive(); if (!al.length) return null;
  if (this.mode === 'arena') { const g = PD.pick(m.gates); return { x: g.x + rnd(-24, 24), y: g.y + rnd(-14, 14) }; }
  for (let i = 0; i < 40; i++) {
    const p = PD.pick(al), a = Math.random() * 6.283, d = rnd(300, 460), x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx < 4 || ty < 4 || tx >= m.w - 4 || ty >= m.h - 4 || PD.solidAt(m, tx, ty) || !m.reach[ty * m.w + tx]) continue;
    if (al.some(q => PD.dist(q.x, q.y, x, y) < 250)) continue;
    return { x, y };
  }
  let best = null, bd = -1; for (const s of m.spawns) { const dd = Math.min(...al.map(q => PD.dist(q.x, q.y, s.x, s.y))); if (dd > bd) { bd = dd; best = s; } }
  return best ? { x: best.x, y: best.y } : null;
};
P.fieldFor = function (p) {
  let f = this.fields[p.id]; const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
  if (!f) f = this.fields[p.id] = { dist: PD.newFlow(this.map), tx: -1, ty: -1, age: 99, ver: -1 };
  if (f.ver !== this.map.ver || f.age > 1.5 || (f.age > .6 && (f.tx !== tx || f.ty !== ty))) { PD.flowFill(this.map, f.dist, tx, ty, 420); f.tx = tx; f.ty = ty; f.age = 0; f.ver = this.map.ver; }
  return f;
};
const _o = { x: 0, y: 0 };
P.updZ = function (z, dt) {
  const m = this.map, g = this.g;
  if (z.burn > 0) { z.burn -= dt; z.bt -= dt; if (z.bt <= 0) { z.bt = .25; this.hurtZ(z, 3, null, 5); if (z.dead) return; } z.fl |= 1; } else z.fl &= ~1;
  z.flash = Math.max(0, z.flash - dt); z.atk = Math.max(0, z.atk - dt); z.ba = Math.max(0, (z.ba || 0) - dt);
  const frozen = g.pu.freeze > 0; z.fl = frozen ? z.fl | 2 : z.fl & ~2;
  const tg = nearestAlive(this, z.x, z.y); if (!tg) return;
  const p = tg.p, d = tg.d, spd = z.sp * (frozen ? .35 : 1), tp = ZT[z.type];
  let dx, dy;
  if (z.wander > 0) { z.wander -= dt; dx = z.wx; dy = z.wy; }
  else if (d < 110 && PD.hasLOS(m, z.x, z.y, p.x, p.y)) { dx = (p.x - z.x) / d; dy = (p.y - z.y) / d; }
  else { const f = this.fieldFor(p); if (!PD.flowDir(m, f.dist, z.x, z.y, _o)) { _o.x = (p.x - z.x) / d; _o.y = (p.y - z.y) / d; } dx = _o.x; dy = _o.y; }
  if (tp.ranged) {
    if (d < 80) { dx = -dx; dy = -dy; } else if (d < 100) { dx = dy = 0; }
    z.shootT -= dt;
    if (z.shootT <= 0 && d < 220 && PD.hasLOS(m, z.x, z.y, p.x, p.y)) {
      z.shootT = 2.2; const a = Math.atan2(p.y - z.y, p.x - z.x);
      this.eprojs.push({ x: z.x, y: z.y, vx: Math.cos(a) * 105, vy: Math.sin(a) * 105, dmg: 12, r: 3, life: 3, kind: 'acid' });
    }
  }
  // separation
  let sx = 0, sy = 0; const h = this.hash, cx = (z.x / 24) | 0, cy = (z.y / 24) | 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const c = h.get((cx + i) + (cy + j) * 4096); if (!c) continue; for (const o of c) { if (o === z) continue; const ex = z.x - o.x, ey = z.y - o.y, dd = ex * ex + ey * ey; if (dd < 144 && dd > .01) { const k = 1 / Math.sqrt(dd); sx += ex * k; sy += ey * k; } } }
  dx += sx * .6; dy += sy * .6;
  const l = Math.hypot(dx, dy); if (l > 0) { dx /= l; dy /= l; }
  const want = Math.hypot(dx, dy) * spd * dt, moved = want > 0 ? PD.moveCircle(m, z, dx * spd * dt, dy * spd * dt, z.r) : 0;
  if (want > 0) { z.ang = Math.atan2(dy, dx); z.ph += moved * .3; z.stuck += moved < want * .2 ? dt : -z.stuck; if (moved < want * .5 && this.blk.size && this.zBash(z, dx, dy, tp.dmg)) z.stuck = 0; if (z.stuck > .5) { z.stuck = 0; z.wander = .6; const a = Math.random() * 6.283; z.wx = Math.cos(a); z.wy = Math.sin(a); } }
  else z.ang = Math.atan2(p.y - z.y, p.x - z.x);
  if (d < z.r + PR + 3 && z.atk <= 0) { z.atk = .85; this.hurtP(p, tp.dmg); this.snd('zhit', p.x, p.y); }
};

/* a zombie pressed against a player wall chews on it */
P.zBash = function (z, dx, dy, dmg) {
  const m = this.map, k = z.r + 3, pts = [[z.x + dx * k, z.y + dy * k], [z.x + dx * k, z.y], [z.x, z.y + dy * k]];
  for (const q of pts) {
    const tx = Math.floor(q[0] / T), ty = Math.floor(q[1] / T);
    if (!this.blk.has(ty * m.w + tx)) continue;
    if (z.ba <= 0) { z.ba = .85; this.hurtBlock(tx, ty, dmg); }
    return true;
  }
  return false;
};

/* ---------- bosses ---------- */
P.spawnBoss = function () {
  const g = this.g, idx = this.pvp ? g.bossN++ : Math.floor((this.mode === 'arena' ? g.round / 3 : g.round / 5) - 1);
  const kind = PD.BOSSORDER[(idx % 5 + 5) % 5], B = BOSSES[kind], pos = this.spawnPos(); if (!pos) return;
  const np = Math.max(1, this.players.length), hp = B.hp * (1 + .12 * g.round) * (1 + (this.pvp ? .3 : .5) * (np - 1));
  const z = { id: this.nid++, type: kind, boss: true, x: pos.x, y: pos.y, ang: 0, r: B.r, hp, mhp: hp, hpf: 1, sp: B.sp, fl: 4, atk: 0, ph: 0, burn: 0, bt: 0, flash: 0, mv: 0, stuck: 0, armor: kind === 'jugg', ai: { st: 'chase', t: 1.5, c1: 2, c2: 4, dir: 0, hit: 0 }, shootT: 0 };
  this.zs.push(z); g.boss = z; this.banner('BOSS: ' + B.name, '#ff3b3b'); this.snd('roar', pos.x, pos.y);
};
P.smash = function (z, ux, uy) {
  const m = this.map, px = z.x + ux * (z.r + 6), py = z.y + uy * (z.r + 6), tx0 = Math.floor(px / T), ty0 = Math.floor(py / T);
  let n = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const tx = tx0 + i, ty = ty0 + j, t = PD.tileAt(m, tx, ty), edge = Math.min(tx, ty, m.w - 1 - tx, m.h - 1 - ty);
    if (edge <= (m.arena ? 4 : 3)) continue;
    if (PD.BUILT[t]) { this.hurtBlock(tx, ty, 260); n++; continue; }
    if (PD.SMASH[t] || t === TL.WALL) { const v = t === TL.WALL ? TL.FLOOR : (t === TL.CRATE || t === TL.AMMO) ? this.groundUnder(tx, ty) : TL.GRASS; PD.setTile(m, tx, ty, v); this.rel.push({ t: 'tile', x: tx, y: ty, v }); this.emit({ t: 'spark', x: tx * T + 8, y: ty * T + 8 }); n++; }
  }
  if (n) this.snd('smash', z.x, z.y);
};
P.updBoss = function (z, dt) {
  const m = this.map, g = this.g, B = BOSSES[z.type], A = z.ai, tg = nearestAlive(this, z.x, z.y);
  z.flash = Math.max(0, z.flash - dt); z.atk = Math.max(0, z.atk - dt);
  if (z.burn > 0) { z.burn -= dt; z.bt -= dt; if (z.bt <= 0) { z.bt = .25; this.hurtZ(z, 3, null, 5); if (z.dead) return; } }
  if (!tg) return; const p = tg.p, d = tg.d, ux = (p.x - z.x) / (d || 1), uy = (p.y - z.y) / (d || 1);
  const frz = g.pu.freeze > 0 ? .35 : 1; let vx = 0, vy = 0, sp = z.sp * frz;
  const toward = () => { if (d < 220 && PD.hasLOS(m, z.x, z.y, p.x, p.y)) { vx = ux; vy = uy; } else { const f = this.fieldFor(p); if (PD.flowDir(m, f.dist, z.x, z.y, _o)) { vx = _o.x; vy = _o.y; } else { vx = ux; vy = uy; } } };
  const away = () => { vx = -ux; vy = -uy; };
  const aim = z.ang = Math.atan2(p.y - z.y, p.x - z.x);
  A.t -= dt; A.c1 -= dt; A.c2 -= dt;
  switch (z.type) {
    case 'brute':
      if (A.st === 'chase') { toward(); if (A.t <= 0 && d < 130) { A.st = 'wind'; A.t = .7; } }
      else if (A.st === 'wind') { A.dir = aim; if (A.t <= 0) { A.st = 'charge'; A.t = .7; A.hit = 0; } }
      else if (A.st === 'charge') { vx = Math.cos(A.dir); vy = Math.sin(A.dir); sp *= 4.2;
        if (!A.hit && d < z.r + PR + 2) { A.hit = 1; this.hurtP(p, 55, vx * 36, vy * 36); this.snd('zhit', p.x, p.y); }
        if (A.t <= 0) { A.st = 'rest'; A.t = .7; this.explode(z.x, z.y, 70, 30, null, true); this.snd('smash', z.x, z.y); } }
      else if (A.st === 'rest') { if (A.t <= 0) { A.st = 'chase'; A.t = 1.2; } }
      break;
    case 'queen': {
      const enr = z.hp < z.mhp * .4; if (d < 100) away(); else if (d > 150) toward(); if (enr) sp *= 1.4;
      if (A.c1 <= 0 && d < 340) { A.c1 = enr ? 1.0 : 1.5; const n = enr ? 5 : 3; for (let i = 0; i < n; i++) { const a = aim + (i - (n - 1) / 2) * .2; this.eprojs.push({ x: z.x, y: z.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, dmg: 18, r: 3, life: 4, kind: 'acid' }); } this.snd('spit', z.x, z.y); }
      break; }
    case 'necro':
      if (d < 90) away(); else if (d > 170) toward();
      if (A.c2 <= 0) { A.c2 = 6; for (let i = 0; i < 40; i++) { const a = Math.random() * 6.283, dd = rnd(120, 180), x = p.x + Math.cos(a) * dd, y = p.y + Math.sin(a) * dd; if (!PD.solidPx(m, x, y) && m.reach[Math.floor(y / T) * m.w + Math.floor(x / T)]) { z.x = x; z.y = y; this.emit({ t: 'tp', x, y }); break; } } }
      if (A.c1 <= 0) { A.c1 = 2; this.eprojs.push({ x: z.x, y: z.y, vx: Math.cos(aim) * 90, vy: Math.sin(aim) * 90, dmg: 25, r: 4, life: 6, kind: 'skull' }); this.snd('spit', z.x, z.y); }
      A.sum = (A.sum == null ? 7 : A.sum) - dt;
      if (A.sum <= 0) { A.sum = 7; for (let i = 0; i < 3; i++) { const a = i * 2.1, zz = this.spawnZ('walker', z.x + Math.cos(a) * 22, z.y + Math.sin(a) * 22); PD.resolveCircle(m, zz, zz.r); } this.banner('THE DEAD RISE', '#9a6bd6'); }
      break;
    case 'jugg':
      if (d > 130) toward(); else if (d < 70) away();
      if (A.c2 <= 0 && d < 300) { A.c2 = 2.5; for (let i = 0; i < 8; i++) { const a = aim + (i - 3.5) * .09; this.eprojs.push({ x: z.x, y: z.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, dmg: 8, r: 2, life: 1.4, kind: 'bullet' }); } this.snd('shot:minigun', z.x, z.y); }
      break;
    case 'bloat':
      toward(); if (A.c1 <= 0) { A.c1 = .5; this.clouds.push({ x: z.x, y: z.y, r: 22, life: 6 }); }
      break;
  }
  const want = Math.hypot(vx, vy) * sp * dt;
  if (want > 0) {
    const moved = PD.moveCircle(m, z, vx * sp * dt, vy * sp * dt, z.r); z.ph += moved * .1;
    z.stuck = moved < want * .3 ? z.stuck + dt : 0;
    if (z.stuck > .25) { z.stuck = 0; this.smash(z, vx, vy); }
  }
  if (z.type !== 'brute' || A.st !== 'charge') { if (d < z.r + PR + 2 && z.atk <= 0) { z.atk = 1; this.hurtP(p, B.dmg, ux * 14, uy * 14); this.snd('zhit', p.x, p.y); } }
};

/* ---------- pickups, powerups, projectiles ---------- */
P.applyPU = function (p, k) {
  const D = PUDEF[k], g = this.g;
  this.emit({ t: 'pu', x: p.x, y: p.y }); this.snd('power', p.x, p.y); this.emit({ t: 'txt', x: p.x, y: p.y - 14, s: D.name, c: D.col });
  if (k === 'maxammo') for (const q of (this.pve ? this.players : [p])) for (const w of q.weapons) { const d = WDEF[w.id]; if (d.kind === 'melee') continue; w.res = d.res; w.mag = d.mag; }
  else if (k === 'freeze' && this.hide) { for (const q of this.players) if (q.seeker && PD.dist(q.x, q.y, p.x, p.y) < 130) { q.stun = 3.5; this.emit({ t: 'txt', x: q.x, y: q.y - 14, s: 'FROZEN', c: '#8fe8ff' }); } this.emit({ t: 'boom', x: p.x, y: p.y, r: 130 }); }
  else if (k === 'x2' || k === 'insta' || k === 'freeze') g.pu[k] = D.dur;
  else if (k === 'nuke') { this.emit({ t: 'boom', x: p.x, y: p.y, r: 260 }); this.snd('boom', p.x, p.y); for (const z of this.zs) if (!z.boss && !z.dead) this.killZ(z, null, true); for (const q of this.players) { q.pts += 400; q.score += 400; } }
  else if (k === 'heal') p.hp = Math.min(p.maxhp, p.hp + 60);
  else if (k === 'shield') p.sh = 50;
  else if (k === 'turret') this.turrets.push({ id: this.nid++, x: p.x, y: p.y, ang: 0, life: PUDEF.turret.dur, o: p.id, cd: 0 });
  else p.pu[k] = D.dur;
};
P.updProjs = function (dt) {
  const m = this.map;
  for (const q of this.projs) {
    if (q.dead) continue; const d = WDEF[q.w], owner = this.pmap[q.o]; q.life -= dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(q.vx, q.vy) * dt / 4));
    for (let s = 0; s < steps && !q.dead; s++) {
      const nx = q.x + q.vx * dt / steps, ny = q.y + q.vy * dt / steps;
      if (PD.solidPx(m, nx, ny) && PD.BLOCKB[PD.tileAt(m, Math.floor(nx / T), Math.floor(ny / T))]) {
        if (q.kind === 'gl') { if (!PD.solidPx(m, nx, q.y)) { q.vy *= -.6; q.vx *= .6; } else if (!PD.solidPx(m, q.x, ny)) { q.vx *= -.6; q.vy *= .6; } else { q.vx *= -.6; q.vy *= -.6; } continue; }
        q.dead = true; if (d.splash) this.explode(q.x, q.y, d.splash, d.dmg, owner); continue;
      }
      q.x = nx; q.y = ny;
      if (q.kind === 'gl') continue;
      const tl = this.targetsFor(owner);
      for (const z of tl) {
        if (z.dead || q.hit.includes(z.id)) continue;
        if (PD.dist(q.x, q.y, z.x, z.y) < z.r + 3) {
          if (q.kind === 'rpg') { q.dead = true; this.explode(q.x, q.y, d.splash, d.dmg, owner); this.snd('boom', q.x, q.y); }
          else { q.hit.push(z.id); this.dmg(z, d.dmg, owner, 6); for (const o of tl) if (o !== z && !o.dead && PD.dist(q.x, q.y, o.x, o.y) < d.splash + o.r) this.dmg(o, d.dmg * .4, owner, 6); if (--q.pierce <= 0) q.dead = true; }
          break;
        }
      }
    }
    if (!q.dead && q.life <= 0) { q.dead = true; if (d.splash) { this.explode(q.x, q.y, d.splash, d.dmg, owner); if (q.kind !== 'plasma') this.snd('boom', q.x, q.y); } }
  }
  this.projs = this.projs.filter(q => !q.dead);
  for (const q of this.eprojs) {
    q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.life <= 0 || (PD.solidPx(m, q.x, q.y) && PD.BLOCKB[PD.tileAt(m, Math.floor(q.x / T), Math.floor(q.y / T))])) { q.dead = true; continue; }
    for (const p of this.players) if (p.alive && PD.dist(q.x, q.y, p.x, p.y) < PR + q.r) { this.hurtP(p, q.dmg); q.dead = true; this.emit({ t: 'spark', x: q.x, y: q.y }); break; }
  }
  this.eprojs = this.eprojs.filter(q => !q.dead);
};

/* ---------- rounds ---------- */
P.bossRound = function () { const g = this.g; return this.mode === 'arena' ? g.round % 3 === 0 : g.round % 5 === 0; };
P.startRound = function () {
  const g = this.g; g.round++;
  const r = g.round, np = this.players.length, extra = np - 1;
  g.toSpawn = Math.min(6 + 3 * r + extra * 2 * r, 70);
  g.maxAlive = Math.min(16 + 8 * np, 48);
  const dead = this.players.filter(p => !p.alive);
  if (dead.length) { const al = this.alive(); for (const p of dead) this.respawn(p, al[0]); }
  if (this.bossRound()) { g.toSpawn = Math.floor(g.toSpawn / 2); this.spawnBoss(); }
  this.banner((this.mode === 'arena' ? 'WAVE ' : 'ROUND ') + r, '#e0242d'); this.snd('roundStart');
  g.waveT = 55;
};
P.respawn = function (p, near) {
  const base = near || this.map.start; p.alive = true; p.hp = p.maxhp; p.sh = 0; p.stam = 100; p.weapons = [mkW('m1911'), mkW('pick')]; p.cur = 0; p.reload = 0; p.build = 0; p.wood = Math.max(p.wood, PD.BUILD.START.wood); p.pts = Math.max(p.pts, 500);
  for (let i = 0; i < 30; i++) { p.x = base.x + rnd(-30, 30); p.y = base.y + rnd(-30, 30); if (!PD.solidPx(this.map, p.x, p.y)) break; }
  PD.resolveCircle(this.map, p, PR); p.prot = 2;
};
P.updRounds = function (dt) {
  const g = this.g;
  if (this.mode === 'arena' && g.round > 0) {
    g.waveT -= dt;
    if (g.waveT <= 0) { this.startRound(); return; }
    g.dropT -= dt;
    if (g.dropT <= 0) { g.dropT = rnd(8, 12); const s = PD.pick(this.map.itemSpots); if (s && this.pickups.length < 8) { if (Math.random() < .5) this.dropPU(s.x, s.y); else this.dropWP(s.x, s.y); this.pickups[this.pickups.length - 1].life = 60; } }
  }
  if (g.inter > 0) { g.inter -= dt; if (g.inter <= 0) this.startRound(); return; }
  if (g.toSpawn > 0) {
    g.spawnT -= dt;
    if (g.spawnT <= 0 && this.zs.filter(z => !z.boss).length < g.maxAlive) {
      g.spawnT = Math.max(.25, 1.3 - g.round * .05);
      const pos = this.spawnPos(); if (pos) { const z = this.spawnZ(this.chooseType(), pos.x, pos.y); PD.resolveCircle(this.map, z, z.r); g.toSpawn--; if (Math.random() < .3) this.snd('groan', pos.x, pos.y); }
    }
  } else if (!this.zs.length) {
    g.inter = this.mode === 'arena' ? 4 : 6; this.banner(this.mode === 'arena' ? 'WAVE CLEARED' : 'ROUND CLEARED', '#7fa650'); this.snd('roundEnd');
    for (const p of this.alive()) { p.pts += 50 * g.round; p.score += 50 * g.round; }
  }
};

/* ---------- main update ---------- */
P.update = function (dt) {
  if (this.over) return;
  dt = Math.min(dt, .1); this.t += dt; const g = this.g, m = this.map;
  for (const k in g.pu) if (g.pu[k] > 0) g.pu[k] = Math.max(0, g.pu[k] - dt);
  // players
  for (const p of this.players) {
    if (!p.alive) { if (this.pvp && !this.over) { p.resp -= dt; if (p.resp <= 0) this.respawnPvp(p); } continue; }
    p.hurt = Math.max(0, p.hurt - dt); p.cd = Math.max(0, p.cd - dt); p.pull = Math.max(0, p.pull - dt); p.swing = Math.max(0, p.swing - dt); p.prot = Math.max(0, p.prot - dt);
    if (p.bot && this.botThink) this.botThink(p, dt);
    for (const k in p.pu) if (p.pu[k] > 0) p.pu[k] = Math.max(0, p.pu[k] - dt);
    if (p.cbT > 0) { p.cbT -= dt; if (p.cbT <= 0) p.streak = 0; }
    const w = p.weapons[p.cur], d = w ? WDEF[w.id] : null;
    p.spd = (d ? d.slow : 1) * (p.reload > 0 ? .88 : 1) * (p.pu.speed > 0 ? 1.35 : 1);
    if (this.hide) p.spd = (p.seeker ? 1.08 : 1) * (p.pu.speed > 0 ? 1.35 : 1) * (p.seeker && (this.g.ph === 'hide' || p.stun > 0) ? 0 : 1);
    PD.movePlayer(m, p, p.inp, dt); p.ang = p.inp.a;
    if (p.regenT > 0) p.regenT -= dt; else if (p.hp < p.maxhp) p.hp = Math.min(p.maxhp, p.hp + (this.pvp ? 12 : 20) * dt);
    if (!d) continue;
    if (p.build) { this.updBuild(p, dt); continue; }
    if (p.reload > 0) { p.reload -= dt; if (p.reload <= 0) { const take = Math.min(d.mag - w.mag, w.res); w.mag += take; w.res -= take; p.reload = 0; } }
    else {
      const want = d.kind === 'melee' ? (p.inp.f || p.pull > 0) : d.auto ? p.inp.f : p.pull > 0;
      if (want && p.cd <= 0) { if (d.kind !== 'melee' && w.mag <= 0) { if (w.res > 0) this.startReload(p); else if (p.pull > 0) this.snd('deny', p.x, p.y); p.pull = 0; } else { this.fire(p, w, d); if (!d.auto) p.pull = 0; } }
    }
  }
  if (this.pvp) {
    g.tl -= dt; if (g.tl <= 0) this.endPvp();
    g.bossT -= dt; if (g.bossT <= 0) { g.bossT = 90; if (!g.boss && this.alive().length) this.spawnBoss(); }
  }
  if (this.hide) this.updHide(dt);
  if (!this.pve) {   // ground spawner for pvp / hide
    g.itemT -= dt;
    if (g.itemT <= 0) {
      g.itemT = rnd(4, 6);
      if (this.pickups.length < (this.pvp ? 10 : 6)) { const sp = PD.pick(m.itemSpots); if (sp) { if (this.pvp && Math.random() < .5) this.dropWP(sp.x, sp.y); else this.dropPU(sp.x, sp.y); this.pickups[this.pickups.length - 1].life = 60; } }
    }
  }
  // spatial hash for zombie separation
  this.hash = new Map();
  for (const z of this.zs) { const k = ((z.x / 24) | 0) + ((z.y / 24) | 0) * 4096; let c = this.hash.get(k); if (!c) this.hash.set(k, c = []); c.push(z); }
  for (const id in this.fields) this.fields[id].age += dt;
  if (this.pve) this.updRounds(dt);
  for (const z of this.zs) { if (z.dead) continue; if (z.boss) this.updBoss(z, dt); else this.updZ(z, dt); z.hpf = Math.max(0, z.hp / z.mhp); }
  this.zs = this.zs.filter(z => !z.dead);
  this.updProjs(dt);
  if (this.regrow.length) this.updRegrow(dt);
  // turrets
  for (const t of this.turrets) {
    t.life -= dt; t.cd -= dt; if (t.cd > 0) continue;
    const own = this.pmap[t.o]; let b = null, bd = 130; for (const z of this.targetsFor(own || { id: t.o })) { if (z.dead) continue; const dd = PD.dist(t.x, t.y, z.x, z.y); if (dd < bd && PD.hasLOS(m, t.x, t.y, z.x, z.y)) { bd = dd; b = z; } }
    if (b) { t.cd = .3; t.ang = Math.atan2(b.y - t.y, b.x - t.x); this.dmg(b, 12, own, 0); this.emit({ t: 'shot', x: t.x, y: t.y, a: t.ang, l: bd, w: 'turret', s: t.o }); }
  }
  this.turrets = this.turrets.filter(t => t.life > 0);
  // clouds
  for (const c of this.clouds) { c.life -= dt; for (const p of this.players) if (p.alive && PD.dist(c.x, c.y, p.x, p.y) < c.r + PR) { p.cloudT = (p.cloudT || 0) + dt; this.hurtP(p, 10 * dt); } }
  this.clouds = this.clouds.filter(c => c.life > 0);
  // pickups
  for (const k of this.pickups) {
    k.life -= dt; if (k.life <= 0) continue;
    for (const p of this.players) if (p.alive && PD.dist(k.x, k.y, p.x, p.y) < 13) {
      const [kind, id] = k.kind.split(':'); if (this.hide && p.seeker && id !== 'speed') continue; if (kind === 'pu') this.applyPU(p, id); else { this.giveWeapon(p, id); this.snd('buy', p.x, p.y); this.emit({ t: 'txt', x: p.x, y: p.y - 14, s: WDEF[id].name, c: '#ffd24a' }); }
      k.life = 0; break;
    }
  }
  this.pickups = this.pickups.filter(k => k.life > 0);
  this.checkOver();
};

/* ---------- views ---------- */
P.hudFor = function (id) {
  const p = this.pmap[id]; if (!p) return null;
  let hb = 0; if (this.hide && !p.seeker && p.alive) { hb = 9999; for (const q of this.players) if (q.seeker) hb = Math.min(hb, PD.dist(p.x, p.y, q.x, q.y)); }
  return { hp: p.hp, mh: p.maxhp, sh: p.sh, pts: p.pts, sc: Math.floor(p.score), k: p.k, d: p.d, w: p.weapons.map(w => [w.id, w.mag, w.res]), cur: p.cur, rl: p.reload, pu: p.pu, stam: p.stam, al: p.alive ? 1 : 0, spd: p.spd, cb: this.mode === 'arena' ? 1 + Math.min(4, Math.floor(p.streak / 3)) : 0, np: this.nearPrompt(p), hurt: p.hurt, mt: [p.wood | 0, p.stone | 0], bm: p.build ? 1 : 0, bs: p.bsel, seek: p.seeker, stun: p.stun, ab: p.ab, hb, rs: p.resp };
};
P.globalInfo = function () {
  const g = this.g, b = g.boss;
  return { m: this.mode, r: g.round, lf: this.zs.length + g.toSpawn, it: Math.max(0, g.inter), tm: this.t, wt: g.waveT, bs: b ? [BOSSES[b.type].name, Math.max(0, b.hp), b.mhp, b.id] : 0, pu: g.pu, kl: g.kills,
    ph: g.ph, pt: Math.max(0, g.phT), tl: Math.max(0, g.tl), sn: g.scanT, lim: g.lim, sk: this.hide ? this.players.filter(p => p.seeker).length : 0, hd: this.hide ? this.players.filter(p => !p.seeker).length : 0,
    sc: this.players.map(p => [p.id, p.k, p.d, Math.floor(p.score), p.alive ? 1 : 0, p.seeker ? 1 : 0]) };
};
const FLAG = (sim, p) => (p.alive ? 1 : 0) | (p.pu.cloak > 0 ? 2 : 0) | (p.seeker ? 4 : 0) | (p.sh > 0 ? 8 : 0) | (p.sprint ? 16 : 0) | (p.prot > 0 ? 32 : 0) | (sim.hide && sim.inBush(p) ? 64 : 0) | (p.swing > 0 ? 128 : 0);
P.dmgBlocks = function () {
  const out = [], w = this.map.w; if (!this.blk.size) return out;
  for (const [i, b] of this.blk) if (b.hp < b.mhp) out.push({ x: i % w, y: (i / w) | 0, f: Math.max(0, b.hp / b.mhp) });
  return out;
};
P.view = function (meId) {
  const me = this.pmap[meId]; let pl = this.players;
  if (this.hide && me) pl = pl.filter(q => this.canSee(me, q));
  return { map: this.map, meId, players: pl, flag: p => FLAG(this, p), zs: this.zs, projs: this.projs, eprojs: this.eprojs, pickups: this.pickups, turrets: this.turrets, clouds: this.clouds, blocks: this.dmgBlocks(), h: this.hudFor(meId), g: this.globalInfo(), t: this.t };
};
/* compact network snapshot for one receiver (evs = events queued for them) */
P.snapFor = function (id, evs) {
  const v = this.view(id), R1 = x => Math.round(x * 10) / 10;
  let fp = v.players.find(p => p.id === id); if (fp && !fp.alive) fp = v.players.find(p => p.alive) || fp;
  const cx = fp ? fp.x : 0, cy = fp ? fp.y : 0, near = (x, y, r) => !fp || (x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r;
  const s = { t: 's', tm: Math.round(this.t * 100) / 100, p: [], z: [], pr: [], ep: [], pk: [], tu: [], cl: [], bl: [], e: evs || [], h: v.h, g: v.g };
  for (const p of v.players) { const w = p.weapons[p.cur]; s.p.push([p.id, R1(p.x), R1(p.y), Math.round(p.ang * 100) / 100, Math.ceil(p.hp), v.flag(p), w ? w.id : 0]); }
  let nz = 0;
  for (const z of this.zs) {
    if (!z.boss && (nz >= 70 || !near(z.x, z.y, 450))) continue; if (!z.boss) nz++;
    s.z.push([z.id, z.type, R1(z.x), R1(z.y), Math.round(z.ang * 100) / 100, Math.max(1, Math.ceil(z.hpf * 255)), (z.fl & 3) | (z.armor ? 8 : 0) | (z.ai && z.ai.st === 'wind' ? 16 : 0) | (z.flash > 0 ? 32 : 0)]);
  }
  for (const q of this.projs) if (near(q.x, q.y, 520)) s.pr.push([q.kind, Math.round(q.x), Math.round(q.y), Math.round(q.vx), Math.round(q.vy)]);
  for (const q of this.eprojs) if (near(q.x, q.y, 520)) s.ep.push([q.kind, Math.round(q.x), Math.round(q.y), Math.round(q.vx), Math.round(q.vy), q.r]);
  for (const k of this.pickups) s.pk.push([k.id, k.kind, Math.round(k.x), Math.round(k.y), Math.round(k.life * 10) / 10]);
  for (const t of this.turrets) s.tu.push([Math.round(t.x), Math.round(t.y), Math.round(t.ang * 100) / 100]);
  for (const c of this.clouds) if (near(c.x, c.y, 520)) s.cl.push([Math.round(c.x), Math.round(c.y), c.r, Math.round(c.life * 10) / 10]);
  for (const b of v.blocks) if (near(b.x * T, b.y * T, 520)) s.bl.push([b.x, b.y, Math.max(1, Math.ceil(b.f * 255))]);
  return s;
};
/* keep only events a receiver should see */
P.filterEvents = function (evs, id) {
  const p = this.pmap[id]; if (!p) return evs; const out = [];
  for (const e of evs) {
    if (e.t === 'hurt') { if (e.id === id) out.push(e); continue; }
    const x = e.x != null ? e.x : e.p ? e.p[0][0] : null, y = e.x != null ? e.y : e.p ? e.p[0][1] : null;
    if (x == null) { out.push(e); continue; }
    const d2 = (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y);
    /* hide and seek: a seeker without an active scan only hears / sees things close by, so effects at a hidden hider's spot do not give it away */
    const lim = this.hide && p.seeker && !(this.g.scanT > 0) ? 150 : 520;
    if (d2 < lim * lim) out.push(e);
  }
  return out;
};
// debug helpers (used by tests)
P.debugSetRound = function (r) { const g = this.g; this.zs.length = 0; g.round = r - 1; g.toSpawn = 0; g.inter = .01; g.boss = null; };
P.debugGiveAll = function (p) { PD.WORDER.forEach(id => { if (!p.weapons.some(w => w.id === id)) p.weapons.splice(p.weapons.length - 1, 0, mkW(id)); }); };
})(typeof window !== 'undefined' ? window : globalThis);
