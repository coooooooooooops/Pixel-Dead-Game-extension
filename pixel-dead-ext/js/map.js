/* Pixel Dead v2 - map.js : seeded map generation, collision, rays, flow field, textures */
(function (root) {
'use strict';
const PD = root.PD;
const TL = PD.TILE, T = PD.T, SOLID = PD.SOLID, BLOCKB = PD.BLOCKB;
const NOFLOW = 65535;

/* ---------- map object ---------- */
function newMap(kind, w, h, seed) {
  return {
    kind, arena: !!(PD.MAPS[kind] && PD.MAPS[kind].arena), w, h, seed, W: w * T, H: h * T, ver: 0,
    tiles: new Uint8Array(w * h), marks: new Uint8Array(w * h),
    spawns: [], itemSpots: [], boxes: [], wallbuys: [], gates: [], start: { x: w * T / 2, y: h * T / 2 },
    dropped: 0, pocketFilled: 0, bg: null, mini: null, theme: (PD.MAPS[kind] && PD.MAPS[kind].theme) || 0,
  };
}
const inb = (m, x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h;
PD.tileAt = (m, x, y) => inb(m, x, y) ? m.tiles[y * m.w + x] : TL.ROCK;
PD.solidAt = (m, x, y) => !inb(m, x, y) || SOLID[m.tiles[y * m.w + x]] === 1;
PD.solidPx = (m, px, py) => PD.solidAt(m, Math.floor(px / T), Math.floor(py / T));

/* ---------- generation ---------- */
PD.genMap = function (kind, seed, bushy) {
  seed = seed | 0;
  const dim = PD.MAPDIM[kind]; if (!dim) throw new Error('bad map kind ' + kind);
  const m = newMap(kind, dim[0], dim[1], seed);
  const rng = PD.mulberry32(seed * 7919 + kind.length * 104729 + 12345);
  if (kind === 'arena3') genCrucible(m, rng); else if (kind === 'arena4') genFrost(m, rng); else if (kind === 'arena2') genColosseum(m, rng); else if (m.arena) genArena(m, rng); else if (kind === 'block') genShip(m, rng, !!bushy); else if (kind === 'mid') genCity(m, rng, !!bushy); else if (kind === 'hide') genDesert(m, rng, !!bushy); else genTown(m, rng, bushy || kind === 'hide');
  finish(m, rng);
  return m;
};

function mk(m, rng) {
  const set = (x, y, v) => { if (inb(m, x, y)) m.tiles[y * m.w + x] = v; };
  const get = (x, y) => inb(m, x, y) ? m.tiles[y * m.w + x] : TL.ROCK;
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  return { set, get, ri };
}

function genTown(m, rng, bushy) {
  const { w, h } = m, { set, get, ri } = mk(m, rng);
  const marks = m.marks;
  const nv = Math.max(1, Math.round(w / 45) - 1), nh = Math.max(1, Math.round(h / 40) - 1);
  const xs = [], ys = [];
  for (let i = 0; i < nv; i++) xs.push(Math.round(w * (i + 1) / (nv + 1)));
  for (let i = 0; i < nh; i++) ys.push(Math.round(h * (i + 1) / (nh + 1)));
  const isRoad = (x, y) => get(x, y) === TL.ROAD;
  for (const cx of xs) for (let y = 0; y < h; y++) for (let x = cx - 2; x <= cx + 1; x++) set(x, y, TL.ROAD);
  for (const cy of ys) for (let x = 0; x < w; x++) for (let y = cy - 2; y <= cy + 1; y++) set(x, y, TL.ROAD);
  for (const cx of xs) for (let y = 0; y < h; y++) if ((y & 3) < 2 && !ys.some(cy => y >= cy - 2 && y <= cy + 1)) marks[y * w + cx - 1] = 1;
  for (const cy of ys) for (let x = 0; x < w; x++) if ((x & 3) < 2 && !xs.some(cx => x >= cx - 2 && x <= cx + 1)) marks[(cy - 1) * w + x] = 2;
  const sw = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (get(x, y) === TL.GRASS && (isRoad(x + 1, y) || isRoad(x - 1, y) || isRoad(x, y + 1) || isRoad(x, y - 1))) sw.push(y * w + x);
  sw.forEach(i => m.tiles[i] = TL.SIDEW);

  /* blocks */
  const segs = (cs, n, size) => {
    const out = []; let prev = -1;
    for (let i = 0; i <= cs.length; i++) {
      const lo = i === 0 ? 4 : cs[i - 1] + 1 + 3, hi = i === cs.length ? n - 5 : cs[i] - 2 - 3;
      if (hi - lo >= 8) out.push([lo, hi]); prev = i;
    }
    return out;
  };
  const sx = segs(xs, w), sy = segs(ys, h), blocks = [];
  for (const [y0, y1] of sy) for (const [x0, x1] of sx) blocks.push({ x0, y0, x1, y1 });
  const types = blocks.map(() => {
    const r = rng();
    return r < .55 ? 'bld' : r < .69 ? 'park' : r < .76 ? 'lake' : r < .84 ? 'grave' : r < .92 ? 'lot' : 'forest';
  });
  if (blocks.length >= 6) {
    const a = ri(0, blocks.length - 1); let b = ri(0, blocks.length - 1); if (b === a) b = (a + 1) % blocks.length;
    types[a] = 'grave'; types[b] = 'lake';
  }
  const bld = [];                              // all building rects (with 3 tile gap checks)
  const interiorSpots = [];
  blocks.forEach((b, bi) => {
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    const t = types[bi];
    if (t === 'bld') fillBuildings(b, bw, bh);
    else if (t === 'park') {
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (rng() < .1) set(x, y, TL.TREE);
      bushClusters(b, bushy ? 12 : 5);
      const mx = (b.x0 + b.x1) >> 1, my = (b.y0 + b.y1) >> 1;
      for (let x = b.x0; x <= b.x1; x++) for (let k = 0; k < 2; k++) set(x, my + k, TL.SAND);
      for (let y = b.y0; y <= b.y1; y++) for (let k = 0; k < 2; k++) set(mx + k, y, TL.SAND);
    } else if (t === 'lake') {
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, rx = bw * .34, ry = bh * .34;
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
        if (d <= 1) set(x, y, TL.WATER); else if (d <= 1.3) set(x, y, TL.SAND);
        else if (rng() < .05) set(x, y, TL.TREE);
      }
    } else if (t === 'grave') {
      const gw = Math.min(bw - 4, 26), gh = Math.min(bh - 4, 20);
      const gx = b.x0 + ((bw - gw) >> 1), gy = b.y0 + ((bh - gh) >> 1);
      for (let y = gy; y < gy + gh; y += 3) for (let x = gx; x < gx + gw; x += 3) if (rng() < .8) set(x, y, TL.GRAVE);
      for (let i = 0; i < bw * bh * .03; i++) { const x = ri(b.x0, b.x1), y = ri(b.y0, b.y1); if ((x < gx - 1 || x > gx + gw) || (y < gy - 1 || y > gy + gh)) set(x, y, TL.TREE); }
    } else if (t === 'lot') {
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) set(x, y, TL.ROAD);
      const n = Math.floor(bw * bh / 90);
      for (let i = 0; i < n; i++) {
        const x = ri(b.x0 + 1, b.x1 - 3), y = ri(b.y0 + 1, b.y1 - 2);
        if (clearBox(x - 1, y - 1, x + 2, y + 1, TL.ROAD)) { set(x, y, TL.ROCK); set(x + 1, y, TL.ROCK); }
      }
    } else { // forest
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) { const r = rng(); if (r < .22) set(x, y, TL.TREE); else if (r < (bushy ? .27 : .30) + (bushy ? .1 : 0)) set(x, y, TL.BUSH); }
    }
  });
  function clearBox(x0, y0, x1, y1, id) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (get(x, y) !== id) return false; return true; }
  function bushClusters(b, n) {
    for (let i = 0; i < n; i++) {
      const cx = ri(b.x0 + 2, b.x1 - 2), cy = ri(b.y0 + 2, b.y1 - 2);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5 && rng() < .75 && get(cx + dx, cy + dy) === TL.GRASS) set(cx + dx, cy + dy, TL.BUSH);
    }
  }
  function fillBuildings(b, bw, bh) {
    const n = ri(2, 4), mine = [];
    for (let k = 0, tries = 0; k < n && tries < 60; tries++) {
      const w2 = ri(9, 16), h2 = ri(8, 12);
      if (w2 > bw || h2 > bh) continue;
      const x = ri(b.x0, b.x1 - w2 + 1), y = ri(b.y0, b.y1 - h2 + 1);
      if (bld.some(r => x < r.x + r.w + 3 && x + w2 + 3 > r.x && y < r.y + r.h + 3 && y + h2 + 3 > r.y)) continue;
      const r = { x, y, w: w2, h: h2 }; bld.push(r); mine.push(r); k++;
      building(r);
    }
    if (bushy) bushClusters(b, 4);
    // sparse outdoor trees, at least 3 tiles from any building
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++)
      if (get(x, y) === TL.GRASS && rng() < .03 && !bld.some(r => x >= r.x - 3 && x <= r.x + r.w + 2 && y >= r.y - 3 && y <= r.y + r.h + 2)) set(x, y, TL.TREE);
  }
  function building(r) {
    const { x, y, w: bw, h: bh } = r;
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) set(x + i, y + j, (i === 0 || j === 0 || i === bw - 1 || j === bh - 1) ? TL.WALL : TL.FLOOR);
    const sides = [0, 1, 2, 3]; const s1 = sides.splice(ri(0, 3), 1)[0], s2 = sides[ri(0, 2)];
    const doors = [];
    for (const s of [s1, s2]) {
      if (s === 0 || s === 2) { const dx = x + ri(2, bw - 4), dy = s === 0 ? y : y + bh - 1; set(dx, dy, TL.DOOR); set(dx + 1, dy, TL.DOOR); doors.push([dx, dy, 0, s === 0 ? 1 : -1], [dx + 1, dy, 0, s === 0 ? 1 : -1]); }
      else { const dy = y + ri(2, bh - 4), dx = s === 1 ? x + bw - 1 : x; set(dx, dy, TL.DOOR); set(dx, dy + 1, TL.DOOR); doors.push([dx, dy, s === 1 ? -1 : 1, 0], [dx, dy + 1, s === 1 ? -1 : 1, 0]); }
    }
    if (bw >= 13) {
      const px = x + (bw >> 1), gap = ri(y + 2, y + bh - 4);
      for (let j = y + 1; j < y + bh - 1; j++) if (j !== gap && j !== gap + 1) set(px, j, TL.WALL);
    }
    for (const [dx, dy, ix, iy] of doors) if (get(dx + ix, dy + iy) === TL.WALL) set(dx + ix, dy + iy, TL.FLOOR);
    const open8 = (tx, ty) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (get(tx + i, ty + j) !== TL.FLOOR) return false; return true; };
    for (let k = 0, t = 0, na = ri(1, 2); k < na && t < 30; t++) { const tx = ri(x + 2, x + bw - 3), ty = ri(y + 2, y + bh - 3); if (open8(tx, ty)) { set(tx, ty, TL.AMMO); k++; } }
    const nc = ri(1, 3);
    for (let k = 0, t = 0; k < nc && t < 20; t++) { const tx = ri(x + 2, x + bw - 3), ty = ri(y + 2, y + bh - 3); if (open8(tx, ty)) { set(tx, ty, TL.CRATE); k++; } }
    if (rng() < 1 / 3) for (let t = 0; t < 20; t++) { const tx = ri(x + 2, x + bw - 3), ty = ri(y + 2, y + bh - 3); if (open8(tx, ty)) { m.boxes.push({ id: m.boxes.length, x: tx * T + 8, y: ty * T + 8 }); break; } }
    const cand = [];
    for (let i = 1; i < bw - 1; i++) if (get(x + i, y) === TL.WALL && get(x + i, y + 1) === TL.FLOOR && get(x + i - 1, y + 1) === TL.FLOOR && get(x + i + 1, y + 1) === TL.FLOOR) cand.push(i);
    if (cand.length) {
      const i = cand[ri(0, cand.length - 1)];
      m.wallbuys.push({ id: pickWB(rng), x: (x + i) * T + 8, y: (y + 1) * T + 9, tx: x + i, ty: y });
    }
    for (let k = 0, t = 0; k < 2 && t < 20; t++) { const tx = ri(x + 1, x + bw - 2), ty = ri(y + 1, y + bh - 2); if (get(tx, ty) === TL.FLOOR) { m.itemSpots.push({ x: tx * T + 8, y: ty * T + 8 }); k++; } }
  }

  /* border: 3 tile tree band + rock ring */
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const e = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (e === 0) set(x, y, TL.ROCK); else if (e <= 3) set(x, y, TL.TREE);
  }
  /* spawns along road centre lines */
  for (const cx of xs) for (let ty = 6; ty < h - 6; ty += 6) if (get(cx, ty) === TL.ROAD) m.spawns.push({ x: cx * T, y: ty * T + 8 });
  for (const cy of ys) for (let tx = 6; tx < w - 6; tx += 6) if (get(tx, cy) === TL.ROAD) m.spawns.push({ x: tx * T + 8, y: cy * T });
  m.start = { x: xs[xs.length >> 1] * T, y: ys[ys.length >> 1] * T };
  // outdoor loot gets added in finish() once reachability is known
}

/* ===================== shared helpers for the city and the desert town ===================== */
function roadGrid(m, xs, ys) {
  const { w, h } = m, { set, get } = mk(m, null), marks = m.marks;
  const isRoad = (x, y) => get(x, y) === TL.ROAD;
  for (const cx of xs) for (let y = 0; y < h; y++) for (let x = cx - 2; x <= cx + 1; x++) set(x, y, TL.ROAD);
  for (const cy of ys) for (let x = 0; x < w; x++) for (let y = cy - 2; y <= cy + 1; y++) set(x, y, TL.ROAD);
  for (const cx of xs) for (let y = 0; y < h; y++) if ((y & 3) < 2 && !ys.some(cy => y >= cy - 2 && y <= cy + 1)) marks[y * w + cx - 1] = 1;
  for (const cy of ys) for (let x = 0; x < w; x++) if ((x & 3) < 2 && !xs.some(cx => x >= cx - 2 && x <= cx + 1)) marks[(cy - 1) * w + x] = 2;
  const sw = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (get(x, y) === TL.GRASS && (isRoad(x + 1, y) || isRoad(x - 1, y) || isRoad(x, y + 1) || isRoad(x, y - 1))) sw.push(y * w + x);
  sw.forEach(i => m.tiles[i] = TL.SIDEW);
}
function segsOf(cs, n) {
  const out = [];
  for (let i = 0; i <= cs.length; i++) {
    const lo = i === 0 ? 4 : cs[i - 1] + 1 + 3, hi = i === cs.length ? n - 5 : cs[i] - 2 - 3;
    if (hi - lo >= 8) out.push([lo, hi]);
  }
  return out;
}
function townSpawns(m, xs, ys) {
  const { w, h } = m, get = (x, y) => inb(m, x, y) ? m.tiles[y * m.w + x] : TL.ROCK;
  for (const cx of xs) for (let ty = 6; ty < h - 6; ty += 6) if (get(cx, ty) === TL.ROAD) m.spawns.push({ x: cx * T, y: ty * T + 8 });
  for (const cy of ys) for (let tx = 6; tx < w - 6; tx += 6) if (get(tx, cy) === TL.ROAD) m.spawns.push({ x: tx * T + 8, y: cy * T });
}
/* a walled building: doors, partition walls with 2-tile gaps, wooden crates, AMMO crates, loot spots, wall weapons, mystery box.
   o: doors, face (side of the first door: 0 top 1 right 2 bottom 3 left), rooms, crates, ammo, wb (wall weapons), box (chance) */
function structure(m, rng, r, o) {
  o = o || {};
  const { x, y, w: bw, h: bh } = r, { set, get, ri } = mk(m, rng);
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) set(x + i, y + j, (i === 0 || j === 0 || i === bw - 1 || j === bh - 1) ? TL.WALL : TL.FLOOR);
  const split = (x0, y0, x1, y1, depth, avX, avY) => {
    const iw = x1 - x0 + 1, ih = y1 - y0 + 1;
    if (depth > 2 || (iw < 11 && ih < 11)) return;
    if (iw >= ih && iw >= 11) {
      let px = -1; for (let t = 0; t < 8; t++) { const c = ri(x0 + 4, x1 - 4); if (!avX || c < avX[0] || c > avX[1]) { px = c; break; } }
      if (px < 0) return; const gap = ri(y0 + 1, y1 - 2);
      for (let j = y0; j <= y1; j++) if (j !== gap && j !== gap + 1) set(px, j, TL.WALL);
      split(x0, y0, px - 1, y1, depth + 1, null, [gap - 1, gap + 2]); split(px + 1, y0, x1, y1, depth + 1, null, [gap - 1, gap + 2]);
    } else if (ih >= 11) {
      let py = -1; for (let t = 0; t < 8; t++) { const c = ri(y0 + 4, y1 - 4); if (!avY || c < avY[0] || c > avY[1]) { py = c; break; } }
      if (py < 0) return; const gap = ri(x0 + 1, x1 - 2);
      for (let i = x0; i <= x1; i++) if (i !== gap && i !== gap + 1) set(i, py, TL.WALL);
      split(x0, y0, x1, py - 1, depth + 1, [gap - 1, gap + 2], null); split(x0, py + 1, x1, y1, depth + 1, [gap - 1, gap + 2], null);
    }
  };
  if (o.rooms) split(x + 1, y + 1, x + bw - 2, y + bh - 2, 0, null, null);
  else if (bw >= 13) { const px = x + (bw >> 1), gap = ri(y + 2, y + bh - 4); for (let j = y + 1; j < y + bh - 1; j++) if (j !== gap && j !== gap + 1) set(px, j, TL.WALL); }
  const sides = [0, 1, 2, 3], used = [];
  const first = o.face != null ? o.face : sides.splice(ri(0, 3), 1)[0]; if (o.face != null) sides.splice(sides.indexOf(first), 1);
  used.push(first);
  while (used.length < (o.doors || 2) && sides.length) used.push(sides.splice(ri(0, sides.length - 1), 1)[0]);
  const doors = [];
  for (const s of used) {
    if (s === 0 || s === 2) { const dx = x + ri(2, bw - 4), dy = s === 0 ? y : y + bh - 1; set(dx, dy, TL.DOOR); set(dx + 1, dy, TL.DOOR); doors.push([dx, dy, 0, s === 0 ? 1 : -1], [dx + 1, dy, 0, s === 0 ? 1 : -1]); }
    else { const dy = y + ri(2, bh - 4), dx = s === 1 ? x + bw - 1 : x; set(dx, dy, TL.DOOR); set(dx, dy + 1, TL.DOOR); doors.push([dx, dy, s === 1 ? -1 : 1, 0], [dx, dy + 1, s === 1 ? -1 : 1, 0]); }
  }
  for (const [dx, dy, ix, iy] of doors) if (get(dx + ix, dy + iy) === TL.WALL) set(dx + ix, dy + iy, TL.FLOOR);
  const open8 = (tx, ty) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (get(tx + i, ty + j) !== TL.FLOOR) return false; return true; };
  const put = (id, n) => { for (let k = 0, t = 0; k < n && t < 40; t++) { const tx = ri(x + 2, x + bw - 3), ty = ri(y + 2, y + bh - 3); if (open8(tx, ty)) { set(tx, ty, id); k++; } } };
  put(TL.AMMO, o.ammo != null ? o.ammo : ri(1, 2));
  put(TL.CRATE, o.crates != null ? o.crates : ri(1, 3));
  if (rng() < (o.box != null ? o.box : 1 / 3)) for (let t = 0; t < 20; t++) { const tx = ri(x + 2, x + bw - 3), ty = ri(y + 2, y + bh - 3); if (open8(tx, ty)) { m.boxes.push({ id: m.boxes.length, x: tx * T + 8, y: ty * T + 8 }); break; } }
  const cand = [];
  for (let i = 1; i < bw - 1; i++) if (get(x + i, y) === TL.WALL && get(x + i, y + 1) === TL.FLOOR && get(x + i - 1, y + 1) === TL.FLOOR && get(x + i + 1, y + 1) === TL.FLOOR) cand.push(i);
  for (let k = 0; k < (o.wb != null ? o.wb : 1) && cand.length; k++) {
    const i = cand.splice(ri(0, cand.length - 1), 1)[0];
    m.wallbuys.push({ id: pickWB(rng), x: (x + i) * T + 8, y: (y + 1) * T + 9, tx: x + i, ty: y });
  }
  for (let k = 0, t = 0; k < (o.items != null ? o.items : 2) && t < 30; t++) { const tx = ri(x + 1, x + bw - 2), ty = ri(y + 1, y + bh - 2); if (get(tx, ty) === TL.FLOOR) { m.itemSpots.push({ x: tx * T + 8, y: ty * T + 8 }); k++; } }
}
function bushBlob(m, rng, cx, cy, rad, pr, ground) {
  const { set, get } = mk(m, rng);
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (dx * dx + dy * dy <= rad * rad + 1 && rng() < pr && ground.indexOf(get(cx + dx, cy + dy)) >= 0) set(cx + dx, cy + dy, TL.BUSH);
}

/* ===================== DOWNTOWN (map 'mid', 120x90): a dense city ===================== */
function genCity(m, rng, bushy) {
  const { w, h } = m, { set, get, ri } = mk(m, rng);
  const nv = Math.max(1, Math.round(w / 30) - 1), nh = Math.max(1, Math.round(h / 30) - 1), xs = [], ys = [];
  for (let i = 0; i < nv; i++) xs.push(Math.round(w * (i + 1) / (nv + 1)));
  for (let i = 0; i < nh; i++) ys.push(Math.round(h * (i + 1) / (nh + 1)));
  roadGrid(m, xs, ys);
  const sx = segsOf(xs, w), sy = segsOf(ys, h), blocks = [];
  for (const [y0, y1] of sy) for (const [x0, x1] of sx) blocks.push({ x0, y0, x1, y1 });
  const pave = b => { for (let y = b.y0 - 1; y <= b.y1 + 1; y++) for (let x = b.x0 - 1; x <= b.x1 + 1; x++) set(x, y, TL.SIDEW); };
  const plazaI = blocks.findIndex(b => (b.x0 + b.x1) / 2 > w * .3 && (b.x0 + b.x1) / 2 < w * .5 && (b.y0 + b.y1) / 2 > h * .35 && (b.y0 + b.y1) / 2 < h * .6);
  const types = blocks.map((b, bi) => {
    if (bi === plazaI) return 'plaza';
    const r = rng(); return r < .24 ? 'tower' : r < .54 ? 'quad' : r < .8 ? 'row' : r < .86 ? 'lot' : 'park';
  });
  if (blocks.length >= 6) { let a = ri(0, blocks.length - 1); if (a === plazaI) a = (a + 1) % blocks.length; types[a] = 'park'; let b = ri(0, blocks.length - 1); while (b === a || b === plazaI) b = (b + 1) % blocks.length; if (types.indexOf('lot') < 0) types[b] = 'lot'; }
  const freeSpot = (b, id, n, ground) => {
    for (let k = 0, t = 0; k < n && t < 60; t++) {
      const x = ri(b.x0 + 2, b.x1 - 2), y = ri(b.y0 + 2, b.y1 - 2); let ok = true;
      for (let j = -1; j <= 1 && ok; j++) for (let i = -1; i <= 1; i++) if (get(x + i, y + j) !== ground) { ok = false; break; }
      if (ok) { set(x, y, id); k++; }
    }
  };
  blocks.forEach((b, bi) => {
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1, t = types[bi];
    if (t !== 'park') pave(b);
    if (t === 'tower') {
      structure(m, rng, { x: b.x0 + 1, y: b.y0 + 1, w: bw - 2, h: bh - 2 }, { rooms: true, doors: 3, crates: ri(3, 5), ammo: ri(2, 3), wb: 2, box: .6, items: 4 });
    } else if (t === 'quad') {
      const aw = (bw - 2) >> 1, ah = (bh - 2) >> 1;
      [[0, 0, 2], [aw + 2, 0, 2], [0, ah + 2, 0], [aw + 2, ah + 2, 0]].forEach(([ox, oy, face]) => {
        const rw = aw - ri(0, 1), rh = ah - ri(0, 1);
        structure(m, rng, { x: b.x0 + ox + (ox ? aw - rw : 0), y: b.y0 + oy + (oy ? ah - rh : 0), w: rw, h: rh }, { doors: 2, face, crates: ri(1, 3), ammo: ri(1, 2), box: .25 });
      });
    } else if (t === 'row') {
      const bh2 = Math.min(9, (bh - 4) >> 1);
      structure(m, rng, { x: b.x0, y: b.y0, w: bw, h: bh2 }, { rooms: true, doors: 3, face: 2, crates: ri(2, 4), ammo: ri(1, 2), box: .4 });
      structure(m, rng, { x: b.x0, y: b.y1 - bh2 + 1, w: bw, h: bh2 }, { rooms: true, doors: 3, face: 0, crates: ri(2, 4), ammo: ri(1, 2), box: .4 });
      freeSpot({ x0: b.x0, x1: b.x1, y0: b.y0 + bh2 - 1, y1: b.y1 - bh2 + 2 }, TL.AMMO, 1, TL.SIDEW);
      freeSpot({ x0: b.x0, x1: b.x1, y0: b.y0 + bh2 - 1, y1: b.y1 - bh2 + 2 }, TL.CRATE, 2, TL.SIDEW);
    } else if (t === 'lot') {
      for (let y = b.y0 - 1; y <= b.y1 + 1; y++) for (let x = b.x0 - 1; x <= b.x1 + 1; x++) set(x, y, TL.ROAD);
      structure(m, rng, { x: b.x0 + 1, y: b.y0 + 1, w: 8, h: 6 }, { doors: 2, face: 2, crates: 2, ammo: 1, box: 0, items: 1 });
      const n = Math.floor(bw * bh / 70);
      for (let i = 0; i < n; i++) {
        const x = ri(b.x0 + 1, b.x1 - 3), y = ri(b.y0 + 8, b.y1 - 1); let ok = true;
        for (let j = -1; j <= 1 && ok; j++) for (let k = -1; k <= 2; k++) if (get(x + k, y + j) !== TL.ROAD) { ok = false; break; }
        if (ok) { set(x, y, TL.ROCK); set(x + 1, y, TL.ROCK); }               // abandoned cars
      }
      freeSpot(b, TL.AMMO, 2, TL.ROAD); freeSpot(b, TL.CRATE, 3, TL.ROAD);
    } else if (t === 'park') {
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (rng() < .09) set(x, y, TL.TREE);
      bushClusters(b, bushy ? 14 : 5);
      const mx = (b.x0 + b.x1) >> 1, my = (b.y0 + b.y1) >> 1;
      for (let x = b.x0; x <= b.x1; x++) for (let k = 0; k < 2; k++) set(x, my + k, TL.SAND);
      for (let y = b.y0; y <= b.y1; y++) for (let k = 0; k < 2; k++) set(mx + k, y, TL.SAND);
      freeSpot(b, TL.AMMO, 1, TL.GRASS); freeSpot(b, TL.CRATE, 2, TL.GRASS);
    } else if (t === 'plaza') {
      const cx = (b.x0 + b.x1) >> 1, cy = (b.y0 + b.y1) >> 1;
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= 3.2) set(x, y, TL.WATER); else if (d <= 4.4) set(x, y, TL.SAND);
      }
      for (const [dx, dy] of [[-8, -8], [8, -8], [-8, 8], [8, 8], [0, -9], [0, 9], [-9, 0], [9, 0]]) set(cx + dx, cy + dy, TL.TREE);
      for (const [dx, dy] of [[-7, -3], [7, 3], [-3, 7], [3, -7]]) bushBlob(m, rng, cx + dx, cy + dy, bushy ? 3 : 1, bushy ? .9 : .8, [TL.SIDEW]);
      for (const [dx, dy] of [[-8, -6], [8, 6], [-6, 8], [6, -8]]) { set(cx + dx, cy + dy, TL.AMMO); }
      for (const [dx, dy] of [[-8, 5], [8, -5], [5, 8], [-5, -8]]) { set(cx + dx, cy + dy, TL.CRATE); }
      m.boxes.push({ id: m.boxes.length, x: (cx + 6) * T + 8, y: (cy + 6) * T + 8 });
    }
    if (t !== 'park' && t !== 'plaza') {
      // street trees on the pavement and, for hide and seek, hedge planters
      for (let x = b.x0 + 2; x <= b.x1 - 2; x += 6) { if (get(x, b.y0 - 1) === TL.SIDEW) set(x, b.y0 - 1, TL.TREE); if (get(x + 3, b.y1 + 1) === TL.SIDEW) set(x + 3, b.y1 + 1, TL.TREE); }
      if (bushy) for (let x = b.x0 + 4; x <= b.x1 - 4; x += 7) { for (const yy of [b.y0 - 1, b.y1 + 1]) { if (get(x, yy) === TL.SIDEW) set(x, yy, TL.BUSH); if (get(x + 1, yy) === TL.SIDEW) set(x + 1, yy, TL.BUSH); } }
    }
  });
  function bushClusters(b, n) {
    for (let i = 0; i < n; i++) bushBlob(m, rng, ri(b.x0 + 2, b.x1 - 2), ri(b.y0 + 2, b.y1 - 2), 2, .75, [TL.GRASS]);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const e = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (e === 0) set(x, y, TL.ROCK); else if (e <= 3) set(x, y, TL.TREE);
  }
  townSpawns(m, xs, ys);
  m.start = { x: xs[xs.length >> 1] * T, y: ys[ys.length >> 1] * T };
}

/* ===================== DUSTWATER (map 'hide', 150x110): a desert town ===================== */
function genDesert(m, rng, bushy) {
  const { w, h } = m, { set, get, ri } = mk(m, rng);
  const cy = Math.round(h / 2), cx = Math.round(w / 2), xs = [cx], ys = [cy];
  roadGrid(m, xs, ys);
  const lanes = [[Math.round(w * .2), cy + 3, h - 5], [Math.round(w * .8), 4, cy - 3]];      // two dirt lanes off the main street
  for (const [lx, y0, y1] of lanes) for (let y = y0; y <= y1; y++) for (let x = lx - 1; x <= lx + 1; x++) set(x, y, TL.ROAD);
  const laneX = lanes.map(l => l[0]);
  const rects = [], rngPick = a => a[Math.floor(rng() * a.length)];
  const hitsRoad = (x, y, bw, bh) => {
    if (x < cx + 2 + 1 && x + bw > cx - 2 - 1) return true;
    for (const lx of laneX) if (x < lx + 3 && x + bw > lx - 3) return true;
    return false;
  };
  const clear = (x, y, bw, bh, pad) => !rects.some(r => x < r.x + r.w + pad && x + bw + pad > r.x && y < r.y + r.h + pad && y + bh + pad > r.y);
  const add = (x, y, bw, bh, o) => { rects.push({ x, y, w: bw, h: bh }); structure(m, rng, { x, y, w: bw, h: bh }, o); };
  /* boot hill: reserved before the houses so nothing is built on it */
  { const gx = rngPick([ri(36, Math.max(37, cx - 34)), ri(cx + 10, Math.max(cx + 11, Math.round(w * .8) - 26))]), gy = rngPick([ri(9, Math.max(10, cy - 32)), ri(cy + 20, Math.max(cy + 21, h - 22))]);
    rects.push({ x: gx - 2, y: gy - 2, w: 25, h: 18 });
    for (let y = gy; y < gy + 13; y += 3) for (let x = gx; x < gx + 20; x += 3) if (rng() < .85) set(x, y, TL.GRAVE); }
  let bigDone = 0;
  /* main street: buildings face the boardwalk on both sides */
  for (const north of [true, false]) {
    let x = 7;
    while (x < w - 20) {
      const bw = ri(9, 15), bh = ri(8, 12);
      if (hitsRoad(x, 0, bw, bh)) { x += 4; continue; }
      const by = north ? cy - 3 - bh : cy + 3;
      const big = bw >= 14 && !bigDone++ ;
      add(x, by, bw, bh, { doors: 2, face: north ? 2 : 0, rooms: bw >= 14, crates: ri(1, 3), ammo: ri(1, 2), box: big ? 1 : .3, items: 2 });
      x += bw + ri(1, 3);
    }
  }
  /* lane houses and lone homesteads */
  for (let t = 0, n = 0; t < 400 && n < 14; t++) {
    const bw = ri(8, 11), bh = ri(7, 9), x = ri(6, w - bw - 6), y = ri(6, h - bh - 6);
    if (Math.abs(y + bh / 2 - cy) < 13) continue;
    if (hitsRoad(x, y, bw, bh)) continue;
    if (!clear(x, y, bw, bh, 4)) continue;
    add(x, y, bw, bh, { doors: 2, crates: ri(1, 3), ammo: ri(1, 2), box: .2, items: 2 }); n++;
  }
  const near = (x, y, pad) => rects.some(r => x >= r.x - pad && x < r.x + r.w + pad && y >= r.y - pad && y < r.y + r.h + pad);
  const cleanG = (x, y, pad) => get(x, y) === TL.GRASS && !near(x, y, pad) && Math.abs(y - cy) > 4 && Math.abs(x - cx) > 4 && !laneX.some(lx => Math.abs(x - lx) < 4);
  /* dry riverbed */
  { const rx = Math.round(w * .62); for (let y = 4; y < h - 4; y++) { const off = Math.round(Math.sin(y / 9) * 5); for (let x = rx + off - 2; x <= rx + off + 2; x++) if (cleanG(x, y, 1)) set(x, y, TL.SAND); } }
  /* oasis */
  { const ox = Math.round(w * .84), oy = Math.round(h * .76);
    for (let y = oy - 8; y <= oy + 8; y++) for (let x = ox - 11; x <= ox + 11; x++) {
      if (!cleanG(x, y, 2) && get(x, y) !== TL.SAND) continue;
      const d = Math.hypot((x - ox) / 6, (y - oy) / 4);
      if (d <= 1) set(x, y, TL.WATER); else if (d <= 1.35) set(x, y, TL.SAND); else if (d <= 1.9 && rng() < .22) set(x, y, TL.TREE);
      else if (d <= 2.4 && rng() < .35) set(x, y, TL.BUSH);
    } }
  /* boot hill */
  /* mesas and boulders */
  for (let k = 0, t = 0; k < 11 && t < 200; t++) {
    const x = ri(8, w - 9), y = ri(8, h - 9), rad = ri(2, 5);
    if (!cleanG(x, y, rad + 3) || Math.hypot(x - cx, y - cy) < 14) continue;
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad - 1; dx <= rad + 1; dx++) if ((dx * dx) / ((rad + 1) * (rad + 1)) + (dy * dy) / (rad * rad) <= 1 && cleanG(x + dx, y + dy, 1)) set(x + dx, y + dy, TL.ROCK);
    k++;
  }
  /* cactus and sagebrush: dense cover for hide and seek */
  for (let i = 0, n = Math.floor(w * h / 22); i < n; i++) { const x = ri(5, w - 6), y = ri(5, h - 6); if (cleanG(x, y, 2) && rng() < .7) set(x, y, TL.TREE); }
  for (let i = 0, n = bushy ? 90 : 34; i < n; i++) { const x = ri(5, w - 6), y = ri(5, h - 6); if (get(x, y) === TL.GRASS || get(x, y) === TL.SAND) bushBlob(m, rng, x, y, 2, bushy ? .8 : .7, [TL.GRASS, TL.SAND]); }
  if (bushy) for (let i = 0; i < 40; i++) { const x = ri(5, w - 6), y = ri(5, h - 6); if (get(x, y) === TL.GRASS) set(x, y, TL.BUSH); }
  /* canyon wall around the edge */
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const e = Math.min(x, y, w - 1 - x, h - 1 - y); if (e <= 3) set(x, y, TL.ROCK); }
  townSpawns(m, xs, ys);
  for (const lx of laneX) for (let ty = 8; ty < h - 8; ty += 8) if (get(lx, ty) === TL.ROAD) m.spawns.push({ x: lx * T + 8, y: ty * T + 8 });
  m.start = { x: cx * T, y: cy * T };
}


/* ===================== FREIGHTER (map 'block', 90x70): a cargo ship at sea ===================== */
/* fills a hull: deck = SIDEW, outline = WALL, rest untouched. returns a hit test */
function boatHull(m, x0, cy, len, hh, bow) {
  const { w, h } = m, inside = [];
  const half = x => {
    const st = hh * .34;
    if (x < x0 || x > x0 + len) return -1;
    if (x < x0 + st) { const k = (x0 + st - x) / st; return hh * Math.sqrt(Math.max(0, 1 - k * k)); }
    if (x > x0 + len - bow) { const k = (x - (x0 + len - bow)) / bow; return Math.max(1.2, hh * (1 - Math.pow(k, 1.6))); }
    return hh;
  };
  for (let x = x0; x <= x0 + len; x++) { const hw = half(x); for (let y = Math.ceil(cy - hw); y <= Math.floor(cy + hw); y++) if (x >= 0 && y >= 0 && x < w && y < h) inside.push([x, y]); }
  const set = new Set(inside.map(([x, y]) => y * w + x));
  for (const [x, y] of inside) { const edge = !set.has(y * w + x - 1) || !set.has(y * w + x + 1) || !set.has((y - 1) * w + x) || !set.has((y + 1) * w + x); m.tiles[y * w + x] = edge ? TL.WALL : TL.SIDEW; }
  return set;
}
function genShip(m, rng, bushy) {
  const { w, h } = m, { set, get, ri } = mk(m, rng), cy = 35;
  for (let i = 0; i < w * h; i++) m.tiles[i] = TL.WATER;
  boatHull(m, 6, cy, 78, 12, 22);                                      // the freighter
  boatHull(m, 14, 59, 28, 4, 8);                                       // a trawler moored to the south
  /* wharf and pier to the north */
  for (let y = 3; y <= 12; y++) for (let x = 24; x <= 76; x++) set(x, y, TL.ROAD);
  for (let y = 13; y <= 23; y++) for (let x = 45; x <= 48; x++) set(x, y, TL.ROAD);
  for (let x = 45; x <= 48; x++) set(x, 23, TL.ROAD);                  // gangway through the hull wall
  /* plank bridge from the freighter to the trawler */
  for (let y = 47; y <= 55; y++) for (let x = 27; x <= 28; x++) set(x, y, TL.ROAD);
  /* structures */
  structure(m, rng, { x: 12, y: 26, w: 17, h: 18 }, { rooms: true, doors: 2, face: 1, crates: 3, ammo: 3, wb: 2, box: 1, items: 4 });   // accommodation block
  structure(m, rng, { x: 39, y: 31, w: 10, h: 8 }, { doors: 2, face: 0, crates: 1, ammo: 1, wb: 1, box: .5, items: 2 });               // cargo office
  structure(m, rng, { x: 66, y: 31, w: 8, h: 8 }, { doors: 2, face: 3, crates: 1, ammo: 1, wb: 1, box: 0, items: 2 });                 // forecastle
  structure(m, rng, { x: 26, y: 3, w: 15, h: 8 }, { rooms: false, doors: 2, face: 2, crates: 2, ammo: 2, wb: 1, box: .5, items: 3 });  // warehouse
  structure(m, rng, { x: 58, y: 4, w: 14, h: 8 }, { doors: 2, face: 2, crates: 2, ammo: 1, wb: 1, box: .4, items: 2 });               // customs shed
  structure(m, rng, { x: 22, y: 57, w: 9, h: 5 }, { doors: 1, face: 0, crates: 0, ammo: 1, wb: 0, box: 0, items: 1 });                 // wheelhouse
  /* the doorways must open onto the deck, not a wall */
  /* shipping containers in the hold */
  const colors = [];
  for (const ry of [24, 28, 41, 45]) for (let bx = 31; bx <= 63; bx += 8) {
    if (rng() < .28) continue;
    const cw = ri(4, 6), ch = 2;
    let ok = true; for (let j = 0; j < ch && ok; j++) for (let i = 0; i < cw; i++) if (get(bx + i, ry + j) !== TL.SIDEW) { ok = false; break; }
    if (ok && (ry < 31 ? ry + ch < 31 : true)) for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) set(bx + i, ry + j, TL.ROCK);
  }
  /* wharf containers and bollards, tarp piles */
  for (const [bx, by] of [[27, 12], [51, 12], [74, 12]]) for (let i = 0; i < 3; i++) if (get(bx + i, by) === TL.ROAD) set(bx + i, by, TL.ROCK);
  for (let k = 0, n = bushy ? 60 : 8, t = 0; k < n && t < 600; t++) { const x = ri(8, 82), y = ri(24, 46); if (get(x, y) === TL.SIDEW) { bushBlob(m, rng, x, y, 1, .8, [TL.SIDEW]); k++; } }
  /* breakwater boulders around the edge */
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.min(x, y, w - 1 - x, h - 1 - y) <= 1) set(x, y, TL.ROCK);
  /* spawns on open deck, a gangway door and a wharf point */
  const cand = [[22, 35], [34, 35], [54, 35], [60, 34], [62, 36], [34, 27], [54, 43], [36, 33], [46, 14], [46, 8], [32, 8], [66, 8], [30, 51], [34, 59], [22, 35], [76, 35], [28, 50]];
  for (const [x, y] of cand) { const t = get(x, y); if (t === TL.SIDEW || t === TL.ROAD) m.spawns.push({ x: x * T + 8, y: y * T + 8 }); }
  m.start = { x: 33 * T + 8, y: 35 * T + 8 };
}

/* ===================== THE CRUCIBLE (arena3, 72x72): round arena, lava moat, four bridges ===================== */
function wbAt(m, rng, tx, ty, down) { m.wallbuys.push({ id: pickWB(rng), x: tx * T + 8, y: down ? ty * T - 9 : (ty + 1) * T + 9, tx, ty, down: down ? 1 : 0 }); }
function arenaLoot(m, rng, cx, cy, avoid, nAmmo) {
  const { w, h } = m, { set, get, ri } = mk(m, rng);
  const free = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (get(x, y) !== TL.FLOOR) return false; return true; };
  const far = (x, y) => !m.gates.some(g => Math.hypot(x * T - g.x, y * T - g.y) < 6 * T) && !avoid(x, y);
  const ncr = Math.round(w * h / 300);
  for (let k = 0, t = 0; k < ncr && t < ncr * 30; t++) {
    const x = ri(7, w - 9), y = ri(7, h - 9), shape = ri(0, 2), fw = shape === 1 ? 1 : 2, fh = shape === 0 ? 1 : 2;
    if (!far(x, y) || !free(x - 1, y - 1, x + fw, y + fh)) continue;
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) set(x + i, y + j, TL.CRATE);
    if (rng() < .3) set(x, y, TL.AMMO); k++;
  }
  for (let k = 0, t = 0; k < nAmmo && t < 400; t++) { const x = ri(7, w - 8), y = ri(7, h - 8); if (far(x, y) && free(x - 1, y - 1, x + 1, y + 1)) { set(x, y, TL.AMMO); k++; } }
  for (let k = 0, t = 0; k < Math.round(w * h / 300) && t < 400; t++) { const x = ri(7, w - 8), y = ri(7, h - 8); if (get(x, y) === TL.FLOOR) { m.itemSpots.push({ x: x * T + 8, y: y * T + 8 }); k++; } }
}
function genCrucible(m, rng) {
  const { w, h } = m, { set, get, ri } = mk(m, rng), cx = w >> 1, cy = h >> 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x + .5 - cx, y + .5 - cy);
    set(x, y, d <= 31 ? (d > 15.5 && d < 20 ? TL.WATER : TL.FLOOR) : TL.WALL);     // water = lava in this theme
  }
  for (let i = -2; i <= 1; i++) for (let k = 13; k <= 22; k++) { set(cx + i, cy - k, TL.FLOOR); set(cx + i, cy + k - 1, TL.FLOOR); set(cx - k, cy + i, TL.FLOOR); set(cx + k - 1, cy + i, TL.FLOOR); }   // four bridges
  const carve = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, TL.FLOOR); m.gates.push({ x: (x0 + x1 + 1) / 2 * T, y: (y0 + y1 + 1) / 2 * T }); };
  carve(cx - 3, 2, cx + 2, 5); carve(cx - 3, h - 6, cx + 2, h - 3); carve(2, cy - 3, 5, cy + 2); carve(w - 6, cy - 3, w - 3, cy + 2);
  /* island pillars with wall weapons, a ring of cover on the outer deck */
  const pil = (x, y) => { set(x, y, TL.WALL); set(x + 1, y, TL.WALL); set(x, y + 1, TL.WALL); set(x + 1, y + 1, TL.WALL); };
  pil(cx - 8, cy - 7); pil(cx + 7, cy - 7); pil(cx - 8, cy + 6); pil(cx + 7, cy + 6);
  wbAt(m, rng, cx - 8, cy - 6, false); wbAt(m, rng, cx + 7, cy - 6, false); wbAt(m, rng, cx - 7, cy + 6, true);
  for (let a = 0; a < 16; a++) { if (a % 4 === 0) continue; const an = a / 16 * Math.PI * 2 + .2, x = Math.round(cx + Math.cos(an) * 25.5), y = Math.round(cy + Math.sin(an) * 25.5); if (get(x, y) === TL.FLOOR) { set(x, y, TL.WALL); set(x + 1, y, TL.WALL); } }
  m.boxes.push({ id: 0, x: cx * T + 8, y: cy * T + 8 });
  arenaLoot(m, rng, cx, cy, (x, y) => Math.hypot(x - cx, y - cy) < 6, Math.round(w * h / 380));
  m.spawns = m.gates.map(g => ({ x: g.x, y: g.y })); m.start = { x: cx * T + 8, y: (cy + 3) * T + 8 };
}

/* ===================== COLOSSEUM (arena2, 84x60): Roman amphitheatre =====================
   oval outer wall -> paved outer concourse -> arcade ring of pillars and arches -> ambulatory ->
   podium wall with eight vomitoria -> sand pit. Zombies come in through four gate tunnels. */
function genColosseum(m, rng) {
  const { w, h } = m, { set, get, ri } = mk(m, rng), cx = w >> 1, cy = h >> 1, RX = 39, RY = 27;
  const nd = (x, y) => Math.hypot((x + .5 - cx) / RX, (y + .5 - cy) / RY);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = nd(x, y); let t;
    if (d > 1) t = TL.WALL;                                   // outer wall
    else if (d >= .46 && d < .53) t = TL.WALL;                // podium wall around the pit
    else if (d < .46) t = TL.FLOOR;                           // the sand pit
    else t = TL.SIDEW;                                        // paved concourse + ambulatory
    set(x, y, t);
  }
  /* arcade ring: 26 stone piers (2x2) with open arches between them */
  for (let k = 0; k < 26; k++) { const a = k / 26 * Math.PI * 2 + .12, px = Math.round(cx + Math.cos(a) * RX * .77 - 1), py = Math.round(cy + Math.sin(a) * RY * .77 - 1); for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) set(px + i, py + j, TL.WALL); }
  /* eight vomitoria through the podium wall: four on the axes, four on the diagonals */
  const open = (x0, y0, x1, y1, t) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, t); };
  open(cx - 2, cy - 14, cx + 1, cy - 11, TL.SIDEW); open(cx - 2, cy + 11, cx + 1, cy + 14, TL.SIDEW);
  open(cx - 21, cy - 2, cx - 17, cy + 1, TL.SIDEW); open(cx + 17, cy - 2, cx + 21, cy + 1, TL.SIDEW);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const px = Math.round(cx + sx * .495 * RX * .7071), py = Math.round(cy + sy * .495 * RY * .7071); open(px - 2, py - 2, px + 1, py + 1, TL.SIDEW); }
  /* four gate tunnels cut through the outer wall */
  const carve = (x0, y0, x1, y1) => { open(x0, y0, x1, y1, TL.SIDEW); m.gates.push({ x: (x0 + x1 + 1) / 2 * T, y: (y0 + y1 + 1) / 2 * T }); };
  carve(cx - 3, 1, cx + 2, 4); carve(cx - 3, h - 5, cx + 2, h - 2); carve(1, cy - 3, 4, cy + 2); carve(w - 5, cy - 3, w - 2, cy + 2);
  /* cover in the sand pit: four stone blocks */
  const pil = (x, y) => { set(x, y, TL.WALL); set(x + 1, y, TL.WALL); set(x, y + 1, TL.WALL); set(x + 1, y + 1, TL.WALL); };
  pil(cx - 9, cy - 5); pil(cx + 8, cy - 5); pil(cx - 9, cy + 4); pil(cx + 8, cy + 4);
  /* wall weapons on the pit side of the podium wall */
  const wallAt = (x, dir) => { for (let y = cy; y > 0 && y < h - 1; y += dir) if (get(x, y) === TL.WALL) return y; return -1; };
  for (const x of [cx - 8, cx + 8]) { const y = wallAt(x, -1); if (y > 0) wbAt(m, rng, x, y, false); }
  for (const x of [cx - 7, cx + 7]) { const y = wallAt(x, 1); if (y > 0) wbAt(m, rng, x, y, true); }
  m.boxes.push({ id: 0, x: cx * T + 8, y: cy * T + 8 });
  /* loot: crates (some hide ammo), loose ammo crates, pickup spots - on sand or paving */
  const walk = (x, y) => { const t = get(x, y); return t === TL.FLOOR || t === TL.SIDEW; };
  const free = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!walk(x, y)) return false; return true; };
  const farGate = (x, y) => !m.gates.some(g => Math.hypot(x * T - g.x, y * T - g.y) < 6 * T);
  let openN = 0; for (let i = 0; i < w * h; i++) if (m.tiles[i] === TL.FLOOR || m.tiles[i] === TL.SIDEW) openN++;
  const ncr = Math.round(openN / 170), nammo = Math.round(openN / 330), nitem = Math.round(openN / 230);
  for (let k = 0, t = 0; k < ncr && t < ncr * 30; t++) {
    const x = ri(7, w - 9), y = ri(7, h - 9), shape = ri(0, 2), fw = shape === 1 ? 1 : 2, fh = shape === 0 ? 1 : 2;
    if (Math.abs(x - cx) < 4 && Math.abs(y - cy) < 4) continue; if (!farGate(x, y) || !free(x - 1, y - 1, x + fw, y + fh)) continue;
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) set(x + i, y + j, TL.CRATE);
    if (rng() < .3) set(x, y, TL.AMMO); k++;
  }
  for (let k = 0, t = 0; k < nammo && t < 400; t++) { const x = ri(7, w - 8), y = ri(7, h - 8); if (!(Math.abs(x - cx) < 3 && Math.abs(y - cy) < 3) && farGate(x, y) && free(x - 1, y - 1, x + 1, y + 1)) { set(x, y, TL.AMMO); k++; } }
  for (let k = 0, t = 0; k < nitem && t < 400; t++) { const x = ri(7, w - 8), y = ri(7, h - 8); if (walk(x, y)) { m.itemSpots.push({ x: x * T + 8, y: y * T + 8 }); k++; } }
  m.spawns = m.gates.map(g => ({ x: g.x, y: g.y })); m.start = { x: cx * T + 8, y: (cy + 3) * T + 8 };
}

/* ===================== FROSTBITE (arena4, 80x80): cross-shaped ice arena ===================== */
function genFrost(m, rng) {
  const { w, h } = m, { set, get, ri } = mk(m, rng), cx = w >> 1, cy = h >> 1, aw = 11;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inV = x >= cx - aw && x < cx + aw && y >= 5 && y < h - 5, inH = y >= cy - aw && y < cy + aw && x >= 5 && x < w - 5;
    set(x, y, inV || inH ? TL.FLOOR : TL.WALL);
  }
  const carve = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, TL.FLOOR); m.gates.push({ x: (x0 + x1 + 1) / 2 * T, y: (y0 + y1 + 1) / 2 * T }); };
  carve(cx - 3, 2, cx + 2, 4); carve(cx - 3, h - 5, cx + 2, h - 3); carve(2, cy - 3, 4, cy + 2); carve(w - 5, cy - 3, w - 3, cy + 2);
  for (let y = cy - 4; y <= cy + 3; y++) for (let x = cx - 4; x <= cx + 3; x++) if (Math.hypot(x + .5 - cx, y + .5 - cy) <= 4) set(x, y, TL.WATER);   // frozen pond
  const pil = (x, y) => { set(x, y, TL.WALL); set(x + 1, y, TL.WALL); set(x, y + 1, TL.WALL); set(x + 1, y + 1, TL.WALL); };
  for (const [dx, dy] of [[-8, -8], [7, -8], [-8, 7], [7, 7]]) pil(cx + dx, cy + dy);           // chamber pillars
  for (const k of [14, 22]) { const o = k; for (const [x, y, hz] of [[cx, cy - o - 4, 1], [cx, cy + o + 3, 1], [cx - o - 4, cy, 0], [cx + o + 3, cy, 0]]) { if (hz) { for (let i = -6; i <= 5; i++) if (i < -1 || i > 0) { if (get(x + i, y) === TL.FLOOR && Math.abs(i) > 1) set(x + i, y, TL.WALL); } } else { for (let j = -6; j <= 5; j++) if (j < -1 || j > 0) { if (get(x, y + j) === TL.FLOOR) set(x, y + j, TL.WALL); } } } }   // bulkheads with a gap in the middle
  wbAt(m, rng, cx - 8, 4, false); wbAt(m, rng, cx + 7, 4, false); wbAt(m, rng, cx + 7, h - 5, true); wbAt(m, rng, cx - 8, h - 5, true);
  m.boxes.push({ id: 0, x: cx * T + 8, y: (cy - 6) * T + 8 });
  arenaLoot(m, rng, cx, cy, (x, y) => Math.hypot(x - cx, y - cy) < 6 || Math.hypot(x - cx, y - cy - 7) < 5, Math.round(w * h / 380));
  m.spawns = m.gates.map(g => ({ x: g.x, y: g.y })); m.start = { x: cx * T + 8, y: (cy + 7) * T + 8 };
}

/* extra crates scattered in the open (wooden boxes and AMMO crates), never blocking a door or a path */
function scatterCrates(m, rng, seen) {
  const { w, h } = m, n = w * h, SO = SOLID;
  const spots = [].concat(m.spawns, m.boxes, m.wallbuys, m.itemSpots, [m.start]), placed = [];
  const okG = t => t === TL.GRASS || t === TL.SIDEW || t === TL.SAND;
  const tryPlace = id => {
    for (let t = 0; t < 60; t++) {
      const x = 5 + Math.floor(rng() * (w - 10)), y = 5 + Math.floor(rng() * (h - 10)), i = y * w + x;
      if (!seen[i] || !okG(m.tiles[i])) continue;
      let good = true;
      for (let j = -2; j <= 2 && good; j++) for (let k = -2; k <= 2; k++) { const tt = m.tiles[(y + j) * w + x + k]; if (tt === TL.DOOR) { good = false; break; } if (Math.abs(j) <= 1 && Math.abs(k) <= 1 && (SO[tt] || !seen[(y + j) * w + x + k])) { good = false; break; } }
      if (!good) continue;
      const px = x * T + 8, py = y * T + 8;
      if (spots.some(s => Math.hypot(s.x - px, s.y - py) < 64)) continue;
      if (placed.some(q => Math.hypot(q.x - x, q.y - y) < 5)) continue;
      m.tiles[i] = id; placed.push({ x, y }); return true;
    }
    return false;
  };
  for (let k = 0, na = Math.floor(n / 800); k < na; k++) tryPlace(TL.AMMO);
  for (let k = 0, nw = Math.floor(n / 450); k < nw; k++) tryPlace(TL.CRATE);
}

function pickWB(rng) {
  const ids = ['revolver', 'pump', 'smg', 'ak', 'sniper', 'minigun', 'flamer', 'gl', 'tesla', 'plasma', 'rpg', 'rail', 'golden', 'crossbow', 'aa12', 'leech', 'laser', 'cryo'];
  const wts = ids.map(i => 1 / (PD.WDEF[i].cost / 500));
  let s = 0; wts.forEach(v => s += v); let r = rng() * s;
  for (let i = 0; i < ids.length; i++) { r -= wts[i]; if (r <= 0) return ids[i]; }
  return ids[0];
}

function genArena(m, rng) {
  const { w, h } = m, { set, get, ri } = mk(m, rng);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, (x < 5 || y < 5 || x >= w - 5 || y >= h - 5) ? TL.WALL : TL.FLOOR);
  const cx = w >> 1, cy = h >> 1;
  const carve = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, TL.FLOOR); m.gates.push({ x: (x0 + x1 + 1) / 2 * T, y: (y0 + y1 + 1) / 2 * T }); };
  carve(cx - 3, 2, cx + 2, 4); carve(cx - 3, h - 5, cx + 2, h - 3);
  carve(2, cy - 3, 4, cy + 2); carve(w - 5, cy - 3, w - 3, cy + 2);
  for (const [px, py] of [[cx - 7, cy - 6], [cx + 6, cy - 6], [cx - 7, cy + 5], [cx + 6, cy + 5]]) { set(px, py, TL.WALL); set(px + 1, py, TL.WALL); set(px, py + 1, TL.WALL); set(px + 1, py + 1, TL.WALL); }
  const free = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (get(x, y) !== TL.FLOOR) return false; return true; };
  const ncr = Math.round(w * h / 264);
  for (let k = 0, t = 0; k < ncr && t < ncr * 20; t++) {
    const x = ri(7, w - 9), y = ri(7, h - 9), shape = ri(0, 2), fw = shape === 0 ? 2 : shape === 1 ? 1 : 2, fh = shape === 0 ? 1 : shape === 1 ? 2 : 2;
    if (Math.abs(x - cx) < 5 && Math.abs(y - cy) < 5) continue;
    if (m.gates.some(g => Math.hypot(x * T - g.x, y * T - g.y) < 6 * T)) continue;
    if (!free(x - 1, y - 1, x + fw, y + fh)) continue;
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) set(x + i, y + j, TL.CRATE);
    if (rng() < .3) set(x, y, TL.AMMO);
    k++;
  }
  for (let k = 0, t = 0, na = Math.round(w * h / 400); k < na && t < 300; t++) {
    const x = ri(7, w - 8), y = ri(7, h - 8);
    if (Math.abs(x - cx) < 4 && Math.abs(y - cy) < 4) continue; if (m.gates.some(g => Math.hypot(x * T - g.x, y * T - g.y) < 6 * T)) continue;
    if (free(x - 1, y - 1, x + 1, y + 1)) { set(x, y, TL.AMMO); k++; }
  }
  m.boxes.push({ id: 0, x: cx * T + 8, y: cy * T + 8 });
  for (const tx of [cx - 11, cx + 11]) m.wallbuys.push({ id: pickWB(rng), x: tx * T + 8, y: 5 * T + 9, tx, ty: 4 });
  m.wallbuys.push({ id: pickWB(rng), x: (cx + 8) * T + 8, y: (h - 5) * T - 9, tx: cx + 8, ty: h - 5, down: 1 });
  for (let k = 0, t = 0; k < Math.round(w * h / 330) && t < 300; t++) { const x = ri(7, w - 8), y = ri(7, h - 8); if (get(x, y) === TL.FLOOR) { m.itemSpots.push({ x: x * T + 8, y: y * T + 8 }); k++; } }
  m.spawns = m.gates.map(g => ({ x: g.x, y: g.y }));
  m.start = { x: cx * T + 8, y: (cy + 3) * T + 8 };
  // let walkers stand inside the pens: wallbuy flag only for rendering
}

/* flood fill reachability, fill pockets, add outdoor loot, filter points */
function finish(m, rng) {
  const { w, h } = m, n = w * h;
  const seen = new Uint8Array(n), q = new Int32Array(n);
  let sx = Math.floor(m.start.x / T), sy = Math.floor(m.start.y / T);
  if (SOLID[m.tiles[sy * w + sx]]) { const s = m.spawns[0]; sx = Math.floor(s.x / T); sy = Math.floor(s.y / T); }
  let qh = 0, qt = 0; seen[sy * w + sx] = 1; q[qt++] = sy * w + sx;
  while (qh < qt) {
    const i = q[qh++], x = i % w, y = (i / w) | 0;
    for (const j of [i - 1, i + 1, i - w, i + w]) {
      if (j < 0 || j >= n) continue; if ((j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) continue;
      if (seen[j] || SOLID[m.tiles[j]]) continue; seen[j] = 1; q[qt++] = j;
    }
  }
  for (let i = 0; i < n; i++) if (!seen[i] && !SOLID[m.tiles[i]]) { m.tiles[i] = TL.ROCK; m.pocketFilled++; }
  const ok = p => seen[Math.floor(p.y / T) * w + Math.floor(p.x / T)] === 1;
  const keep = (arr) => { const k = arr.filter(ok); m.dropped += arr.length - k.length; return k; };
  m.spawns = keep(m.spawns); m.boxes = keep(m.boxes); m.itemSpots = keep(m.itemSpots);
  m.wallbuys = m.wallbuys.filter(p => { const t = m.tiles[Math.floor(p.y / T) * w + Math.floor(p.x / T)]; const good = !SOLID[t] && seen[Math.floor(p.y / T) * w + Math.floor(p.x / T)]; if (!good) m.dropped++; return good; });
  if (!m.arena) {
    const want = Math.floor(n / 600);
    for (let k = 0, t = 0; k < want && t < want * 20; t++) {
      const i = Math.floor(rng() * n); const tt = m.tiles[i];
      if (seen[i] && m.tiles[i] !== TL.FLOOR && (tt === TL.GRASS || tt === TL.SIDEW || tt === TL.ROAD || tt === TL.SAND)) { m.itemSpots.push({ x: (i % w) * T + 8, y: ((i / w) | 0) * T + 8 }); k++; }
    }
  }
  if (!m.arena) scatterCrates(m, rng, seen);
  m.reach = seen;
}

/* ---------- collision ---------- */
function resolve(m, o, r) {
  const W = m.W, H = m.H;
  for (let it = 0; it < 2; it++) {
    const x0 = Math.floor((o.x - r) / T), x1 = Math.floor((o.x + r) / T), y0 = Math.floor((o.y - r) / T), y1 = Math.floor((o.y + r) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (!PD.solidAt(m, tx, ty)) continue;
      const rx = tx * T, ry = ty * T;
      const cx = o.x < rx ? rx : o.x > rx + T ? rx + T : o.x, cy = o.y < ry ? ry : o.y > ry + T ? ry + T : o.y;
      const dx = o.x - cx, dy = o.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 > 1e-6) { const d = Math.sqrt(d2), k = (r - d) / d; o.x += dx * k; o.y += dy * k; }
      else { // centre inside tile: shortest axis out
        const l = o.x - rx, rr = rx + T - o.x, u = o.y - ry, dn = ry + T - o.y, mn = Math.min(l, rr, u, dn);
        if (mn === l) o.x = rx - r; else if (mn === rr) o.x = rx + T + r; else if (mn === u) o.y = ry - r; else o.y = ry + T + r;
      }
    }
  }
  o.x = PD.clamp(o.x, r, W - r); o.y = PD.clamp(o.y, r, H - r);
}
PD.moveCircle = function (m, o, dx, dy, r) {
  const ox = o.x, oy = o.y;
  o.x += dx; resolve(m, o, r);
  o.y += dy; resolve(m, o, r);
  return Math.hypot(o.x - ox, o.y - oy);
};
PD.resolveCircle = resolve;

/* ---------- ray (DDA) : distance to first bullet-blocking tile ---------- */
PD.rayTiles = function (m, ox, oy, dx, dy, maxd) {
  const l = Math.hypot(dx, dy); if (l === 0) return maxd; dx /= l; dy /= l;
  let tx = Math.floor(ox / T), ty = Math.floor(oy / T);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const ddx = dx === 0 ? Infinity : Math.abs(T / dx), ddy = dy === 0 ? Infinity : Math.abs(T / dy);
  let nx = dx === 0 ? Infinity : ((dx > 0 ? (tx + 1) * T - ox : ox - tx * T) / Math.abs(dx));
  let ny = dy === 0 ? Infinity : ((dy > 0 ? (ty + 1) * T - oy : oy - ty * T) / Math.abs(dy));
  let d = 0;
  if (!inb(m, tx, ty) || BLOCKB[m.tiles[ty * m.w + tx]]) return 0;
  for (let i = 0; i < 400; i++) {
    if (nx < ny) { d = nx; nx += ddx; tx += sx; } else { d = ny; ny += ddy; ty += sy; }
    if (d >= maxd) return maxd;
    if (!inb(m, tx, ty) || BLOCKB[m.tiles[ty * m.w + tx]]) return d;
  }
  return maxd;
};
PD.hasLOS = function (m, ax, ay, bx, by) { const d = Math.hypot(bx - ax, by - ay); return d < 1 || PD.rayTiles(m, ax, ay, bx - ax, by - ay, d) >= d - .01; };

/* ---------- flow field ---------- */
PD.newFlow = m => new Uint16Array(m.w * m.h);
/* with player-built walls on the map zombies may walk "through" them at a cost (they chew the wall when they reach it) */
function flowFillW(m, dist, tx, ty, maxd) {
  const w = m.w, h = m.h, n = w * h, BU = PD.BUILT, BC = PD.BUILD.WALKCOST; dist.fill(NOFLOW);
  tx = PD.clamp(tx, 0, w - 1); ty = PD.clamp(ty, 0, h - 1); maxd = maxd || 400;
  const B = [[], [], [], [], [], [], [], []]; let left = 1; const s = ty * w + tx; dist[s] = 0; B[0].push(s);
  const relax = (j, d) => {
    const t = m.tiles[j], b = BU[t]; if (SOLID[t] && !b) return;
    const nd = d + (b ? BC : 1); if (nd < dist[j] && nd <= maxd) { dist[j] = nd; B[nd & 7].push(j); left++; }
  };
  for (let d = 0; left > 0 && d <= maxd; d++) {
    const bk = B[d & 7];
    while (bk.length) {
      const i = bk.pop(); left--; if (dist[i] !== d) continue; const x = i % w;
      if (x > 0) relax(i - 1, d); if (x < w - 1) relax(i + 1, d); if (i >= w) relax(i - w, d); if (i < n - w) relax(i + w, d);
    }
  }
}
PD.flowFill = function (m, dist, tx, ty, maxd) {
  if (m.nb > 0) return flowFillW(m, dist, tx, ty, maxd);
  const w = m.w, h = m.h, n = w * h; dist.fill(NOFLOW);
  tx = PD.clamp(tx, 0, w - 1); ty = PD.clamp(ty, 0, h - 1);
  if (!PD._q || PD._q.length < n) PD._q = new Int32Array(n);
  const q = PD._q; let qh = 0, qt = 0; const s = ty * w + tx; dist[s] = 0; q[qt++] = s; maxd = maxd || 400;
  while (qh < qt) {
    const i = q[qh++], x = i % w, d = dist[i] + 1; if (d > maxd) break;
    if (x > 0) { const j = i - 1; if (dist[j] === NOFLOW && !SOLID[m.tiles[j]]) { dist[j] = d; q[qt++] = j; } }
    if (x < w - 1) { const j = i + 1; if (dist[j] === NOFLOW && !SOLID[m.tiles[j]]) { dist[j] = d; q[qt++] = j; } }
    if (i >= w) { const j = i - w; if (dist[j] === NOFLOW && !SOLID[m.tiles[j]]) { dist[j] = d; q[qt++] = j; } }
    if (i < n - w) { const j = i + w; if (dist[j] === NOFLOW && !SOLID[m.tiles[j]]) { dist[j] = d; q[qt++] = j; } }
  }
};
// writes a unit vector into out; returns false if no route known
PD.flowDir = function (m, dist, x, y, out) {
  const w = m.w, tx = Math.floor(x / T), ty = Math.floor(y / T);
  if (tx < 0 || ty < 0 || tx >= w || ty >= m.h) { out.x = out.y = 0; return false; }
  const cur = dist[ty * w + tx]; let best = cur, bx = 0, by = 0;
  const ok = (a, b) => { if (a < 0 || b < 0 || a >= w || b >= m.h) return false; const t = m.tiles[b * w + a]; return !SOLID[t] || PD.BUILT[t] === 1; };
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = tx + dx, ny = ty + dy; if (!ok(nx, ny)) continue;
    if (dx && dy && !(ok(tx + dx, ty) && ok(tx, ty + dy))) continue;
    const d = dist[ny * w + nx]; if (d < best) { best = d; bx = nx; by = ny; }
  }
  if (best >= cur || (bx === 0 && by === 0)) { out.x = out.y = 0; return cur === NOFLOW ? false : true; }
  const vx = bx * T + 8 - x, vy = by * T + 8 - y, l = Math.hypot(vx, vy) || 1;
  out.x = vx / l; out.y = vy / l; return true;
};
PD.NOFLOW = NOFLOW;

/* ---------- textures (browser only) ---------- */
const MINI_D = ['#9c8456', '#4a4540', '#5e4c38', '#a8764a', '#2f6a34', '#1f5a6a', '#8a5a3a', '#6a4c2c', '#6b7a4a', '#5a3d22', '#8a6a3a', '#b8a06a', '#7a6540', '#9a7238', '#8a8f96', '#59c25a'];
const MINI_C = ['#1f2a1b', '#232528', '#2c3036', '#262b33', '#0f2a14', '#1b3f66', '#6a6d72', '#5a5d63', '#2c4a20', '#3e6a78', '#8a6a3a', '#8a7a55', '#4a4f4a', '#9a7238', '#8a8f96', '#59c25a'];
const MINI = ['#1f2a1b', '#3a3c40', '#4a4d52', '#8a4a3a', '#0f2a14', '#1b3f66', '#6a6a6a', '#5a5d62', '#2c4a20', '#b98a4a', '#8a6a3a', '#8a7a55', '#4a4f4a', '#9a7238', '#8a8f96', '#59c25a'];
const MINI_B = ['#1b4a7a', '#8a6a3a', '#3a4048', '#a3503a', '#2f6a34', '#1b4a7a', '#c0562f', '#7a8490', '#6b7a4a', '#4a90a8', '#8a6a3a', '#b8a06a', '#7a6540', '#9a7238', '#8a8f96', '#59c25a'];
const MINI_L = ['#1f2a1b', '#3a3c40', '#5a4a50', '#0e0a10', '#0f2a14', '#d0501a', '#6a6d72', '#5a5d63', '#2c4a20', '#3e6a78', '#8a6a3a', '#8a7a55', '#4a4f4a', '#9a7238', '#8a8f96', '#59c25a'];
const MINI_F = ['#1f2a1b', '#3a3c40', '#7ea3b8', '#2e4658', '#0f2a14', '#16365a', '#6a6d72', '#5a5d63', '#2c4a20', '#3e6a78', '#8a6a3a', '#8a7a55', '#4a4f4a', '#9a7238', '#8a8f96', '#59c25a'];
const MINI_R = ['#1f2a1b', '#3a3c40', '#d2b87a', '#8a7c66', '#0f2a14', '#1b3f66', '#6a6d72', '#a89a82', '#2c4a20', '#3e6a78', '#8a6a3a', '#8a7a55', '#4a4f4a', '#9a7238', '#8a8f96', '#59c25a'];
const miniPal = m => m.theme === 1 ? MINI_D : m.theme === 2 ? MINI_C : m.theme === 3 ? MINI_B : m.theme === 4 ? MINI_L : m.theme === 5 ? MINI_F : m.theme === 6 ? MINI_R : MINI;
/* per-map look: th 1 = desert town, 2 = downtown. returns false for tiles that keep the stock look */
function drawThemed(fr, m, tx, ty, t, th, H, i) {
  const rn = (a, k) => (H(a + k) * 15) | 0;
  if (th === 1) {
    const sand = () => { fr(['#9c8456', '#927b4f', '#a38b5c', '#8c7549'][(H(1) * 4) | 0], 0, 0, T, T); for (let k = 0; k < 4; k++) fr(H(k + 5) < .5 ? '#ad9566' : '#7a6540', rn(9, k), rn(17, k), 1, 1); if (H(30) < .07) fr('#6a5a38', rn(3, 1), rn(5, 2), 2, 1); };
    switch (t) {
      case TL.GRASS: sand(); return true;
      case TL.ROAD: fr('#4a4540', 0, 0, T, T); for (let k = 0; k < 5; k++) fr(H(k) < .5 ? '#55504a' : '#3c3834', rn(9, k), rn(17, k), 1, 1); if (m.marks[i] === 1) fr('#a89a5a', 15, 0, 2, 8); else if (m.marks[i] === 2) fr('#a89a5a', 0, 15, 8, 2); return true;
      case TL.SIDEW: fr('#4a3220', 0, 0, T, T); for (let r = 0; r < 4; r++) fr(['#8a6a40', '#7e603a', '#92704a'][(H(r + 40) * 3) | 0], 0, r * 4, T, 3); fr('rgba(255,255,255,.1)', 0, 0, T, 1); return true;
      case TL.FLOOR: case TL.DOOR:
        fr(((tx + ty) & 1) ? '#5e4c38' : '#574632', 0, 0, T, T); fr('rgba(0,0,0,.25)', 0, 0, T, 1); fr('rgba(0,0,0,.25)', 0, 0, 1, T);
        if (t === TL.DOOR) { fr('#3e2a18', 0, 0, T, T); fr('#5a3d22', 1, 1, T - 2, T - 2); fr('#2a1a0c', 0, 7, T, 2); } else if (PD.tileAt(m, tx, ty - 1) === TL.WALL) fr('rgba(0,0,0,.4)', 0, 0, T, 5);
        return true;
      case TL.WALL: {
        fr('#5a3820', 0, 0, T, T); const br = ['#b0804e', '#a67846', '#b88a56', '#9e7040'];
        for (let r = 0; r < 2; r++) for (let k = 0; k < 2; k++) fr(br[(H(r * 2 + k) * 4) | 0], 1 + k * 8 - (r & 1 ? 4 : 0), 1 + r * 7, 7, 6);
        fr('rgba(255,255,255,.14)', 0, 0, T, 1); if (PD.tileAt(m, tx, ty + 1) !== TL.WALL) fr('rgba(0,0,0,.35)', 0, T - 2, T, 2); return true; }
      case TL.TREE: sand();
        if (H(7) < .65) { fr('rgba(0,0,0,.28)', 4, 14, 9, 2); fr('#2f6a34', 6, 2, 4, 13); fr('#2f6a34', 2, 6, 4, 2); fr('#2f6a34', 2, 4, 2, 4); fr('#2f6a34', 10, 8, 4, 2); fr('#2f6a34', 12, 5, 2, 5); fr('#4a8a4a', 6, 2, 1, 12); }
        else { fr('rgba(0,0,0,.25)', 4, 14, 9, 2); fr('#5a4228', 7, 4, 2, 11); fr('#5a4228', 4, 5, 3, 1); fr('#5a4228', 4, 3, 1, 3); fr('#5a4228', 9, 7, 4, 1); fr('#5a4228', 12, 5, 1, 3); fr('#7a5a38', 7, 4, 1, 9); }
        return true;
      case TL.WATER: fr(['#1f5a6a', '#1d5262', '#256a7a'][(H(1) * 3) | 0], 0, 0, T, T); if (H(2) < .5) fr('rgba(255,255,255,.18)', rn(3, 0) % 10, rn(4, 0), 4, 1); return true;
      case TL.ROCK: sand(); fr('#8a5a3a', 1, 3, 14, 12); fr('#b07a52', 2, 3, 10, 3); fr('#5e3c26', 1, 12, 14, 3); fr('#4a2e1c', 5, 8, 3, 1); return true;
      case TL.BUSH: sand(); fr('#55623a', 1, 4, 14, 10); fr('#6b7a4a', 2, 4, 6, 5); fr('#6b7a4a', 8, 7, 6, 5); fr('#3c4828', 2, 11, 12, 2); fr('#8a7a4a', 4, 3, 1, 2); fr('#8a7a4a', 11, 5, 1, 2); return true;
      case TL.SAND: fr(['#b8a06a', '#ad9660', '#c0a874'][(H(1) * 3) | 0], 0, 0, T, T); return true;
      case TL.GRAVE: sand(); fr('rgba(0,0,0,.3)', 3, 12, 10, 3); fr('#7a6540', 3, 11, 10, 2); fr('#5a3d20', 7, 2, 2, 10); fr('#5a3d20', 4, 5, 8, 2); fr('#7a5a30', 7, 2, 1, 9); return true;
    }
  } else if (th === 2) {
    switch (t) {
      case TL.SIDEW: fr('#5a5d63', 0, 0, T, T); fr('#4a4d52', 0, 15, T, 1); fr('#4a4d52', 15, 0, 1, T); fr('#686b71', 0, 0, T, 1); if (((tx + ty) & 3) === 0) fr('#505359', 6, 6, 3, 3); return true;
      case TL.FLOOR: case TL.DOOR:
        fr(((tx + ty) & 1) ? '#31353c' : '#2c3036', 0, 0, T, T); fr('rgba(0,0,0,.25)', 0, 0, T, 1); fr('rgba(0,0,0,.25)', 0, 0, 1, T);
        if (t === TL.DOOR) { fr('#2a3a42', 0, 0, T, T); fr('#4e8494', 1, 1, T - 2, T - 2); fr('#79b0c0', 2, 2, T - 4, 3); fr('#2a3a42', 7, 0, 2, T); } else if (PD.tileAt(m, tx, ty - 1) === TL.WALL) fr('rgba(0,0,0,.4)', 0, 0, T, 5);
        return true;
      case TL.WALL: {
        fr('#1e232a', 0, 0, T, T); fr('#2f3640', 0, 0, T, T - 1);
        for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) fr(H(r * 2 + k + 50) < .2 ? '#d8c070' : '#3f4b5c', 1 + k * 8, 2 + r * 5, 6, 3);
        fr('rgba(255,255,255,.1)', 0, 0, T, 1); if (PD.tileAt(m, tx, ty + 1) !== TL.WALL) fr('rgba(0,0,0,.4)', 0, T - 2, T, 2); return true; }
      case TL.ROCK: fr('#3a3d42', 0, 0, T, T); fr('#686b70', 1, 4, 14, 9); fr('#8a8d92', 1, 4, 14, 2); fr('#4a4d52', 1, 11, 14, 2); fr('#d9b100', 3, 7, 2, 2); fr('#d9b100', 9, 7, 2, 2); fr('rgba(0,0,0,.35)', 0, 14, T, 2); return true;
    }
  } else if (th === 3) {
    switch (t) {
      case TL.WATER: fr(['#17456e', '#143f66', '#1c5280'][(H(1) * 3) | 0], 0, 0, T, T); if (H(2) < .55) fr('rgba(255,255,255,.2)', rn(3, 0) % 10, rn(4, 0), 5, 1); if (H(6) < .2) fr('rgba(255,255,255,.12)', rn(7, 0) % 9, rn(8, 0), 3, 1); return true;
      case TL.SIDEW: fr(((tx + ty) & 1) ? '#4b535e' : '#464e58', 0, 0, T, T); fr('#3a414a', 0, 15, T, 1); fr('#3a414a', 15, 0, 1, T); fr('#6a7480', 1, 1, 1, 1); fr('#6a7480', 13, 1, 1, 1); fr('#6a7480', 1, 13, 1, 1); fr('#6a7480', 13, 13, 1, 1); if (H(9) < .1) fr('#b9a24a', 0, 7, T, 2); return true;
      case TL.ROAD: fr('#3a2a1c', 0, 0, T, T); for (let r = 0; r < 4; r++) fr(['#7a5a38', '#6e5232', '#86643e'][(H(r + 40) * 3) | 0], 0, r * 4, T, 3); fr('rgba(255,255,255,.1)', 0, 0, T, 1); return true;
      case TL.FLOOR: case TL.DOOR:
        fr(((tx + ty) & 1) ? '#3a4048' : '#353b43', 0, 0, T, T); fr('rgba(0,0,0,.25)', 0, 0, T, 1); fr('rgba(0,0,0,.25)', 0, 0, 1, T);
        if (t === TL.DOOR) { fr('#2a3238', 0, 0, T, T); fr('#59707a', 1, 1, T - 2, T - 2); fr('#8aa4ae', 2, 2, T - 4, 2); fr('#c8b04a', 6, 6, 4, 4); fr('#2a3238', 7, 7, 2, 2); } else if (PD.tileAt(m, tx, ty - 1) === TL.WALL) fr('rgba(0,0,0,.4)', 0, 0, T, 5);
        return true;
      case TL.WALL: fr('#2a1f1c', 0, 0, T, T); fr('#7a3a2c', 0, 0, T, T - 1); fr('#8e4636', 0, 1, T, 4); fr('#5e2a20', 0, 8, T, 1); fr('#c8c0b0', 2, 3, 1, 1); fr('#c8c0b0', 8, 3, 1, 1); fr('#c8c0b0', 13, 3, 1, 1); fr('rgba(255,255,255,.14)', 0, 0, T, 1); if (PD.tileAt(m, tx, ty + 1) !== TL.WALL) fr('rgba(0,0,0,.4)', 0, T - 2, T, 2); return true;
      case TL.ROCK: { fr('#2a2d33', 0, 0, T, T); const col = ['#b3422e', '#2f5fa8', '#3f8a4a', '#d08a1f', '#c8c2a8', '#7a4fa0'][(PD.hash2(tx >> 2, ty >> 1, m.seed) * 6) | 0]; fr(col, 0, 1, T, 13); for (let k = 1; k < T; k += 3) fr('rgba(0,0,0,.22)', k, 1, 1, 13); fr('rgba(255,255,255,.25)', 0, 1, T, 1); fr('rgba(0,0,0,.4)', 0, 12, T, 2); fr('rgba(0,0,0,.35)', 0, 14, T, 2); return true; }
      case TL.BUSH: fr(((tx + ty) & 1) ? '#4b535e' : '#464e58', 0, 0, T, T); fr('#3c4a34', 1, 4, 14, 10); fr('#55673f', 2, 4, 7, 5); fr('#4a5a3a', 8, 7, 6, 5); fr('#2a3424', 2, 11, 12, 2); fr('#8a7a4a', 3, 3, 1, 2); fr('#8a7a4a', 11, 5, 1, 2); return true;
      case TL.GRASS: fr('#17456e', 0, 0, T, T); return true;
    }
  } else if (th === 4) {
    switch (t) {
      case TL.WATER: fr(['#a8300f', '#b83a12', '#9c2c0e'][(H(1) * 3) | 0], 0, 0, T, T); fr('#d0501a', rn(3, 0) % 11, rn(4, 0) % 12, 5, 2); if (H(5) < .4) fr('#f0a030', rn(6, 0) % 12, rn(7, 0) % 12, 2, 1); fr('rgba(0,0,0,.25)', 0, 14, T, 2); return true;
      case TL.FLOOR: fr(((tx + ty) & 1) ? '#4a3d42' : '#43373c', 0, 0, T, T); fr('rgba(0,0,0,.3)', 0, 0, T, 1); fr('rgba(0,0,0,.3)', 0, 0, 1, T); if (H(8) < .12) { fr('#c8501a', rn(2, 0) % 11, rn(3, 0) % 12, 4, 1); fr('#c8501a', rn(2, 0) % 11 + 3, rn(3, 0) % 12 + 1, 1, 2); } return true;
      case TL.WALL: fr('#08060a', 0, 0, T, T); fr('#15101a', 0, 0, T, T - 1); fr('#201a26', 1, 1, 6, 6); fr('#201a26', 8, 8, 6, 6); if (H(4) < .45) { fr('#e0601a', rn(2, 0) % 12, rn(3, 0) % 12, 1, 4); fr('#e07a1f', rn(2, 0) % 12, rn(3, 0) % 12 + 1, 1, 2); } fr('rgba(255,160,90,.3)', 0, 0, T, 1); if (PD.tileAt(m, tx, ty + 1) !== TL.WALL) fr('rgba(0,0,0,.55)', 0, T - 2, T, 2); return true;
    }
  } else if (th === 5) {
    switch (t) {
      case TL.WATER: fr(['#16365a', '#12304f', '#1b3f66'][(H(1) * 3) | 0], 0, 0, T, T); if (H(2) < .5) fr('rgba(200,230,255,.25)', rn(3, 0) % 10, rn(4, 0), 4, 1); fr('rgba(0,0,0,.2)', 0, 14, T, 2); return true;
      case TL.FLOOR: fr(((tx + ty) & 1) ? '#6f93a8' : '#6a8da2', 0, 0, T, T); fr('rgba(255,255,255,.2)', 0, 0, T, 1); fr('rgba(255,255,255,.12)', 0, 0, 1, T); if (H(8) < .18) fr('rgba(255,255,255,.4)', rn(2, 0) % 10, rn(3, 0) % 14, 5, 1); if (H(11) < .1) fr('rgba(30,60,90,.35)', rn(4, 0) % 12, rn(5, 0) % 12, 1, 3); return true;
      case TL.WALL: fr('#223646', 0, 0, T, T); const br = ['#3e5c70', '#456579', '#38566a']; for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) fr(br[(H(r * 2 + k) * 3) | 0], 1 + k * 8 - (r & 1 ? 5 : 0), 1 + r * 5, 7, 4); fr('rgba(255,255,255,.25)', 0, 0, T, 1); if (PD.tileAt(m, tx, ty + 1) !== TL.WALL) fr('rgba(0,0,0,.4)', 0, T - 2, T, 2); return true;
    }
  } else if (th === 6) {
    switch (t) {
      case TL.FLOOR: fr(['#c8ac6e', '#c0a466', '#cfb47a', '#bda064'][(H(1) * 4) | 0], 0, 0, T, T); for (let k = 0; k < 4; k++) fr(H(k + 5) < .5 ? '#dcc58c' : '#a88c52', rn(9, k), rn(17, k), 1, 1); if (H(30) < .06) fr('#8a6a3a', rn(31, 0) % 12, rn(32, 0) % 12, 3, 1); if (PD.tileAt(m, tx, ty - 1) === TL.WALL) fr('rgba(0,0,0,.35)', 0, 0, T, 5); return true;
      case TL.SIDEW: fr(((tx + ty) & 1) ? '#a89a82' : '#9f9179', 0, 0, T, T); fr('#85785f', 0, 15, T, 1); fr('#85785f', 15, 0, 1, T); fr('rgba(255,255,255,.18)', 0, 0, T, 1); if (H(8) < .12) fr('#7a6e58', rn(2, 0) % 11, rn(3, 0) % 12, 4, 1); if (PD.tileAt(m, tx, ty - 1) === TL.WALL) fr('rgba(0,0,0,.35)', 0, 0, T, 5); return true;
      case TL.WALL: {
        fr('#5e5240', 0, 0, T, T); const br = ['#cbbd9f', '#c1b296', '#d3c6aa', '#b9aa8d'];
        for (let r = 0; r < 2; r++) for (let k = 0; k < 2; k++) fr(br[(H(r * 2 + k) * 4) | 0], 1 + k * 8 - (r & 1 ? 4 : 0), 1 + r * 7, 7, 6);
        fr('rgba(255,255,255,.2)', 0, 0, T, 1); if (PD.tileAt(m, tx, ty + 1) !== TL.WALL) fr('rgba(0,0,0,.4)', 0, T - 2, T, 2); return true; }
    }
  }
  return false;
}
function drawTile(c, m, tx, ty) {
  const i = ty * m.w + tx, t = m.tiles[i], x = tx * T, y = ty * T, s = m.seed, H = (k) => PD.hash2(tx * 7 + k, ty * 13 + k * 3, s);
  const fr = (col, a, b, w, h) => { c.fillStyle = col; c.fillRect(x + a, y + b, w, h); };
  const grass = () => {
    fr(['#1a2217', '#161c13', '#1e281a', '#141a11'][(H(1) * 4) | 0], 0, 0, T, T);
    for (let k = 0; k < 4; k++) fr(H(k + 5) < .5 ? '#243020' : '#0e120c', (H(k + 9) * 15) | 0, (H(k + 17) * 15) | 0, 1, 2);
  };
  if (m.theme && t !== TL.AMMO && drawThemed(fr, m, tx, ty, t, m.theme, H, i)) return;
  switch (t) {
    case TL.AMMO: fr('#25282c', 0, 0, T, T); fr('#2f3a22', 0, 1, T, 14); fr('#46592f', 1, 2, T - 2, 12); fr('#36452a', 1, 7, T - 2, 2); fr('#d9b100', 2, 4, 2, 3); fr('#d9b100', 6, 4, 2, 3); fr('#d9b100', 10, 4, 2, 3); fr('#b08a00', 2, 6, 10, 1); fr('#c8c04a', 3, 10, 10, 2); fr('rgba(255,255,255,.12)', 1, 2, T - 2, 1); fr('rgba(0,0,0,.4)', 0, 14, T, 2); break;
    case TL.GRASS: grass(); break;
    case TL.ROAD: fr('#2b2d31', 0, 0, T, T); for (let k = 0; k < 5; k++) fr(H(k) < .5 ? '#33363a' : '#222428', (H(k + 9) * 15) | 0, (H(k + 17) * 15) | 0, 1, 1);
      if (m.marks[i] === 1) fr('#b9a24a', 15, 0, 2, 8); else if (m.marks[i] === 2) fr('#b9a24a', 0, 15, 8, 2); break;
    case TL.SIDEW: fr('#4a4d52', 0, 0, T, T); fr('#3a3d42', 0, 15, T, 1); fr('#3a3d42', 15, 0, 1, T); fr('#585b60', 0, 0, T, 1); break;
    case TL.FLOOR: case TL.DOOR: {
      fr(((tx + ty) & 1) ? '#2a2d31' : '#25282c', 0, 0, T, T); fr('rgba(0,0,0,.25)', 0, 0, T, 1); fr('rgba(0,0,0,.25)', 0, 0, 1, T);
      if (t === TL.DOOR) { fr('#5a3b22', 0, 0, T, T); fr('#7a5230', 1, 1, T - 2, T - 2); fr('#3b2514', 0, 7, T, 2); }
      else if (PD.tileAt(m, tx, ty - 1) === TL.WALL) fr('rgba(0,0,0,.4)', 0, 0, T, 5);
      break; }
    case TL.WALL: {
      fr('#2c1c17', 0, 0, T, T);
      const br = ['#7a4332', '#6b3a2c', '#84493a', '#733f30'];
      for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) { fr(br[(H(r * 2 + k) * 4) | 0], 1 + k * 8 - (r & 1 ? 5 : 0), 1 + r * 5, 7, 4); }
      fr('rgba(255,255,255,.1)', 0, 0, T, 1);
      if (PD.tileAt(m, tx, ty + 1) !== TL.WALL) fr('rgba(0,0,0,.35)', 0, T - 2, T, 2);
      break; }
    case TL.TREE: grass(); fr('#3b2a1a', 7, 11, 2, 5); fr('#0f2a14', 1, 1, 14, 11); fr('#173a1c', 2, 2, 12, 8); fr('#1f4a24', 4 + ((H(3) * 3) | 0), 3, 5, 4); fr('#0a1c0e', 2, 10, 12, 2); break;
    case TL.WATER: fr(['#1b3f66', '#1a3a5e', '#204a74'][(H(1) * 3) | 0], 0, 0, T, T); if (H(2) < .5) fr('rgba(255,255,255,.15)', (H(3) * 10) | 0, (H(4) * 14) | 0, 4, 1); break;
    case TL.ROCK: grass(); fr('#4d4f52', 1, 3, 14, 12); fr('#6a6c70', 2, 3, 10, 3); fr('#3a3c3f', 1, 12, 14, 3); fr('#2a2b2e', 5, 8, 3, 1); break;
    case TL.BUSH: grass(); fr('#1c3a14', 1, 3, 14, 11); fr('#2c5a1e', 2, 3, 6, 5); fr('#2c5a1e', 8, 6, 6, 6); fr('#173010', 2, 11, 12, 2); break;
    case TL.CRATE: fr('#25282c', 0, 0, T, T); fr('#6b4a2a', 0, 0, T, T); fr('#8a6234', 1, 1, T - 2, T - 2); fr('#5a3d20', 1, 7, T - 2, 2); fr('#5a3d20', 7, 1, 2, T - 2); fr('rgba(0,0,0,.35)', 0, 14, T, 2); break;
    case TL.SAND: fr(['#8a7a55', '#7e6f4c', '#948360'][(H(1) * 3) | 0], 0, 0, T, T); break;
    case TL.GRAVE: grass(); fr('#7a7c80', 4, 3, 8, 10); fr('#9a9ca0', 5, 3, 6, 2); fr('#55575a', 7, 5, 2, 6); fr('#55575a', 5, 7, 6, 2); fr('rgba(0,0,0,.35)', 4, 13, 8, 2); break;
    case TL.WOODW: {
      fr('#2a1a0c', 0, 0, T, T); const pl = ['#8a6234', '#7a5428', '#95703c'];
      for (let r = 0; r < 4; r++) fr(pl[(H(r + 20) * 3) | 0], 1, 1 + r * 4, T - 2, 3);
      fr('#b8925a', 1, 1, T - 2, 1); fr('#3a2410', 3, 3, 1, 1); fr('#3a2410', 12, 7, 1, 1); fr('#3a2410', 3, 11, 1, 1);
      if (PD.tileAt(m, tx, ty + 1) !== TL.WOODW) fr('rgba(0,0,0,.4)', 0, T - 2, T, 2); break; }
    case TL.STONEW: {
      fr('#2a2c30', 0, 0, T, T); const br = ['#8a8f96', '#7a8088', '#979ca3', '#80858c'];
      for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) fr(br[(H(r * 2 + k + 30) * 4) | 0], 1 + k * 8 - (r & 1 ? 5 : 0), 1 + r * 5, 7, 4);
      fr('rgba(255,255,255,.14)', 0, 0, T, 1); if (PD.tileAt(m, tx, ty + 1) !== TL.STONEW) fr('rgba(0,0,0,.4)', 0, T - 2, T, 2); break; }
    default: fr('#000', 0, 0, T, T);
  }
}
PD.renderBG = function (m) {
  if (typeof document === 'undefined') return;
  const c = document.createElement('canvas'); c.width = m.W; c.height = m.H;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) drawTile(g, m, tx, ty);
  m.bg = c; m.bgctx = g; PD.renderMini(m);
};
PD.renderMini = function (m) {
  if (typeof document === 'undefined') return;
  const mc = document.createElement('canvas'); mc.width = m.w; mc.height = m.h;
  const mg = mc.getContext('2d');
  for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) { mg.fillStyle = miniPal(m)[m.tiles[ty * m.w + tx]] || '#000'; mg.fillRect(tx, ty, 1, 1); }
  m.mini = mc; m.minictx = mg;
};
/* ---------- building helpers (shared by the sim and the client ghost preview) ---------- */
PD.buildTarget = function (px, py, mx, my) {
  let dx = mx - px, dy = my - py; const d = Math.hypot(dx, dy), R = PD.BUILD.REACH;
  if (d > R) { dx *= R / d; dy *= R / d; }
  return { tx: Math.floor((px + dx) / T), ty: Math.floor((py + dy) / T) };
};
/* is any circle (player / zombie) touching this tile? */
PD.tileBusy = function (m, tx, ty, ents) {
  const x0 = tx * T, y0 = ty * T;
  for (const e of ents) {
    const qx = e.x < x0 ? x0 : e.x > x0 + T ? x0 + T : e.x, qy = e.y < y0 ? y0 : e.y > y0 + T ? y0 + T : e.y, r = (e.r || 5) + 1;
    if ((e.x - qx) * (e.x - qx) + (e.y - qy) * (e.y - qy) < r * r) return true;
  }
  return false;
};
/* returns '' when a wall may go on this tile, otherwise a short reason */
PD.buildCheck = function (m, tx, ty, ents) {
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return 'edge';
  if (Math.min(tx, ty, m.w - 1 - tx, m.h - 1 - ty) <= (m.arena ? 5 : 4)) return 'edge';
  const i = ty * m.w + tx; if (!PD.BUILD.BASE[m.tiles[i]] || !m.reach[i]) return 'ground';
  const cx = tx * T + 8, cy = ty * T + 8;
  for (const g of m.gates) if (Math.hypot(g.x - cx, g.y - cy) < 5 * T) return 'gate';
  for (const b of m.boxes) if (Math.hypot(b.x - cx, b.y - cy) < 24) return 'shop';
  for (const b of m.wallbuys) if (Math.hypot(b.x - cx, b.y - cy) < 22) return 'shop';
  if (PD.tileBusy(m, tx, ty, ents)) return 'busy';
  return '';
};
PD.setTile = function (m, x, y, v) {
  if (!inb(m, x, y)) return;
  m.tiles[y * m.w + x] = v; m.ver++;
  if (m.bgctx) {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (inb(m, x + i, y + j)) drawTile(m.bgctx, m, x + i, y + j);
    m.minictx.fillStyle = miniPal(m)[v] || '#000'; m.minictx.fillRect(x, y, 1, 1);
  }
};
})(typeof window !== 'undefined' ? window : globalThis);
