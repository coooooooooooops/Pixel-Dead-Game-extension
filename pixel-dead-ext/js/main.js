/* Pixel Dead v2.1 - main.js : flow, input, game loop, host / join / client glue.
   Sessions: 'single' and 'host' run the Sim locally; 'client' renders a Mirror built from host snapshots. */
(function () {
'use strict';
const PD = window.PD, R = PD.Render, A = PD.audio, UI = PD.UI, Net = PD.Net, $ = id => document.getElementById(id);
const cv = $('c'), ctx = cv.getContext('2d'); cv.width = PD.CW; cv.height = PD.CH; ctx.imageSmoothingEnabled = false;
const ST = { state: 'menu', role: 'single', mode: 'single', sim: null, host: null, client: null, mirror: null, me: 'p1', overlay: null, banner: null, feed: [], showMap: false, showScore: false, fc: 0, lastSlot: 0, over: null, chat: [], chatHist: [], chatOpen: false, net: null };
const keys = {}, mouse = { x: 256, y: 144, down: false, rdown: false };
let last = 0, inpT = 0;
const P = UI.profile;
const best = k => { try { return +localStorage.getItem(k) || 0; } catch (e) { return 0; } };
const setBest = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const online = () => ST.role !== 'single';
const fmtT = s => { s = Math.floor(s); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); };

UI.onView = (w, h) => { cv.width = w; cv.height = h; ctx.imageSmoothingEnabled = false; };
UI.init();
R.fontsReady();

/* =====================================================================
   menu + simple screens
   ===================================================================== */
function toMenu(msg, kind) {
  const go = () => { teardown(); UI.setPlaying(false); UI.show('menu'); ST.state = 'menu'; if (msg) UI.toast(msg, kind || 'info'); };
  if (ST.state === 'play' || ST.state === 'over' || ST.state === 'pause') UI.dissolve(go, { ms: 340 }); else go();
}
function teardown() {
  try { if (ST.host) ST.host.close(); } catch (e) {} try { if (ST.client) ST.client.leave(); } catch (e) {}
  try { Net.close(); } catch (e) {}
  ST.host = null; ST.client = null; ST.sim = null; ST.mirror = null; ST.role = 'single'; ST.over = null; ST.overlay = null; ST.state = 'menu'; ST.room = null;
  clearChat(); ST.net = null; resetHostUI(); resetJoinUI();
}
$('bLook').onclick = () => { A.init(); UI.show('look'); ST.state = 'look'; };
$('bLookOk').onclick = () => { UI.show('menu'); ST.state = 'menu'; };
$('bRand').onclick = () => UI.randomize();
$('bHow').onclick = () => UI.show('how'); $('bHowOk').onclick = () => UI.show('menu');
$('bHost').onclick = () => { A.init(); openHost(); };
$('bJoin').onclick = () => { A.init(); openJoin(); };

/* =====================================================================
   single player
   ===================================================================== */
function beginGame(sim, role) {
  ST.sim = sim; ST.role = role; ST.mode = sim.mode; ST.me = 'p1'; ST.mirror = null; ST.over = null; ST.overlay = null;
  PD.renderBG(sim.map); R.reset(); ST.feed = []; ST.chat = []; closeChat(); ST.banner = null; ST.showMap = false; ST.showScore = false; ST.lastSlot = 0;
  ST.state = 'play'; UI.hideAll(); UI.setPlaying(true); PD.debug.sim = sim; last = performance.now();
}
const setup = { mode: 'single', map: 'town' };
UI.getPref('pdSetup', '').then(v => { try { const o = JSON.parse(v); if (o && PD.MODES[o.mode] && PD.MODES[o.mode].min === 1 && o.mode !== 'endless') { setup.mode = o.mode; setup.map = PD.pickMap(o.mode, o.map); } } catch (e) {} });
function refreshSetup() {
  setup.map = PD.pickMap(setup.mode, setup.map);
  $('playModes').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', b.dataset.mode === setup.mode ? 'true' : 'false'));
  const box = $('playMaps'); if (box._mode !== setup.mode) UI.buildMaps(box, setup.mode, k => { setup.map = k; UI.markMaps(box, k); }); UI.markMaps(box, setup.map);
  $('playDesc').textContent = setup.mode === 'arena' ? 'Waves of zombies pour through the gates. Build combos, grab drops, boss every third wave.' : 'Endless zombies. A boss every fifth round. Buy guns from the walls.';
}
$('playModes').querySelectorAll('button').forEach(b => b.onclick = () => { A.play('ui:pick'); setup.mode = b.dataset.mode; refreshSetup(); });
$('bSingle').onclick = () => { A.init(); ST.state = 'setup'; UI.show('play', { focus: '#bPlayGo' }); refreshSetup(); };
$('bPlayBack').onclick = () => { UI.show('menu'); ST.state = 'menu'; };
$('bPlayGo').onclick = () => { UI.setPref('pdSetup', JSON.stringify(setup)); startSingle(); };
function startSingle() {
  A.init(); if (ST.state === 'loading') return; ST.state = 'loading'; teardown(); ST.state = 'loading';
  const mode = setup.mode, map = PD.pickMap(mode, setup.map);
  const mid = () => beginGame(new PD.Sim({ mode, map, seed: (Math.random() * 1e9) | 0, players: [{ id: 'p1', name: P.name, look: P.look }] }), 'single');
  UI.dissolve(mid, { ms: 440, ox: .3, oy: .6 });
}
$('bAgain').onclick = startSingle; $('bMenu').onclick = () => toMenu();

/* =====================================================================
   pause / menu overlay
   ===================================================================== */
function openPause() {
  if (ST.state !== 'play' || ST.overlay) return; ST.overlay = 'pause'; mouse.down = false;
  const on = online(); $('pauseTitle').textContent = on ? 'Menu' : 'Paused';
  $('pauseNote').textContent = on ? (ST.role === 'host' ? 'The game keeps running. Leaving ends it for everyone.' : 'The game keeps running while this is open.') : 'Your run is on hold.';
  UI.label($('bQuit'), on ? 'Leave game' : 'Quit to menu'); UI.syncTools(); UI.show('pause'); A.play('ui:open');
}
function closePause() { if (ST.overlay !== 'pause') return; ST.overlay = null; UI.hideAll(); A.play('ui:back'); last = performance.now(); }
$('bResume').onclick = closePause; $('bQuit').onclick = () => toMenu();

/* =====================================================================
   host
   ===================================================================== */
const slots = [];
let botPref = 4; UI.getPref('pdBots', '4').then(v => { const n = parseInt(v, 10); botPref = [0, 4, 6, 8].includes(n) ? n : 4; if (ST.host) { ST.host.setBots(botPref); refreshHost(); } });
$('hostBots').querySelectorAll('button').forEach(b => b.onclick = () => { A.play('ui:pick'); botPref = +b.dataset.n; UI.setPref('pdBots', String(botPref)); if (ST.host) ST.host.setBots(botPref); refreshHost(); });
function setHostStatus(kind, text) { const el = $('hostStatus'); el.querySelector('.dot').className = 'dot ' + kind; el.querySelector('span').textContent = text; }
function resetHostUI() { slots.length = 0; $('slots').innerHTML = ''; UI.setCode(''); $('bCopyCode').disabled = true; $('manual').open = false; UI.resetRoster($('hostRoster')); }
function openHost(keep) {
  if (UI.popup) { UI.openTab('host'); return; }
  if (!ST.host) {
    resetHostUI(); ST.role = 'host'; const h = ST.host = new PD.HostSession(Net, { name: P.name, look: P.look });
    UI.buildModes($('hostModes'), id => { if (ST.host && ST.host.setMode(id)) refreshHost(); }); $('hostMaps').innerHTML = ''; $('hostMaps')._mode = '';
    h.botFill = botPref; h.onchat = pushChat; h.onroster = () => refreshHost(); h.onleave = (e, why) => { if (e && ST.state !== 'play') UI.toast(e.name + ' left the room.', 'info', 3000); };
    setHostStatus('work', 'Opening room');
    Net.hostRoom().then(code => { if (ST.host !== h) return; ST.room = code; UI.setCode(code); $('bCopyCode').disabled = false; setHostStatus('ok', 'Room open. Friends can join with this code.'); })
      .catch(() => { if (ST.host !== h) return; setHostStatus('bad', 'Could not reach a relay server. Use copy and paste instead.'); $('manual').open = true; UI.toast('Could not reach a relay server. Use copy and paste codes instead.', 'bad'); });
  }
  ST.state = 'host'; UI.show('host', { focus: '.modecard[aria-checked=true]' }); refreshHost();
}
function refreshHost() {
  const h = ST.host; if (!h) return; UI.renderRoster($('hostRoster'), h.roster, { max: 8, meId: 'p1', bots: h.botsToAdd() }); UI.markModes($('hostModes'), h.mode, h.roster.length + h.botsToAdd());
  const hm = $('hostMaps'); if (hm._mode !== h.mode) UI.buildMaps(hm, h.mode, k => { if (ST.host && ST.host.setMap(k)) refreshHost(); }); UI.markMaps(hm, h.map);
  const nb = h.botsToAdd(), can = h.canStart(), min = PD.MODES[h.mode].min; $('bStart').disabled = !can; $('needNote').textContent = can ? '' : h.roster.length + nb < min ? 'Needs ' + min + ' or more players. Turn bots on or invite a friend.' : '';
  $('hostBots').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', +b.dataset.n === h.botFill ? 'true' : 'false'));
  $('botNote').textContent = nb ? (nb === 1 ? '1 bot' : nb + ' bots') + ' will join when you start. Bots never take a seat from a friend.' : '';
  slots.forEach(updSlot);
}
$('bHostBack').onclick = () => { teardown(); UI.show('menu'); ST.state = 'menu'; };
$('bStart').onclick = () => {
  const h = ST.host; if (!h || !h.canStart()) return; A.init(); ST.state = 'loading';
  UI.dissolve(() => { const sim = h.start(); if (sim) beginGame(sim, 'host'); else { ST.state = 'host'; } }, { ms: 440 });
};
async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); } catch (e) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (er) {} t.remove(); }
  A.play('ui:copy'); if (btn) { const old = btn.querySelector('.lb').textContent; UI.label(btn, 'Copied'); setTimeout(() => UI.label(btn, old), 1400); }
}
$('bCopyCode').onclick = e => { if (ST.room) copyText(ST.room, e.currentTarget); };
$('bAddFriend').onclick = async e => {
  const btn = e.currentTarget; btn.disabled = true;
  try { const o = await Net.hostManualOffer(); addSlot(o.pid, o.code); } catch (er) { UI.toast(er.message || 'Could not create an invite.', 'bad'); }
  btn.disabled = false;
};
function addSlot(pid, code) {
  const el = document.createElement('div'); el.className = 'slot';
  el.innerHTML = '<div class="top"><b></b><span class="st">Waiting for reply</span></div>' +
    '<div class="row"><textarea class="input area" rows="2" readonly aria-label="Invite to send"></textarea><button class="btn small" type="button">Copy invite</button></div>' +
    '<div class="row"><textarea class="input area" rows="2" placeholder="Paste their reply here" aria-label="Reply from your friend"></textarea><button class="btn small" type="button">Connect</button></div>';
  const s = { pid, el, n: slots.length + 1, st: 'wait', was: false };
  el.querySelector('b').textContent = 'Friend ' + s.n; const [offer, reply] = el.querySelectorAll('textarea'), [bc, bk] = el.querySelectorAll('button');
  offer.value = code; offer.onfocus = () => offer.select(); UI.upgrade(el);
  bc.onclick = () => copyText(code, bc);
  bk.onclick = async () => { const v = reply.value.trim(); if (!v) { bk.classList.remove('shake'); void bk.offsetWidth; bk.classList.add('shake'); return; } try { await Net.hostManualAnswer(pid, v); s.st = 'conn'; updSlot(s); } catch (er) { UI.toast('That reply is not valid. Ask your friend to copy it again.', 'bad'); } };
  $('slots').appendChild(el); slots.push(s); s.reply = reply; s.bk = bk; updSlot(s);
}
function updSlot(s) {
  const st = s.el.querySelector('.st'), h = ST.host, inR = h && h.entry(s.pid);
  if (inR) { s.was = true; st.textContent = 'Connected: ' + inR.name; st.className = 'st ok'; s.reply.disabled = true; s.bk.disabled = true; }
  else if (s.was) { st.textContent = 'Disconnected'; st.className = 'st bad'; }
  else if (s.st === 'conn') { st.textContent = 'Connecting'; st.className = 'st'; }
}

/* =====================================================================
   join
   ===================================================================== */
function setJoinStatus(kind, text) { const el = $('joinStatus'); el.querySelector('.dot').className = 'dot ' + kind; el.querySelector('span').textContent = text; }
function resetJoinUI() { $('codeIn').value = ''; $('bJoinGo').disabled = true; $('inviteIn').value = ''; $('replyOut').value = ''; $('replyField').hidden = true; $('bCopyReply').hidden = true; $('invite').open = false; setJoinStatus('idle', 'Ask the host for their five-letter code.'); }
function openJoin() {
  if (UI.popup) { UI.openTab('join'); return; }
  ST.state = 'join'; UI.show('join', { focus: '#codeIn' });
}
$('codeIn').addEventListener('input', e => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); e.target.value = v; $('bJoinGo').disabled = v.length !== 5 || !!ST.client; });
$('codeIn').addEventListener('keydown', e => { if (e.key === 'Enter' && !$('bJoinGo').disabled) $('bJoinGo').click(); });
function makeClient() {
  const c = new PD.ClientSession(Net, { name: P.name, look: P.look }); ST.client = c; ST.role = 'client';
  c.onchat = pushChat; c.onroster = (list, mode, map, bots) => {
    if (ST.state === 'join' || ST.state === 'lobby' || ST.state === 'menu' && UI.cur === 'join') { ST.state = 'lobby'; UI.show('wait', { focus: '#bLeave' }); }
    $('waitMode').textContent = UI.MODES[mode] ? UI.MODES[mode].name : 'Lobby'; $('waitDesc').textContent = UI.MODES[mode] ? UI.MODES[mode].desc : ''; $('waitMap').textContent = PD.MAPS[map] ? 'Map: ' + PD.MAPS[map].name : '';
    UI.renderRoster($('waitRoster'), list, { max: 8, meId: c.id, bots: bots | 0 }); $('waitBots').textContent = bots ? (bots === 1 ? '1 bot' : bots + ' bots') + ' will join when the host starts.' : '';
  };
  c.onstart = m => startClient(m);
  c.onlobby = () => { ST.mirror = null; ST.over = null; ST.overlay = null; const go = () => { UI.setPlaying(false); ST.state = 'lobby'; UI.show('wait', { focus: '#bLeave' }); }; if (ST.state === 'play' || ST.state === 'over') UI.dissolve(go, { ms: 320 }); else go(); };
  c.onover = o => { if (ST.state === 'play') showOver(o); };
  c.onreject = why => { UI.toast(why, 'bad'); backToJoin(); };
  c.onbye = why => toMenu(why, 'info');
  c.onclose = why => { if (ST.state === 'play' || ST.state === 'over' || ST.state === 'lobby') toMenu('Lost connection to the host.', 'bad'); else { UI.toast('Could not stay connected to the host. Check the code and try again.', 'bad'); backToJoin(); } };
  return c;
}
function backToJoin() { try { if (ST.client) ST.client.leave(); } catch (e) {} try { Net.close(); } catch (e) {} ST.client = null; ST.role = 'single'; ST.state = 'join'; UI.show('join', { focus: '#codeIn' }); setJoinStatus('idle', 'Ask the host for their five-letter code.'); $('replyField').hidden = true; $('bCopyReply').hidden = true; $('bJoinGo').disabled = $('codeIn').value.length !== 5; $('bMakeReply').disabled = false; }
$('bJoinGo').onclick = async () => {
  const code = $('codeIn').value; if (code.length !== 5) return; A.init(); try { if (ST.client) ST.client.leave(); } catch (e) {}
  makeClient(); $('bJoinGo').disabled = true; setJoinStatus('work', 'Contacting relay'); Net.onstatus = s => setJoinStatus('work', s.replace(/\.+$/, ''));
  try { await Net.joinRoom(code); setJoinStatus('work', 'Connected. Waiting for the host'); }
  catch (e) { if (!ST.client) return; setJoinStatus('bad', e.message); UI.toast(e.message, 'bad'); try { ST.client.leave(); } catch (er) {} ST.client = null; ST.role = 'single'; $('bJoinGo').disabled = $('codeIn').value.length !== 5; }
};
$('bMakeReply').onclick = async e => {
  const inv = $('inviteIn').value.trim(); if (!inv) { UI.toast('Paste the invite from the host first.', 'bad'); return; } A.init(); e.currentTarget.disabled = true;
  try { if (ST.client) ST.client.leave(); } catch (er) {} makeClient();
  try { const code = await Net.joinManual(inv); $('replyOut').value = code; $('replyField').hidden = false; $('bCopyReply').hidden = false; setJoinStatus('work', 'Send the reply to the host. Connecting starts when they paste it.'); }
  catch (er) { UI.toast('That invite is not valid. Ask the host to copy it again.', 'bad'); try { ST.client.leave(); } catch (x) {} ST.client = null; ST.role = 'single'; e.target.disabled = false; }
};
$('replyOut').addEventListener('focus', e => e.target.select());
$('bCopyReply').onclick = e => copyText($('replyOut').value, e.currentTarget);
$('bJoinBack').onclick = () => { teardown(); UI.show('menu'); ST.state = 'menu'; };
$('bLeave').onclick = () => { teardown(); UI.show('menu'); ST.state = 'menu'; };

function startClient(m) {
  ST.state = 'loading';
  UI.dissolve(() => {
    ST.sim = null; ST.mirror = m; ST.mode = m.mode; ST.me = ST.client.id; ST.role = 'client'; ST.over = null; ST.overlay = null;
    PD.renderBG(m.map); R.reset(); ST.feed = []; ST.chat = []; closeChat(); ST.banner = null; ST.showMap = false; ST.showScore = false; ST.lastSlot = 0;
    ST.state = 'play'; UI.hideAll(); UI.setPlaying(true); PD.debug.mirror = m; last = performance.now();
  }, { ms: 440 });
}

/* =====================================================================
   input
   ===================================================================== */
function mpos(e) { const r = cv.getBoundingClientRect(); mouse.x = (e.clientX - r.left) * PD.CW / r.width; mouse.y = (e.clientY - r.top) * PD.CH / r.height; }
cv.addEventListener('mousemove', mpos);
cv.addEventListener('mousedown', e => { mpos(e); A.init(); if (e.button === 0 && !ST.overlay) { mouse.down = true; ST.fc++; } else if (e.button === 2 && !ST.overlay) mouse.rdown = true; e.preventDefault(); });
window.addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; else if (e.button === 2) mouse.rdown = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
const meP = () => ST.role === 'client' ? (ST.mirror && ST.mirror.me()) : (ST.sim && ST.sim.pmap[ST.me]);
function slotInfo() { if (ST.role === 'client') { const h = ST.mirror && ST.mirror.hv; return h ? { n: h.w.length, cur: h.cur } : null; } const p = meP(); return p ? { n: p.weapons.length, cur: p.cur } : null; }
/* build mode state of the local player: { on, sel } */
function bmode() { if (ST.role === 'client') { const h = ST.mirror && ST.mirror.hv; return h ? { on: !!h.bm, sel: h.bs | 0 } : { on: false, sel: 0 }; } const p = meP(); return p ? { on: !!p.build, sel: p.bsel | 0 } : { on: false, sel: 0 }; }
function act(k, v) { if (ST.role === 'client') { if (ST.client) ST.client.act(k, v); } else if (ST.sim) ST.sim.act(ST.me, k, v); }
function sw2(i) { const s = slotInfo(); if (!s || i === s.cur || i >= s.n || i < 0) return; ST.lastSlot = s.cur; act('sw', i); }
cv.addEventListener('wheel', e => { if (ST.state !== 'play' || ST.overlay) return; const b = bmode(); if (b.on) { act('bsel', b.sel ^ 1); e.preventDefault(); return; } const s = slotInfo(); if (!s || s.n < 2) return; sw2((s.cur + (e.deltaY > 0 ? 1 : s.n - 1)) % s.n); e.preventDefault(); }, { passive: false });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; mouse.rdown = false; if (ST.state === 'play' && ST.role === 'single' && !ST.overlay && !UI.popup) openPause(); });
function backKey() {
  switch (UI.cur) {
    case 'look': UI.show('menu'); ST.state = 'menu'; A.play('ui:back'); break;
    case 'how': UI.show('menu'); A.play('ui:back'); break;
    case 'host': $('bHostBack').click(); break;
    case 'join': $('bJoinBack').click(); break;
    case 'wait': $('bLeave').click(); break;
  }
}
window.addEventListener('keydown', e => {
  const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) { if (e.key === 'Escape') tg.blur(); return; }
  const k = e.key.toLowerCase(); A.init();
  if (ST.state === 'play' && !ST.overlay) { keys[k] = true; if (['tab', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault(); }
  else if (k === 'escape') { if (ST.overlay === 'pause') closePause(); else backKey(); return; }
  else if (k === 'p' && ST.overlay === 'pause' && ST.role === 'single') { closePause(); return; }
  if (ST.state === 'play') {
    if (k === 'escape' || (k === 'p' && ST.role === 'single')) { if (!e.repeat) openPause(); return; }
    if (ST.overlay || e.repeat) return;
    if (k === 'enter') { if (online()) { e.preventDefault(); openChat(); } return; }
    const p = meP();
    if (k === 'r') act('rl'); else if (k === 'e') act('use'); else if (k === 'f') act('ab');
    else if (k === 'b') act('bm');
    else if (k === 'v') { const s = slotInfo(); if (s) { if (bmode().on) act('bm'); sw2(s.n - 1); } }
    else if ((k === '1' || k === '2') && bmode().on) act('bsel', +k - 1);
    else if (k >= '1' && k <= '3') sw2(+k - 1); else if (k === 'q') { const s = slotInfo(); if (s) sw2(ST.lastSlot < s.n ? ST.lastSlot : 0); }
    else if (k === 'm') ST.showMap = !ST.showMap; else if (k === 'tab') ST.showScore = true;
  }
});
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); keys[k] = false; if (k === 'tab') ST.showScore = false; });
function readInput(p) {
  if (ST.overlay || ST.chatOpen || !p) return { mx: 0, my: 0, a: 0, f: false, f2: false, ad: 0, fc: ST.fc, sp: false };
  const mwx = R.cam.x + mouse.x, mwy = R.cam.y + mouse.y;
  return { mx: (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0), my: (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0), a: Math.atan2(mwy - p.y, mwx - p.x), f: mouse.down, f2: mouse.rdown, ad: Math.hypot(mwx - p.x, mwy - p.y), fc: ST.fc, sp: !!keys['shift'] };
}

/* =====================================================================
   loop
   ===================================================================== */
function sounds(evs) {
  for (const e of evs) { if (e.t === 'snd') A.play(e.s, e.x, e.y); else if (e.t === 'hit') A.play('hit', e.x, e.y); else if (e.t === 'kill' && !e.pl) A.play('kill', e.x, e.y); else if (e.t === 'hurt' && e.id === ST.me) A.play('hurt'); }
}
function rel(list) { for (const e of list) { if (e.t === 'banner') ST.banner = { s: e.s, c: e.c || '#e8e2cf', t: 2.2 }; else if (e.t === 'feed') ST.feed.push({ s: e.s, t: 4 }); } list.length = 0; }
function frame(ts) {
  const dt = Math.min(.05, (ts - last) / 1000 || .016); last = ts; requestAnimationFrame(frame);
  if (ST.state !== 'play' && ST.state !== 'over') return;
  const client = ST.role === 'client', uiOpts = { mouse, banner: ST.banner, feed: ST.feed, showMap: ST.showMap, showScore: ST.showScore || ST.state === 'over', noCursor: !!ST.overlay || ST.state === 'over' };
  let v;
  if (client) {
    const m = ST.mirror; if (!m) return; const p0 = m.me(), inp = readInput(p0), p = m.predict(ST.state === 'play' ? dt : 0, inp);
    if (ST.state === 'play') { if (ST.client) { ST.client.sendInput(inp); ST.client.ping(); } if (p) { A.lx = p.x; A.ly = p.y; } }
    v = m.view(); sounds(m.ev); rel(m.rel); if (ST.state === 'play') R.update(dt, v); m.ev.length = 0; v.ev = [];
  } else {
    const s = ST.sim; if (!s) return; const p = s.pmap[ST.me], frozen = ST.role === 'single' && ST.overlay;
    if (ST.state === 'play' && !frozen) {
      if (p) s.setInput(ST.me, readInput(p));
      s.update(dt); if (ST.host) ST.host.step(dt);
      rel(s.rel); if (p) { A.lx = p.x; A.ly = p.y; } sounds(s.ev);
      if (s.over && !ST.over) showOver(s.over);
    } else if (ST.state === 'over' && ST.host) ST.host.step(dt);
    v = s.view(ST.me); v.ev = ST.state === 'play' && !frozen ? s.ev : []; if (ST.state === 'play' && !frozen) R.update(dt, v);
    s.ev.length = 0; s.rel.length = 0;
  }
  if (ST.banner) { ST.banner.t -= dt; if (ST.banner.t <= 0) ST.banner = null; }
  ST.feed.forEach(f => f.t -= dt); ST.feed = ST.feed.filter(f => f.t > 0).slice(-5);
  ST.chat.forEach(c => c.t -= dt); ST.chat = ST.chat.filter(c => c.t > 0);
  uiOpts.chatOpen = ST.chatOpen; uiOpts.chat = ST.chatOpen ? ST.chatHist.slice(-8).map(m => ({ n: m.name, s: m.s, sys: m.sys, a: 1 })) : ST.chat.map(c => ({ n: c.n, s: c.s, sys: c.sys, a: Math.min(1, c.t / 1.5) }));
  if (client && ST.client && ST.state === 'play') { uiOpts.ping = ST.client.rtt >= 0 ? ST.client.rtt : null; uiOpts.via = ST.net && ST.net.h ? ST.net.h.via : ''; }
  uiOpts.frozen = !!(v.g && v.g.pu && v.g.pu.freeze > 0); uiOpts.tight = !!(v.g && v.g.m === 'hide' && v.h && v.h.seek); uiOpts.banner = ST.banner; uiOpts.feed = ST.feed;
  R.draw(ctx, v, uiOpts);
}

/* =====================================================================
   results
   ===================================================================== */
function statTile(label, val, o) { const d = document.createElement('div'); d.className = 'stat' + (o && o.best ? ' best' : ''); d.innerHTML = '<b>0</b><span></span>'; d.querySelector('span').textContent = label; if (o && o.best) { const st = document.createElement('span'); st.className = 'stamp'; st.textContent = 'New best'; d.appendChild(st); } return d; }
function showOver(o) {
  if (ST.over) return; ST.over = o; ST.state = 'over'; ST.overlay = 'over'; mouse.down = false;
  const mode = o.mode, rows = o.players || [], my = rows.find(r => r.id === ST.me) || { k: 0, d: 0, score: 0, seeker: 0 }, on = online();
  let title = 'You went down', sub = '', tiles = [], boardRows = rows.slice(), winSet = {};
  const T = fmtT(o.time || 0);
  if (mode === 'pvp') {
    const w = rows.find(r => r.id === o.winner); winSet[o.winner] = 1;
    title = !w ? 'Match over' : w.id === ST.me ? 'You win' : w.name + ' wins'; sub = w && w.k >= 20 ? 'First to 20 kills.' : 'Time ran out. Most kills takes it.';
    tiles = [['Your kills', my.k], ['Deaths', my.d], ['K/D', Math.round(my.k / Math.max(1, my.d) * 100), v => (v / 100).toFixed(2)], ['Score', my.score], ['Time', o.time, fmtT]]; boardRows.sort((a, b) => b.k - a.k || a.d - b.d);
    if (rows.some(r => r.id === ST.me)) { try { localStorage.setItem('pdPvpK', (best('pdPvpK') + (my.k | 0))); localStorage.setItem('pdPvpD', (best('pdPvpD') + (my.d | 0))); } catch (e) {} UI.refreshChip(); }
  } else if (mode === 'hide') {
    const hw = o.winner === 'hiders'; title = hw ? 'Hiders survive' : 'Seekers win'; rows.forEach(r => { if (hw ? !r.seeker : r.seeker) winSet[r.id] = 1; });
    sub = my.seeker ? (hw ? 'You finished as a seeker. The hiders ran out the clock.' : 'You finished as a seeker. Nobody is left hiding.') : 'You stayed a hider to the end.';
    tiles = [['Tags', my.k], ['Score', my.score], ['Time', o.time, fmtT]]; boardRows.sort((a, b) => b.score - a.score);
  } else {
    const key = 'pdBest_' + (on ? mode : 'single'), nb = (o.round || 0) > best('pixelDeadBest'); if ((o.round || 0) > best(key)) setBest(key, o.round); if (nb) setBest('pixelDeadBest', o.round);
    title = on ? 'Everyone went down' : 'You went down'; sub = (mode === 'arena' ? 'You held the arena for ' : 'You held out for ') + T + '.';
    tiles = [[mode === 'arena' ? 'Wave' : 'Round', o.round, null, nb], [on ? 'Team kills' : 'Kills', o.kills], ['Time', o.time, fmtT], ['Score', on ? my.score : (rows[0] ? rows[0].score : 0)]]; boardRows.sort((a, b) => b.score - a.score);
  }
  $('overTitle').textContent = title; $('overSub').textContent = sub; const box = $('overStats'); box.innerHTML = '';
  tiles.forEach(t => { const el = statTile(t[0], t[1], { best: t[3] }); box.appendChild(el); });
  box.style.gridTemplateColumns = 'repeat(' + tiles.length + ', 1fr)';
  const board = $('overBoard'); board.hidden = !on || rows.length < 2;
  if (!board.hidden) {
    const showKd = mode !== 'hide'; board.innerHTML = '<thead><tr><th>Player</th><th>' + (mode === 'hide' ? 'Tags' : 'Kills') + '</th><th>Deaths</th>' + (showKd ? '<th>K/D</th>' : '') + '<th>Score</th></tr></thead><tbody></tbody>'; const tb = board.querySelector('tbody');
    boardRows.slice(0, 8).forEach((r, i) => { const tr = document.createElement('tr'); tr.style.setProperty('--i', i); if (r.id === ST.me) tr.className = 'me'; if (winSet[r.id]) tr.className += ' win'; tr.innerHTML = '<td></td><td></td><td></td>' + (showKd ? '<td></td>' : '') + '<td></td>'; const c = tr.children; c[0].textContent = r.name + (r.bot ? ' (bot)' : ''); c[1].textContent = r.k; c[2].textContent = r.d; if (showKd) c[3].textContent = PD.kd(r.k, r.d); c[c.length - 1].textContent = r.score; tb.appendChild(tr); });
  }
  $('bAgain').hidden = on; $('bLobby').hidden = ST.role !== 'host'; $('overWait').hidden = ST.role !== 'client';
  const t = $('overTitle'); t.classList.remove('slam'); void t.offsetWidth; t.classList.add('slam');
  UI.show('over', { focus: on ? (ST.role === 'host' ? '#bLobby' : '#bMenu') : '#bAgain' }); A.play('ui:slam');
  const panel = document.querySelector('#over .panel'); panel.classList.remove('shakey'); void panel.offsetWidth; panel.classList.add('shakey');
  setTimeout(() => { [...box.children].forEach((el, i) => { const t = tiles[i]; UI.countUp(el.querySelector('b'), t[1] || 0, 700 + i * 120, t[2]); }); }, 420);
}
$('bLobby').onclick = () => { const h = ST.host; if (!h) return; UI.dissolve(() => { h.toLobby(); ST.sim = null; ST.over = null; ST.overlay = null; UI.setPlaying(false); ST.state = 'host'; UI.show('host', { focus: '.modecard[aria-checked=true]' }); refreshHost(); }, { ms: 320 }); };

/* =====================================================================
   chat: lobby boxes (host + client wait screen) and the in-game bar
   ===================================================================== */
const chatBar = $('chatBar');
function sendChat(text) { text = String(text || ''); if (!text.trim()) return false; if (ST.role === 'host' && ST.host) return ST.host.chat(text); if (ST.role === 'client' && ST.client) return ST.client.chat(text); return false; }
function clearChat() { ST.chat = []; ST.chatHist = []; ST.chatOpen = false; chatBar.hidden = true; chatBar.value = ''; for (const id of ['hostChatLog', 'waitChatLog']) $(id).innerHTML = ''; }
function pushChat(m) {
  if (!m || !m.s) return; ST.chatHist.push(m); if (ST.chatHist.length > 60) ST.chatHist.shift();
  for (const id of ['hostChatLog', 'waitChatLog']) {
    const box = $(id), pin = box.scrollTop + box.clientHeight >= box.scrollHeight - 6, p = document.createElement('p');
    if (m.sys) { p.className = 'sys'; p.textContent = m.s; } else { const b = document.createElement('b'); b.textContent = m.name + ': '; p.appendChild(b); p.appendChild(document.createTextNode(m.s)); }
    box.appendChild(p); while (box.children.length > 40) box.firstChild.remove(); if (pin) box.scrollTop = box.scrollHeight;
  }
  if (!m.old && (ST.state === 'play' || ST.state === 'over')) { ST.chat.push({ n: m.name, s: m.s, sys: m.sys, t: 10 }); if (ST.chat.length > 8) ST.chat.shift(); if (!m.sys && m.id !== ST.me) A.play('ui:tick'); }
}
function bindChat(inp, btn) {
  const go = () => { if (sendChat(inp.value)) { inp.value = ''; } else if (inp.value.trim()) { inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake'); } };
  btn.onclick = go; inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
}
bindChat($('hostChatIn'), $('hostChatGo')); bindChat($('waitChatIn'), $('waitChatGo'));
function openChat() {
  if (ST.state !== 'play' || ST.overlay || !online() || ST.chatOpen) return;
  const r = cv.getBoundingClientRect(); chatBar.style.left = Math.round(r.left + 6) + 'px'; chatBar.style.bottom = Math.round(innerHeight - r.bottom + 4) + 'px'; chatBar.style.width = Math.round(Math.min(r.width * .6, 460)) + 'px';
  for (const k in keys) keys[k] = false; mouse.down = false; mouse.rdown = false;
  ST.chatOpen = true; chatBar.value = ''; chatBar.hidden = false; chatBar.focus();
}
function closeChat() { if (!ST.chatOpen && chatBar.hidden) return; ST.chatOpen = false; chatBar.hidden = true; chatBar.value = ''; }
chatBar.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); sendChat(chatBar.value); chatBar.blur(); }
  else if (e.key === 'Escape') { e.preventDefault(); chatBar.blur(); }
  e.stopPropagation();
});
chatBar.addEventListener('blur', closeChat);

/* =====================================================================
   connection info: selected ICE candidate type per peer, refreshed every few seconds while online
   ===================================================================== */
let netBusy = false;
async function pollNet() {
  if (netBusy || !online() || !Net.role) return; netBusy = true;
  try {
    const st = await Net.stats(); ST.net = st;
    if (ST.role === 'host') { const ids = Object.keys(st).filter(k => st[k]); const rel = ids.filter(k => st[k].via === 'relay').length; $('hostConn').textContent = ids.length ? 'Connections: ' + (ids.length - rel) + ' direct' + (rel ? ', ' + rel + ' through a relay' : '') + '.' : ''; }
    else if (st.h) $('waitConn').textContent = 'Connection to host: ' + (st.h.via === 'relay' ? 'through a relay' : 'direct') + (st.h.rtt >= 0 ? ', ' + st.h.rtt + ' ms' : '') + '.';
  } catch (e) {}
  netBusy = false;
}
setInterval(pollNet, 2500);

/* connection settings (How to play): TURN relay and relay-only test switch, stored in localStorage (read by net.js for each new peer) */
(function () {
  const h = $('turnHost'), u = $('turnUser'), c = $('turnCred'), ro = $('relayOnly');
  try { const t = JSON.parse(localStorage.getItem('pdTurn') || 'null'); if (Array.isArray(t) && t[0]) { h.value = t[0].host || ''; u.value = t[0].username || ''; c.value = t[0].credential || ''; } ro.checked = localStorage.getItem('pdRelayOnly') === '1'; } catch (e) {}
  const save = () => {
    const host = h.value.trim().replace(/^(turns?:)?\/*/i, '').replace(/[:/].*$/, '');
    try { if (host) localStorage.setItem('pdTurn', JSON.stringify([{ host, username: u.value.trim(), credential: c.value.trim() }])); else localStorage.removeItem('pdTurn'); localStorage.setItem('pdRelayOnly', ro.checked ? '1' : '0'); } catch (e) {}
    $('turnNote').textContent = host ? 'Saved on this device. Your relay is used instead of the shared one.' : 'Saved on this device. Applies to the next room you host or join.';
  };
  [h, u, c].forEach(el => el.addEventListener('input', save)); ro.addEventListener('change', save);
})();

/* =====================================================================
   boot
   ===================================================================== */
PD.debug = { ST, UI, start: startSingle, get sim() { return ST.sim; }, set sim(v) {}, get mirror() { return ST.mirror; }, set mirror(v) {}, openHost, openJoin, showOver, sendChat, pushChat, pollNet, openChat, closeChat };
ST.state = 'menu'; requestAnimationFrame(frame);
UI.show('menu', { noFocus: !!UI.params.get('go') });
const go = UI.params.get('go'); if (go === 'host') setTimeout(() => $('bHost').click(), 450); else if (go === 'join') setTimeout(() => $('bJoin').click(), 450);
})();
