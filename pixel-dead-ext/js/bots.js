/* Pixel Dead v2.4 - bots.js : AI players that fill empty online lobbies.
   A bot is an ordinary Sim player (p.bot is its brain state) whose input is written by botThink() every frame, so it
   uses exactly the same movement, weapons, damage, scoring and networking as a human. Hosts add bots in HostSession.start(). */
(function (root) {
'use strict';
const PD = root.PD, T = PD.T, WDEF = PD.WDEF, P = PD.Sim.prototype, TL = PD.TILE;
const _o = { x: 0, y: 0 }, rnd = PD.rnd, TAU = Math.PI * 2;

PD.newBot = function () { return { t: 0, stuckT: 0, lx: 0, ly: 0, jit: 0, ja: 0, strafe: 1, strafeT: 0, tgt: null, eng: false, los: false, dest: null, flee: false, noise: 0, spot: null, spotT: 0, idleT: 0, abT: rnd(2, 6) }; };

/* a flow field leading to tile (tx,ty); one per bot, refreshed lazily */
P.botField = function (p, tx, ty) {
  const key = 'bf' + p.id; let f = this.fields[key];
  if (!f) f = this.fields[key] = { dist: PD.newFlow(this.map), tx: -1, ty: -1, age: 99, ver: -1 };
  if (f.ver !== this.map.ver || f.age > 2 || ((f.tx !== tx || f.ty !== ty) && f.age > .4)) { PD.flowFill(this.map, f.dist, tx, ty, 420); f.tx = tx; f.ty = ty; f.age = 0; f.ver = this.map.ver; }
  return f;
};
/* unit vector from p toward a world point, following the flow field (falls back to a straight line) */
P.botDir = function (p, x, y, out) {
  const m = this.map, d = Math.hypot(x - p.x, y - p.y) || 1;
  if (d > 20 && PD.hasLOS(m, p.x, p.y, x, y) && d < 90) { out.x = (x - p.x) / d; out.y = (y - p.y) / d; return; }
  const f = this.botField(p, Math.floor(x / T), Math.floor(y / T));
  if (!PD.flowDir(m, f.dist, p.x, p.y, _o) || (_o.x === 0 && _o.y === 0)) { out.x = (x - p.x) / d; out.y = (y - p.y) / d; return; }
  out.x = _o.x; out.y = _o.y;
};
function gunScore(d) { return d.kind === 'melee' ? 0 : (d.dmg * (d.pellets || 1)) / Math.max(.09, d.rate) * (d.slow < 1 ? .8 : 1); }
function ammoOf(w) { return w.mag + w.res; }
/* choose the best weapon with ammo; the pickaxe is the fallback */
P.botWeapon = function (p) {
  const ws = p.weapons; if (ws.length < 2) return;
  const cur = ws[p.cur], cd = WDEF[cur.id]; let best = ws.length - 1, bs = -1;
  for (let i = 0; i < ws.length - 1; i++) { const d = WDEF[ws[i].id]; if (ammoOf(ws[i]) <= 0) continue; const s = gunScore(d); if (s > bs) { bs = s; best = i; } }
  const curOk = cd.kind !== 'melee' && ammoOf(cur) > 0;
  if (p.reload > 0 && curOk) return;
  if ((!curOk && best !== p.cur) || (curOk && bs > gunScore(cd) * 1.5 && best !== p.cur)) this.act(p.id, 'sw', best);
};
P.botBushes = function () {
  if (this._bushes) return this._bushes; const m = this.map, l = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.tiles[y * m.w + x] === TL.BUSH && m.reach[y * m.w + x]) l.push({ x: x * T + 8, y: y * T + 8 });
  return this._bushes = l;
};
P.botFlee = function (b, p, from, out) { const d = Math.hypot(p.x - from.x, p.y - from.y) || 1; out.x = (p.x - from.x) / d; out.y = (p.y - from.y) / d; };

/* ---- decision step (4 times a second) ---- */
P.botDecide = function (p, b) {
  const m = this.map, g = this.g, d0 = p.weapons[p.cur] ? WDEF[p.weapons[p.cur].id] : null;
  b.noise = rnd(-1, 1) * (this.pvp ? .09 : .06); b.eng = false; b.flee = false; b.tgt = null; b.los = false; b.dest = null;
  if (this.hide) return this.botDecideHide(p, b);
  const range = d0 && d0.kind !== 'melee' ? d0.range * .9 : 24;
  let best = null, bd = 1e9;
  const consider = (e, maxd) => { if (e.dead || e === p || (e.alive === false)) return; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd && d < maxd) { bd = d; best = e; } };
  if (this.pvp) { for (const q of this.players) if (q !== p && q.alive && (!(q.pu.cloak > 0) || Math.hypot(q.x - p.x, q.y - p.y) < 60)) consider(q, 520); for (const z of this.zs) consider(z, 240); }
  else for (const z of this.zs) consider(z, 300);
  this.botWeapon(p);
  const w = p.weapons[p.cur];
  if (w && d0 && d0.kind !== 'melee' && p.reload <= 0 && w.res > 0 && (w.mag === 0 || (!best && w.mag < d0.mag * .5))) this.act(p.id, 'rl');
  if (best) {
    b.tgt = best; b.los = PD.hasLOS(m, p.x, p.y, best.x, best.y); const isP = !!best.weapons;
    const want = d0 && d0.kind === 'melee' ? 18 : Math.min(range * .6, this.pvp ? 120 : 150);
    if (p.hp < 28 && (isP || bd < 90)) { b.flee = true; b.dest = null; }
    else if (b.los && bd < range) { b.eng = true; b.want = want; }
    else b.dest = { x: best.x, y: best.y };
    if (!b.los && !isP && bd < 70) b.flee = true;
    return;
  }
  /* nothing to fight: grab a pickup, otherwise follow a teammate (co-op) or wander (pvp) */
  let pk = null, pd = this.pvp ? 300 : 170;
  for (const k of this.pickups) { if (k.life <= 0) continue; const d = Math.hypot(k.x - p.x, k.y - p.y); if (d < pd) { pd = d; pk = k; } }
  if (pk) { b.dest = { x: pk.x, y: pk.y }; return; }
  if (!this.pvp) {
    let mate = null, md = 1e9; for (const q of this.players) if (q !== p && q.alive) { const d = Math.hypot(q.x - p.x, q.y - p.y) * (q.bot ? 1.6 : 1); if (d < md) { md = d; mate = q; } }
    if (mate) { const d = Math.hypot(mate.x - p.x, mate.y - p.y); if (d > 75) b.dest = { x: mate.x, y: mate.y }; return; }
  }
  b.spotT -= .25; if (!b.spot || b.spotT <= 0 || Math.hypot(b.spot.x - p.x, b.spot.y - p.y) < 20) { const s = PD.pick(m.itemSpots) || m.start; b.spot = { x: s.x, y: s.y }; b.spotT = rnd(6, 12); }
  b.dest = b.spot;
};
P.botDecideHide = function (p, b) {
  const g = this.g, m = this.map, bushes = this.botBushes();
  if (!p.seeker) {
    const seekers = this.players.filter(q => q.seeker); let near = null, nd = 1e9;
    for (const s of seekers) { const d = Math.hypot(s.x - p.x, s.y - p.y); if (d < nd) { nd = d; near = s; } }
    const inB = this.inBush(p);
    if (g.ph === 'seek' && near && nd < (inB ? 38 : 120)) { b.flee = true; b.spot = null; b.from = near; }       // spotted: run, then pick a fresh bush
    if (!b.spot || (b.spot.dead)) {
      let best = null, bs = -1e9;
      for (let i = 0; i < 14 && bushes.length; i++) {
        const s = bushes[(Math.random() * bushes.length) | 0]; let md = 1e9; for (const q of seekers) md = Math.min(md, Math.hypot(q.x - s.x, q.y - s.y));
        const sc = Math.min(md, 500) - Math.hypot(s.x - p.x, s.y - p.y) * .5 + rnd(0, 60); if (sc > bs) { bs = sc; best = s; }
      }
      b.spot = best ? { x: best.x, y: best.y } : { x: p.x + rnd(-60, 60), y: p.y + rnd(-60, 60) };
    }
    if (inB && Math.hypot(b.spot.x - p.x, b.spot.y - p.y) < 22 && !b.flee) { b.dest = null; b.still = true; } else { b.dest = b.spot; b.still = false; }
    return;
  }
  if (g.ph !== 'seek' || p.stun > 0) { b.still = true; return; }
  b.still = false;
  let best = null, bd = 1e9; for (const h of this.players) if (!h.seeker && h.alive && this.canSee(p, h)) { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d < bd) { bd = d; best = h; } }
  if (best) { b.dest = { x: best.x, y: best.y }; b.chase = true; return; }
  b.chase = false; b.abT -= .25; if (b.abT <= 0) { b.abT = rnd(8, 16); if (p.ab <= 0) this.act(p.id, 'ab'); }
  if (!b.spot || Math.hypot(b.spot.x - p.x, b.spot.y - p.y) < 22 || (b.spotT -= .25) <= 0) { const s = bushes.length ? bushes[(Math.random() * bushes.length) | 0] : { x: this.map.start.x, y: this.map.start.y }; b.spot = { x: s.x, y: s.y }; b.spotT = rnd(8, 14); }
  b.dest = b.spot;
};

/* ---- per-frame step: writes p.inp ---- */
P.botThink = function (p, dt) {
  const b = p.bot; if (!b || !p.alive || this.over) return;
  b.t -= dt; b.stuckT += dt; b.jit = Math.max(0, b.jit - dt); b.strafeT -= dt;
  if (!b.lx && !b.ly) { b.lx = p.x; b.ly = p.y; }
  if (b.stuckT >= .5) { if (b.moving && Math.hypot(p.x - b.lx, p.y - b.ly) < 4) { b.jit = .7; b.ja = rnd(0, TAU); } b.lx = p.x; b.ly = p.y; b.stuckT = 0; }
  if (b.t <= 0) { b.t = rnd(.2, .3); this.botDecide(p, b); }
  if (b.strafeT <= 0) { b.strafeT = rnd(.7, 1.6); b.strafe = Math.random() < .5 ? -1 : 1; }
  const inp = p.inp; let mx = 0, my = 0, aim = p.ang, fire = false, sp = false, v = { x: 0, y: 0 };
  const tgt = b.tgt && !b.tgt.dead && b.tgt.alive !== false ? b.tgt : null;
  if (this.hide) {
    if (b.flee && b.from) { this.botFlee(b, p, b.from, v); mx = v.x; my = v.y; sp = true; if (Math.hypot(b.from.x - p.x, b.from.y - p.y) > 160) b.flee = false; }
    else if (b.dest) { this.botDir(p, b.dest.x, b.dest.y, v); mx = v.x; my = v.y; sp = !!(b.chase && Math.hypot(b.dest.x - p.x, b.dest.y - p.y) > 24) || (Math.hypot(b.dest.x - p.x, b.dest.y - p.y) > 200 && p.stam > 60); }
    if (b.still) { mx = 0; my = 0; }
  } else {
    if (tgt) {
      const dx = tgt.x - p.x, dy = tgt.y - p.y, d = Math.hypot(dx, dy) || 1, w = p.weapons[p.cur], dd = w ? WDEF[w.id] : null;
      aim = Math.atan2(dy, dx) + b.noise;
      if (b.flee) { this.botFlee(b, p, tgt, v); mx = v.x; my = v.y; sp = true; }
      else if (b.eng) {
        const R = b.want || 100;
        if (d < R * .55) { this.botFlee(b, p, tgt, v); mx = v.x * .8 - v.y * b.strafe * .5; my = v.y * .8 + v.x * b.strafe * .5; }
        else if (d > R * 1.4) { this.botDir(p, tgt.x, tgt.y, v); mx = v.x; my = v.y; }
        else if (this.pvp) { mx = -dy / d * b.strafe; my = dx / d * b.strafe; }
        if (dd && !p.build && !(dd.kind !== 'melee' && w.mag <= 0 && w.res <= 0)) { fire = true; if (dd.kind !== 'melee' && !dd.auto && p.cd <= 0) p.pull = .15; }
      } else if (b.dest) { this.botDir(p, b.dest.x, b.dest.y, v); mx = v.x; my = v.y; sp = d > 160 && p.stam > 50; }
    } else if (b.dest) {
      const d = Math.hypot(b.dest.x - p.x, b.dest.y - p.y); this.botDir(p, b.dest.x, b.dest.y, v); mx = v.x; my = v.y; sp = d > 220 && p.stam > 55; if (d > 6) aim = Math.atan2(my, mx);
    }
  }
  if (b.jit > 0) { mx = Math.cos(b.ja); my = Math.sin(b.ja); }
  b.moving = Math.abs(mx) + Math.abs(my) > .05;
  inp.mx = mx; inp.my = my; inp.a = aim; inp.f = fire ? 1 : 0; inp.sp = sp ? 1 : 0; inp.f2 = 0; inp.ad = tgt ? Math.hypot(tgt.x - p.x, tgt.y - p.y) : 100;
};
})(typeof window !== 'undefined' ? window : globalThis);
