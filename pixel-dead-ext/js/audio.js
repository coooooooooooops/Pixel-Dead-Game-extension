/* Pixel Dead v2 - audio.js : synthesized WebAudio sfx with positional volume */
(function (root) {
'use strict';
const PD = root.PD; let ac = null, master = null, nbuf = null;
const A = PD.audio = { lx: 0, ly: 0, on: true, vol: .6 };
try { if (root.localStorage && root.localStorage.getItem('pdSound') === '0') A.on = false; } catch (e) {}
A.init = function () {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try { ac = new (root.AudioContext || root.webkitAudioContext)(); } catch (e) { return; }
  master = ac.createGain(); master.gain.value = A.vol; master.connect(ac.destination);
  nbuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
};
function tone(f, dur, type, vol, slide, delay, g0) {
  if (!ac) return; const t0 = ac.currentTime + (delay || 0), o = ac.createOscillator(); o.type = type || 'square';
  o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  const g = ac.createGain(); g.gain.setValueAtTime((vol || .1) * (g0 == null ? 1 : g0), t0); g.gain.exponentialRampToValueAtTime(.001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur);
}
function noise(dur, vol, fc, g0, hp) {
  if (!ac) return; const t0 = ac.currentTime, s = ac.createBufferSource(); s.buffer = nbuf;
  const f = ac.createBiquadFilter(); f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = fc || 2000;
  const g = ac.createGain(); g.gain.setValueAtTime((vol || .2) * (g0 == null ? 1 : g0), t0); g.gain.exponentialRampToValueAtTime(.001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t0, Math.random() * .5, dur);
}
const S = {
  'shot:m1911': g => noise(.09, .25, 3200, g), 'shot:revolver': g => { noise(.22, .4, 2000, g); tone(90, .2, 'sawtooth', .15, 40, 0, g); },
  'shot:pump': g => noise(.22, .38, 1700, g), 'shot:smg': g => noise(.06, .2, 4200, g), 'shot:ak': g => { noise(.08, .26, 3000, g); tone(120, .06, 'square', .08, 60, 0, g); },
  'shot:sniper': g => { noise(.35, .4, 1400, g); tone(70, .3, 'sawtooth', .18, 30, 0, g); }, 'shot:minigun': g => noise(.05, .2, 3600, g),
  'shot:flamer': g => noise(.08, .16, 900, g), 'shot:rpg': g => { noise(.35, .3, 800, g); tone(200, .3, 'sawtooth', .1, 60, 0, g); },
  'shot:gl': g => { tone(150, .12, 'square', .14, 60, 0, g); noise(.1, .2, 1200, g); }, 'shot:rail': g => { tone(900, .35, 'sawtooth', .16, 80, 0, g); noise(.2, .25, 6000, g, 1); },
  'shot:tesla': g => { tone(1200, .08, 'square', .08, 300, 0, g); noise(.08, .18, 5000, g, 1); }, 'shot:plasma': g => tone(700, .1, 'sine', .12, 200, 0, g),
  'shot:golden': g => { noise(.08, .22, 3600, g); tone(1500, .1, 'triangle', .08, 900, 0, g); }, 'shot:crossbow': g => { tone(240, .14, 'triangle', .14, 90, 0, g); noise(.05, .12, 2600, g); },
  'shot:aa12': g => noise(.12, .3, 1900, g), 'shot:leech': g => { noise(.06, .18, 3000, g); tone(180, .08, 'sine', .08, 90, 0, g); },
  'shot:laser': g => tone(1500, .06, 'sawtooth', .07, 600, 0, g), 'shot:cryo': g => noise(.08, .14, 7000, g),
  coin: g => { tone(1320, .06, 'square', .06, 0, 0, g); tone(1760, .12, 'square', .06, 0, .06, g); },
  swing: g => noise(.1, .22, 6000, g, 1), hit: g => tone(110, .06, 'square', .08, 60, 0, g), zhit: g => tone(160, .1, 'sawtooth', .1, 70, 0, g),
  kill: g => tone(70, .18, 'sawtooth', .12, 30, 0, g), buy: g => { tone(660, .08, 'square', .08, 0, 0, g); tone(990, .12, 'square', .08, 0, .08, g); },
  deny: g => tone(90, .15, 'square', .1, 0, 0, g), reload: g => { tone(200, .04, 'square', .06, 0, 0, g); tone(260, .04, 'square', .06, 0, .4, g); }, sw: g => tone(300, .04, 'square', .05, 0, 0, g),
  hurt: g => tone(140, .2, 'sawtooth', .15, 50, 0, g), groan: g => tone(55 + Math.random() * 30, .5, 'sawtooth', .05, 38, 0, g),
  roundStart: () => [0, .18, .36, .62].forEach((d, i) => tone([196, 165, 147, 110][i], .3, 'triangle', .13, 0, d)),
  roundEnd: () => [0, .15, .3].forEach((d, i) => tone([262, 330, 392][i], .25, 'triangle', .1, 0, d)),
  power: g => { tone(520, .1, 'square', .08, 0, 0, g); tone(780, .1, 'square', .08, 0, .1, g); tone(1040, .18, 'square', .08, 0, .2, g); },
  down: g => tone(180, 1.2, 'sawtooth', .18, 30, 0, g), boom: g => { noise(.6, .5, 500, g); tone(60, .5, 'sawtooth', .2, 25, 0, g); },
  roar: g => { tone(70, 1, 'sawtooth', .2, 30, 0, g); tone(95, 1, 'square', .1, 40, 0, g); noise(.8, .15, 500, g); },
  'ui:tick': g => tone(1500, .018, 'square', .022, 0, 0, g),
  'ui:click': g => { tone(520, .05, 'square', .07, 0, 0, g); tone(780, .07, 'square', .05, 0, .04, g); },
  'ui:back': g => tone(360, .09, 'square', .06, 200, 0, g),
  'ui:pick': g => tone(900, .05, 'triangle', .09, 1300, 0, g),
  'ui:open': g => { tone(220, .06, 'square', .05, 0, 0, g); tone(330, .09, 'square', .05, 0, .05, g); },
  'ui:join': g => [0, .07, .14].forEach((d, i) => tone([523, 659, 784][i], .09, 'square', .06, 0, d, g)),
  'ui:err': g => { tone(170, .12, 'sawtooth', .08, 90, 0, g); tone(125, .14, 'sawtooth', .08, 70, .1, g); },
  'ui:slam': g => { tone(85, .28, 'sawtooth', .16, 30, 0, g); noise(.2, .25, 900, g); },
  'ui:count': g => tone(1100, .025, 'square', .028, 0, 0, g),
  'ui:start': g => { tone(110, .4, 'sawtooth', .12, 260, 0, g); noise(.35, .1, 2500, g, 1); },
  'ui:copy': g => { tone(880, .05, 'square', .06, 0, 0, g); tone(1320, .08, 'square', .05, 0, .05, g); },
  mine: g => { noise(.05, .22, 2600, g, 1); tone(240, .06, 'square', .08, 120, 0, g); }, build: g => { tone(150, .07, 'square', .1, 90, 0, g); noise(.06, .16, 1500, g); },
  smash: g => { noise(.25, .4, 700, g); tone(80, .15, 'square', .12, 40, 0, g); }, spit: g => tone(400, .2, 'sawtooth', .07, 120, 0, g),
};
A.play = function (name, x, y) {
  if (!ac || !A.on || !S[name]) return;
  let g = 1; if (x != null) g = Math.pow(PD.clamp(1 - Math.hypot(x - A.lx, y - A.ly) / 420, 0, 1), 1.5);
  if (g < .02) return; S[name](g);
};
A.setOn = v => { A.on = !!v; try { localStorage.setItem('pdSound', v ? '1' : '0'); } catch (e) {} };
A.setVol = v => { A.vol = v; if (master) master.gain.value = v; };
})(typeof window !== 'undefined' ? window : globalThis);
