/* Pixel Dead v2 - render.js : camera, world, sprites, fx, HUD, minimap */
(function (root) {
'use strict';
const PD = root.PD, T = PD.T, WDEF = PD.WDEF, BOSSES = PD.BOSSES, PUDEF = PD.PUDEF;
let VW = PD.VW, VH = PD.VH;
const R = PD.Render = { cam: { x: 0, y: 0 }, fx: null };
const BONE = '#e8e2cf', BLOOD = '#b3121b', BLOODB = '#e0242d', ROT = '#7fa650';
let ctx = null;
const fr = (c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
function txt(s, x, y, col, align, size) {
  ctx.font = ((size || 8) > 8 ? 16 : 8) + 'px Silkscreen, monospace'; ctx.textBaseline = 'top'; ctx.textAlign = align || 'left'; s = String(s);
  ctx.fillStyle = '#000'; ctx.fillText(s, Math.round(x) + 1, Math.round(y) + 1); ctx.fillStyle = col || BONE; ctx.fillText(s, Math.round(x), Math.round(y));
}
const tw = (s, size) => { ctx.font = ((size || 8) > 8 ? 16 : 8) + 'px Silkscreen, monospace'; return Math.ceil(ctx.measureText(String(s)).width); };
const mmss = t => { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); };
R.fontsReady = function () { try { return Promise.all([document.fonts.load('8px Silkscreen'), document.fonts.load('16px Silkscreen')]); } catch (e) { return Promise.resolve(); } };
function pxLine(x0, y0, x1, y1, col, s) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy; ctx.fillStyle = col;
  for (let n = 0; n < 400; n++) { ctx.fillRect(x0, y0, s || 1, s || 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
}
const shc = {}; function shade(hex, k) {
  const key = hex + k; if (shc[key]) return shc[key]; const n = parseInt(hex.slice(1), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(v * k))); return shc[key] = 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
}
function legs(x, y, ph, col) { const s = Math.round(Math.sin(ph) * 1.6); fr(col, x - 3, y + 3 + s, 2, 3); fr(col, x + 1, y + 3 - s, 2, 3); }
const GUN = { m1911: [8, '#555'], revolver: [10, '#8a8a8a'], pump: [13, '#6b4a2a'], smg: [11, '#444'], ak: [14, '#6b4a2a'], sniper: [17, '#333'], minigun: [14, '#666'], flamer: [12, '#b05a1a'], rpg: [15, '#4a5d3a'], gl: [11, '#3a3a3a'], rail: [16, '#4aa3ff'], tesla: [11, '#7fe0ff'], plasma: [12, '#9a6bd6'], golden: [9, '#ffd24a'], crossbow: [13, '#8a6a3a'], aa12: [14, '#555'], leech: [11, '#a02848'], laser: [13, '#ff4a6a'], cryo: [12, '#8fe8ff'] };

/* ---------- melee tool: the same pickaxe in four looks (look.pick) ---------- */
function drawMelee(x, y, ang, kind, sw, sab) {
  const a = sw > 0 ? ang - 1 + (1 - sw / .18) * 2 : ang, ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca, oy = y - 2;
  const at = L => [x + ca * L, oy + sa * L];
  fr('#222', x + Math.round(Math.cos(ang) * 4) - 1, oy + Math.round(Math.sin(ang) * 4) - 1, 3, 3);
  const line = (l0, l1, col, w) => { const a0 = at(l0), a1 = at(l1); pxLine(a0[0], a0[1], a1[0], a1[1], col, w); };
  if (kind === 1) {                                   // katana
    line(3, 6, '#5a1a1a', 2); const g = at(6); pxLine(g[0] - px * 2, g[1] - py * 2, g[0] + px * 2, g[1] + py * 2, '#d9b100', 1); line(7, 20, '#e8f0f4', 2); line(7, 20, '#ffffff', 1);
  } else if (kind === 2) {                            // lightsaber
    const sc = PD.SABERS[sab | 0] || PD.SABERS[0]; line(3, 8, '#8a8f96', 2); line(3, 4, '#444', 2); const ga = ctx.globalAlpha; ctx.globalAlpha = ga * .35; line(9, 23, sc.glow, 4); ctx.globalAlpha = ga; line(9, 22, sc.core, 2); line(9, 22, '#ffffff', 1);
  } else if (kind === 3) {                            // zombie arm
    line(3, 5, '#4a3a2a', 3); line(5, 12, '#6b8a4a', 3); line(5, 12, '#7a9a56', 1);
    const h = at(13); fr('#7a9a56', Math.round(h[0]) - 1, Math.round(h[1]) - 1, 3, 3); fr('#4a6a30', Math.round(h[0] + ca * 2) - 1, Math.round(h[1] + sa * 2) - 1, 1, 1);
    const b = at(8); fr('#e8e2cf', Math.round(b[0] + px * 2), Math.round(b[1] + py * 2), 1, 2);
  } else if (kind === 5) {                            // candy cane
    line(3, 12, '#ffffff', 2); for (let L = 4; L < 12; L += 3) line(L, L + 1, '#d8202a', 2);
    const h = at(12); pxLine(h[0], h[1], h[0] + px * 3, h[1] + py * 3, '#ffffff', 2); const e = at(12); pxLine(e[0] + px * 2, e[1] + py * 2, e[0] + px * 3, e[1] + py * 3, '#d8202a', 2);
  } else {                                            // stock pickaxe (kind 4 = the golden one)
    const gold = kind === 4, c1 = gold ? '#7a4a1a' : '#8a5a2a', c2 = gold ? '#c08a30' : '#a87440', c3 = gold ? '#ffd24a' : '#b8c0c8', c4 = gold ? '#d9a100' : '#6a727a';
    line(3, 12, c1, 2); line(3, 12, c2, 1);
    const h = at(11); pxLine(h[0] - px * 4, h[1] - py * 4, h[0] + px * 4, h[1] + py * 4, c3, 2);
    fr(c4, Math.round(h[0] - px * 4), Math.round(h[1] - py * 4), 2, 2); fr(c4, Math.round(h[0] + px * 4), Math.round(h[1] + py * 4), 2, 2);
    if (gold) { fr('#fff6c0', Math.round(h[0]), Math.round(h[1]), 1, 1); }
  }
}

/* ---------- characters ---------- */
/* hsl -> '#rrggbb' (disco shirt) */
function hsl(h, sat, l) { const f = n => { const k = (n + h / 30) % 12, a = sat * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return '#' + [f(0), f(8), f(4)].map(v => ('0' + v.toString(16)).slice(-2)).join(''); }
/* the pose of an emote: body offset, facing, leg phase, how it is flipped. opts.em = emote id + 1, opts.t = seconds */
function emotePose(E, t) {
  const P = { dx: 0, dy: 0, ang: Math.PI / 2, ph: 0, flip: false };
  switch (E) {
    case 1: P.dx = Math.round(Math.sin(t * 4.5) * 2); P.dy = -Math.round(Math.abs(Math.sin(t * 9)) * 2); P.ph = t * 12; break;
    case 2: P.dy = -Math.round(Math.abs(Math.sin(t * 7)) * 3); break;
    case 3: P.ang = t * 9; P.dy = -Math.round(Math.abs(Math.sin(t * 5)) * 1); P.ph = t * 10; break;
    case 5: P.dx = Math.round(Math.sin(t * 40)); P.dy = Math.sin(t * 20) > 0 ? -1 : 0; break;
    case 6: P.dx = Math.round(Math.sin(t * 5) * 2); P.dy = -(Math.sin(t * 10) > .4 ? 1 : 0); P.ph = t * 8; break;
    case 7: P.ang = t * 6; P.ph = t * 14; P.flip = true; P.dy = 0; break;
  }
  return P;
}
/* arms and little effects for an emote, drawn over the body */
function emoteArms(E, x, y, t, skin, shirt) {
  const arm = (ax, ay, w, h) => { fr(shirt, ax, ay, w, Math.min(h, 2)); if (h > 2) fr(skin, ax, ay + 2, w, h - 2); };
  const nt = (nx, ny, col) => { fr(col, nx + 1, ny, 1, 3); fr(col, nx, ny + 2, 2, 2); };
  switch (E) {
    case 0: { const s = Math.round(Math.sin(t * 10) * 2); fr(shirt, x + 4, y - 5, 2, 3); fr(skin, x + 5, y - 9, 2, 5); fr(skin, x + 5 + s, y - 11, 2, 2); fr(shirt, x - 6, y - 4, 2, 4); break; }
    case 1: { const l = Math.sin(t * 9) > 0; arm(x - 6, l ? y - 11 : y - 3, 2, l ? 8 : 5); arm(x + 4, l ? y - 3 : y - 11, 2, l ? 5 : 8); const k = (t * 1.4) % 1, k2 = (k + .5) % 1, ga = ctx.globalAlpha; ctx.globalAlpha = ga * (1 - k); nt(x + 8, Math.round(y - 12 - k * 8), '#ffd24a'); ctx.globalAlpha = ga * (1 - k2); nt(x - 10, Math.round(y - 10 - k2 * 8), '#8fe8ff'); ctx.globalAlpha = ga; break; }
    case 2: { const u = Math.sin(t * 14) > 0 ? 1 : 0; arm(x - 6, y - 12 - u, 2, 9); arm(x + 4, y - 12 - (1 - u), 2, 9); for (let i = 0; i < 4; i++) { const a = t * 6 + i * 1.57; fr(i % 2 ? '#ffd24a' : '#fff', Math.round(x + Math.cos(a) * 11), Math.round(y - 14 + Math.sin(a) * 5), 1, 1); } break; }
    case 4: fr(shirt, x + 4, y - 5, 2, 2); fr(skin, x + 3, y - 9, 3, 4); fr(skin, x + 1, y - 10, 3, 1); fr(shirt, x - 6, y - 4, 2, 5); break;
    case 5: arm(x - 6, y - 4, 2, 4); arm(x + 4, y - 4, 2, 4); { const on = Math.sin(t * 20) > 0; txt(on ? 'HA' : 'HA HA', x, y - 29, '#fff', 'center', 8); } break;
    case 6: { const l = Math.sin(t * 5) > 0; arm(l ? x + 4 : x - 6, y - 13, 2, 9); arm(l ? x - 6 : x + 4, y - 3, 2, 4); for (let i = 0; i < 6; i++) { const a = t * 3 + i * 1.047; fr(hsl((t * 180 + i * 60) % 360, 1, .6), Math.round(x + Math.cos(a) * 12), Math.round(y - 5 + Math.sin(a) * 9), 2, 2); } break; }
    case 7: arm(x - 7, y - 2, 2, 4); arm(x + 5, y - 2, 2, 4); break;
  }
}

/* ---------- outfits (look.out): body art that replaces shirt + pants. x,y = the same body anchor drawChar uses ---------- */
const nowT = () => Date.now() / 1000;
/* feet, leg stripe and shorts: drawn over the legs, under the body */
function outfitLegs(O, x, y, ph, skin) {
  const s = Math.round(Math.sin(ph) * 1.6);
  if (O.shorts) fr(O.shorts, x - 4, y + 3, 8, 2);
  if (O.stripe) { fr(O.stripe, x - 3, y + 3 + s, 1, 3); fr(O.stripe, x + 2, y + 3 - s, 1, 3); }
  if (O.feet) { fr(O.feet, x - 3, y + 5 + s, 2, 1); fr(O.feet, x + 1, y + 5 - s, 2, 1); }
}
/* the horse tail hangs off the back: out to the side when you see the body from the front or the side, straight down when you face away */
function horseTail(x, y, ph, sx, back, col, stage) {
  const sw = Math.round(Math.sin(ph * .9)), tip = shade(col, .6);
  if (back) { if (stage === 1) { fr(col, x - 1, y + 1, 3, 2); fr(col, x - 1 + sw, y + 3, 3, 3); fr(tip, x - 1 + sw, y + 6, 3, 1); } return; }
  if (stage !== 0) return; const b = sx > 0 ? -6 : 4, d = sx > 0 ? -1 : 1;
  fr(col, x + b, y, 2, 2); fr(col, x + b + d + sw, y + 2, 2, 2); fr(tip, x + b + d + sw, y + 4, 2, 2);
}
/* stage 0 = behind the body, 1 = the body itself. st = { ph, sx (+1 facing right), back, skin, hatc } */
function drawOutfit(O, x, y, st, stage) {
  const r = (c, dx, dy, w, h) => fr(c, x + dx, y + dy, w, h);
  if (O.k === 'horse') horseTail(x, y, st.ph, st.sx, st.back, st.hatc, stage);
  if (stage !== 1) return;
  switch (O.k) {
    case 'ball': r('#f4f4f0', -4, -4, 8, 8); for (let i = -3; i <= 3; i += 2) r('#1d2f6f', i, -3, 1, 6); r('#1d2f6f', -4, -4, 8, 1); r('#b3121b', -4, 2, 8, 1); break;
    case 'parka': r('#e0701f', -5, -3, 10, 7); r('#e0701f', -4, -4, 8, 1); r('#b85514', -5, -1, 10, 1); r('#b85514', -5, 1, 10, 1); r('#9aa0a8', -4, -4, 8, 2); r('#9aa0a8', 2, -2, 2, 4); r('#7a8088', 2, 1, 2, 1); break;
    case 'punk': r('#17171b', -4, -4, 8, 8); r('#2a2a30', -4, -3, 1, 6); r('#8a8f96', 0, -3, 1, 6); r('#e8e2cf', -2, -4, 4, 1); r('#e8e2cf', -1, -3, 2, 1);
      for (const [a, b] of [[-4, -4], [3, -4], [-4, -2], [3, -2], [-4, 0], [3, 0]]) r('#cfd3d8', a, b, 1, 1); r('#cfd3d8', -5, -5, 1, 2); r('#cfd3d8', 4, -5, 1, 2); r('#7a1020', -4, 2, 8, 1); break;
    case 'soldier': r('#4a5d3a', -4, -4, 8, 8); r('#2f3d26', -3, -3, 3, 2); r('#2f3d26', 1, 0, 3, 2); r('#6b7d52', 0, -3, 2, 1); r('#6b7d52', -4, 1, 2, 2); r('#26301f', -4, -4, 2, 6); r('#26301f', 2, -4, 2, 6); r('#2a2f22', -3, -1, 2, 2); r('#2a2f22', 1, -1, 2, 2); r('#1b1b1b', -4, 2, 8, 1); break;
    case 'outlaw': r('#8a5a3a', -4, -4, 8, 1); r('#8a5a3a', -5, -3, 10, 6); r('#d9a14a', -5, -2, 10, 1); r('#b3121b', -5, -1, 10, 1); r('#d9a14a', -5, 0, 10, 1); for (let i = -5; i < 5; i += 2) r('#8a5a3a', i, 3, 1, 2); r('#3a2418', -1, -4, 2, 1); break;
    case 'royal': r('#a0121b', -4, -4, 8, 10); r('#f4f0e6', -4, -4, 8, 2); r('#f4f0e6', -1, -2, 2, 8); r('#f4f0e6', -4, 4, 8, 2); r('#ffd24a', -4, 1, 8, 1);
      for (const [a, b] of [[-3, -4], [2, -4], [-3, 4], [0, 5], [2, 4]]) r('#111', a, b, 1, 1); break;
    case 'horse': r('#8a5a3a', -4, -4, 8, 8); r('#6e4528', -4, -4, 8, 1); r('#a87440', -2, 0, 4, 3);
      if (st.back) r(st.hatc, -1, -4, 2, 8); else { r(st.hatc, -4, -4, 1, 3); r(st.hatc, 3, -4, 1, 3); r('#5a3a24', -1, 3, 2, 1); } break;
    case 'wizard': r('#5a2fa0', -4, -4, 8, 10); r('#8a5fd0', -4, 4, 8, 2); r('#8a5fd0', -4, -4, 8, 1); r('#ffd24a', -4, 1, 8, 1); r('#ffd24a', -3, -2, 1, 1); r('#ffd24a', 2, -3, 1, 1); r('#ffffff', -1, 3, 1, 1); r('#ffd24a', 2, 2, 1, 1); r('#ffffff', -3, 5, 1, 1); break;
    case 'pirate': r('#7a1522', -4, -4, 8, 8); r('#5a0e18', -4, -4, 2, 8); r('#5a0e18', 2, -4, 2, 8); r('#e8e2cf', -2, -4, 4, 1); r('#e8e2cf', -1, -3, 2, 1);
      for (const [a, b] of [[-2, -1], [1, -1], [-2, 1], [1, 1]]) r('#ffd24a', a, b, 1, 1); r('#1b1b20', -4, 2, 8, 1); r('#ffd24a', -1, 2, 2, 1); break;
    case 'santa': r('#c8161d', -4, -4, 8, 8); r('#f4f4f0', -1, -4, 2, 8); r('#f4f4f0', -4, 3, 8, 1); r('#f4f4f0', -4, -4, 8, 1); r('#1b1b20', -4, 1, 8, 1); r('#ffd24a', -1, 1, 2, 1); break;
    case 'knight': r('#aab2bb', -4, -4, 8, 8); r('#d7dde3', -4, -4, 8, 1); r('#d7dde3', -4, -4, 1, 6); r('#7c858e', -4, 3, 8, 1); r('#7c858e', 3, -3, 1, 6); r(st.hatc, -2, -3, 4, 7); r('#e8e2cf', 0, -2, 1, 4); r('#e8e2cf', -1, -1, 3, 1);
      r('#d7dde3', -5, -4, 2, 3); r('#d7dde3', 3, -4, 2, 3); r('#7c858e', -5, -2, 2, 1); r('#7c858e', 3, -2, 2, 1); break;
    case 'disco': { r('#b9b4d8', -4, -4, 8, 8); for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) if ((gx + gy) & 1) r('#8f89c0', -4 + gx * 2, -4 + gy * 2, 2, 2);
      const t = Math.floor(nowT() * 5); for (let n = 0; n < 3; n++) { const k = (t * 3 + n * 7) % 16; r(n === 1 ? '#8fe8ff' : '#ffffff', -4 + (k % 4) * 2, -4 + ((k / 4) | 0) * 2, 1, 1); } r('#ff3fa4', -4, -4, 8, 1); break; }
    case 'gold': r('#e0b020', -4, -4, 8, 8); r('#fff0a0', -4, -4, 1, 6); r('#fff0a0', -3, -4, 4, 1); r('#9a6a10', -4, 3, 8, 1); r('#9a6a10', 3, -3, 1, 6); r('#7a4a10', -4, 1, 8, 1); r('#fff6c0', -1, 1, 2, 1);
      { const k = Math.floor(nowT() * 3) % 6; r('#ffffff', -3 + k % 3 * 3, -2 + ((k / 3) | 0) * 4, 1, 1); } break;
    case 'skeleton': r('#15171c', -4, -4, 8, 8); r('#e8e2cf', 0, -4, 1, 8);
      if (!st.back) for (const dy of [-3, -1, 1]) { r('#e8e2cf', -3, dy, 2, 1); r('#e8e2cf', 1, dy, 2, 1); } else { r('#e8e2cf', -3, -3, 6, 1); r('#e8e2cf', -2, 0, 4, 1); }
      r('#e8e2cf', -2, 3, 4, 1); break;
    case 'heather': r('#9aa0a8', -4, -4, 8, 8); r('#8a9098', -5, -5, 10, 2); r('#858b93', -3, 1, 6, 2); r('#6f757d', -3, 1, 6, 1); r('#e8e2cf', -2, -3, 1, 3); r('#e8e2cf', 1, -3, 1, 3); break;
    case 'boxtee': r('#d41f26', -4, -4, 8, 8); r('#a8151b', -4, -4, 8, 1); r('#f4f4f0', -2, -2, 4, 2); r('#d41f26', -1, -1, 2, 1); break;
    case 'puffer': r('#1a1c20', -5, -3, 10, 7); r('#1a1c20', -4, -4, 8, 1); r('#e8c020', -5, -3, 10, 2); r('#2b2e34', -5, 0, 10, 1); r('#2b2e34', -5, 2, 10, 1); r('#c8ccd2', 0, -4, 1, 8); break;
    case 'track': r('#1c2c5c', -4, -4, 8, 8); r('#f4f4f0', -4, -4, 1, 8); r('#f4f4f0', 3, -4, 1, 8); r('#c8ccd2', 0, -4, 1, 6); r('#2c4180', -3, -4, 6, 1); break;
    case 'camohood': r('#3f5a2a', -4, -4, 8, 8); r('#24351a', -3, -3, 3, 2); r('#24351a', 1, 0, 3, 3); r('#6f8a3a', 0, -3, 3, 1); r('#6f8a3a', -4, 1, 3, 2); r('#a8b060', 2, -2, 1, 1); r('#a8b060', -2, 2, 1, 1);
      r('#34491f', -5, -5, 10, 2); r('#c8ccd2', 0, -3, 1, 6); r('#2f4420', -3, 2, 2, 1); break;
    case 'varsity': r('#7a1522', -4, -4, 8, 8); r('#e8dcc0', -5, -3, 2, 6); r('#e8dcc0', 3, -3, 2, 6); r('#e8dcc0', -4, -4, 8, 1); r('#e8dcc0', -4, 3, 8, 1); r('#7a1522', -5, 2, 2, 1); r('#7a1522', 3, 2, 2, 1);
      r('#f4f4f0', -3, -2, 2, 2); for (const b of [-3, -1, 1]) r('#d9b100', 0, b, 1, 1); break;
    case 'hazard': r('#ececec', -4, -4, 8, 8); r('#c8c8c8', -4, -4, 8, 1); for (let q = 0; q < 3; q++) for (let i = 0; i < 8; i++) r(((i + q) >> 1) & 1 ? '#ff7a00' : '#111111', -4 + i, -1 + q, 1, 1); break;
    case 'sand': r('#c9ae86', -5, -4, 10, 8); r('#b09468', -5, -4, 10, 1); r('#b09468', -5, 3, 10, 1); r('#b8a07a', 3, -3, 2, 6); break;
    case 'court': r(st.skin, -4, -4, 8, 8); r('#c8161d', -3, -4, 6, 7); r('#f4f4f0', -3, -4, 6, 1); r('#f4f4f0', -3, -3, 1, 5); r('#f4f4f0', 2, -3, 1, 5); r('#f4f4f0', -1, -2, 2, 4); break;
  }
}
PD.drawChar = function (c, x, y, ang, look, ph, wid, opts) {
  const o = opts || {}, prev = ctx; ctx = c; look = look || PD.defaultLook();
  x = Math.round(x); y = Math.round(y);
  const E = o.em ? o.em - 1 : -1, et = o.t || 0, pose = E >= 0 ? emotePose(E, et) : null;
  const skin = PD.SKIN[look.skin], shirtBase = PD.COLORS[look.shirt], pants = PD.COLORS[look.pants], hatc = PD.COLORS[look.hatc];
  const O = look.out > 0 ? PD.OUTFITS[look.out] || null : null, oc = v => v === 'skin' ? skin : v;
  const shirt = O ? oc(O.sleeve) : E === 6 ? hsl((et * 180) % 360, .8, .5) : shirtBase;
  if (o.cloak) c.globalAlpha = .35;
  fr('rgba(0,0,0,.35)', x - 5, y + 1, 10, 6);
  if (pose) { x += pose.dx; y += pose.dy; ang = pose.ang; ph = pose.ph; wid = null; if (pose.flip) { c.save(); c.translate(0, 2 * (y - 3)); c.scale(1, -1); } }
  const ca = Math.cos(ang), sa = Math.sin(ang), back = sa < -.45, st = O ? { ph: ph || 0, sx: ca >= 0 ? 1 : -1, back, skin, hatc } : null;
  if (O) drawOutfit(O, x, y, st, 0);
  legs(x, y, ph || 0, O ? oc(O.pants) : shade(pants, .7));
  if (O) { outfitLegs(O, x, y, ph || 0, skin); drawOutfit(O, x, y, st, 1); if (O.k === 'horse' && back) horseTail(x, y, st.ph, st.sx, true, hatc, 1); }
  else { fr(shirt, x - 4, y - 4, 8, 8); fr(shade(shirt, .75), x - 4, y - 4, 8, 2); fr(shade(shirt, .6), x - 1, y - 1, 2, 4); }
  if (o.seek) { fr('#e0242d', x - 4, y - 4, 8, 1); }
  if (back) { fr(shade(skin, .55), x - 3, y - 10, 6, 6); } else { fr(skin, x - 3, y - 10, 6, 6); fr('#111', x - 2 + (ca > .3 ? 1 : 0), y - 8, 1, 1); fr('#111', x + 1 + (ca > .3 ? 1 : 0), y - 8, 1, 1); }
  if (!back) {
    if (look.acc === 1) fr('#111', x - 3, y - 9, 6, 2); else if (look.acc === 2) fr('#ddd', x - 3, y - 7, 6, 3); else if (look.acc === 3) { fr('#111', x + 0, y - 9, 3, 2); fr('#111', x - 3, y - 10, 1, 1); }
    else if (look.acc === 4) { fr('#e8e2cf', x - 3, y - 10, 6, 6); fr('#111', x - 3, y - 9, 2, 2); fr('#111', x + 1, y - 9, 2, 2); fr('#111', x, y - 7, 1, 1); fr('#111', x - 2, y - 5, 1, 1); fr('#111', x, y - 5, 1, 1); fr('#111', x + 2, y - 5, 1, 1); }
  }
  switch (look.hat) {
    case 1: fr(hatc, x - 3, y - 12, 6, 3); fr(shade(hatc, .7), x - 4 + (ca > 0 ? 1 : -1) * 2, y - 10, 6, 1); break;
    case 2: fr(hatc, x - 3, y - 12, 6, 3); fr(shade(hatc, 1.3), x - 1, y - 14, 2, 2); break;
    case 3: fr(hatc, x - 1, y - 14, 2, 4); fr(hatc, x - 1, y - 12, 2, 3); break;
    case 4: fr('#5a6a52', x - 4, y - 12, 8, 4); fr('#7a8a72', x - 4, y - 12, 8, 1); break;
    case 5: fr(hatc, x - 3, y - 10, 6, 2); fr(hatc, x - 4, y - 9, 1, 2); break;
    case 6: fr('#ffd24a', x - 3, y - 13, 6, 3); fr('#ffd24a', x - 3, y - 14, 1, 1); fr('#ffd24a', x - 1, y - 15, 2, 2); fr('#ffd24a', x + 2, y - 14, 1, 1); break;
    case 7: {                                          // horse head: same size as a head, plus ears, a short muzzle and a mane in the hat colour
      const sx = back ? 0 : ca >= 0 ? 1 : -1, hd = '#8a5a3a', ml = '#a87440';
      fr(back ? shade(hd, .75) : hd, x - 3, y - 11, 6, 7); fr(hd, x - 3, y - 13, 2, 3); fr(hd, x + 1, y - 13, 2, 3); fr('#d9a0a0', x - 3, y - 12, 1, 1); fr('#d9a0a0', x + 2, y - 12, 1, 1);
      if (back) { fr(hatc, x - 1, y - 12, 2, 8); }
      else { fr(hatc, sx > 0 ? x - 3 : x + 2, y - 12, 1, 7); fr(hatc, x - 1, y - 13, 2, 2); fr(ml, sx > 0 ? x : x - 4, y - 8, 4, 4); fr('#3a2412', sx > 0 ? x + 2 : x - 3, y - 6, 1, 1); fr('#3a2412', sx > 0 ? x + 1 : x - 2, y - 6, 1, 1); fr('#111', sx > 0 ? x - 1 : x + 0, y - 9, 1, 1); fr('#111', sx > 0 ? x + 1 : x - 2, y - 9, 1, 1); }
      break; }
    case 8: fr(hatc, x - 5, y - 11, 10, 2); fr(hatc, x - 3, y - 14, 6, 3); fr(hatc, x - 2, y - 17, 4, 3); fr(hatc, x, y - 19, 3, 2); fr('#ffd24a', x - 1, y - 13, 1, 1); fr('#ffd24a', x + 1, y - 16, 1, 1); break;
    case 9: fr('#1b1b20', x - 5, y - 12, 10, 2); fr('#1b1b20', x - 3, y - 14, 6, 2); fr('#e8e2cf', x - 1, y - 14, 2, 1); fr('#e8e2cf', x - 2, y - 13, 1, 1); fr('#e8e2cf', x + 1, y - 13, 1, 1); break;
    case 10: fr('#c8161d', x - 3, y - 13, 6, 4); fr('#c8161d', x - 2, y - 15, 4, 2); fr('#c8161d', x + 1, y - 16, 3, 2); fr('#ffffff', x - 4, y - 11, 8, 2); fr('#ffffff', x + 3, y - 15, 2, 2); break;
    case 12: fr(hatc, x - 3, y - 12, 6, 2); fr(shade(hatc, .8), x - 5, y - 10, 10, 2); fr(shade(hatc, 1.25), x - 3, y - 12, 6, 1); break;
    case 11: fr('#aab2bb', x - 4, y - 12, 8, 7); fr('#d7dde3', x - 4, y - 12, 8, 1); fr('#8a929b', x - 4, y - 6, 8, 1); if (!back) fr('#1a1d22', x - 3, y - 9, 6, 1); fr(hatc, x - 1, y - 15, 2, 3); break;
  }
  if (E >= 0) emoteArms(E, x, y, et, skin, shirt);
  if (wid && wid !== 'none') {
    if (wid === 'pick') drawMelee(x, y, ang, look.pick | 0, o.swing || 0, look.sab | 0);
    else { const g = GUN[wid] || [10, '#555']; fr('#222', x + Math.round(ca * 4) - 1, y - 2 + Math.round(sa * 4) - 1, 3, 3); pxLine(x + ca * 3, y - 2 + sa * 3, x + ca * g[0], y - 2 + sa * g[0], g[1], 2); if (wid === 'golden' && ((Date.now() / 140) | 0) % 7 === 0) fr('#fff', Math.round(x + ca * g[0]), Math.round(y - 3 + sa * g[0]), 1, 1); }
  }
  if (pose && pose.flip) c.restore();
  c.globalAlpha = 1; ctx = prev;
};

/* ---------- zombies and bosses ---------- */
const ZP = { walker: ['#6b8a4a', '#4a3a2a', '#3a5a2a'], runner: ['#8aa05a', '#5a3a2a', '#4a6a30'], fatty: ['#7a8a5a', '#6a4a3a', '#5a6a40'], spitter: ['#a3b83a', '#4a4a2a', '#7a9a2a'], bloater: ['#9a6a8a', '#6a3a5a', '#7a4a6a'] };
function drawZ(z, t) {
  const x = Math.round(z.x), y = Math.round(z.y), p = ZP[z.type] || ZP.walker, ca = Math.cos(z.ang), sa = Math.sin(z.ang);
  fr('rgba(0,0,0,.35)', x - z.r, y + 1, z.r * 2, 6);
  let skin = p[0], cl = p[1];
  if (z.fl & 2) skin = '#8fe8ff'; if (z.flash > 0) skin = '#fff';
  const w = z.type === 'fatty' ? 12 : z.type === 'bloater' ? 11 + Math.round(Math.sin(t * 6)) : 8, h = z.type === 'runner' ? 7 : 8;
  legs(x, y, z.ph, p[2]);
  fr(cl, x - w / 2, y - 4, w, h); fr(shade(cl, .75), x - w / 2, y - 4, w, 2);
  if (z.type === 'bloater') { fr('#c08ab0', x - 3, y - 1, 3, 3); fr('#c08ab0', x + 1, y + 1, 2, 2); }
  const hy = z.type === 'runner' ? y - 9 : y - 10; fr(skin, x - 3 + Math.round(ca * 1), hy, 6, 6);
  fr('#c00', x - 2 + Math.round(ca), hy + 2, 1, 1); fr('#c00', x + 1 + Math.round(ca), hy + 2, 1, 1);
  if (z.type === 'spitter') fr(p[2], x - 2, hy - 2, 4, 2);
  // arms reach toward facing
  const ax = Math.round(ca * 5), ay = Math.round(sa * 4); fr(skin, x + ax - 1, y - 3 + ay, 2, 2); fr(skin, x + Math.round(ca * 3) - 1 - Math.round(sa * 3), y - 3 + Math.round(sa * 2) + Math.round(ca * 3), 2, 2);
  if (z.fl & 1) { fr('#ff8a1a', x - 2, y - 14 + Math.round(Math.sin(t * 20)), 2, 3); fr('#ffd24a', x + 1, y - 13, 1, 2); }
  if (z.hpf < 1 && !z.boss) { fr('#000', x - 6, y - 14, 12, 2); fr(BLOODB, x - 6, y - 14, Math.max(1, 12 * z.hpf), 2); }
}
function drawBoss(z, t) {
  const B = BOSSES[z.type], s = B.scale, x = Math.round(z.x), y = Math.round(z.y), col = z.flash > 0 ? '#fff' : B.col, dk = shade(B.col, .6), lt = shade(B.col, 1.3);
  fr('rgba(0,0,0,.4)', x - B.r, y + B.r * .3, B.r * 2, B.r * .8);
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  const bob = Math.round(Math.sin(z.ph) * 1), face = Math.cos(z.ang) >= 0 ? 1 : -1;
  const F = (c, a, b, w, h) => fr(c, a, b, w, h);
  F(dk, -3, 2 + bob, 2, 3); F(dk, 1, 2 - bob, 2, 3);
  switch (z.type) {
    case 'brute': F(col, -5, -5, 10, 8); F(dk, -5, -5, 10, 2); F(lt, -7, -4, 2, 6); F(lt, 5, -4, 2, 6); F(col, -3, -9, 6, 5); F('#e8e2cf', -4, -10, 1, 3); F('#e8e2cf', 3, -10, 1, 3); F('#f33', -2, -7, 1, 1); F('#f33', 1, -7, 1, 1); if (z.ai.st === 'wind') F('#f33', -5, -6, 10, 1); break;
    case 'queen': F(col, -4, -4, 8, 8); F(dk, -4, 1, 8, 3); F(lt, -3, -9, 6, 5); F('#ffd24a', -3, -11, 1, 2); F('#ffd24a', -1, -12, 2, 3); F('#ffd24a', 2, -11, 1, 2); F('#ff0', -2, -7, 1, 1); F('#ff0', 1, -7, 1, 1); F(lt, -7, -2 + Math.round(Math.sin(t * 5)), 3, 1); F(lt, 4, -2 + Math.round(Math.cos(t * 5)), 3, 1); break;
    case 'necro': F('#2a1a3a', -4, -5, 8, 9); F('#3a2a4a', -4, -5, 8, 2); F(col, -3, -9, 6, 5); F('#2a1a3a', -4, -10, 8, 2); F('#b6f', -2, -7, 1, 1); F('#b6f', 1, -7, 1, 1); F('#6b4a2a', 6 * face, -8, 1, 12); F('#b6f', 6 * face - 1, -10, 3, 3); break;
    case 'jugg': F(z.armor ? '#6b7480' : '#7a3a3a', -5, -5, 10, 9); F(z.armor ? '#98a2ae' : '#a85a5a', -5, -5, 10, 2); F(z.armor ? '#4a5058' : '#5a2a2a', -6, -3, 2, 6); F(z.armor ? '#4a5058' : '#5a2a2a', 4, -3, 2, 6); F('#4a5058', -3, -9, 6, 5); F('#f33', -2, -7, 4, 1); break;
    case 'bloat': F(col, -6, -6, 12, 11); F(dk, -6, 2, 12, 3); F(lt, -4, -5, 4, 3); F('#c0d060', 2, 0, 2, 2); F('#c0d060', -5, 1, 2, 2); F(col, -3, -9, 6, 4); F('#a00', -2, -8, 1, 1); F('#a00', 1, -8, 1, 1); break;
  }
  if (z.flash > 0) F('rgba(255,255,255,.5)', -7, -10, 14, 16);
  ctx.restore();
  if (z.fl & 1) fr('#ff8a1a', x - 3, y - B.r * 2 - 3, 3, 4);
}

/* ---------- fx ---------- */
const Fx = R.fx = { parts: [], tracers: [], texts: [], rings: [], bolts: [], decals: [], di: 0, shake: 0, hurt: 0, flash: 0 };
function part(x, y, a, sp, life, col, sz, g) { Fx.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, l: life, ml: life, c: col, s: sz || 1, g: g || 0 }); }
function decal(x, y, c, s) { const d = { x, y, c, s }; if (Fx.decals.length < 700) Fx.decals.push(d); else { Fx.decals[Fx.di] = d; Fx.di = (Fx.di + 1) % 700; } }
function splat(x, y, n, sp) { for (let i = 0; i < n; i++) decal(x + PD.rnd(-sp, sp), y + PD.rnd(-sp, sp), Math.random() < .7 ? '#5a0a0f' : '#7d1017', 1 + ((Math.random() * 2) | 0)); }
const TRC = { m1911: '#ffe9a0', revolver: '#ffd070', pump: '#ffc060', smg: '#ffe9a0', ak: '#ffd890', sniper: '#fff', minigun: '#ffb060', rail: '#7fd0ff', turret: '#cfd6da', golden: '#ffd24a', crossbow: '#e8dcc0', aa12: '#ffc060', leech: '#ff5a7a', laser: '#ff4a6a' };
R.handle = function (e, view) {
  const me = view.players.find(p => p.id === view.meId);
  switch (e.t) {
    case 'shot': Fx.tracers.push({ x: e.x, y: e.y, a: e.a, l: e.l, life: e.w === 'rail' ? .25 : .06, ml: e.w === 'rail' ? .25 : .06, c: TRC[e.w] || '#ffe9a0', w: e.w === 'rail' ? 3 : e.w === 'sniper' ? 2 : 1 });
      for (let i = 0; i < 2; i++) part(e.x + Math.cos(e.a) * 6, e.y + Math.sin(e.a) * 6, e.a + PD.rnd(-.5, .5), PD.rnd(40, 120), .08, '#ffd070', 1);
      if (e.s === view.meId) Fx.shake = Math.max(Fx.shake, e.w === 'sniper' || e.w === 'revolver' || e.w === 'rail' ? 3 : .8); break;
    case 'hit': for (let i = 0; i < 4; i++) part(e.x, e.y, e.a + PD.rnd(-.7, .7), PD.rnd(30, 100), .35, i & 1 ? '#8a0f16' : '#c0202a', 1, 0); if (Math.random() < .5) splat(e.x, e.y, 2, 4); break;
    case 'kill': splat(e.x, e.y, e.b ? 40 : 14, e.b ? 22 : 8); for (let i = 0; i < (e.b ? 24 : 8); i++) part(e.x, e.y, Math.random() * 6.28, PD.rnd(20, 90), .5, '#7d1017', 2); if (e.b) { Fx.shake = 8; Fx.rings.push({ x: e.x, y: e.y, r: 4, mr: 60, l: .6, ml: .6, c: '#ff3b3b' }); } break;
    case 'boom': Fx.rings.push({ x: e.x, y: e.y, r: 4, mr: e.r, l: .35, ml: .35, c: '#ffb04a' }); for (let i = 0; i < Math.min(30, e.r / 2); i++) part(e.x, e.y, Math.random() * 6.28, PD.rnd(20, e.r * 2.2), PD.rnd(.2, .5), Math.random() < .5 ? '#ff8a1a' : '#ffd24a', 2);
      if (me) Fx.shake = Math.max(Fx.shake, Math.min(8, e.r / 14 * Math.max(0, 1 - PD.dist(e.x, e.y, me.x, me.y) / 300))); break;
    case 'flame': for (let i = 0; i < 3; i++) part(e.x, e.y, e.a + PD.rnd(-.3, .3), PD.rnd(90, 150), PD.rnd(.15, .3), e.c ? (Math.random() < .5 ? '#8fe8ff' : '#e8fbff') : (Math.random() < .5 ? '#ff8a1a' : '#ffd24a'), 2); break;
    case 'zap': Fx.bolts.push({ p: e.p, l: .1 }); break;
    case 'spark': for (let i = 0; i < 5; i++) part(e.x, e.y, Math.random() * 6.28, PD.rnd(20, 70), .25, '#cfd6da', 1); break;
    case 'swing': break;
    case 'brk': { const wd = e.c === 13 || e.c === 4 || e.c === 10; const am = e.c === 15; for (let i = 0; i < 9; i++) part(e.x, e.y, Math.random() * 6.28, PD.rnd(20, 80), PD.rnd(.25, .5), am ? (i & 1 ? '#46592f' : '#d9b100') : wd ? (i & 1 ? '#8a6234' : '#5a3d20') : (i & 1 ? '#8a8f96' : '#5a5d62'), 2, 60); break; }
    case 'txt': Fx.texts.push({ x: e.x, y: e.y, s: e.s, c: e.c || BONE, l: 1.1 }); break;
    case 'pu': Fx.rings.push({ x: e.x, y: e.y, r: 4, mr: 28, l: .4, ml: .4, c: '#ffd24a' }); break;
    case 'tp': Fx.rings.push({ x: e.x, y: e.y, r: 20, mr: 2, l: .4, ml: .4, c: '#b48cff' }); break;
    case 'hurt': if (e.id === view.meId) { Fx.hurt = .35; Fx.shake = Math.max(Fx.shake, 3); } break;
  }
};
R.update = function (dt, view) {
  for (const e of view.ev || []) R.handle(e, view);
  for (const p of Fx.parts) { p.l -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .93; p.vy *= .93; }
  Fx.parts = Fx.parts.filter(p => p.l > 0);
  for (const t of Fx.tracers) t.life -= dt; Fx.tracers = Fx.tracers.filter(t => t.life > 0);
  for (const t of Fx.texts) { t.l -= dt; t.y -= 14 * dt; } Fx.texts = Fx.texts.filter(t => t.l > 0);
  for (const r of Fx.rings) r.l -= dt; Fx.rings = Fx.rings.filter(r => r.l > 0);
  for (const b of Fx.bolts) b.l -= dt; Fx.bolts = Fx.bolts.filter(b => b.l > 0);
  Fx.shake = Math.max(0, Fx.shake - dt * 14); Fx.hurt = Math.max(0, Fx.hurt - dt);
};
R.syncView = function () { VW = PD.VW; VH = PD.VH; };
R.reset = function () { Fx.parts = []; Fx.tracers = []; Fx.texts = []; Fx.rings = []; Fx.bolts = []; Fx.decals = []; Fx.di = 0; Fx.shake = 0; Fx.hurt = 0; };

/* ---------- lighting ---------- */
let vig = null, vigK = 0, vigW = 0;
function vignette(k) {
  if (vig && vigK === k && vigW === VW) return vig; vigK = k; vigW = VW; vig = document.createElement('canvas'); vig.width = VW * 2; vig.height = VH * 2;
  const g = vig.getContext('2d'), gr = g.createRadialGradient(VW, VH, 40 * k, VW, VH, 260 * k);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.72)'); g.fillStyle = gr; g.fillRect(0, 0, VW * 2, VH * 2); return vig;
}

/* ---------- main draw ---------- */
const PUCH = k => PUDEF[k] || { col: '#fff', ch: '?' };
function drawPickup(k, t) {
  const [kind, id] = k.kind.split(':'), x = Math.round(k.x), y = Math.round(k.y + Math.sin(t * 4 + k.id) * 1.5);
  if (k.life < 5 && ((t * 6) | 0) % 2) return;
  if (kind === 'pu') { const d = PUCH(id); fr('rgba(0,0,0,.4)', x - 5, y + 5, 10, 3); fr(d.col, x - 6, y - 6, 12, 12); fr('#111', x - 5, y - 5, 10, 10); txt(d.ch, x, y - 4, d.col, 'center', 8); }
  else { fr('rgba(0,0,0,.4)', x - 7, y + 4, 14, 3); fr('#ffd24a', x - 8, y - 5, 16, 10); fr('#222', x - 7, y - 4, 14, 8); const g = GUN[id] || [10, '#888']; fr(g[1], x - 5, y - 1, Math.min(11, g[0] - 1), 2); fr('#8a6234', x - 5, y + 1, 3, 2); }
}
function drawProj(q) {
  const x = Math.round(q.x), y = Math.round(q.y);
  if (q.kind === 'rpg') { fr('#8a8a8a', x - 2, y - 1, 4, 2); fr('#ff8a1a', x - 4 - Math.round(q.vx / 80), y - 1, 2, 2); }
  else if (q.kind === 'gl') { fr('#333', x - 2, y - 2, 4, 4); fr('#7fa650', x - 1, y - 1, 2, 2); }
  else { fr('#7fe0ff', x - 2, y - 2, 4, 4); fr('#fff', x - 1, y - 1, 2, 2); }
}
function drawEProj(q) { const c = q.kind === 'acid' ? '#9be03a' : q.kind === 'skull' ? '#b48cff' : '#ffd24a'; fr(c, Math.round(q.x) - q.r, Math.round(q.y) - q.r, q.r * 2, q.r * 2); fr('#fff', Math.round(q.x), Math.round(q.y), 1, 1); }

/* ---------- the hunt: a scrap of paper on the ground, and the note you read with E ---------- */
function drawNote(c, t) {
  const x = Math.round(c.x), y = Math.round(c.y), found = PD.Hunt.hasFound(c.code);
  fr('rgba(0,0,0,.35)', x - 4, y + 3, 9, 3);
  fr(found ? '#b8ad8c' : '#e8dcc0', x - 3, y - 3, 6, 7); fr(found ? '#8a7f62' : '#a89870', x - 2, y - 1, 4, 1); fr(found ? '#8a7f62' : '#a89870', x - 2, y + 1, 3, 1);
  if (!found && (((t * 1.4 + c.i * .37) % 3.2) < .22)) { fr('#fff', x + 3, y - 5, 1, 3); fr('#fff', x + 2, y - 4, 3, 1); }     // a faint glint every few seconds
}
function drawNotePanel(code) {
  const p = PD.Hunt.byCode[code]; if (!p) return;
  const lines = p.keyLines.concat([''], p.bodyLines), big = p.bodyLines.every(l => tw(l, 16) <= VW - 56);
  let w = 0; p.keyLines.forEach(l => w = Math.max(w, tw(l))); p.bodyLines.forEach(l => w = Math.max(w, tw(l, big ? 16 : 8))); w = Math.max(w, tw('E: CLOSE'), tw('SAVED TO YOUR CODES TAB')) + 20;
  const bh = p.bodyLines.length * (big ? 18 : 10), h = 14 + p.keyLines.length * 10 + 8 + bh + 8 + 22, x = Math.round((VW - w) / 2), y = 34;
  fr('#000', x - 2, y - 2, w + 4, h + 4); fr('#2a2418', x, y, w, h); fr('#c8b27a', x, y, w, 1); fr('#c8b27a', x, y + h - 1, w, 1); fr('#c8b27a', x, y, 1, h); fr('#c8b27a', x + w - 1, y, 1, h);
  txt('A SCRAP OF PAPER', VW / 2, y + 5, '#c8b27a', 'center', 8);
  let ly = y + 18; p.keyLines.forEach(l => { txt(l, VW / 2, ly, '#e8dcc0', 'center', 8); ly += 10; }); ly += 8;
  p.bodyLines.forEach(l => { txt(l, VW / 2, ly, '#ffd24a', 'center', big ? 16 : 8); ly += big ? 18 : 10; });
  txt('SAVED TO YOUR CODES TAB', VW / 2, y + h - 22, '#8a867a', 'center', 8); txt('E: CLOSE', VW / 2, y + h - 12, '#8a867a', 'center', 8);
}

R.draw = function (c, view, ui) {
  ctx = c; ctx.imageSmoothingEnabled = false; const m = view.map, t = view.t, me = view.players.find(p => p.id === view.meId);
  let fp = me; if (me && !(view.flag(me) & 1)) fp = view.players.find(p => view.flag(p) & 1) || me;
  const fx = fp ? fp.x : m.W / 2, fy = fp ? fp.y : m.H / 2;
  let cx = PD.clamp(Math.round(fx - VW / 2), 0, Math.max(0, m.W - VW)), cy = PD.clamp(Math.round(fy - VH / 2), 0, Math.max(0, m.H - VH));
  R.cam.x = cx; R.cam.y = cy; const sh = Fx.shake; if (sh > .1) { cx += Math.round(PD.rnd(-sh, sh)); cy += Math.round(PD.rnd(-sh, sh)); }
  fr('#000', 0, 0, PD.CW, PD.CH);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, VW, VH); ctx.clip(); ctx.translate(-cx, -cy);
  if (m.bg) ctx.drawImage(m.bg, cx, cy, VW, VH, cx, cy, VW, VH);
  const inV = (x, y, r) => x > cx - r && x < cx + VW + r && y > cy - r && y < cy + VH + r;
  for (const d of Fx.decals) if (inV(d.x, d.y, 4)) fr(d.c, Math.round(d.x), Math.round(d.y), d.s, d.s);
  for (const b of m.wallbuys) if (inV(b.x, b.y, 16)) { const wy = b.down ? b.y + 7 : b.y - 17, own = me && me.weapons && false; fr('#111', b.x - 9, wy, 18, 8); fr('#ffd24a', b.x - 9, wy, 18, 1); const g = GUN[b.id] || [10, '#888']; fr(g[1], b.x - 6, wy + 3, Math.min(12, g[0] - 2), 2); txt(String(WDEF[b.id].cost), b.x, wy - 10, '#ffd24a', 'center', 8); }
  for (const b of m.boxes) if (inV(b.x, b.y, 16)) { fr('rgba(0,0,0,.4)', b.x - 8, b.y + 4, 16, 4); fr('#3b2a6a', b.x - 8, b.y - 6, 16, 11); fr('#6a4ab0', b.x - 7, b.y - 5, 14, 3); fr('#ffd24a', b.x - 1, b.y - 3, 2, 4); txt('?', b.x + 1, b.y - 6, '#fff', 'center', 8); }
  if (PD.Hunt) for (const c of PD.Hunt.cluesFor(m)) if (inV(c.x, c.y, 12)) drawNote(c, t);
  for (const b of view.blocks || []) {
    const x0 = b.x * T, y0 = b.y * T; if (!inV(x0, y0, 16)) continue; const dm = 1 - b.f;
    if (dm > .2) { fr('rgba(0,0,0,.55)', x0 + 4, y0 + 3, 1, 5); fr('rgba(0,0,0,.55)', x0 + 5, y0 + 7, 3, 1); }
    if (dm > .5) { fr('rgba(0,0,0,.55)', x0 + 10, y0 + 2, 1, 6); fr('rgba(0,0,0,.55)', x0 + 8, y0 + 8, 3, 1); fr('rgba(0,0,0,.55)', x0 + 11, y0 + 9, 1, 4); }
    if (dm > .75) { fr('rgba(0,0,0,.6)', x0 + 2, y0 + 11, 8, 1); fr('rgba(0,0,0,.6)', x0 + 6, y0 + 9, 1, 5); fr('rgba(0,0,0,.35)', x0, y0, T, T); }
    fr('#000', x0 + 1, y0 - 3, 14, 3); fr(b.f > .5 ? '#7be26a' : b.f > .25 ? '#ffd24a' : '#e0242d', x0 + 2, y0 - 2, Math.max(1, Math.round(12 * b.f)), 1);
  }
  if (view.h && view.h.bm && me && (view.flag(me) & 1) && ui.mouse && !ui.noCursor) drawGhost(view, me, ui);
  for (const cl of view.clouds) if (inV(cl.x, cl.y, cl.r)) { ctx.globalAlpha = Math.min(.45, cl.life / 3 * .45); ctx.fillStyle = '#7ab030'; ctx.beginPath(); ctx.arc(cl.x, cl.y, cl.r, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1; }
  for (const k of view.pickups) if (inV(k.x, k.y, 12)) drawPickup(k, t);
  for (const tu of view.turrets) { const x = Math.round(tu.x), y = Math.round(tu.y); fr('#444', x - 4, y - 3, 8, 6); fr('#888', x - 3, y - 4, 6, 2); pxLine(x, y - 1, x + Math.cos(tu.ang) * 8, y - 1 + Math.sin(tu.ang) * 8, '#cfd6da', 2); }
  const ents = [];
  for (const z of view.zs) if (inV(z.x, z.y, 40)) ents.push({ y: z.y, z });
  for (const p of view.players) if (inV(p.x, p.y, 20) && (view.flag(p) & 1)) ents.push({ y: p.y, p });
  ents.sort((a, b) => a.y - b.y);
  for (const e of ents) {
    if (e.z) { if (e.z.boss) drawBoss(e.z, t); else drawZ(e.z, t); }
    else {
      const p = e.p, f = view.flag(p), mine = p.id === view.meId; if ((f & 2) && !mine) continue;
      const w = p.weapons ? p.weapons[p.cur] : null;
      if (f & 8) { ctx.strokeStyle = 'rgba(127,166,255,.7)'; ctx.beginPath(); ctx.arc(Math.round(p.x), Math.round(p.y) - 3, 10, 0, 6.3); ctx.stroke(); }
      if ((f & 32) && ((t * 10) | 0) % 2) ctx.globalAlpha = .4; else if ((f & 64) && !mine) ctx.globalAlpha = .5;
      PD.drawChar(ctx, p.x, p.y, p.ang, p.look, p.ph, w ? w.id : p.wid, { cloak: f & 2, seek: f & 4, swing: p.swing, em: p.em | 0, t: t }); ctx.globalAlpha = 1;
      if (!(f & 64) || mine) txt(p.name, p.x, p.y - 24, mine ? '#fff' : (f & 4) ? '#ff6a5a' : '#ffd24a', 'center', 8);
    }
  }
  for (const q of view.projs) drawProj(q); for (const q of view.eprojs) drawEProj(q);
  for (const tr of Fx.tracers) { ctx.globalAlpha = tr.life / tr.ml; pxLine(tr.x, tr.y, tr.x + Math.cos(tr.a) * tr.l, tr.y + Math.sin(tr.a) * tr.l, tr.c, tr.w); } ctx.globalAlpha = 1;
  for (const b of Fx.bolts) { ctx.globalAlpha = Math.min(1, b.l * 12); for (let i = 1; i < b.p.length; i++) { const a = b.p[i - 1], d = b.p[i], mx = (a[0] + d[0]) / 2 + PD.rnd(-5, 5), my = (a[1] + d[1]) / 2 + PD.rnd(-5, 5); pxLine(a[0], a[1], mx, my, '#bff4ff', 1); pxLine(mx, my, d[0], d[1], '#fff', 1); } } ctx.globalAlpha = 1;
  for (const p of Fx.parts) { ctx.globalAlpha = Math.min(1, p.l / p.ml * 1.5); fr(p.c, Math.round(p.x), Math.round(p.y), p.s, p.s); } ctx.globalAlpha = 1;
  for (const r of Fx.rings) { const k = 1 - r.l / r.ml; ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(r.x, r.y, r.r + (r.mr - r.r) * k, 0, 6.3); ctx.stroke(); } ctx.globalAlpha = 1; ctx.lineWidth = 1;
  for (const tx of Fx.texts) txt(tx.s, tx.x, tx.y, tx.c, 'center', 8);
  ctx.restore();
  if (fp) ctx.drawImage(vignette(ui.tight ? .6 : 1), Math.round(fp.x - cx) - VW, Math.round(fp.y - cy) - VH);
  if (Fx.hurt > 0) { ctx.fillStyle = 'rgba(180,10,20,' + (Fx.hurt * .8) + ')'; ctx.fillRect(0, 0, VW, VH); }
  if (ui.frozen) { ctx.fillStyle = 'rgba(120,220,255,.12)'; ctx.fillRect(0, 0, VW, VH); }
  if (view.g && view.g.sn > 0) { ctx.fillStyle = 'rgba(255,50,40,' + (.07 + .03 * Math.sin(t * 14)) + ')'; ctx.fillRect(0, 0, VW, VH); }
  drawMini(view, me || fp); drawHUD(view, ui, me); drawChat(ui); drawPing(ui); if (ui.wheel) drawWheel(ui.wheel);
  if (PD.Hunt && me) {
    const alive = !!(view.flag(me) & 1); PD.Hunt.update(m, me.x, me.y, alive);
    if (PD.Hunt.reading) drawNotePanel(PD.Hunt.reading.code);
    else if (alive && !ui.noCursor && PD.Hunt.near(m, me.x, me.y)) txt('E: READ NOTE', VW / 2, VH - 52, '#ffd24a', 'center', 8);
  }
  if (view.g && view.g.m === 'hide' && view.g.ph === 'hide' && view.h && view.h.seek) drawBlind(view);
  if (ui.showMap) drawBigMap(view, me || fp);
  if (ui.showScore) drawScore(view);
  if (ui.mouse && !ui.noCursor) { const x = Math.round(ui.mouse.x), y = Math.round(ui.mouse.y); fr('#e8e2cf', x - 5, y, 3, 1); fr('#e8e2cf', x + 3, y, 3, 1); fr('#e8e2cf', x, y - 5, 1, 3); fr('#e8e2cf', x, y + 3, 1, 3); }
};

/* ---------- build ghost ---------- */
function drawGhost(view, me, ui) {
  const m = view.map, h = view.h, B = PD.BLOCKS[h.bs | 0] || PD.BLOCKS[0], mwx = R.cam.x + ui.mouse.x, mwy = R.cam.y + ui.mouse.y;
  const tg = PD.buildTarget(me.x, me.y, mwx, mwy), ents = [];
  for (const p of view.players) if (view.flag(p) & 1) ents.push(p); for (const z of view.zs) ents.push(z);
  const bad = PD.buildCheck(m, tg.tx, tg.ty, ents), poor = (h.mt ? h.mt[h.bs | 0] : 0) < B.cost, ok = !bad && !poor, x0 = tg.tx * T, y0 = tg.ty * T;
  ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.beginPath(); ctx.arc(Math.round(me.x), Math.round(me.y), PD.BUILD.REACH, 0, 6.3); ctx.stroke();
  ctx.globalAlpha = .5; fr(ok ? B.col : '#e0242d', x0, y0, T, T); ctx.globalAlpha = 1;
  ctx.strokeStyle = ok ? '#7be26a' : '#ff5a4a'; ctx.lineWidth = 1; ctx.strokeRect(x0 + .5, y0 + .5, T - 1, T - 1);
}
function drawBuildBar(h) {
  const cx = VW / 2, y = VH - 36, w = 96;
  PD.BLOCKS.forEach((B, i) => {
    const x = cx - w - 2 + i * (w + 4), on = (h.bs | 0) === i, have = h.mt ? h.mt[i] : 0, can = have >= B.cost;
    fr(on ? '#3a2a0c' : '#16181b', x, y, w, 24); fr(on ? '#ffd24a' : '#2a2d31', x, y, w, 1);
    fr(B.col, x + 4, y + 5, 10, 10); fr('rgba(0,0,0,.35)', x + 4, y + 12, 10, 3);
    txt((i + 1) + ' ' + B.name, x + 18, y + 3, on ? BONE : '#8a867a', 'left', 8); txt('COST ' + B.cost + '  HAVE ' + have, x + 4, y + 14, can ? '#7be26a' : BLOODB, 'left', 8);
  });
  txt('BUILD MODE   CLICK PLACE   RIGHT CLICK REMOVE   B EXIT', cx, y - 11, '#ffd24a', 'center', 8);
}

/* ---------- HUD ---------- */
function heart(x, y, big, col) { const p = big ? [[1, 0], [2, 0], [4, 0], [5, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [2, 4], [3, 4], [4, 4], [3, 5]] : []; for (const q of p) fr(col, x + q[0] * 2, y + q[1] * 2, 2, 2); }
function drawHUD(view, ui, me) {
  const h = view.h, g = view.g, y0 = VH, mode = g.m, pvp = mode === 'pvp', hide = mode === 'hide', t = view.t;
  fr('#0b0c0e', 0, y0, PD.CW, PD.HUD); fr('#2a2d31', 0, y0, PD.CW, 1);
  if (h) {
    const x0 = 6;
    if (hide) {
      const lab = h.seek ? 'SEEKER' : 'HIDER'; txt(lab, x0, y0 + 4, h.seek ? '#ff6a5a' : '#7be26a', 'left', 8);
      const info = g.ph === 'hide' ? (h.seek ? 'FROZEN ' : 'HIDE ') + Math.ceil(g.pt) + 'S' : mmss(g.tl) + ' LEFT'; txt(info, x0 + tw(lab) + 10, y0 + 4, g.ph === 'hide' ? '#ffd24a' : ROT, 'left', 8);
      fr('#222', x0, y0 + 17, 120, 6); fr(h.stun > 0 ? '#ff6a5a' : '#e8e2cf', x0, y0 + 17, 120 * Math.max(0, Math.min(1, h.stam / 100)), 6);
      txt(h.stun > 0 ? 'STUNNED' : 'SPRINT', x0, y0 + 24, h.stun > 0 ? '#ff6a5a' : '#6a6e75', 'left', 8);
      txt('HIDERS ' + g.hd, VW / 2, y0 + 4, '#7be26a', 'center', 8); txt('SEEKERS ' + g.sk, VW / 2, y0 + 16, '#ff6a5a', 'center', 8);
    } else {
      let lab, val;
      if (pvp) { lab = 'KILLS '; val = h.k + '/' + g.lim; } else { lab = mode === 'arena' ? 'WAVE ' : 'ROUND '; val = String(g.r); }
      txt(lab, x0, y0 + 4, BLOODB, 'left', 8); const lw = tw(lab); txt(val, x0 + lw, y0 + 4, BLOODB, 'left', 8);
      if (pvp) txt(mmss(g.tl), x0 + lw + tw(val) + 8, y0 + 4, ROT, 'left', 8); else txt(g.it > 0 ? 'NEXT ' + g.it.toFixed(0) + 'S' : g.lf + ' LEFT', x0 + lw + tw(val) + 8, y0 + 4, ROT, 'left', 8);
      txt('$' + Math.floor(h.pts), VW / 2, y0 + 4, '#ffd24a', 'center', 8);
      if (h.mt) { const mx = VW / 2 - 24; fr('#8a6234', mx, y0 + 17, 6, 6); fr('#5a3d20', mx, y0 + 21, 6, 2); txt(h.mt[0], mx + 9, y0 + 16, h.mt[0] ? BONE : '#6a6e75', 'left', 8); fr('#8a8f96', mx + 32, y0 + 17, 6, 6); fr('#5a5d62', mx + 32, y0 + 21, 6, 2); txt(h.mt[1], mx + 41, y0 + 16, h.mt[1] ? BONE : '#6a6e75', 'left', 8); }
      if (h.bm && h.al) drawBuildBar(h);
      if (h.cb > 1) txt('COMBO X' + h.cb, VW / 2, y0 - 24, '#ff9a3b', 'center', 8);
      fr('#222', x0, y0 + 17, 120, 6); fr(h.hp < 35 ? BLOODB : '#3fae4a', x0, y0 + 17, 120 * Math.max(0, h.hp / h.mh), 6); if (h.sh > 0) fr('#7fa6ff', x0, y0 + 17, 120 * Math.min(1, h.sh / 50), 2);
      fr('#222', x0, y0 + 25, 120, 3); fr('#e8e2cf', x0, y0 + 25, 120 * h.stam / 100, 3);
    }
    let px = 134; const pus = [];
    for (const k in h.pu) if (h.pu[k] > 0) pus.push([k, h.pu[k]]); for (const k in g.pu) if (g.pu[k] > 0) pus.push([k, g.pu[k]]);
    for (const [k, v] of pus) { const d = PUCH(k); fr(d.col, px, y0 + 16, 12, 12); fr('#111', px + 1, y0 + 17, 10, 10); txt(d.ch, px + 7, y0 + 18, d.col, 'center', 8); fr('#000', px, y0 + 29, 12, 2); fr(d.col, px, y0 + 29, Math.max(1, Math.min(12, 12 * v / (d.dur || 20))), 2); px += 15; }
    if (hide) {
      let rx = PD.CW - 8;
      if (h.seek) { const rdy = h.ab > 0 ? '' : 'F SCAN'; const ready = !(h.ab > 0); txt(ready ? 'F  SCAN READY' : 'SCAN ' + Math.ceil(h.ab) + 'S', rx, y0 + 6, ready ? '#ffd24a' : '#8a867a', 'right', 8); fr('#222', rx - 90, y0 + 20, 90, 5); fr(ready ? '#ffd24a' : '#7a5a2a', rx - 90, y0 + 20, 90 * (ready ? 1 : 1 - h.ab / 25), 5); }
      else { const near = h.hb < 600, rate = near ? 1.5 + Math.max(0, (400 - h.hb) / 400) * 5 : 0, beat = near && ((t * rate) % 1) < .22, col = h.hb < 150 ? BLOODB : h.hb < 300 ? '#d0603a' : '#6a3a3a'; if (near) heart(rx - 14 - (beat ? 1 : 0), y0 + 6 - (beat ? 1 : 0), 1, col); txt(near ? (h.hb < 150 ? 'SEEKER CLOSE' : 'SEEKER NEAR') : 'ALL CLEAR', rx - 20, y0 + 20, near ? col : '#5a7a5a', 'right', 8); }
      if (h.sh > 0) txt('SHIELD', VW / 2, VH - 22, '#7fa6ff', 'center', 8);
    } else {
      let wx = PD.CW - 6; for (let i = h.w.length - 1; i >= 0; i--) {
        const [id, mag, res] = h.w[i], d = WDEF[id], cur = i === h.cur; const wdt = 72; wx -= wdt; fr(cur ? '#3a0f12' : '#16181b', wx, y0 + 3, wdt - 3, 26); if (cur) fr(BLOODB, wx, y0 + 3, wdt - 3, 1);
        txt((i + 1) + ' ' + d.name, wx + 3, y0 + 4, cur ? BONE : '#8a867a', 'left', 8);
        const mel = d.kind === 'melee', mm = mel ? 'INFINITE' : mag + '/' + res; txt(mm, wx + 3, y0 + 16, !mel && mag === 0 ? BLOODB : cur ? '#ffd24a' : '#8a867a', 'left', 8);
      }
      const cw = h.w[h.cur]; if (cw && h.rl > 0) { const mx = ui.mouse ? ui.mouse.x : VW / 2, my = ui.mouse ? ui.mouse.y : VH / 2, tot = WDEF[cw[0]].reload; fr('#000', mx - 10, my + 9, 20, 3); fr('#ffd24a', mx - 9, my + 10, 18 * (1 - h.rl / tot), 1); }
    }
    if (h.np) txt(h.np, VW / 2, VH - 40, '#ffd24a', 'center', 8);
    if (!h.al) {
      if (pvp) { txt('YOU ARE DOWN', VW / 2, 100, BLOODB, 'center', 16); txt('RESPAWN IN ' + Math.max(1, Math.ceil(h.rs || 0)), VW / 2, 122, BONE, 'center', 8); }
      else if (!hide) txt('YOU ARE DOWN', VW / 2, 110, BLOODB, 'center', 16);
    }
  }
  // top centre: boss bar, or the match clock
  if (g.bs) { const [n, hp, mh] = g.bs, w = 220, x = VW / 2 - w / 2; fr('#000', x - 2, 6, w + 4, 12); fr('#3a0508', x, 8, w, 8); fr(BLOODB, x, 8, w * Math.max(0, hp / mh), 8); txt(n, VW / 2, 19, '#fff', 'center', 8); }
  else if (pvp) { const sc = (g.sc || []).slice().sort((a, b) => (b[1] - a[1]) || (b[3] - a[3])), top = sc[0], p = top && view.players.find(q => q.id === top[0]); const s1 = 'TIME ' + mmss(g.tl) + (top ? '   LEAD ' + ((p ? p.name : top[0]).slice(0, 10)).toUpperCase() + ' ' + top[1] : ''); fr('rgba(0,0,0,.45)', VW / 2 - tw(s1) / 2 - 5, 4, tw(s1) + 10, 12); txt(s1, VW / 2, 6, BONE, 'center', 8); }
  else if (hide && g.ph === 'seek') { const s1 = mmss(g.tl); fr('rgba(0,0,0,.45)', VW / 2 - tw(s1) / 2 - 5, 4, tw(s1) + 10, 12); txt(s1, VW / 2, 6, g.tl < 30 ? BLOODB : BONE, 'center', 8); }
  let fy = 6; for (const f of ui.feed || []) { ctx.globalAlpha = Math.min(1, f.t); txt(f.s, 6, fy, BONE, 'left', 8); fy += 10; } ctx.globalAlpha = 1;
  if (ui.banner) { ctx.globalAlpha = Math.min(1, ui.banner.t * 2); txt(ui.banner.s, VW / 2, 70, ui.banner.c, 'center', 16); ctx.globalAlpha = 1; }
  if (mode === 'arena' && g.r > 0) txt('NEXT WAVE ' + Math.max(0, Math.ceil(g.wt)) + 'S', VW / 2, VH - 28, '#8a867a', 'center', 8);
}

/* ---------- minimap / map ---------- */
function markers(view, me, ox, oy, s, big) {
  const m = view.map;
  for (const k of view.pickups) { fr('#ffd24a', ox + k.x / T * s | 0, oy + k.y / T * s | 0, big ? 2 : 1, big ? 2 : 1); }
  if (big) for (const b of m.wallbuys) fr('#c08a3a', ox + b.x / T * s | 0, oy + b.y / T * s | 0, 2, 2);
  if (big) for (const b of m.boxes) fr('#9a6bd6', ox + b.x / T * s | 0, oy + b.y / T * s | 0, 3, 3);
  if (big && PD.Hunt) for (const c of PD.Hunt.cluesFor(m)) if (PD.Hunt.hasFound(c.code)) fr('#e8dcc0', ox + c.x / T * s - 1 | 0, oy + c.y / T * s - 1 | 0, 3, 3);
  const rad = big ? 1e9 : 450;
  for (const z of view.zs) { if (me && PD.dist(z.x, z.y, me.x, me.y) > rad) continue; if (z.boss) { const k = 3 + (((view.t * 4) | 0) % 2) * 2; fr('#ff3b3b', ox + z.x / T * s - k / 2 | 0, oy + z.y / T * s - k / 2 | 0, k, k); } else fr('#e0242d', ox + z.x / T * s | 0, oy + z.y / T * s | 0, 1, 1); }
  for (const p of view.players) { if (!(view.flag(p) & 1)) continue; const mine = p.id === view.meId; if ((view.flag(p) & 2) && !mine) continue; const sk = view.flag(p) & 4; if (mine && ((view.t * 3) | 0) % 2) continue; fr(mine ? '#fff' : sk ? '#ff5a4d' : '#5fd0ff', ox + p.x / T * s - 1 | 0, oy + p.y / T * s - 1 | 0, 3, 3); }
}
function drawMini(view, me) {
  const m = view.map; if (!m.mini || !me) return; const s = Math.min(110 / m.w, 80 / m.h), w = Math.round(m.w * s), h = Math.round(m.h * s), ox = VW - w - 4, oy = 4;
  fr('#000', ox - 2, oy - 2, w + 4, h + 4); ctx.globalAlpha = .85; ctx.drawImage(m.mini, 0, 0, m.w, m.h, ox, oy, w, h); ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.strokeRect(ox + R.cam.x / T * s + .5, oy + R.cam.y / T * s + .5, VW / T * s, VH / T * s);
  markers(view, me, ox, oy, s, false); txt('M MAP', ox + w, oy + h + 3, '#8a867a', 'right', 8);
}
function drawBigMap(view, me) {
  const m = view.map; if (!m.mini) return; fr('rgba(0,0,0,.82)', 0, 0, VW, VH);
  const s = Math.min((VW - 40) / m.w, (VH - 36) / m.h), w = Math.round(m.w * s), h = Math.round(m.h * s), ox = (VW - w) >> 1, oy = ((VH - h) >> 1) + 4;
  ctx.drawImage(m.mini, 0, 0, m.w, m.h, ox, oy, w, h); ctx.strokeStyle = '#8a867a'; ctx.strokeRect(ox - .5, oy - .5, w + 1, h + 1);
  markers(view, me, ox, oy, s, true); txt(view.g && view.g.m === 'hide' ? 'FULL MAP  (M TO CLOSE)' : 'FULL MAP  (M TO CLOSE)   PURPLE = MYSTERY BOX   ORANGE = WALL WEAPON', VW / 2, 6, '#e8e2cf', 'center', 8);
}
const kd = (k, d) => (k / Math.max(1, d)).toFixed(2);
PD.kd = kd;
function drawScore(view) {
  const g = view.g, pvp = g.m === 'pvp', hide = g.m === 'hide', sc = (g.sc || []).slice().sort((a, b) => pvp ? (b[1] - a[1]) || (b[3] - a[3]) : b[3] - a[3]);
  const w = hide ? 320 : 352, x = (VW - w) / 2, y = 56, rows = Math.min(sc.length, 12); fr('rgba(6,8,16,.9)', x, y, w, 26 + rows * 12); fr(BLOODB, x, y, w, 1);
  txt('NAME', x + 8, y + 6, '#8a867a', 'left', 8); txt(hide ? 'TAGS' : 'K', x + 190, y + 6, '#8a867a', 'right', 8); txt('D', x + 226, y + 6, '#8a867a', 'right', 8); if (!hide) txt('K/D', x + 276, y + 6, '#8a867a', 'right', 8); txt('SCORE', x + w - 8, y + 6, '#8a867a', 'right', 8);
  sc.slice(0, rows).forEach((r, i) => {
    const p = view.players.find(q => q.id === r[0]), me = r[0] === view.meId, yy = y + 20 + i * 12, nm = ((p ? p.name : r[0]) + (r[4] ? '' : ' (DOWN)')).slice(0, 18);
    txt(nm, x + 8, yy, me ? '#ffd24a' : r[5] ? '#ff6a5a' : BONE, 'left', 8); txt(r[1] + '', x + 190, yy, BONE, 'right', 8); txt(r[2] + '', x + 226, yy, BONE, 'right', 8); if (!hide) txt(kd(r[1], r[2]), x + 276, yy, '#c9c3ae', 'right', 8); txt(r[3] + '', x + w - 8, yy, BONE, 'right', 8);
  });
}
/* emote wheel (hold G): 8 slots on an ellipse around the middle of the view. R.wheelPick maps a canvas mouse position to a slot (-1 = middle = nothing) */
const WRX = 100, WRY = 60;
R.wheelPick = function (mx, my) {
  const dx = mx - VW / 2, dy = my - VH / 2; if (Math.hypot(dx, dy) < 16) return -1;
  let a = Math.atan2(dy / WRY, dx / WRX) + Math.PI / 2; if (a < 0) a += Math.PI * 2; return Math.round(a / (Math.PI / 4)) % 8;
};
function drawWheel(w) {
  const cx = VW / 2, cy = VH / 2; ctx.globalAlpha = .45; fr('#000', 0, 0, VW, VH); ctx.globalAlpha = 1;
  const ring = (rx, ry) => { for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; fr('rgba(255,255,255,.12)', Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1); } };
  ring(WRX * .45, WRY * .45); ring(WRX, WRY);
  for (let i = 0; i < 8; i++) {
    const E = PD.EMOTES[i], a = -Math.PI / 2 + i * Math.PI / 4, bx = Math.round(cx + Math.cos(a) * WRX), by = Math.round(cy + Math.sin(a) * WRY), bw = 64, bh = 14, on = w.sel === i, lock = !!(E.lock && !PD.Unlocks.has(E.lock));
    fr(on ? '#ffd24a' : '#000', bx - bw / 2 - 1, by - bh / 2 - 1, bw + 2, bh + 2); fr(on ? '#3a2e10' : lock ? '#15171c' : '#20242c', bx - bw / 2, by - bh / 2, bw, bh);
    txt(lock ? (i + 1) + ' ???' : (i + 1) + ' ' + E.name, bx, by - 4, on ? '#ffd24a' : lock ? '#5a5e66' : BONE, 'center', 8);
  }
  const sel = w.sel >= 0 ? PD.EMOTES[w.sel] : null;
  txt(sel ? (sel.lock && !PD.Unlocks.has(sel.lock) ? 'LOCKED' : 'RELEASE G OR CLICK TO PLAY ' + sel.name) : 'MOVE THE MOUSE OR PRESS 1-8', cx, cy + WRY + 16, '#c9c3ae', 'center', 8);
  txt('MOVING OR SHOOTING STOPS AN EMOTE', cx, cy + WRY + 27, '#8a867a', 'center', 8);
}
/* chat log, bottom left above the HUD: ui.chat = [{n, s, sys, a}] (a = alpha), newest last */
function drawChat(ui) {
  const L = ui.chat; if (!L || !L.length) return; const n = Math.min(L.length, ui.chatOpen ? 8 : 6), rows = L.slice(-n);
  for (let i = 0; i < n; i++) {
    const m = rows[i], y = VH - 12 - (n - 1 - i) * 10; let line = m.sys ? m.s : m.n + ': ' + m.s; const maxw = Math.min(VW - 120, 380);
    while (line.length > 4 && tw(line) > maxw) line = line.slice(0, -2);
    if (line !== (m.sys ? m.s : m.n + ': ' + m.s)) line += '..';
    ctx.globalAlpha = Math.max(0, Math.min(1, m.a == null ? 1 : m.a)) * .55; fr('#000', 4, y - 1, tw(line) + 4, 10);
    ctx.globalAlpha = Math.max(0, Math.min(1, m.a == null ? 1 : m.a));
    if (m.sys) txt(line, 6, y, '#ff9a3b', 'left', 8); else { const nw = tw(m.n + ': '); txt(m.n + ': ', 6, y, '#ffd24a', 'left', 8); txt(line.slice(m.n.length + 2), 6 + nw, y, BONE, 'left', 8); }
  }
  ctx.globalAlpha = 1;
}
/* client only: round trip time and whether the link is direct or through a relay */
function drawPing(ui) {
  if (ui.ping == null || ui.ping < 0) return; const via = ui.via === 'relay' ? '  RELAY' : ui.via === 'direct' ? '  DIRECT' : '', s = 'PING ' + Math.round(ui.ping) + via;
  txt(s, VW - 6, VH - 12, ui.ping > 150 ? '#ff6a5a' : ui.ping > 80 ? '#ffd24a' : '#6a8a6a', 'right', 8);
}
function drawBlind(view) {
  const g = view.g; fr('#000', 0, 0, VW, VH);
  txt('SEEKERS ARE COUNTING', VW / 2, VH / 2 - 22, BONE, 'center', 16); txt(Math.ceil(g.pt) + '', VW / 2, VH / 2 + 2, '#ff6a5a', 'center', 16);
  txt('YOU CAN MOVE ONCE THE HIDERS HAVE SCATTERED', VW / 2, VH / 2 + 28, '#8a867a', 'center', 8);
}
})(typeof window !== 'undefined' ? window : globalThis);
