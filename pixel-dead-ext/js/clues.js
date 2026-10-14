/* Pixel Dead v2 - clues.js : THE HUNT. Every redeem code (except the three secret ones) is the answer to a puzzle.
   The Codes tab shows hint 1 (where to look). A scrap of paper lies on that map at that spot: stand next to it, press E, read the note.
   The note is the code, written in a simple cipher with its key printed on the note. Nothing here touches the sim or the network:
   each player's game finds the notes on its own copy of the map (maps are built from the seed, so host and clients agree). */
(function (root) {
'use strict';
const PD = root.PD, T = PD.T;
const H = PD.Hunt = {};

/* ---------- where: eight compass anchors, as fractions of the map ---------- */
const ANCH = { NW: [.07, .10], N: [.5, .07], NE: [.93, .10], W: [.06, .5], E: [.94, .5], SW: [.07, .90], S: [.5, .93], SE: [.93, .90] };
const WORDS = { NW: 'far north-west corner', N: 'far north edge', NE: 'far north-east corner', W: 'far west edge', E: 'far east edge', SW: 'far south-west corner', S: 'far south edge', SE: 'far south-east corner' };
H.ANCHORS = ANCH;

/* ---------- ciphers (the note prints the key, so every note can be solved) ---------- */
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NATO = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL', 'INDIA', 'JULIET', 'KILO', 'LIMA', 'MIKE', 'NOVEMBER', 'OSCAR', 'PAPA', 'QUEBEC', 'ROMEO', 'SIERRA', 'TANGO', 'UNIFORM', 'VICTOR', 'WHISKEY', 'XRAY', 'YANKEE', 'ZULU'];
const NUM = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
const shift = (s, n) => s.replace(/[A-Z]/g, c => A[(A.indexOf(c) + n + 26) % 26]);
const FILL = 'XQZJKVW';
/* seeded shuffle used by the anagram cipher; always differs from the original */
function shuffled(s) {
  const a = s.split('');
  for (let salt = 1; salt < 50; salt++) {
    const r = PD.mulberry32(s.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) + salt * 977);
    const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = b[i]; b[i] = b[j]; b[j] = t; }
    if (b.join('') !== s) return b.join('');
  }
  return a.reverse().join('');
}
/* each cipher: enc(code, arg) -> { key: [lines], body: [lines] } ; dec(bodyLines, arg) -> code */
const C = {
  rev:     { enc: s => ({ key: ['READ IT FROM THE', 'WRONG END'], body: [s.split('').reverse().join('')] }), dec: b => b.join('').split('').reverse().join('') },
  shift:   { enc: (s, n) => ({ key: ['EACH LETTER WALKED ' + NUM[n] + ' STEP' + (n > 1 ? 'S' : ''), 'FORWARD IN THE ALPHABET'], body: [shift(s, n)] }), dec: (b, n) => shift(b.join(''), -n) },
  atbash:  { enc: s => ({ key: ['A IS Z. B IS Y.', 'THE ALPHABET RUNS BACKWARDS'], body: [s.replace(/[A-Z]/g, c => A[25 - A.indexOf(c)])] }), dec: b => b.join('').replace(/[A-Z]/g, c => A[25 - A.indexOf(c)]) },
  rot13:   { enc: s => ({ key: ['EACH LETTER WALKED', 'THIRTEEN STEPS ON'], body: [shift(s, 13)] }), dec: b => shift(b.join(''), 13) },
  a1z26:   { enc: s => ({ key: ['A IS 1. B IS 2.', 'AND SO ON'], body: [s.split('').map(c => A.indexOf(c) + 1).join(' ')] }), dec: b => b.join(' ').split(/\s+/).map(n => A[+n - 1]).join('') },
  nato:    { enc: s => { const w = s.split('').map(c => NATO[A.indexOf(c)]), body = []; for (let i = 0; i < w.length; i += 3) body.push(w.slice(i, i + 3).join(' ')); return { key: ['TAKE THE FIRST LETTER', 'OF EVERY WORD'], body }; }, dec: b => b.join(' ').split(/\s+/).map(w => w[0]).join('') },
  skip:    { enc: s => ({ key: ['ONLY EVERY OTHER LETTER', 'COUNTS. START AT THE FIRST'], body: [s.split('').map((c, i) => c + FILL[(c.charCodeAt(0) + i) % FILL.length]).join('')] }), dec: b => b.join('').split('').filter((c, i) => i % 2 === 0).join('') },
  shuffle: { enc: s => ({ key: ['THE LETTERS WERE SHAKEN UP.', 'PUT THEM BACK IN ORDER'], body: [shuffled(s)] }), dec: () => null },   // anagram: checked by letters (H.isAnagram)
};
H.CIPHERS = C;

/* ---------- the sixteen puzzles ---------- */
/* hint = the second sentence of hint 1 (the first sentence is built from map + anchor so it can never disagree with where the note really is) */
const P = [
  { code: 'DARTH',     map: 'town',   at: 'NW', c: 'atbash',  hint: 'The note reads like a reflection.' },
  { code: 'WIZARD',    map: 'town',   at: 'SE', c: 'shift',   n: 1, hint: 'A spell that is one step off.' },
  { code: 'PIRATE',    map: 'mid',    at: 'NE', c: 'rev',     hint: 'Treasure maps are read from the wrong end.' },
  { code: 'KNIGHT',    map: 'mid',    at: 'SW', c: 'shift',   n: 3, hint: 'Sealed with three steps of the alphabet.' },
  { code: 'SANTA',     map: 'block',  at: 'E',  w: 'far east end', c: 'a1z26',   hint: 'Numbers where the letters should be.' },
  { code: 'MIDAS',     map: 'block',  at: 'W',  w: 'far west end', c: 'nato',    hint: 'Left behind by a radio operator.' },
  { code: 'SPOOKY',    map: 'hide',   at: 'NE', c: 'skip',    hint: 'Half of it is noise.' },
  { code: 'GROOVE',    map: 'hide',   at: 'SW', c: 'rot13',   hint: 'Spin the alphabet halfway round.' },
  { code: 'DROP',      map: 'arena',  at: 'NW', c: 'shift',   n: 4, hint: 'Four steps along the alphabet.' },
  { code: 'SUMMIT',    map: 'arena',  at: 'SE', c: 'shuffle', hint: 'The letters got shaken up.' },
  { code: 'SPRINT',    map: 'arena2', at: 'N',  c: 'shift',   n: 5, hint: 'Five steps ahead of the truth.' },
  { code: 'JUNGLE',    map: 'arena2', at: 'S',  c: 'nato',    hint: 'Radio chatter in the sand.' },
  { code: 'VARSITY',   map: 'arena3', at: 'W',  c: 'a1z26',   hint: 'Scratched into the stone as numbers.' },
  { code: 'CAUTION',   map: 'arena3', at: 'E',  c: 'skip',    hint: 'Every other letter is a decoy.' },
  { code: 'SANDSTORM', map: 'arena4', at: 'N',  c: 'shift',   n: 2, hint: 'A whiteout of letters, two steps off.' },
  { code: 'COURT',     map: 'arena4', at: 'S',  c: 'shuffle', hint: 'Someone shuffled the letters.' },
];
/* codes that are NOT part of the hunt: the developer shortcuts */
H.SECRET = ['DEVELOPER', 'STREETWEAR', 'EVERYTHING'];
H.byCode = {};
P.forEach((p, i) => {
  p.i = i; p.where = p.w || WORDS[p.at]; p.mapName = PD.MAPS[p.map].name;
  const e = C[p.c].enc(p.code, p.n); p.keyLines = e.key; p.bodyLines = e.body;
  p.note = e.key.concat([''], e.body);
  p.hint1 = p.mapName + ', the ' + p.where + '. ' + p.hint;
  H.byCode[p.code] = p;
});
H.puzzles = P;
/* what a code gives, by menu tab (for "Unlocks: Head, Outfits") */
H.rewardTabs = code => {
  const c = PD.CODES[code]; if (!c) return [];
  const names = { head: 'Head', outfit: 'Outfits', street: 'Streetwear', gear: 'Gear' }, out = [];
  for (const k of Object.keys(PD.LOCK)) if (c.give.indexOf(PD.LOCK[k]) >= 0) { const n = names[PD.lockTab(k)]; if (out.indexOf(n) < 0) out.push(n); }
  return out;
};
/* does a typed answer solve a puzzle's note? (used by the tests: decode the printed note and compare) */
H.decodeNote = p => p.c === 'shuffle' ? null : C[p.c].dec(p.bodyLines, p.n);
H.isAnagram = p => { const a = p.bodyLines.join('').split('').sort().join(''), b = p.code.split('').sort().join(''); return a === b && p.bodyLines.join('') !== p.code; };

/* ---------- which notes this device has found ---------- */
const KEY = 'pdClues'; let mem = [];
const ls = () => { try { return root.localStorage || null; } catch (e) { return null; } };
const load = () => { const s = ls(); if (!s) return mem.slice(); try { const a = JSON.parse(s.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string' && H.byCode[x]).slice(0, 64) : []; } catch (e) { return []; } };
const save = a => { mem = a.slice(); const s = ls(); if (s) { try { s.setItem(KEY, JSON.stringify(a)); } catch (e) {} } };
H.found = () => load();
H.hasFound = code => load().indexOf(code) >= 0;
H.mark = code => { if (!H.byCode[code]) return false; const a = load(); if (a.indexOf(code) >= 0) return false; a.push(code); save(a); return true; };
H.solved = code => { const c = PD.CODES[code]; return !!c && c.give.every(t => PD.Unlocks.has(t)); };
H.progress = () => ({ total: P.length, found: P.filter(p => H.hasFound(p.code) || H.solved(p.code)).length, solved: P.filter(p => H.solved(p.code)).length });
H.reset = () => { save([]); H.reading = null; };

/* ---------- placing the notes on a map ---------- */
const OK_TILES = (() => { const a = new Uint8Array(16); [PD.TILE.GRASS, PD.TILE.ROAD, PD.TILE.FLOOR, PD.TILE.SIDEW, PD.TILE.SAND].forEach(i => a[i] = 1); return a; })();
/* a clue tile: reachable, plain ground, and every neighbour is walkable (never wedged against a wall) */
function good(m, tx, ty) {
  if (tx < 1 || ty < 1 || tx >= m.w - 1 || ty >= m.h - 1) return false;
  if (!m.reach || m.reach[ty * m.w + tx] !== 1 || !OK_TILES[m.tiles[ty * m.w + tx]]) return false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (PD.solidAt(m, tx + dx, ty + dy)) return false;
  return true;
}
H.place = function (m) {
  const out = [], keepAway = [];
  for (const b of m.wallbuys || []) keepAway.push([b.x, b.y, 72]);
  for (const b of m.boxes || []) keepAway.push([b.x, b.y, 72]);
  for (const s of m.spawns || []) keepAway.push([s.x, s.y, 56]);
  for (const g of m.gates || []) keepAway.push([g.x, g.y, 56]);
  if (m.start) keepAway.push([m.start.x, m.start.y, 56]);
  for (const p of P) {
    if (p.map !== m.kind) continue;
    const a = ANCH[p.at], gx = a[0] * m.w, gy = a[1] * m.h, cand = [];
    for (let ty = 1; ty < m.h - 1; ty++) for (let tx = 1; tx < m.w - 1; tx++) {
      if (!good(m, tx, ty)) continue; const px = tx * T + 8, py = ty * T + 8;
      let bad = false; for (const k of keepAway) if (Math.hypot(px - k[0], py - k[1]) < k[2]) { bad = true; break; }
      if (!bad) for (const o of out) if (Math.hypot(px - o.x, py - o.y) < 160) { bad = true; break; }
      if (!bad) cand.push([(tx - gx) * (tx - gx) + (ty - gy) * (ty - gy), px, py]);
    }
    if (!cand.length) continue;
    let best = cand[0]; for (const c of cand) if (c[0] < best[0]) best = c;
    out.push({ code: p.code, i: p.i, x: best[1], y: best[2] });
  }
  return out;
};
/* the notes of a map, built once per map object */
H.cluesFor = m => m ? (m._clues || (m._clues = H.place(m))) : [];
H.REACH = 28;
H.near = (m, x, y) => { let best = null, bd = H.REACH; for (const c of H.cluesFor(m)) { const d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; best = c; } } return best; };

/* ---------- reading ---------- */
H.reading = null;            // { code, map } while a note is open
/* E pressed at (x, y): closes an open note, or opens the nearest one. -> { ok, fresh, code } or null */
H.use = function (m, x, y) {
  if (H.reading) { H.reading = null; return { ok: true, closed: true }; }
  const c = H.near(m, x, y); if (!c) return null;
  const fresh = H.mark(c.code); H.reading = { code: c.code, map: m }; return { ok: true, fresh, code: c.code };
};
/* every frame: close the note if you walked away, changed map or went down */
H.update = function (m, x, y, alive) {
  const r = H.reading; if (!r) return;
  if (r.map !== m || alive === false) { H.reading = null; return; }
  const c = H.cluesFor(m).find(q => q.code === r.code);
  if (!c || Math.hypot(c.x - x, c.y - y) > H.REACH + 14) H.reading = null;
};
})(typeof window !== 'undefined' ? window : globalThis);
