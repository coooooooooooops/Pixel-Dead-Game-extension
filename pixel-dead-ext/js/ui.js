/* Pixel Dead - ui.js : screens, transitions, scaling, profile, toasts, roster, live preview.
   No game logic here. main.js drives the flow and calls into PD.UI. */
(function (root) {
'use strict';
const PD = root.PD, A = PD.audio, $ = id => document.getElementById(id);
const UI = PD.UI = { cur: null, popup: false, params: new URLSearchParams(root.location.search), profile: { name: 'Survivor', look: null } };
const reduced = () => { try { return root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const SCREENS = ['menu', 'play', 'look', 'how', 'host', 'join', 'wait', 'pause', 'over'];
UI.MODES = {
  arena:   { name: 'Arena Rush',    desc: 'Co-op waves in a walled arena. Combos, loot drops, a boss every third wave.' },
  endless: { name: 'Endless',       desc: 'Co-op survival on the big town map. A boss every fifth round.' },
  pvp:     { name: 'PvP',           desc: 'Free-for-all. First to 20 kills wins. A roaming boss drops in now and then.' },
  hide:    { name: 'Hide and Seek', desc: 'Hide in bushes. Seekers tag hiders into seekers. The last hider wins.' },
  single:  { name: 'Single player', desc: 'Endless zombies on the big town map. A boss every fifth round.' },
};
UI.MODE_ORDER = ['arena', 'endless', 'pvp', 'hide'];
const sentence = s => { s = String(s).toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };

/* ---------- storage (chrome.storage.local when it exists, localStorage otherwise) ---------- */
const hasChrome = () => { try { return !!(root.chrome && chrome.storage && chrome.storage.local); } catch (e) { return false; } };
UI.getPref = function (key, def) {
  return new Promise(res => {
    try { if (hasChrome()) { chrome.storage.local.get(key, o => res(o && o[key] != null ? o[key] : def)); return; } } catch (e) {}
    try { const v = root.localStorage.getItem('pd_' + key); res(v == null ? def : v); } catch (e) { res(def); }
  });
};
UI.setPref = function (key, val) {
  try { if (hasChrome()) chrome.storage.local.set({ [key]: val }); } catch (e) {}
  try { root.localStorage.setItem('pd_' + key, val); } catch (e) {}
};

/* ---------- fit: rem scale, art pixel size, game canvas size ---------- */
UI.fit = function () {
  const W = root.innerWidth, H = root.innerHeight, dpr = root.devicePixelRatio || 1;
  const s = Math.max(.8, Math.min(3, Math.min(W / 640, H / 420))), rem = 16 * s, de = document.documentElement;
  de.style.fontSize = rem + 'px';
  de.style.setProperty('--px', Math.max(1, Math.round(rem * .125 * dpr)) / dpr + 'px');
  de.style.setProperty('--cpx', Math.max(1, Math.round(rem * .11 * dpr)) / dpr + 'px');
  /* game canvas: integer-ish scale, canvas size follows the window shape so there are no bars */
  const Wd = W * dpr, Hd = H * dpr; let k = Math.min(Wd / 512, Hd / 320); const fl = Math.floor(k); if (fl >= 1 && k / fl < 1.12) k = fl;
  const cw = Math.max(512, Math.min(800, Math.floor(Wd / k))), ch = Math.max(320, Math.min(480, Math.floor(Hd / k)));
  if (cw !== PD.CW || ch !== PD.CH) { PD.setView(cw, ch); if (PD.Render) PD.Render.syncView(); if (UI.onView) UI.onView(cw, ch); }
  const wrap = $('wrap'); wrap.style.width = Math.floor(cw * k) / dpr + 'px'; wrap.style.height = Math.floor(ch * k) / dpr + 'px';
  UI.rem = rem; UI.fitPanels();
  clearTimeout(UI._ft); UI._ft = setTimeout(() => { if (PD.Scene) PD.Scene.resize(); }, 60);
};

/* ---------- buttons ---------- */
UI.upgrade = function (rootEl) {
  (rootEl || document).querySelectorAll('.btn:not([data-up])').forEach(b => {
    b.dataset.up = 1; const face = document.createElement('span'), lb = document.createElement('span'); face.className = 'face'; lb.className = 'lb';
    while (b.firstChild) lb.appendChild(b.firstChild); face.appendChild(lb); b.appendChild(face);
  });
};
UI.label = function (btn, text) { const lb = btn.querySelector('.lb'); if (lb) lb.textContent = text; else btn.textContent = text; };

/* ---------- screens ---------- */
let outTimer = 0;
function stagger(el) {
  el.querySelectorAll('.panel').forEach(p => { [...p.children].forEach((c, i) => c.style.setProperty('--i', i)); });
  el.querySelectorAll('.stack').forEach((s, n) => [...s.children].forEach((c, i) => c.style.setProperty('--i', i + 1 + n)));
  const tag = el.querySelector('.brand .tag'); if (tag) tag.style.setProperty('--i', 0);
  const pr = el.querySelector('.profile'); if (pr) pr.style.setProperty('--i', 5);
  const pn = el.querySelector('.popnote'); if (pn) pn.style.setProperty('--i', 6);
}
UI.show = function (id, opt) {
  opt = opt || {}; const next = $(id); if (!next) return; const prev = UI.cur ? $(UI.cur) : null;
  if (UI.cur === id && !next.hidden) return;
  SCREENS.forEach(s => { const e = $(s); if (e && s !== id && s !== UI.cur) { e.hidden = true; e.classList.remove('in', 'out'); } });
  if (prev && prev !== next) { if (opt.instant || reduced()) { prev.hidden = true; } else { prev.classList.remove('in'); prev.classList.add('out'); const p = prev; setTimeout(() => { if (UI.cur !== p.id) { p.hidden = true; p.classList.remove('out'); } }, 170); } }
  UI.cur = id; next.classList.remove('out'); next.hidden = false; stagger(next);
  next.classList.remove('in'); void next.offsetWidth; next.classList.add('in');
  clearTimeout(outTimer); outTimer = setTimeout(() => next.classList.remove('in'), 1500);
  $('ui').classList.add('has-screen');
  if (id === 'menu') UI.refreshMenu();
  if (id === 'look') UI.openLook();
  if (UI.onShow) UI.onShow(id);
  UI.fitPanels(); setTimeout(UI.fitPanels, 420);
  startLoop();
  if (!opt.noFocus && UI.kbd) setTimeout(() => { const f = next.querySelector(opt.focus || '.btn.primary:not(:disabled), .btn:not(:disabled), input'); if (f && UI.cur === id) f.focus({ preventScroll: true }); }, 380);
};
UI.hideAll = function () {
  SCREENS.forEach(s => { const e = $(s); if (e) { e.hidden = true; e.classList.remove('in', 'out'); } });
  UI.cur = null; $('ui').classList.remove('has-screen'); if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
};
UI.setPlaying = function (on) {
  document.body.classList.toggle('playing', !!on); $('wrap').hidden = !on;
  if (on) PD.Scene.stop(); else PD.Scene.start();
  UI.fit();
};

/* ---------- pixel dissolve between screens ---------- */
const fx = { cv: null, g: null };
UI.dissolve = function (mid, o) {
  o = o || {};
  return new Promise(res => {
    if (reduced()) { try { mid && mid(); } catch (e) { console.error(e); } return res(); }
    const cv = fx.cv = fx.cv || $('fx'), g = fx.g = fx.g || cv.getContext('2d'), dpr = root.devicePixelRatio || 1;
    const w = root.innerWidth, h = root.innerHeight; cv.width = w; cv.height = h; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const b = Math.max(10, Math.round(UI.rem * .8)), cols = Math.ceil(w / b), rows = Math.ceil(h / b), th = new Float32Array(cols * rows), sh = new Uint8Array(cols * rows);
    const cx = o.ox != null ? o.ox : .5, cy = o.oy != null ? o.oy : .5;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const d = Math.hypot(x / cols - cx, (y / rows - cy) * (h / w)); th[y * cols + x] = Math.min(.999, d * .9 + Math.random() * .28); sh[y * cols + x] = (Math.random() * 3) | 0; }
    const cols3 = ['#04060e', '#080b1a', '#0d1230'], ms = o.ms || 420; let t0 = performance.now(), phase = 0;
    const draw = (p, edge) => {
      g.clearRect(0, 0, w, h);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const v = th[y * cols + x]; if (v < p) { g.fillStyle = edge && p - v < .06 ? '#ffb547' : cols3[sh[y * cols + x]]; g.fillRect(x * b, y * b, b, b); } }
    };
    const step = ts => {
      const k = Math.min(1, (ts - t0) / ms);
      if (phase === 0) {
        draw(k * 1.08, true);
        if (k >= 1) { draw(1.1, false); phase = 1; try { mid && mid(); } catch (e) { console.error(e); } setTimeout(() => { t0 = performance.now(); requestAnimationFrame(step); }, o.hold || 90); return; }
      } else {
        draw(1.08 * (1 - k), false);
        if (k >= 1) { g.clearRect(0, 0, w, h); return res(); }
      }
      requestAnimationFrame(step);
    };
    A.play('ui:start'); requestAnimationFrame(step);
  });
};

/* ---------- toasts ---------- */
UI.toast = function (msg, kind, ms) {
  const box = $('toasts'); ms = ms || 5200; const d = document.createElement('div'); d.className = 'toast ' + (kind || 'bad'); d.style.setProperty('--life', ms + 'ms');
  d.innerHTML = '<i></i><p></p><u></u>'; d.querySelector('p').textContent = msg; box.appendChild(d);
  if ((kind || 'bad') === 'bad') A.play('ui:err'); else A.play('ui:open');
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 240); }, ms);
};

/* ---------- avatars ---------- */
UI.avatar = function (cv, look, o) {
  o = o || {}; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, cv.width, cv.height);
  PD.drawChar(g, cv.width / 2, cv.height - (o.base || 7), o.ang != null ? o.ang : .6, look, o.ph || 0, o.wid || null, {});
};
UI.renderRoster = function (ul, list, o) {
  o = o || {}; const prev = ul._ids || {}, seen = {}, max = o.max || 8, nb = Math.max(0, Math.min(o.bots | 0, max - list.length)); ul.innerHTML = ''; let joined = false;
  for (let i = 0; i < max; i++) {
    const li = document.createElement('li'), r = list[i];
    if (!r && i - list.length < nb) {   // a bot that will take this seat when the game starts
      li.className = 'botseat'; const cv = document.createElement('canvas'); cv.width = 16; cv.height = 24; UI.avatar(cv, PD.defaultLook()); li.appendChild(cv);
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = 'Bot'; li.appendChild(nm); const t = document.createElement('span'); t.className = 'tg'; t.textContent = 'AI'; li.appendChild(t);
    } else if (r) {
      const cv = document.createElement('canvas'); cv.width = 16; cv.height = 24; UI.avatar(cv, r.look); li.appendChild(cv);
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name; li.appendChild(nm);
      if (r.id === 'p1') { const t = document.createElement('span'); t.className = 'tg'; t.textContent = 'Host'; li.appendChild(t); }
      else if (r.id === o.meId) { const t = document.createElement('span'); t.className = 'tg'; t.textContent = 'You'; li.appendChild(t); }
      seen[r.id] = 1; if (ul._init && !prev[r.id]) { li.classList.add('join'); joined = true; }
    } else { li.className = 'empty'; li.innerHTML = '<span class="nm">Open</span>'; }
    ul.appendChild(li);
  }
  ul._ids = seen; ul._init = true; if (joined) A.play('ui:join');
};
UI.resetRoster = function (ul) { ul._ids = {}; ul._init = false; };

/* ---------- mode picker (host) ---------- */
UI.buildModes = function (box, onPick) {
  box.innerHTML = '';
  UI.MODE_ORDER.forEach(id => {
    const m = UI.MODES[id], b = document.createElement('button'); b.type = 'button'; b.className = 'modecard'; b.dataset.mode = id; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false');
    b.innerHTML = '<i class="bar"></i><b></b><small></small><em></em>'; b.querySelector('b').textContent = m.name; b.querySelector('small').textContent = m.desc;
    b.onclick = () => { A.play('ui:pick'); onPick(id); }; box.appendChild(b);
  });
  box.onkeydown = e => { if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return; const els = [...box.children], i = els.indexOf(document.activeElement); if (i < 0) return; e.preventDefault(); const n = els[(i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : els.length - 1)) % els.length]; n.focus(); n.click(); };
};
UI.markModes = function (box, mode, count) {
  UI.fitPanels();
  [...box.children].forEach(b => {
    const id = b.dataset.mode, need = PD.MODES[id].min, on = id === mode; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1;
    const em = b.querySelector('em'); if (need > 1) { const ok = count >= need; em.textContent = ok ? 'Ready' : 'Needs ' + need + ' or more players'; em.className = ok ? 'ready' : ''; } else em.textContent = '';
  });
};


/* ---------- map thumbnails + map picker ---------- */
const thumbs = {};
UI.thumb = function (kind) {
  if (thumbs[kind]) return thumbs[kind];
  const m = PD.genMap(kind, 7, false); PD.renderMini(m);
  const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.drawImage(m.mini, 0, 0, m.w, m.h, 0, 0, 64, 48);
  return (thumbs[kind] = c);
};
UI.buildMaps = function (box, mode, onPick, key) {
  box.innerHTML = ''; box._mode = mode; const list = PD.MODES[mode].maps;
  list.forEach(id => {
    const d = PD.MAPS[id], b = document.createElement('button'); b.type = 'button'; b.className = 'mapcard'; b.dataset.map = id; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false');
    b.innerHTML = '<i class="bar"></i><canvas width="64" height="48" aria-hidden="true"></canvas><span class="mt"><b></b><small></small></span>';
    b.querySelector('b').textContent = d.name; b.querySelector('small').textContent = d.desc;
    b.onclick = () => { A.play('ui:pick'); onPick(id); }; box.appendChild(b);
    const cv = b.querySelector('canvas'); setTimeout(() => { try { cv.getContext('2d').drawImage(UI.thumb(id), 0, 0); cv.classList.add('ready'); } catch (e) {} }, 30 + list.indexOf(id) * 20);
  });
  box.onkeydown = e => { if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return; const els = [...box.children], i = els.indexOf(document.activeElement); if (i < 0) return; e.preventDefault(); const n = els[(i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : els.length - 1)) % els.length]; n.focus(); n.click(); };
  UI.fitPanels();
};
UI.markMaps = function (box, kind) {
  [...box.children].forEach(b => { const on = b.dataset.map === kind; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
};

/* ---------- keep every panel inside the window (shrinks it if the content is taller / wider) ---------- */
let fpRaf = 0;
UI.fitPanels = function () {
  cancelAnimationFrame(fpRaf);
  fpRaf = requestAnimationFrame(() => {
    const sc = UI.cur && $(UI.cur); if (!sc || sc.hidden) return; const pn = sc.querySelector('.panel'); if (!pn) return;
    pn.style.zoom = ''; const cs = getComputedStyle(sc), ph = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom), pw = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const k = Math.min(1, (sc.clientHeight - ph) / pn.scrollHeight, (sc.clientWidth - pw) / pn.offsetWidth);
    if (k < .995) pn.style.zoom = Math.max(.5, k - .005).toFixed(3);
  });
};

/* ---------- room code tickets ---------- */
UI.setCode = function (code) {
  const bs = [...$('codeBoxes').children];
  bs.forEach((b, i) => { b.classList.remove('in'); b.innerHTML = ''; b.style.setProperty('--n', i); if (code && code[i]) { const s = document.createElement('span'); s.textContent = code[i]; b.appendChild(s); void b.offsetWidth; b.classList.add('in'); } });
  if (code) A.play('ui:open');
};

/* ---------- count-up ---------- */
UI.countUp = function (el, to, ms, fmt) {
  fmt = fmt || (v => String(v)); to = Math.round(to) || 0; if (reduced() || to === 0) { el.textContent = fmt(to); return; }
  const t0 = performance.now(); ms = ms || 700; let lastV = -1;
  const f = ts => { const k = Math.min(1, (ts - t0) / ms), v = Math.round(to * (1 - Math.pow(1 - k, 3))); if (v !== lastV) { lastV = v; el.textContent = fmt(v); if (k < 1 && v % 3 === 0) A.play('ui:count'); } if (k < 1) requestAnimationFrame(f); };
  requestAnimationFrame(f);
};

/* ---------- profile + look screen ---------- */
const P = UI.profile; let prevFx = { hop: 0, fire: 0, shake: 0, pk: 0, casings: [] }, mouse = { x: -1, y: -1, t: -9 };
UI.loadProfile = function () {
  let name = 'Survivor', look = PD.defaultLook();
  try { name = PD.cleanName(localStorage.getItem('pdName')); look = PD.cleanLook(JSON.parse(localStorage.getItem('pdLook') || 'null')); } catch (e) {}
  P.name = name; P.look = look;
};
UI.saveProfile = function () { try { localStorage.setItem('pdName', P.name); localStorage.setItem('pdLook', JSON.stringify(P.look)); } catch (e) {} };
UI.best = () => { try { return +localStorage.getItem('pixelDeadBest') || 0; } catch (e) { return 0; } };

function buildLook() {
  const mkSw = (el, list) => {
    const k = el.dataset.k; el.innerHTML = '';
    list.forEach((c, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'sw'; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', k + ' ' + (i + 1)); b.style.setProperty('--c', c); b.innerHTML = '<i></i>'; b.onclick = () => pick(k, i, b); el.appendChild(b); });
  };
  const mkChips = (el, list) => {
    const k = el.dataset.k; el.innerHTML = '';
    list.forEach((n, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chipbtn'; b.setAttribute('role', 'radio'); b.innerHTML = '<span></span>'; b.firstChild.textContent = sentence(n); b.onclick = () => pick(k, i, b); el.appendChild(b); });
  };
  document.querySelectorAll('#look .swatches').forEach(el => mkSw(el, el.dataset.k === 'skin' ? PD.SKIN : PD.COLORS));
  mkChips(document.querySelector('#look .chips[data-k=hat]'), PD.HATS); mkChips(document.querySelector('#look .chips[data-k=acc]'), PD.ACCS); mkChips(document.querySelector('#look .chips[data-k=pick]'), PD.PICKS);
  document.querySelectorAll('#look [role=radiogroup]').forEach(grp => grp.addEventListener('keydown', e => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }; if (!keys[e.key]) return; const els = [...grp.children], i = els.indexOf(document.activeElement); if (i < 0) return;
    e.preventDefault(); const n = els[(i + keys[e.key] + els.length) % els.length]; n.focus(); n.click();
  }));
}
function pick(k, i, btn) {
  if (P.look[k] === i) return; P.look[k] = i; UI.saveProfile(); refreshLook(true); A.play('ui:pick');
  if (btn) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); }
  prevFx.hop = .28; if (k === 'pick') prevFx.pk = 2.6;
}
function refreshLook(animate) {
  document.querySelectorAll('#look [role=radiogroup]').forEach(grp => { const k = grp.dataset.k; [...grp.children].forEach((b, i) => { const on = P.look[k] === i; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; }); });
  $('hatcField').classList.toggle('off', P.look.hat === 0);
  UI.refreshChip();
}
/* lifetime PvP record of the local player (updated in main.showOver) */
UI.pvpRecord = () => { try { return { k: +localStorage.getItem('pdPvpK') || 0, d: +localStorage.getItem('pdPvpD') || 0 }; } catch (e) { return { k: 0, d: 0 }; } };
UI.refreshChip = function () {
  $('chipName').textContent = P.name; const b = UI.best(), r = UI.pvpRecord(), pv = r.k + r.d > 0 ? 'PvP K/D ' + (r.k / Math.max(1, r.d)).toFixed(2) : '';
  $('chipBest').textContent = b || pv ? [b ? 'Best: round ' + b : '', pv].filter(Boolean).join(' · ') : 'Tap to change your look';
};
UI.refreshMenu = function () { UI.refreshChip(); $('popNote').hidden = !UI.popup; };
UI.openLook = function () { $('nameIn').value = P.name === 'Survivor' ? '' : P.name; refreshLook(); };
UI.randomize = function () { const pk = P.look.pick; P.look = PD.randomLook(); P.look.pick = pk; UI.saveProfile(); refreshLook(true); prevFx.hop = .35; A.play('ui:pick'); document.querySelectorAll('#look .sw[aria-checked=true], #look .chipbtn[aria-checked=true]').forEach(b => { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }); };

/* live preview + chip avatar: runs only while menu/look are visible */
let loopOn = false, lt = 0, chipT = 0;
function startLoop() { if (loopOn) return; loopOn = true; lt = performance.now(); requestAnimationFrame(loop); }
function loop(ts) {
  if (!(UI.cur === 'look' || UI.cur === 'menu')) { loopOn = false; return; }
  requestAnimationFrame(loop); const dt = Math.min(.05, (ts - lt) / 1000); lt = ts; if (reduced() && UI.cur !== 'look') return;
  const t = ts / 1000;
  if (UI.cur === 'look') drawPreview(t, dt);
  else { chipT += dt; if (chipT > .12) { chipT = 0; const cv = $('chipCv'), g = cv.getContext('2d'); g.clearRect(0, 0, 28, 32); const bob = Math.sin(t * 2.2) > .6 ? -1 : 0; PD.drawChar(g, 14, 24 + bob, 0.5 + Math.sin(t * .9) * .5, P.look, 0, null, {}); } }
}
const BG = ['#0d1129', '#10153a'];
function drawPreview(t, dt) {
  const cv = $('prev'), g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 7; x++) { g.fillStyle = BG[(x + y) & 1]; g.fillRect(x * 8, y * 8, 8, 8); }
  const cx = 28, cy = 44;
  // lamp pool (ordered dither)
  for (let y = 0; y < 64; y++) for (let x = 0; x < 56; x++) { const d = Math.hypot((x - cx) / 30, (y - cy + 6) / 24); if (d < 1) { const a = (1 - d) * 1.1, bx = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]][y & 3][x & 3] / 16; if (a > bx) { g.fillStyle = 'rgba(255,181,71,.2)'; g.fillRect(x, y, 1, 1); } } }
  // aim at the pointer
  const r = cv.getBoundingClientRect(); let ang = .35 + Math.sin(t * .8) * .5;
  if (performance.now() / 1000 - mouse.t < 6) ang = Math.atan2(mouse.y - (r.top + r.height * (cy - 8) / 64), mouse.x - (r.left + r.width * cx / 56));
  prevFx.hop = Math.max(0, prevFx.hop - dt); prevFx.fire = Math.max(0, prevFx.fire - dt); prevFx.pk = Math.max(0, prevFx.pk - dt);
  const hop = prevFx.hop > 0 ? (Math.floor(prevFx.hop * 24) % 2 ? -4 : -2) : 0, bob = Math.sin(t * 2.2) > .6 ? -1 : 0, rc = prevFx.fire > 0 ? 1 : 0;
  const x = cx - Math.round(Math.cos(ang) * rc), y = cy + hop + bob - Math.round(Math.sin(ang) * rc);
  if (prevFx.pk > 0) PD.drawChar(g, x, y, ang, P.look, 0, 'pick', { swing: .18 * (1 - ((prevFx.pk * 2.2) % 1)) });   // show the chosen melee look swinging
  else PD.drawChar(g, x, y, ang, P.look, 0, 'ak', {});
  if (prevFx.fire > .03) { const mx = x + Math.cos(ang) * 17, my = y - 2 + Math.sin(ang) * 17; g.fillStyle = '#fff4c8'; g.fillRect(Math.round(mx) - 1, Math.round(my) - 1, 3, 3); g.fillStyle = '#ffb547'; g.fillRect(Math.round(mx + Math.cos(ang) * 3) - 1, Math.round(my + Math.sin(ang) * 3), 2, 2); for (let i = 1; i < 6; i++) { g.fillStyle = 'rgba(255,233,160,' + (1 - i / 6) + ')'; g.fillRect(Math.round(mx + Math.cos(ang) * (3 + i * 5)), Math.round(my + Math.sin(ang) * (3 + i * 5)), 1, 1); } }
  for (const c of prevFx.casings) { c.l -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 140 * dt; if (c.y > cy + 6) { c.y = cy + 6; c.vy *= -.3; c.vx *= .6; } g.fillStyle = '#ffd24a'; g.fillRect(Math.round(c.x), Math.round(c.y), 1, 1); }
  prevFx.casings = prevFx.casings.filter(c => c.l > 0);
}
function fireP(e) {
  const r = $('prev').getBoundingClientRect(); mouse.x = e.clientX; mouse.y = e.clientY; mouse.t = performance.now() / 1000;
  prevFx.fire = .09; A.play('shot:ak'); const a = Math.atan2(e.clientY - (r.top + r.height * 36 / 64), e.clientX - (r.left + r.width / 2));
  prevFx.casings.push({ x: 28 + Math.cos(a) * 6, y: 40, vx: -Math.sin(a) * rr(20, 40) * (Math.random() < .5 ? 1 : -1) - 10, vy: -rr(30, 55), l: 1.2 });
  const pc = $('prev'); pc.style.transform = 'translate(' + (-Math.cos(a) * 2) + 'px,' + (-Math.sin(a) * 2) + 'px)'; setTimeout(() => pc.style.transform = '', 50);
}
const rr = (a, b) => a + Math.random() * (b - a);

/* ---------- tools: sound, expand/fullscreen ---------- */
UI.openTab = function (go) {
  const path = 'game.html' + (go ? '?go=' + go : '');
  try { if (root.chrome && chrome.tabs && chrome.runtime) { chrome.tabs.create({ url: chrome.runtime.getURL(path) }, () => { try { root.close(); } catch (e) {} }); return; } } catch (e) {}
  root.open(path, '_blank');
};
UI.isFull = () => !!document.fullscreenElement;
UI.toggleFullscreen = function () {
  try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => UI.toast('Your browser blocked fullscreen. Try the F11 key.', 'info')); } catch (e) {}
};
function syncTools() {
  const t = $('tSound'); t.classList.toggle('muted', !A.on); t.setAttribute('aria-label', A.on ? 'Sound on' : 'Sound off'); t.title = A.on ? 'Mute' : 'Unmute';
  const e = $('tExpand'), full = UI.isFull(); const lab = UI.popup ? 'Open in a tab' : full ? 'Exit fullscreen' : 'Fullscreen'; e.setAttribute('aria-label', lab); e.title = lab;
  const bf = $('bFull'); if (bf) { bf.hidden = UI.popup; UI.label(bf, full ? 'Exit fullscreen' : 'Fullscreen'); }
}
UI.syncTools = syncTools;
UI.setOpenIn = function (v) {
  UI.setPref('openIn', v); $('oiPopup').setAttribute('aria-checked', v === 'popup' ? 'true' : 'false'); $('oiTab').setAttribute('aria-checked', v === 'tab' ? 'true' : 'false');
};

/* ---------- init ---------- */
UI.init = function () {
  document.addEventListener('keydown', () => { UI.kbd = true; }, true); document.addEventListener('pointerdown', () => { UI.kbd = false; }, true);
  UI.popup = UI.params.get('popup') === '1'; document.body.classList.toggle('popup', UI.popup);
  UI.loadProfile(); UI.fit(); root.addEventListener('resize', UI.fit); document.addEventListener('fullscreenchange', () => { UI.fit(); syncTools(); });
  // logotype
  const logo = document.querySelector('.logo'); let n = 0; logo.querySelectorAll('.w').forEach((w, wi) => { const word = wi === 0 ? 'PIXEL' : 'DEAD'; for (const ch of word) { const s = document.createElement('span'); s.className = 'l'; s.style.setProperty('--n', n++); s.textContent = ch; w.appendChild(s); } });
  UI.upgrade(); buildLook(); refreshLook();
  // look screen
  $('nameIn').addEventListener('input', e => { P.name = PD.cleanName(e.target.value); UI.saveProfile(); UI.refreshChip(); });
  const prv = $('prev'); prv.addEventListener('mousedown', e => { A.init(); fireP(e); e.preventDefault(); });
  document.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.t = performance.now() / 1000; if (PD.Scene) PD.Scene.mouse((e.clientX / root.innerWidth - .5) * 2, (e.clientY / root.innerHeight - .5) * 2); });
  // tools
  A.on = A.on; $('tSound').onclick = () => { A.init(); A.setOn(!A.on); syncTools(); A.play('ui:click'); };
  $('tExpand').onclick = () => { if (UI.popup) UI.openTab(); else UI.toggleFullscreen(); };
  $('bFull').onclick = () => UI.toggleFullscreen();
  $('bPopTab').onclick = () => UI.openTab();
  $('oiPopup').onclick = () => UI.setOpenIn('popup'); $('oiTab').onclick = () => UI.setOpenIn('tab');
  UI.getPref('openIn', 'popup').then(v => UI.setOpenIn(v === 'tab' ? 'tab' : 'popup'));
  syncTools();
  // menu keyboard navigation: up/down move between buttons in a stack
  document.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return; const st = e.target.closest && e.target.closest('.stack'); if (!st) return;
    const bs = [...st.querySelectorAll('.btn:not(:disabled)')], i = bs.indexOf(e.target.closest('.btn')); if (i < 0) return; e.preventDefault(); bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length].focus();
  });
  // UI sounds
  let lastHover = null, lastT = 0;
  document.addEventListener('mouseover', e => { const el = e.target.closest && e.target.closest('.btn,.chipbtn,.sw,.modecard,.chip,.tool,.seg button,summary'); if (!el || el === lastHover || el.disabled) return; lastHover = el; const n = performance.now(); if (n - lastT > 45) { lastT = n; A.play('ui:tick'); } });
  document.addEventListener('mouseout', e => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.btn,.chipbtn,.sw,.modecard,.chip,.tool,.seg button,summary')) lastHover = null; });
  document.addEventListener('click', e => {
    A.init(); const el = e.target.closest && e.target.closest('.btn,.chip,.tool,.seg button,summary'); if (!el || el.disabled) return;
    if (el.matches('.btn.quiet')) A.play('ui:back'); else if (el.matches('summary')) A.play('ui:open'); else if (el.id === 'tSound') return; else A.play('ui:click');
  }, true);
  document.addEventListener('pointerdown', () => A.init(), { once: true });
  PD.Scene.start();
};
})(typeof window !== 'undefined' ? window : globalThis);
