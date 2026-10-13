/* Pixel Dead v2 - data.js : constants, definitions, utils. Everything hangs off window.PD */
(function (root) {
'use strict';
const PD = root.PD = root.PD || {};

PD.VW = 512; PD.VH = 288; PD.HUD = 32; PD.CW = 512; PD.CH = 320; PD.T = 16;
/* the canvas size follows the window shape (see UI.fit); view = canvas minus the HUD strip */
PD.setView = function (cw, ch) { PD.CW = cw; PD.CH = ch; PD.VW = cw; PD.VH = ch - PD.HUD; };

/* tile ids */
PD.TILE = { GRASS: 0, ROAD: 1, FLOOR: 2, WALL: 3, TREE: 4, WATER: 5, ROCK: 6, SIDEW: 7, BUSH: 8, DOOR: 9, CRATE: 10, SAND: 11, GRAVE: 12, WOODW: 13, STONEW: 14, AMMO: 15 };
PD.SOLID = new Uint8Array(16); PD.BLOCKB = new Uint8Array(16); PD.SMASH = new Uint8Array(16);
[3, 4, 5, 6, 10, 12, 13, 14, 15].forEach(i => PD.SOLID[i] = 1);
[3, 4, 6, 10, 12, 13, 14, 15].forEach(i => PD.BLOCKB[i] = 1);       // blocks bullets (water does not)
[4, 6, 10, 12, 15].forEach(i => PD.SMASH[i] = 1);           // bosses may smash these (walls handled separately)

/* ---------- building ----------
   Player-built walls are solid tiles with hit points (tracked by the sim). Zombies path through them at a cost and chew on them. */
PD.BUILT = new Uint8Array(16); PD.BUILT[13] = PD.BUILT[14] = 1;
PD.BLOCKS = [
  { id: 13, name: 'WOOD',  mat: 'wood',  cost: 2, hp: 120, col: '#8a6234' },
  { id: 14, name: 'STONE', mat: 'stone', cost: 3, hp: 300, col: '#8a8f96' },
];
PD.BUILD = { REACH: 64, WALKCOST: 6, MATMAX: 99, START: { wood: 4, stone: 0 }, BASE: new Uint8Array(16) };
[0, 1, 2, 7, 11].forEach(i => PD.BUILD.BASE[i] = 1);        // grass, road, floor, sidewalk, sand
/* what the pickaxe can mine: hits needed, material, amount, tile left behind, seconds until it grows back (0 = never) */
PD.NODES = {
  4:  { need: 3, mat: 'wood',  n: 6, to: 0,  regrow: 90 },   // tree
  6:  { need: 4, mat: 'stone', n: 6, to: 0,  regrow: 90 },   // rock
  10: { need: 2, mat: 'wood',  n: 4, ground: 1, regrow: 90, ammo: .3, ammoP: .4 },   // wooden box: wood, sometimes a little ammo
  15: { need: 2, mat: null,    n: 0, ground: 1, regrow: 120, ammo: .6, ammoP: 1 },   // AMMO CRATE: always restocks ammo
  12: { need: 3, mat: 'stone', n: 4, to: 0,  regrow: 90 },   // gravestone
  3:  { need: 5, mat: 'stone', n: 5, to: 2,  regrow: 0 },    // brick wall
};
PD.MAXGUNS = 2;                                               // guns carried besides the pickaxe (raised in a later stage)

/* seeded PRNG */
PD.mulberry32 = function (a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};
PD.hash2 = function (x, y, s) {            // cheap deterministic per-tile noise in [0,1)
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
  h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296;
};
PD.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
PD.rnd = (a, b) => a + Math.random() * (b - a);
PD.rndi = (a, b) => (a + Math.random() * (b - a + 1)) | 0;
PD.pick = arr => arr[(Math.random() * arr.length) | 0];
PD.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
PD.angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

/* zombie base hp (v1 formula) */
PD.zHP = r => r <= 9 ? 50 + r * 22 : (50 + 9 * 22) * Math.pow(1.1, r - 9);

/* ---------- weapons ---------- */
// kind: hit | flame | proj | beam | tesla | melee.  slow = move-speed multiplier while held.
const W = (o) => Object.assign({ pellets: 1, spread: .03, reload: 1.2, range: 300, pierce: 1, slow: 1, auto: false, cost: 0 }, o);
PD.WDEF = {
  m1911:   W({ name: 'M1911',   kind: 'hit',   dmg: 22,  mag: 8,   res: 96,  rate: .26,  reload: 1.1, range: 300, cost: 0 }),
  revolver:W({ name: 'MAGNUM',  kind: 'hit',   dmg: 75,  mag: 6,   res: 48,  rate: .5,   reload: 1.8, range: 340, cost: 600, spread: .02 }),
  pump:    W({ name: 'PUMP',    kind: 'hit',   dmg: 20,  mag: 6,   res: 36,  rate: .75,  reload: 2.0, range: 150, cost: 500, pellets: 8, spread: .2 }),
  smg:     W({ name: 'MP5K',    kind: 'hit',   dmg: 16,  mag: 32,  res: 192, rate: .075, reload: 1.7, range: 270, cost: 1000, auto: true, spread: .06 }),
  ak:      W({ name: 'AK-47',   kind: 'hit',   dmg: 27,  mag: 30,  res: 150, rate: .105, reload: 2.0, range: 300, cost: 1200, auto: true, spread: .05 }),
  sniper:  W({ name: 'SNIPER',  kind: 'hit',   dmg: 130, mag: 5,   res: 30,  rate: 1.0,  reload: 2.4, range: 800, cost: 1500, pierce: 3, spread: .005 }),
  minigun: W({ name: 'MINIGUN', kind: 'hit',   dmg: 14,  mag: 150, res: 450, rate: .05,  reload: 3.5, range: 280, cost: 2500, auto: true, slow: .65, spread: .13 }),
  flamer:  W({ name: 'FLAMER',  kind: 'flame', dmg: 7,   mag: 100, res: 300, rate: .05,  reload: 2.5, range: 85,  cost: 2000, auto: true, burn: 3 }),
  rpg:     W({ name: 'ROCKET',  kind: 'proj',  dmg: 170, mag: 1,   res: 12,  rate: .9,   reload: 2.2, range: 600, cost: 3000, splash: 46, speed: 210 }),
  gl:      W({ name: 'GRENADE', kind: 'proj',  dmg: 130, mag: 4,   res: 20,  rate: .55,  reload: 2.4, range: 400, cost: 2000, splash: 42, speed: 190, bounce: 1, fuse: 1.1 }),
  rail:    W({ name: 'RAILGUN', kind: 'beam',  dmg: 220, mag: 3,   res: 21,  rate: 1.1,  reload: 2.6, range: 900, cost: 3500, pierce: 99 }),
  tesla:   W({ name: 'TESLA',   kind: 'tesla', dmg: 32,  mag: 40,  res: 160, rate: .13,  reload: 2.2, range: 120, cost: 2750, auto: true, chain: 4 }),
  plasma:  W({ name: 'PLASMA',  kind: 'proj',  dmg: 48,  mag: 24,  res: 120, rate: .15,  reload: 2.0, range: 420, cost: 3000, auto: true, pierce: 3, splash: 16, speed: 230, plasma: 1 }),
  /* pickaxe: weak melee that mines and repairs. Unbreakable, no ammo (mag/res unused) */
  pick:    W({ name: 'PICKAXE', kind: 'melee', dmg: 34,  mag: 0,   res: 0,   rate: .42,  reload: 0,   range: 26,  cost: 0, arc: 1.6 }),
};
PD.WORDER = ['m1911', 'revolver', 'pump', 'smg', 'ak', 'sniper', 'minigun', 'flamer', 'rpg', 'gl', 'rail', 'tesla', 'plasma', 'pick'];
PD.WBOX = PD.WORDER.filter(i => i !== 'm1911' && i !== 'pick');

/* ---------- power-ups ---------- */
PD.PUDEF = {
  maxammo: { name: 'MAX AMMO',  col: '#4aa3ff', team: 1, dur: 0,  ch: 'A' },
  x2:      { name: '2X POINTS', col: '#ffd24a', team: 1, dur: 30, ch: '2' },
  insta:   { name: 'INSTA-KILL',col: '#ff3b3b', team: 1, dur: 25, ch: 'I' },
  nuke:    { name: 'NUKE',      col: '#ffffff', team: 1, dur: 0,  ch: 'N' },
  freeze:  { name: 'FREEZE',    col: '#8fe8ff', team: 1, dur: 10, ch: 'F' },
  heal:    { name: 'HEAL',      col: '#ff6fa0', team: 0, dur: 0,  ch: '+' },
  shield:  { name: 'SHIELD',    col: '#7fa6ff', team: 0, dur: 0,  ch: 'S' },
  speed:   { name: 'SPEED',     col: '#6fff9a', team: 0, dur: 20, ch: '>' },
  rapid:   { name: 'RAPID FIRE',col: '#ff9a3b', team: 0, dur: 20, ch: 'R' },
  cloak:   { name: 'CLOAK',     col: '#b48cff', team: 0, dur: 12, ch: 'C' },
  turret:  { name: 'TURRET',    col: '#c0c0c0', team: 0, dur: 25, ch: 'T' },
};
PD.PUPOOL = {
  pve:   ['maxammo', 'x2', 'insta', 'nuke', 'freeze', 'heal', 'shield', 'speed', 'rapid', 'turret'],
  pvp:   ['maxammo', 'heal', 'shield', 'speed', 'rapid', 'cloak', 'turret'],
  hide:  ['speed', 'cloak', 'shield', 'freeze'],
};

/* ---------- zombies ---------- */
// hp = multiplier of zHP(round); sp = px/s; from = first round; r = radius
PD.ZT = {
  walker:  { hp: 1,    sp: 24, r: 5, from: 1, dmg: 20, w: 10 },
  runner:  { hp: .55,  sp: 50, r: 5, from: 3, dmg: 14, w: 5 },
  fatty:   { hp: 2.6,  sp: 17, r: 7, from: 5, dmg: 32, w: 3 },
  spitter: { hp: .8,   sp: 22, r: 5, from: 6, dmg: 12, w: 3, ranged: 1 },
  bloater: { hp: 1.5,  sp: 19, r: 6, from: 4, dmg: 18, w: 3, boom: 1 },
};

/* ---------- bosses ---------- */
PD.BOSSORDER = ['brute', 'queen', 'necro', 'jugg', 'bloat'];
PD.BOSSES = {
  brute: { name: 'THE BRUTE',   hp: 2200, r: 12, scale: 2, sp: 30, dmg: 28, col: '#8a5a3a' },
  queen: { name: 'ACID QUEEN',  hp: 1700, r: 11, scale: 2, sp: 26, dmg: 22, col: '#7fe05a' },
  necro: { name: 'NECROMANCER', hp: 1500, r: 10, scale: 2, sp: 22, dmg: 22, col: '#9a6bd6' },
  jugg:  { name: 'JUGGERNAUT',  hp: 3000, r: 12, scale: 2, sp: 24, dmg: 30, col: '#6b7480' },
  bloat: { name: 'THE BLOAT',   hp: 2600, r: 17, scale: 3, sp: 15, dmg: 30, col: '#a6b04a' },
};

/* ---------- looks ---------- */
PD.SKIN = ['#f1c9a0', '#d9a577', '#b27c52', '#8a5a3a', '#5e3b24', '#c7d9b0'];
PD.COLORS = ['#4a5d3a', '#b3121b', '#2f5fb3', '#d9b100', '#e8e2cf', '#222428', '#8a4fc7', '#e07a1f', '#1fa38a', '#d86fa0'];
PD.HATS = ['NONE', 'CAP', 'BEANIE', 'MOHAWK', 'HELMET', 'BANDANA', 'CROWN'];
PD.ACCS = ['NONE', 'SHADES', 'MASK', 'EYEPATCH'];
PD.PICKS = ['PICKAXE', 'KATANA', 'LIGHTSABER', 'ZOMBIE ARM'];   // looks of the melee tool (cosmetic only)
PD.defaultLook = () => ({ skin: 0, shirt: 0, pants: 5, hat: 0, hatc: 1, acc: 0, pick: 0 });
PD.randomLook = () => ({ skin: PD.rndi(0, 5), shirt: PD.rndi(0, 9), pants: PD.rndi(0, 9), hat: PD.rndi(0, 6), hatc: PD.rndi(0, 9), acc: PD.rndi(0, 3), pick: PD.rndi(0, 3) });
PD.cleanLook = l => {
  const d = PD.defaultLook(); l = l || {};
  const f = (k, n) => { const v = l[k] | 0; return v >= 0 && v < n ? v : d[k]; };
  return { skin: f('skin', 6), shirt: f('shirt', 10), pants: f('pants', 10), hat: f('hat', 7), hatc: f('hatc', 10), acc: f('acc', 4), pick: f('pick', 4) };
};
PD.cleanName = n => (String(n == null ? '' : n).replace(/[^\w \-.!?]/g, '').trim().slice(0, 12)) || 'Survivor';

/* ---------- misc ---------- */
PD.MODES = {
  single: { name: 'SINGLE PLAYER', map: 'town',  maps: ['town', 'mid', 'block', 'hide'], min: 1, desc: 'Endless zombies. A boss every 5th round.' },
  endless:{ name: 'ENDLESS',       map: 'town',  maps: ['town', 'mid', 'block', 'hide'], min: 1, desc: 'Co-op endless survival, up to 8 players. Bosses every 5th round.' },
  arena:  { name: 'ARENA RUSH',    map: 'arena', maps: ['arena', 'arena2', 'arena3', 'arena4'],              min: 1, desc: 'Waves in a walled arena. Combos, loot drops, boss every 3rd wave.' },
  pvp:    { name: 'PVP',           map: 'mid',   maps: ['mid', 'town', 'block', 'arena', 'arena2', 'arena3', 'arena4', 'hide'], min: 2, desc: 'Free-for-all deathmatch. First to 20 kills. A roaming boss appears now and then.' },
  hide:   { name: 'HIDE AND SEEK', map: 'hide',  maps: ['hide', 'mid', 'town', 'block'], min: 2, desc: 'Hide in bushes. Seekers tag hiders into seekers. Last hider wins.' },
};
/* every map: size in tiles and which generator builds it */
PD.MAPS = {
  town:   { name: 'Dead Town',  dim: [200, 150], arena: false, desc: 'Huge streets, many buildings, a lake.' },
  mid:    { name: 'Downtown',    dim: [120, 90],  arena: false, theme: 2, desc: 'Dense city: towers, avenues, a plaza, tight alleys.' },
  block:  { name: 'Freighter',  dim: [90, 70],   arena: false, theme: 3, desc: 'A cargo ship at sea: containers, cabins, a bridge, a pier and a trawler.' },
  hide:   { name: 'Dustwater',  dim: [150, 110], arena: false, theme: 1, desc: 'Desert town: adobe houses, cactus, sagebrush, an oasis.' },
  arena:  { name: 'The Pit',    dim: [60, 44],   arena: true,  desc: 'Small walled arena, four gates.' },
  arena2: { name: 'Colosseum',  dim: [84, 60],   arena: true,  theme: 6, desc: 'Roman amphitheatre: oval stone arena, sand pit, arched rings and four gate tunnels.' },
  arena3: { name: 'The Crucible', dim: [72, 72],  arena: true,  theme: 4, desc: 'Round arena. A lava moat, four bridges, an island in the middle.' },
  arena4: { name: 'Frostbite',  dim: [80, 80],   arena: true,  theme: 5, desc: 'Cross-shaped ice arena. Long corridors and a frozen pond.' },
};
PD.MAPDIM = {}; for (const k in PD.MAPS) PD.MAPDIM[k] = PD.MAPS[k].dim;
/* pick a valid map for a mode (falls back to the mode default) */
PD.pickMap = function (mode, kind) { const m = PD.MODES[mode]; return m && m.maps.indexOf(kind) >= 0 ? kind : (m ? m.map : 'town'); };
PD.MAXP = 8;
/* bots that fill empty online lobbies */
PD.BOTNAMES = ['Rex', 'Nova', 'Duke', 'Mako', 'Pixel', 'Ghost', 'Rusty', 'Zed', 'Echo', 'Bolt', 'Viper', 'Tank'];
PD.cleanChat = s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
})(typeof window !== 'undefined' ? window : globalThis);
