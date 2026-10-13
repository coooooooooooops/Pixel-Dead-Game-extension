/* Pixel Dead - scene.js : the animated night street behind every menu.
   Low-res buffer scaled by an integer factor (always crisp). Layers are baked once per resize; only windows, stars, fog,
   zombies, the crow, moths and the lamp are drawn per frame. Runs at 30 fps and sleeps while a game is running. */
(function (root) {
'use strict';
const PD = root.PD = root.PD || {};
const Scene = PD.Scene = { running: false, ready: false };

/* ---------- helpers ---------- */
const B8 = (() => {   // 8x8 Bayer matrix, normalised 0..1
  let m = [[0, 2], [3, 1]];
  for (let n = 2; n < 8; n *= 2) { const o = []; for (let y = 0; y < n * 2; y++) { o.push([]); for (let x = 0; x < n * 2; x++) { const b = m[y % n][x % n]; o[y].push(4 * b + [[0, 2], [3, 1]][(y / n) | 0][(x / n) | 0]); } } m = o; }
  return m.map(r => r.map(v => (v + .5) / 64));
})();
const bay = (x, y) => B8[y & 7][x & 7];
const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgb = c => 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rr = (a, b) => a + Math.random() * (b - a);
const reduced = () => { try { return root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

/* ---------- state ---------- */
let cv, g, W = 0, H = 0, S = 1, gy = 0, sw = 0, lx = 0, bx = 0, by = 0, topY = 0, PAD = 8;
let L = {}, cone = null, fogA = null, fogB = null, vig = null;
let stars = [], wins = [], beacons = [], zs = [], parts = [], moths = [], shoot = null, crow = null;
let t = 0, last = 0, raf = 0, acc = 0, flashT = 0, nextFlash = 18, nextZ = 1, stopCool = 6, lampOff = 0, lampFl = null, nextFl = 8, surge = 0, intro = 0;
let mx = 0, my = 0, tmx = 0, tmy = 0;
const ZCOL = { skin: hex('#8fbf6a'), skinD: hex('#121a36'), pants: hex('#2b3262'), pantsD: hex('#080c1c'), shirtD: hex('#0a0f24'), eye: hex('#ff4a3a'), cone: hex('#ff7a1a'), coneD: hex('#3a1a10') };
const SHIRTS = [hex('#6b3a3a'), hex('#3a5a7a'), hex('#4f6a3a'), hex('#6a5a2a'), hex('#5a3a6a'), hex('#7a7a6a')];

/* ---------- baking ---------- */
function layer(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return { c, g: x, w, h }; }
function fill(l, x, y, w, h, col) { l.g.fillStyle = col; l.g.fillRect(x, y, w, h); }
function line(l, x0, y0, x1, y1, col) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy; l.g.fillStyle = col;
  for (let n = 0; n < 500; n++) { l.g.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
}

function bakeSky(rng) {
  const w = W + PAD * 2, h = gy + 4, l = layer(w, h), im = l.g.createImageData(w, h), d = im.data;
  const stops = ['#04060e', '#070a18', '#0b1029', '#10173a', '#171f4d', '#212a60', '#2c3372', '#3a3a7e', '#4a3d80'].map(hex);
  const at = u => { const f = clamp(u, 0, 1) * (stops.length - 1), i = Math.min(stops.length - 2, f | 0); return mix(stops[i], stops[i + 1], f - i); };
  const LV = 18;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = Math.min(1, y / gy), q = u * LV, lo = q | 0, c = at((lo + (q - lo > bay(x, y) ? 1 : 0)) / LV), i = (y * w + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  // moon + halo
  const r = Math.max(7, Math.round(H * .075)), mxp = Math.round(W * .58) + PAD, myp = Math.round(gy * .24), hal = r + Math.round(r * 1.1);
  for (let y = myp - hal; y <= myp + hal; y++) for (let x = mxp - hal; x <= mxp + hal; x++) {
    if (x < 0 || y < 0 || x >= w || y >= h) continue; const dd = Math.hypot(x - mxp, y - myp), i = (y * w + x) * 4;
    if (dd <= r) {
      let c = hex('#e8edf7'); if ((x - mxp) + (y - myp) > r * .55) c = hex('#cdd5ea'); if ((x - mxp) + (y - myp) > r * 1.05) c = hex('#aab4d4');
      const cr = [[-.35, -.25, .22], [.2, .3, .17], [-.1, .45, .12], [.4, -.35, .1]]; for (const k of cr) if (Math.hypot(x - mxp - k[0] * r, y - myp - k[1] * r) < k[2] * r) c = hex('#bcc6e2');
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    } else if (dd < hal) { const a = (1 - (dd - r) / (hal - r)) * .5; if (a > bay(x, y)) { d[i] = Math.min(255, d[i] + 38); d[i + 1] = Math.min(255, d[i + 1] + 46); d[i + 2] = Math.min(255, d[i + 2] + 70); } }
  }
  l.g.putImageData(im, 0, 0); return l;
}

function bakeSkyline(rng) {
  const w = W + PAD * 2;
  // far layer
  const far = layer(w, gy + 4), nearL = layer(w, gy + 4); wins.length = 0; beacons.length = 0;
  let x = -4;
  while (x < w) {
    const bw = 8 + (rng() * 12 | 0), bh = Math.round(H * (.12 + rng() * .24)), top = gy - bh;
    fill(far, x, top, bw, bh + 3, '#0e1331'); fill(far, x, top, bw, 1, '#161d44');
    if (rng() < .22) fill(far, x + (bw >> 1), top - 6, 1, 6, '#0e1331');
    for (let wy = top + 3; wy < gy - 3; wy += 4) for (let wx = x + 2; wx < x + bw - 2; wx += 3) if (rng() < .12) fill(far, wx, wy, 1, 1, '#1d2658');
    x += bw + (rng() * 3 | 0);
  }
  // near layer (windows are dynamic)
  x = -6;
  while (x < w) {
    const bw = 12 + (rng() * 18 | 0), bh = Math.round(H * (.17 + rng() * .21)), top = gy - bh, dark = rng() < .22;
    fill(nearL, x, top, bw, bh + 3, '#080b1d'); fill(nearL, x, top, bw, 1, '#10153a'); fill(nearL, x + bw - 1, top, 1, bh, '#0b0f26');
    const kind = rng();
    if (kind < .25) { fill(nearL, x + 3, top - 4, 6, 4, '#080b1d'); fill(nearL, x + 4, top - 2, 1, 2, '#05071a'); }      // water tank
    else if (kind < .5) { const ax = x + 2 + (rng() * (bw - 4) | 0); fill(nearL, ax, top - 9, 1, 9, '#080b1d'); beacons.push({ x: ax, y: top - 10, ph: rng() * 3 }); }   // antenna
    else if (kind < .62) fill(nearL, x + 2, top - 3, bw - 4, 3, '#080b1d');
    for (let wy = top + 3; wy < gy - 4; wy += 5) for (let wx = x + 2; wx < x + bw - 3; wx += 4) {
      fill(nearL, wx, wy, 2, 2, '#0c1130');
      if (!dark && rng() < .2) { const k = rng(), col = k < .72 ? '#ffb547' : k < .86 ? '#8fe0ff' : '#7be26a'; wins.push({ x: wx, y: wy, on: 1, col, t: rr(2, 20) }); }
      else if (rng() < .05) wins.push({ x: wx, y: wy, on: 0, col: '#ffb547', t: rr(5, 40) });
    }
    x += bw + (rng() * 5 | 0);
  }
  return { far, near: nearL };
}

function bakeGround(rng) {
  const w = W + PAD * 2, h = H - gy + 2, l = layer(w, h), roadTop = sw + 1;
  fill(l, 0, 0, w, sw, '#171d44'); fill(l, 0, 0, w, 1, '#2b3568'); fill(l, 0, sw - 1, w, 1, '#2c366b'); fill(l, 0, sw, w, 1, '#080a17');
  for (let x = ((rng() * 14) | 0); x < w; x += 14) fill(l, x, 1, 1, sw - 2, '#111638');
  fill(l, 0, roadTop, w, h - roadTop, '#0d1022');
  for (let y = roadTop; y < h; y++) for (let x = 0; x < w; x++) { const r = rng(); if (r < .07) fill(l, x, y, 1, 1, '#141a3d'); else if (r < .1) fill(l, x, y, 1, 1, '#080a18'); }
  const ly = roadTop + Math.round((h - roadTop) * .62), off = (rng() * 12) | 0;
  for (let x = -off; x < w; x += 12) fill(l, x, ly, 6, 1, '#4a4228');
  // street furniture on the sidewalk
  const hx = Math.round(W * .47) + PAD; fill(l, hx, 2, 3, 4, '#a02a2a'); fill(l, hx - 1, 3, 5, 1, '#c03a3a'); fill(l, hx, 1, 3, 1, '#7a1f1f'); fill(l, hx + 1, 6, 1, 1, '#080a17');
  const tx = Math.round(W * .86) + PAD; fill(l, tx, 0, 5, 6, '#232a5a'); fill(l, tx, 0, 5, 1, '#33407f'); fill(l, tx + 1, 2, 3, 1, '#161b40');
  // manhole
  const mhx = Math.round(W * .33) + PAD, mhy = roadTop + 7; fill(l, mhx, mhy, 6, 2, '#05060f'); fill(l, mhx + 1, mhy - 1, 4, 1, '#161b40');
  // lamp pole (drawn into ground layer; bulb is dynamic)
  const px = lx + PAD, base = sw - 2, top = topY - gy;
  fill(l, px - 2, base, 5, 2, '#10153a'); fill(l, px - 1, top, 2, base - top, '#1d2350'); fill(l, px - 1, top, 1, base - top, '#2f3a7a');
  fill(l, px - 11, top, 11, 1, '#262d62'); fill(l, px - 11, top + 1, 1, 2, '#262d62');
  fill(l, px - 13, top + 1, 6, 3, '#2a3166'); fill(l, px - 13, top + 1, 6, 1, '#3a4690');
  // lamp base glow stays dynamic; add a little dead tree on the left (silhouette)
  const tr = (x, y, a, len, dep) => { if (dep > 5 || len < 2) return; const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; line(l, x, y, x2, y2, '#07091a'); const n = rng() < .5 ? 2 : 1; for (let i = 0; i < n; i++) tr(x2, y2, a + rr(-.8, .8) * (rng() < .5 ? 1 : -1), len * rr(.62, .82), dep + 1); };
  tr(Math.round(W * .07) + PAD, 4, -Math.PI / 2 + .08, Math.max(8, H * .06), 0);
  return l;
}

function bakeCone() {
  const cw = Math.round(H * .66) | 1, ch = (gy + sw) - by + 3, c = layer(cw, ch + Math.round(H * .08)), im = c.g.createImageData(c.w, c.h), d = im.data, cx = cw >> 1;
  for (let y = 0; y < c.h; y++) for (let x = 0; x < cw; x++) {
    const u = y / ch, hw = 3 + u * (cw / 2 - 4); let a = 0;
    if (u <= 1) { const k = Math.abs(x - cx) / hw; if (k < 1) a = (1 - u * .62) * (1 - k * k) * 1.05; }
    else { const k = Math.hypot((x - cx) / (cw * .46), (y - ch) / (H * .045)); if (k < 1) a = (1 - k) * .72; }   // pool on the ground
    if (a > bay(x, y)) { const core = a > .62, i = (y * cw + x) * 4; d[i] = 255; d[i + 1] = core ? 208 : 181; d[i + 2] = core ? 122 : 71; d[i + 3] = core ? 84 : 58; }
  }
  // dense halo around the bulb
  for (let y = 0; y < 14; y++) for (let x = cx - 14; x <= cx + 14; x++) { if (x < 0 || x >= cw) continue; const dd = Math.hypot(x - cx, y - 1); const a = (1 - dd / 12) * 1.1; if (a > bay(x, y)) { const i = (y * cw + x) * 4; d[i] = 255; d[i + 1] = 224; d[i + 2] = 150; d[i + 3] = 120; } }
  c.g.putImageData(im, 0, 0); c.cx = cx; return c;
}

function bakeFog(w, h, alpha, seed) {
  const l = layer(w, h), im = l.g.createImageData(w, h), d = im.data, p = [rr(0, 6), rr(0, 6), rr(0, 6)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w * Math.PI * 2, v = Math.sin(u * 2 + p[0] + seed) + Math.sin(u * 5 + p[1] + y * .08) * .6 + Math.sin(u * 9 + p[2] - y * .12) * .35;
    const vy = Math.sin(y / h * Math.PI), val = ((v + 1.9) / 3.8) * vy * 1.25 - .18;
    if (val > bay(x, y)) { const i = (y * w + x) * 4; d[i] = 150; d[i + 1] = 165; d[i + 2] = 232; d[i + 3] = alpha; }
  }
  l.g.putImageData(im, 0, 0); return l;
}

function bakeVig() {
  const l = layer(W, H), im = l.g.createImageData(W, H), d = im.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x / W - .5) * 1.25, dy = (y / H - .5) * 1.1, dd = Math.hypot(dx, dy), a = clamp((dd - .38) / .5, 0, 1) * .85;
    if (a > bay(x, y)) { const i = (y * W + x) * 4; d[i] = 2; d[i + 1] = 3; d[i + 2] = 10; d[i + 3] = 150; }
  }
  l.g.putImageData(im, 0, 0); return l;
}

/* ---------- build / resize ---------- */
Scene.resize = function () {
  if (!cv) return;
  const vw = Math.max(1, root.innerWidth || 640), vh = Math.max(1, root.innerHeight || 420);
  S = Math.max(1, Math.round(vh / 180)); W = Math.ceil(vw / S); H = Math.ceil(vh / S);
  cv.width = W; cv.height = H; cv.style.width = W * S + 'px'; cv.style.height = H * S + 'px'; g.imageSmoothingEnabled = false;
  gy = Math.round(H * .7); sw = Math.max(8, Math.round(H * .065)); lx = Math.round(W * .74); topY = gy - Math.round(H * .37); bx = lx - 10; by = topY + 3;
  let seed = 1337; const rng = PD.mulberry32 ? PD.mulberry32(seed) : Math.random;
  L.sky = bakeSky(rng); const sk = bakeSkyline(rng); L.far = sk.far; L.near = sk.near; L.ground = bakeGround(rng); cone = bakeCone();
  fogA = bakeFog(W, 26, 40, 0); fogB = bakeFog(W, 22, 34, 3); vig = bakeVig();
  stars = []; const n = Math.round(W * gy / 650);
  for (let i = 0; i < n; i++) stars.push({ x: (rng() * W) | 0, y: (rng() * gy * .82) | 0, b: rng() < .12 ? 2 : rng() < .5 ? 1 : 0, ph: rng() * 6.3, sp: rr(.6, 2.2) });
  moths = []; for (let i = 0; i < 3; i++) moths.push({ a: rr(0, 6.3), r: rr(4, 10), sp: rr(1.5, 3), y: rr(-3, 4) });
  if (!zs.length) { for (let i = 0; i < 2; i++) spawnZ(rr(W * .15, W * .6)); }
  else for (const z of zs) z.y = clamp(z.y, gy + 3, H - 4);
  crow = { st: 'perch', x: bx + 5, y: by - 4, t: 0, fx: 0, fy: 0, tx: 0, ty: 0, d: 0 };
  Scene.ready = true; if (!Scene.running) draw(0);
};

/* ---------- entities ---------- */
function spawnZ(x) {
  const dir = Math.random() < .5 ? 1 : -1, run = Math.random() < .06;
  const z = { x: x != null ? x : (dir > 0 ? -10 : W + 10), y: rr(gy + 3, H - 4), dir, sp: run ? rr(22, 30) : rr(6, 12), ph: rr(0, 4), st: 'walk', tm: 0, tall: Math.random() < .2, fat: Math.random() < .2, cone: Math.random() < .13, run, shirt: SHIRTS[(Math.random() * SHIRTS.length) | 0], prev: 0 };
  z.prev = z.x; zs.push(z); return z;
}
function litAt(x, y) { const cx = bx, dx = Math.abs(x - cx), r = H * .26; if (dx > r) return 0; const v = (1 - dx / r) * (y > gy ? 1 : .6); return v > .6 ? 1 : v > .25 ? .5 : 0; }
function blood(x, y, n) { for (let i = 0; i < n; i++) { const a = rr(-Math.PI * 1.1, -Math.PI * .1); parts.push({ x, y, vx: Math.cos(a) * rr(10, 40), vy: Math.sin(a) * rr(18, 50), l: rr(.4, .9), c: Math.random() < .6 ? '#8a0f16' : '#c0202a' }); } }

Scene.click = function (cx, cy) {
  if (!Scene.running) return false;
  const px = cx / S - PAD + PAD - gx(), py = cy / S - gyOff();
  for (let i = zs.length - 1; i >= 0; i--) { const z = zs[i]; if (z.st === 'dead') continue; if (Math.abs(px - z.x) < 6 && py < z.y + 2 && py > z.y - 16) { z.st = 'dead'; z.tm = 0; blood(z.x, z.y - 9, 14); return 'zombie'; } }
  if (Math.hypot(px - bx, py - by) < 10) { lampOff = 1.1; return 'lamp'; }
  return false;
};
Scene.surge = function () { surge = .5; for (const z of zs) if (z.st === 'walk') z.sp *= 1.0; };
Scene.mouse = function (nx, ny) { tmx = clamp(nx, -1, 1); tmy = clamp(ny, -1, 1); };
const gx = () => Math.round(mx * 3), gyOff = () => 0;

/* ---------- update ---------- */
function update(dt) {
  t += dt; mx += (tmx - mx) * Math.min(1, dt * 4); my += (tmy - my) * Math.min(1, dt * 4);
  if (intro < 2) intro += dt;
  nextZ -= dt; if (nextZ <= 0 && zs.length < 5) { spawnZ(); nextZ = rr(3, 7); }
  stopCool -= dt;
  for (const z of zs) {
    if (z.st === 'walk') {
      z.prev = z.x; z.x += z.dir * z.sp * dt; z.ph += z.sp * dt / 3;
      if (stopCool <= 0 && (z.prev - bx) * (z.x - bx) <= 0 && Math.random() < .5) { z.st = 'stop'; z.tm = rr(2.4, 3.6); stopCool = 11; if (crow && crow.st === 'perch') flyCrow(); }
    } else if (z.st === 'stop') { z.tm -= dt; if (z.tm <= 0) z.st = 'walk'; }
    else if (z.st === 'dead') z.tm += dt;
  }
  zs = zs.filter(z => !(z.st === 'dead' && z.tm > 3.2) && z.x > -16 && z.x < W + 16);
  for (const p of parts) { p.l -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; if (p.y > H - 1) { p.y = H - 1; p.vy = 0; p.vx *= .5; } }
  parts = parts.filter(p => p.l > 0);
  // lamp flicker
  if (lampOff > 0) lampOff -= dt;
  nextFl -= dt; if (nextFl <= 0 && !lampFl) { lampFl = { i: 0, tt: 0, seq: [.5, 1, .15, .8, 0, 1, .6, 1] }; nextFl = rr(7, 15); }
  if (lampFl) { lampFl.tt += dt; if (lampFl.tt > .07) { lampFl.tt = 0; if (++lampFl.i >= lampFl.seq.length) lampFl = null; } }
  if (surge > 0) surge -= dt;
  // flashes + shooting stars
  nextFlash -= dt; if (nextFlash <= 0) { flashT = .36; nextFlash = rr(26, 48); }
  if (flashT > 0) flashT -= dt;
  if (!shoot && Math.random() < dt / 13) { const x0 = rr(W * .3, W * .95), y0 = rr(2, gy * .3); shoot = { x: x0, y: y0, vx: -rr(90, 140), vy: rr(35, 60), l: .8 }; }
  if (shoot) { shoot.l -= dt; shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt; if (shoot.l <= 0) shoot = null; }
  // windows
  for (const w of wins) { w.t -= dt; if (w.t <= 0) { w.on = w.on ? 0 : (Math.random() < .55 ? 1 : 0); w.t = rr(6, 40); } }
  // crow
  if (crow) {
    if (crow.st === 'fly') { crow.t += dt; const k = clamp(crow.t / crow.d, 0, 1); crow.x = crow.fx + (crow.tx - crow.fx) * k; crow.y = crow.fy + (crow.ty - crow.fy) * k - Math.sin(k * Math.PI) * 14 * (crow.arc || 1); if (k >= 1) { crow.st = crow.tx === bx + 5 ? 'perch' : 'gone'; crow.t = 0; if (crow.st === 'gone') crow.wait = rr(12, 22); } }
    else if (crow.st === 'gone') { crow.wait -= dt; if (crow.wait <= 0) { crow.st = 'fly'; crow.fx = W + 12; crow.fy = rr(4, gy * .35); crow.tx = bx + 5; crow.ty = by - 4; crow.t = 0; crow.d = 3.2; crow.arc = .6; } }
  }
}
function flyCrow() { crow.st = 'fly'; crow.fx = crow.x; crow.fy = crow.y; crow.tx = -14; crow.ty = rr(2, gy * .3); crow.t = 0; crow.d = 3.4; crow.arc = 1; }

/* ---------- draw ---------- */
function lampLevel() {
  if (lampOff > 0) return lampOff > .5 && Math.floor(lampOff * 14) % 2 ? .35 : 0;
  let v = 1; if (lampFl) v = lampFl.seq[lampFl.i];
  const IN = [[0, 0], [.22, .55], [.3, 0], [.46, .8], [.58, .1], [.8, .9], [.95, .35], [1.1, 1]]; if (intro < 1.1) { v = 0; for (const s of IN) if (intro >= s[0]) v = s[1]; }
  if (surge > 0) v = 1;
  return v;
}
function R(c, x, y, w, h) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }
function zcol(z, lit) {
  const k = lit, shirt = mix(ZCOL.shirtD, z.shirt, k), skin = mix(ZCOL.skinD, ZCOL.skin, k), pants = mix(ZCOL.pantsD, ZCOL.pants, k);
  return { shirt: rgb(shirt), skin: rgb(skin), pants: rgb(pants) };
}
function drawZ(z, ox) {
  const lit = litAt(z.x, z.y), c = zcol(z, lit), d = z.dir, x = Math.round(z.x) + ox, y = Math.round(z.y);
  const X = (dx, w) => d > 0 ? x + dx : x - dx - w + 1;
  let al = 1; if (z.st === 'dead') { al = z.tm > 2.2 ? Math.max(0, 1 - (z.tm - 2.2)) : 1; if (al < 1 && Math.floor(z.tm * 12) % 2) al *= .5; }
  g.globalAlpha = al;
  if (lit > 0) { const len = clamp(Math.abs(z.x - bx) * .7 + 3, 3, 16); const sx = z.x >= bx ? x : x - len; R('rgba(0,0,0,.5)', sx + (z.x >= bx ? 0 : 0), y, len, 1); }
  if (z.st === 'dead') {
    const k = z.tm;
    if (k < .12) { R('#fff', X(-2, 5), y - 9, 5, 6); }
    else if (k < .3) { R(c.pants, X(-2, 2), y - 3, 2, 3); R(c.shirt, X(-1, 6), y - 7, 6, 4); R(c.skin, X(4, 4), y - 8, 4, 3); }
    else { R(c.pants, X(-6, 4), y - 2, 4, 2); R(c.shirt, X(-2, 6), y - 3, 6, 3); R(c.skin, X(4, 4), y - 3, 4, 3); R('rgba(120,10,16,.8)', X(-3, 9), y - 1, 9, 1); }
    g.globalAlpha = 1; return;
  }
  const stop = z.st === 'stop', step = (Math.floor(z.ph) & 1), bob = stop ? 0 : (step ? 0 : 1);
  const th = z.tall ? 1 : 0, tw = z.fat ? 2 : 0;
  // legs
  const la = stop ? 0 : step ? 1 : 0, lb = stop ? 0 : step ? 0 : 1;
  R(c.pants, X(-2 - (tw >> 1), 2), y - 4 + la, 2, 4 - la); R(c.pants, X(1 + (tw >> 1), 2), y - 4 + lb, 2, 4 - lb);
  // torso
  R(c.shirt, X(-2 - (tw >> 1), 5 + tw), y - 9 - th + bob, 5 + tw, 5 + th);
  // head
  const hy = y - 12 - th + bob - (stop ? 1 : 0), hx = stop ? 0 : 1;
  R(c.skin, X(-1 + hx - (stop ? 1 : 0), 4), hy, 4, 3);
  if (lit < 1) { R('rgba(255,60,50,.28)', X(1 + hx + 1, 2), hy, 2, 3); }
  R(rgb(ZCOL.eye), X(2 + hx - (stop ? 1 : 0), 1), hy + 1, 1, 1);
  if (z.cone) { R(rgb(mix(ZCOL.coneD, ZCOL.cone, Math.max(.35, lit))), X(0 + hx - (stop ? 1 : 0), 2), hy - 3, 2, 1); R(rgb(mix(ZCOL.coneD, ZCOL.cone, Math.max(.35, lit))), X(-1 + hx - (stop ? 1 : 0), 4), hy - 2, 4, 2); }
  // arms
  if (stop) { R(c.skin, X(3, 1), y - 14 - th, 1, 5); R(c.skin, X(1, 1), y - 13 - th, 1, 4); }
  else { const ay = y - 8 - th + bob + (step ? 0 : -1); R(c.skin, X(2 + (tw >> 1), 4), ay, 4, 1); R(c.skin, X(2 + (tw >> 1), 3), ay + 1, 3, 1); }
  g.globalAlpha = 1;
}

function draw(dt) {
  if (!g || !W) return;
  const o0 = Math.round(mx * .4), o1 = Math.round(mx * 1), o2 = Math.round(mx * 2), o3 = Math.round(mx * 3), oy1 = Math.round(my * .5);
  g.globalAlpha = 1;
  g.drawImage(L.sky.c, -PAD + o0, 0);
  // stars
  for (const s of stars) {
    const tw = Math.sin(t * s.sp + s.ph); const lv = s.b === 2 ? 2 : (tw > .75 ? 1 : s.b);
    const col = lv === 2 ? '#fff' : lv === 1 ? '#c5cfee' : '#6a76ab'; g.fillStyle = col; const x = s.x + o0, y = s.y; g.fillRect(x, y, 1, 1);
    if (s.b === 2 && tw > .2) { g.fillStyle = '#8d97bd'; g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); g.fillRect(x, y - 1, 1, 1); g.fillRect(x, y + 1, 1, 1); }
  }
  if (shoot) { for (let i = 0; i < 9; i++) { const k = i / 9; g.fillStyle = 'rgba(230,236,247,' + (1 - k) * Math.min(1, shoot.l * 3) + ')'; g.fillRect(Math.round(shoot.x - shoot.vx * .014 * i), Math.round(shoot.y - shoot.vy * .014 * i), 1, 1); } }
  g.drawImage(L.far.c, -PAD + o1, 0);
  g.drawImage(fogA.c, Math.round(-(t * 2.5) % W) + o1, gy - 22); g.drawImage(fogA.c, Math.round(-(t * 2.5) % W) + W + o1, gy - 22);
  g.drawImage(L.near.c, -PAD + o2, 0);
  // windows
  for (const w of wins) { if (!w.on) continue; const fl = (Math.sin(t * 3 + w.x * 7) > .985) ? 0 : 1; if (!fl) continue; g.fillStyle = w.col; g.fillRect(w.x - PAD + o2, w.y, 2, 2); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(w.x - PAD + o2, w.y, 1, 1); }
  for (const b of beacons) { if (((t + b.ph) % 1.6) < .22) { g.fillStyle = '#ff3b3b'; g.fillRect(b.x - PAD + o2, b.y, 1, 1); g.fillStyle = 'rgba(255,60,50,.3)'; g.fillRect(b.x - PAD + o2 - 1, b.y, 3, 1); g.fillRect(b.x - PAD + o2, b.y - 1, 1, 3); } }
  if (flashT > 0) { const k = flashT > .2 ? 1 : (flashT > .12 ? 0 : .7); if (k) { g.fillStyle = 'rgba(190,205,255,' + .11 * k + ')'; g.fillRect(0, 0, W, gy); } }
  g.drawImage(L.ground.c, -PAD + o3, gy);
  // entities, y-sorted
  const ents = zs.slice().sort((a, b) => a.y - b.y);
  for (const z of ents) { g.save(); g.translate(0, gy * 0); drawZ(z, o3); g.restore(); }
  // crow
  if (crow && crow.st !== 'gone') {
    const cx = Math.round(crow.x) + o3, cy = Math.round(crow.y);
    if (crow.st === 'perch') { R('#05060f', cx - 2, cy - 1, 5, 3); R('#05060f', cx + 3, cy, 2, 1); R('#8d97bd', cx + 4, cy, 1, 1); R('#05060f', cx - 4, cy + 1, 2, 1); }
    else { const f = Math.floor(t * 10) & 1; R('#05060f', cx - 1, cy, 3, 2); R(f ? '#05060f' : '#0a0e22', cx - 4, cy + (f ? -2 : 1), 3, 1); R(f ? '#05060f' : '#0a0e22', cx + 2, cy + (f ? -2 : 1), 3, 1); }
  }
  // blood
  for (const p of parts) { g.globalAlpha = Math.min(1, p.l * 3); g.fillStyle = p.c; g.fillRect(Math.round(p.x) + o3, Math.round(p.y), 1, 1); } g.globalAlpha = 1;
  // lamp: bulb, cone, moths
  const lv = lampLevel(), ox = o3, bxx = bx + ox;
  if (lv > 0) {
    g.globalAlpha = Math.min(1, lv) * (.9 + Math.sin(t * 40) * .02); g.drawImage(cone.c, bxx - cone.cx, by);
    g.globalAlpha = 1; g.fillStyle = lv > .7 ? '#fff4c8' : '#ffd07a'; g.fillRect(bxx - 1, by, 3, 2); g.fillStyle = '#ffb547'; g.fillRect(bxx - 2, by + 1, 5, 1);
    for (const m of moths) { m.a += m.sp * (dt || .033); const mxp = bxx + Math.cos(m.a) * m.r + Math.sin(t * 3 + m.r) * 2, myp = by + 2 + Math.sin(m.a * 1.7) * m.r * .6 + m.y; g.fillStyle = Math.floor(t * 12 + m.r) & 1 ? '#e6ecf7' : '#8d97bd'; g.fillRect(Math.round(mxp), Math.round(myp), 1, 1); }
  } else { g.fillStyle = '#2a3166'; g.fillRect(bxx - 1, by, 3, 1); }
  // foreground fog + vignette
  g.drawImage(fogB.c, Math.round(-(t * 6) % W) + o3, H - 22); g.drawImage(fogB.c, Math.round(-(t * 6) % W) + W + o3, H - 22);
  g.drawImage(vig.c, 0, 0);
  // intro fade
  if (intro < 1.6) { const a = Math.max(0, 1 - intro / 1.4); g.fillStyle = 'rgba(2,3,10,' + (Math.floor(a * 6) / 6) + ')'; g.fillRect(0, 0, W, H); }
}

/* ---------- loop ---------- */
function frame(ts) {
  if (!Scene.running) return; raf = requestAnimationFrame(frame);
  const dt = Math.min(.1, (ts - last) / 1000 || .033); acc += dt; last = ts;
  if (acc < 1 / 30 - .002) return; const step = Math.min(acc, .1); acc = 0;
  update(step); draw(step);
}
Scene.start = function () {
  if (!cv) { cv = document.getElementById('scene'); if (!cv) return; g = cv.getContext('2d', { alpha: false }); Scene.resize(); cv.addEventListener('click', e => { const r = Scene.click(e.clientX, e.clientY); if (r && PD.audio) PD.audio.play(r === 'zombie' ? 'zhit' : 'deny'); }); }
  cv.style.display = ''; if (Scene.running) return;
  if (reduced()) { Scene.running = false; intro = 2; if (Scene.ready) draw(0); return; }
  Scene.running = true; last = performance.now(); acc = 0; raf = requestAnimationFrame(frame);
};
Scene.stop = function () { Scene.running = false; cancelAnimationFrame(raf); if (cv) cv.style.display = 'none'; };
Scene.replayIntro = function () { intro = 0; };
})(typeof window !== 'undefined' ? window : globalThis);
