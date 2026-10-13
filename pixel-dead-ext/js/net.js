/* Pixel Dead v2 - net.js : WebRTC data channels, room codes over public MQTT brokers, manual copy/paste codes.
   Host-authoritative star topology. Host is always peer id "p1"; joiners get p2..p8 from the host.
   ICE: STUN (google, cloudflare) + optional TURN (your own via Connection settings / PD_TURN / localStorage.pdTurn, else the shared Open Relay as an UNVERIFIED best effort).
   Without a working relay, strict / symmetric NATs can still fail. Manual codes need no signaling servers but still need STUN or a LAN. */
(function (root) {
'use strict';
const PD = root.PD = root.PD || {};
const TE = new TextEncoder(), TD = new TextDecoder();

/* =====================================================================
   MQTT 3.1.1 : just enough for CONNECT / SUBSCRIBE / PUBLISH (QoS 0) / PING
   ===================================================================== */
function varint(n) { const b = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; b.push(d); } while (n > 0); return b; }
function mstr(s) { const u = TE.encode(s); const o = new Uint8Array(2 + u.length); o[0] = u.length >> 8; o[1] = u.length & 255; o.set(u, 2); return o; }
function cat(parts) { let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; }
function packet(first, body) { return cat([Uint8Array.from([first, ...varint(body.length)]), body]); }
const MQ = PD.mqtt = {
  connect(clientId, keepalive) { return packet(0x10, cat([Uint8Array.from([0, 4, 77, 81, 84, 84, 4, 2, keepalive >> 8, keepalive & 255]), mstr(clientId)])); },
  subscribe(id, topic) { return packet(0x82, cat([Uint8Array.from([id >> 8, id & 255]), mstr(topic), Uint8Array.from([0])])); },
  publish(topic, payload) { return packet(0x30, cat([mstr(topic), typeof payload === 'string' ? TE.encode(payload) : payload])); },
  ping() { return Uint8Array.from([0xC0, 0]); },
  /* stream parser: feed() any chunking, emits {type:'connack'|'suback'|'publish'|'pingresp'|'other', ...} */
  Parser: class {
    constructor(onpacket) { this.buf = new Uint8Array(0); this.on = onpacket; }
    feed(chunk) {
      this.buf = this.buf.length ? cat([this.buf, chunk]) : chunk;
      for (;;) {
        const b = this.buf; if (b.length < 2) return;
        let rem = 0, mul = 1, i = 1, ok = false;
        while (i < b.length && i <= 4) { const d = b[i++]; rem += (d & 127) * mul; mul *= 128; if (!(d & 128)) { ok = true; break; } }
        if (!ok) { if (i > 4) throw new Error('bad MQTT length'); return; }
        if (b.length < i + rem) return;
        const body = b.subarray(i, i + rem), t = b[0] >> 4, fl = b[0] & 15; this.buf = b.subarray(i + rem);
        if (t === 2) this.on({ type: 'connack', code: body[1] });
        else if (t === 9) this.on({ type: 'suback' });
        else if (t === 13) this.on({ type: 'pingresp' });
        else if (t === 3) {
          const tl = (body[0] << 8) | body[1], topic = TD.decode(body.subarray(2, 2 + tl)), qos = (fl >> 1) & 3, off = 2 + tl + (qos ? 2 : 0), payload = body.slice(off);
          this.on({ type: 'publish', topic, payload, text: TD.decode(payload) });
        } else this.on({ type: 'other', t });
      }
    }
  },
};

class MqttConn {
  constructor(url) { this.url = url; this.ws = null; this.ready = false; this.subs = []; this.onmsg = null; this.ping = 0; this.pid = 1; this.dead = false; }
  open(ms) {
    return new Promise((res, rej) => {
      let done = false; const fail = e => { if (!done) { done = true; rej(e); } this.close(); };
      const to = setTimeout(() => fail(new Error('timeout ' + this.url)), ms || 6000);
      let ws; try { ws = this.ws = new WebSocket(this.url, 'mqtt'); } catch (e) { clearTimeout(to); return fail(e); }
      ws.binaryType = 'arraybuffer';
      const parser = new MQ.Parser(p => {
        if (p.type === 'connack') { if (p.code === 0) { this.ready = true; if (!done) { done = true; clearTimeout(to); res(this); } this.ping = setInterval(() => this.raw(MQ.ping()), 20000); this.subs.forEach(t => this.raw(MQ.subscribe(this.pid++, t))); } else fail(new Error('refused ' + p.code)); }
        else if (p.type === 'publish' && this.onmsg) this.onmsg(p.topic, p.text, this);
      });
      ws.onopen = () => ws.send(MQ.connect('pd' + Math.random().toString(36).slice(2, 10), 30));
      ws.onmessage = e => { try { parser.feed(new Uint8Array(e.data)); } catch (er) { fail(er); } };
      ws.onerror = () => fail(new Error('ws error ' + this.url));
      ws.onclose = () => { this.ready = false; clearInterval(this.ping); this.dead = true; if (!done) { done = true; clearTimeout(to); rej(new Error('closed ' + this.url)); } };
    });
  }
  raw(u8) { if (this.ws && this.ws.readyState === 1) this.ws.send(u8); }
  subscribe(topic) { this.subs.push(topic); if (this.ready) this.raw(MQ.subscribe(this.pid++, topic)); }
  publish(topic, text) { if (this.ready) this.raw(MQ.publish(topic, text)); }
  close() { this.dead = true; clearInterval(this.ping); try { this.ws && this.ws.close(); } catch (e) {} }
}

PD.DEFAULT_BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://mqtt.eclipseprojects.io:443/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
function brokers() {
  if (Array.isArray(root.PD_BROKERS) && root.PD_BROKERS.length) return root.PD_BROKERS;
  try { const o = JSON.parse(root.localStorage.getItem('pdBrokers') || 'null'); if (Array.isArray(o) && o.length) return o; } catch (e) {}
  return PD.DEFAULT_BROKERS;
}
const uid = n => { let s = ''; const A = 'abcdefghijklmnopqrstuvwxyz0123456789'; for (let i = 0; i < (n || 8); i++) s += A[(Math.random() * A.length) | 0]; return s; };
const TOP = 'pixeldead-ext/v1/';

/* Connects to ALL brokers at once, resolves when the first one is up, publishes on every live one, de-dupes by message uid. */
class Hub {
  constructor() { this.conns = []; this.seen = new Set(); this.onmsg = null; this.topics = []; this.closed = false; }
  connect(topics) {
    this.topics = topics;
    const list = brokers();
    return new Promise((res, rej) => {
      let pending = list.length, any = false;
      for (const url of list) {
        const c = new MqttConn(url); topics.forEach(t => c.subscribe(t));
        c.onmsg = (topic, text) => { let m; try { m = JSON.parse(text); } catch (e) { return; } if (m.u) { if (this.seen.has(m.u)) return; this.seen.add(m.u); if (this.seen.size > 500) this.seen.clear(); } if (this.onmsg) this.onmsg(m, topic); };
        c.open(6000).then(() => { any = true; if (this.closed) c.close(); else { this.conns.push(c); res(); } }).catch(() => { if (--pending === 0 && !any) rej(new Error('Could not reach any signaling server')); });
      }
    });
  }
  publish(topic, obj) { obj.u = obj.u || uid(10); const t = JSON.stringify(obj); for (const c of this.conns) c.publish(topic, t); }
  close() { this.closed = true; this.conns.forEach(c => c.close()); this.conns = []; }
}

/* =====================================================================
   WebRTC peer: two data channels, ctl (reliable) + st (unreliable, unordered)
   ===================================================================== */
/* ---- timeouts (ms), exported for tests ---- */
const T = { gather: 5000, srflxGrace: 2000, relayGrace: 300, join: 25000, host: 35000, grace: 8000, ctlFallback: 1500 };
/* ---- ICE configuration: one place, used by every peer ---- */
const STUN = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'];
/* shared public relay, best effort only: availability and quotas are UNVERIFIED. Skipped when you set your own TURN or pdNoRelay=1. */
const PUBLIC_RELAY = { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' };
const lsGet = k => { try { return root.localStorage.getItem(k); } catch (e) { return null; } };
const okUrl = u => typeof u === 'string' && /^(stun|turn|turns):[^\s]+$/i.test(u) && u.length < 200;
/* accepts [{urls, username, credential}] or the short form [{host, username, credential}] which expands to udp 3478, tcp 3478 and tls 443 */
function cleanTurn(list) {
  const out = []; if (!Array.isArray(list)) return out;
  for (const e of list.slice(0, 6)) {
    if (!e || typeof e !== 'object') continue; let urls = [];
    if (typeof e.host === 'string' && /^[\w.\-]{1,120}(:\d{1,5})?$/.test(e.host)) { const h = e.host.replace(/:\d+$/, ''); urls = ['turn:' + h + ':3478?transport=udp', 'turn:' + h + ':3478?transport=tcp', 'turns:' + h + ':443?transport=tcp']; }
    else urls = (Array.isArray(e.urls) ? e.urls : [e.urls]).filter(okUrl);
    if (!urls.length) continue; const o = { urls };
    if (typeof e.username === 'string') o.username = e.username.slice(0, 200); if (typeof e.credential === 'string') o.credential = e.credential.slice(0, 300);
    out.push(o);
  }
  return out;
}
function userTurn() {
  if (Array.isArray(root.PD_TURN) && root.PD_TURN.length) return cleanTurn(root.PD_TURN);
  try { const o = JSON.parse(lsGet('pdTurn') || 'null'); if (Array.isArray(o) && o.length) return cleanTurn(o); } catch (e) {}
  return [];
}
const relayOnly = () => !!root.PD_RELAY_ONLY || lsGet('pdRelayOnly') === '1';
function iceConfig() {
  const servers = [{ urls: STUN.slice() }], mine = userTurn();
  for (const t of mine) servers.push(t);
  if (!mine.length && !root.PD_NO_PUBLIC_RELAY && lsGet('pdNoRelay') !== '1') servers.push({ urls: PUBLIC_RELAY.urls.slice(), username: PUBLIC_RELAY.username, credential: PUBLIC_RELAY.credential });
  const cfg = { iceServers: servers, iceCandidatePoolSize: 4 };
  if (relayOnly()) cfg.iceTransportPolicy = 'relay';
  return cfg;
}
PD.iceConfig = iceConfig;
const candType = c => c ? (c.type || ((/ typ (\w+)/.exec(c.candidate || '') || [])[1]) || '') : '';
/* Non-trickle gathering. Resolves when gathering completes, or soon after a relay candidate shows up, or a grace period after the
   first server-reflexive one (so a dead TURN server cannot stall everybody), or at the hard limit. Records what it found on pc.__gather. */
function gathered(pc, hardMs, srflxMs, relayMs) {
  hardMs = hardMs || T.gather; srflxMs = srflxMs == null ? T.srflxGrace : srflxMs; relayMs = relayMs == null ? T.relayGrace : relayMs;
  const g = pc.__gather = { why: '', host: 0, srflx: 0, relay: 0, ms: 0 }, t0 = Date.now();
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') { g.why = 'complete'; return res(g); }
    let done = false, soft = 0;
    const fin = why => { if (done) return; done = true; clearTimeout(hard); clearTimeout(soft); pc.removeEventListener('icegatheringstatechange', chk); pc.removeEventListener('icecandidate', onc); g.why = why; g.ms = Date.now() - t0; res(g); };
    const chk = () => { if (pc.iceGatheringState === 'complete') fin('complete'); };
    const see = ty => {
      if (g[ty] == null) return; g[ty]++;
      if (ty === 'relay' && g.relay === 1) { clearTimeout(soft); soft = setTimeout(() => fin('relay'), relayMs); }
      else if (ty === 'srflx' && g.srflx === 1 && !g.relay) { clearTimeout(soft); soft = setTimeout(() => fin('srflx'), srflxMs); }
    };
    const onc = e => { const c = e.candidate; if (c && c.candidate) see(candType(c)); };
    const hard = setTimeout(() => fin('timeout'), hardMs);
    pc.addEventListener('icegatheringstatechange', chk); pc.addEventListener('icecandidate', onc);
    // candidates gathered before we started listening (candidate pool) are already in the local description
    try { const sdp = pc.localDescription && pc.localDescription.sdp || ''; for (const m of sdp.matchAll(/^a=candidate:.* typ (\w+)/gm)) see(m[1]); } catch (e) {}
  });
}
const encCode = d => btoa(unescape(encodeURIComponent(JSON.stringify({ type: d.type, sdp: d.sdp }))));
const decCode = c => { const o = JSON.parse(decodeURIComponent(escape(atob(String(c).replace(/\s+/g, ''))))); if (!o || !o.sdp || !o.type) throw new Error('not a valid code'); return o; };
PD.encCode = encCode; PD.decCode = decCode;

class Peer {
  constructor(net, pid, isHost) {
    this.net = net; this.pid = pid; this.isHost = isHost; this.open = false; this.closed = false; this.ctl = null; this.st = null; this.uid = null; this.t0 = Date.now();
    const pc = this.pc = new RTCPeerConnection(iceConfig());
    if (isHost) { this.attach(pc.createDataChannel('ctl')); this.attach(pc.createDataChannel('st', { ordered: false, maxRetransmits: 0 })); }
    else pc.ondatachannel = e => this.attach(e.channel);
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState; clearTimeout(this.dt);
      if (s === 'failed' || s === 'closed') this.drop(s);
      else if (s === 'disconnected') this.dt = setTimeout(() => { if (pc.connectionState === 'disconnected') this.drop('disconnected'); }, T.grace);
    };
  }
  attach(ch) {
    if (ch.label === 'st') this.st = ch; else this.ctl = ch;
    ch.onopen = () => this.check(); ch.onclose = () => { if (ch.label === 'ctl') this.drop('channel closed'); };
    ch.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (er) { return; } this.net.onmsg(this.pid, m); };
    this.check();
  }
  check() {
    if (this.open || this.closed) return;
    const c = this.ctl && this.ctl.readyState === 'open', s = this.st && this.st.readyState === 'open';
    if (c && s) this.markOpen();
    else if (c && !this.fb) this.fb = setTimeout(() => this.markOpen(), T.ctlFallback);   // fall back to ctl only
  }
  markOpen() { if (this.open || this.closed) return; this.open = true; clearTimeout(this.fb); if (this.net._open) this.net._open(this.pid); this.net.onopen(this.pid); }
  send(obj, reliable) {
    if (!this.open) return; const data = typeof obj === 'string' ? obj : JSON.stringify(obj);
    const ch = reliable === false && this.st && this.st.readyState === 'open' ? this.st : this.ctl;
    if (ch && ch.readyState === 'open') { if (ch === this.st && ch.bufferedAmount > 65536) return; try { ch.send(data); } catch (e) {} }
  }
  /* selected candidate pair: {type host|srflx|prflx|relay, via direct|relay, proto, rtt} or null */
  async stats() {
    try {
      const rep = await Promise.race([this.pc.getStats(), new Promise((_, rej) => setTimeout(() => rej(new Error('stats timeout')), 1500))]), by = {}; let tr = null, pair = null;
      rep.forEach(r => { by[r.id] = r; if (r.type === 'transport' && r.selectedCandidatePairId) tr = r; });
      if (tr) pair = by[tr.selectedCandidatePairId];
      if (!pair) rep.forEach(r => { if (!pair && r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) pair = r; });
      if (!pair) return null;
      const l = by[pair.localCandidateId] || {}, rm = by[pair.remoteCandidateId] || {}, a = l.candidateType || '', b = rm.candidateType || '';
      const type = a === 'relay' || b === 'relay' ? 'relay' : a === 'srflx' || b === 'srflx' ? 'srflx' : a === 'prflx' || b === 'prflx' ? 'prflx' : (a || b || 'host');
      return { type, via: type === 'relay' ? 'relay' : 'direct', proto: l.protocol || rm.protocol || '', rtt: typeof pair.currentRoundTripTime === 'number' ? Math.round(pair.currentRoundTripTime * 1000) : -1 };
    } catch (e) { return null; }
  }
  drop(why) {
    if (this.closed) return; this.closed = true; clearTimeout(this.fb); clearTimeout(this.dt); const was = this.open; this.open = false;
    try { this.pc.close(); } catch (e) {}
    this.net.forget(this); this.net.onclose(this.pid, why, was);
  }
}

/* =====================================================================
   Net: the public API
   ===================================================================== */
const Net = PD.Net = {
  role: null, peers: {}, byUid: {}, room: null, hub: null, accepting: true, maxPlayers: 8,
  onopen() {}, onclose() {}, onmsg() {}, onstatus() {},
  status(s) { try { Net.onstatus(s); } catch (e) {} },
  forget(peer) { if (Net.peers[peer.pid] === peer) delete Net.peers[peer.pid]; if (peer.uid && Net.byUid[peer.uid] === peer) delete Net.byUid[peer.uid]; },
  count() { return Object.keys(Net.peers).length; },
  close() {
    for (const id in Net.peers) { const p = Net.peers[id]; p.closed = true; try { p.pc.close(); } catch (e) {} }
    Net.peers = {}; Net.byUid = {}; if (Net.hub) Net.hub.close(); Net.hub = null; Net.room = null; Net.role = null; Net.accepting = true; Net._open = null;
  },
  drop(pid) { const p = Net.peers[pid]; if (p) p.drop('removed'); },
  send(pid, obj, reliable) { const p = Net.peers[pid]; if (p) p.send(obj, reliable); },
  broadcast(obj, reliable, except) { const d = JSON.stringify(obj); for (const id in Net.peers) if (id !== except) Net.peers[id].send(d, reliable); },
  /* per open peer: selected candidate type (host / srflx / relay) - shown in the lobby */
  async stats() { const out = {}; for (const id in Net.peers) { const p = Net.peers[id]; if (p && p.open) out[id] = await p.stats(); } return out; },
  iceConfig, T, _t: { cleanTurn, gathered, Peer },
  nextPid() { for (let i = 2; i <= Net.maxPlayers; i++) if (!Net.peers['p' + i]) return 'p' + i; return null; },

  /* ---------- host: room code via MQTT ---------- */
  async hostRoom() {
    Net.close(); Net.role = 'host'; const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let room = ''; for (let i = 0; i < 5; i++) room += A[(Math.random() * A.length) | 0];
    Net.room = room; Net.hub = new Hub(); Net.hub.onmsg = m => hostSignal(room, m);
    Net.status('Opening room...'); await Net.hub.connect([TOP + room + '/h']); Net.status('Room open'); return room;
  },
  /* ---------- host: manual codes ---------- */
  async hostManualOffer() {
    if (Net.role !== 'host') { Net.close(); Net.role = 'host'; }
    const pid = Net.nextPid(); if (!pid) throw new Error('Room is full');
    const peer = new Peer(Net, pid, true); Net.peers[pid] = peer; const pc = peer.pc;
    await pc.setLocalDescription(await pc.createOffer()); await gathered(pc);
    return { pid, code: encCode(pc.localDescription) };
  },
  async hostManualAnswer(pid, code) { const p = Net.peers[pid]; if (!p) throw new Error('That slot was closed'); await p.pc.setRemoteDescription(decCode(code)); },
  cancelManual(pid) { const p = Net.peers[pid]; if (p && !p.open) { p.closed = true; try { p.pc.close(); } catch (e) {} Net.forget(p); } },

  /* ---------- joiner: room code ---------- */
  joinRoom(code) {
    Net.close(); Net.role = 'client'; code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); const me = uid(8);
    return new Promise(async (res, rej) => {
      let gotOffer = false, finished = false, timer = 0;
      const fail = e => { if (finished) return; finished = true; clearInterval(timer); Net.close(); rej(e instanceof Error ? e : new Error(e)); };
      const hub = Net.hub = new Hub();
      try { Net.status('Contacting relay...'); await hub.connect([TOP + code + '/' + me]); } catch (e) { return fail(new Error('Could not reach a relay server. Check your connection or use a copy-paste code.')); }
      Net._open = pid => { if (!finished && pid === 'h') { finished = true; clearInterval(timer); res(true); } };
      hub.onmsg = async m => {
        if (m.k === 'full') return fail(new Error('That room is full or already playing.'));
        if (m.k !== 'offer' || gotOffer || !m.sdp) return; gotOffer = true; clearInterval(timer); Net.status('Connecting to host...');
        try {
          const peer = new Peer(Net, 'h', false); Net.peers.h = peer; const pc = peer.pc;
          await pc.setRemoteDescription(m.sdp); await pc.setLocalDescription(await pc.createAnswer()); await gathered(pc);
          hub.publish(TOP + code + '/h', { k: 'answer', from: me, sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
          setTimeout(() => { if (!finished) fail(new Error('Could not connect to the host. Strict networks can block direct connections. Try a copy-paste code, or set a TURN server under How to play.')); }, T.join);
        } catch (e) { fail(e); }
      };
      let tries = 0; const send = () => { if (gotOffer || finished) return; if (tries++ > 6) return fail(new Error('Room not found. Check the code and try again.')); hub.publish(TOP + code + '/h', { k: 'join', from: me }); };
      Net.status('Looking for room ' + code + '...'); send(); timer = setInterval(send, 2000);
    });
  },
  /* ---------- joiner: manual codes, returns the answer code to send back ---------- */
  async joinManual(offerCode) {
    Net.close(); Net.role = 'client'; const peer = new Peer(Net, 'h', false); Net.peers.h = peer; const pc = peer.pc;
    await pc.setRemoteDescription(decCode(offerCode)); await pc.setLocalDescription(await pc.createAnswer()); await gathered(pc);
    return encCode(pc.localDescription);
  },
};

/* host side of the room-code handshake */
async function hostSignal(room, m) {
  if (Net.role !== 'host' || !m || !m.from) return; const reply = o => Net.hub && Net.hub.publish(TOP + room + '/' + m.from, o);
  if (m.k === 'join') {
    const ex = Net.byUid[m.from];
    if (ex) { if (!ex.open && ex.offerMsg) reply(ex.offerMsg); return; }
    const pid = Net.nextPid(); if (!Net.accepting || !pid) return reply({ k: 'full' });
    const peer = new Peer(Net, pid, true); peer.uid = m.from; Net.peers[pid] = peer; Net.byUid[m.from] = peer;
    try {
      await peer.pc.setLocalDescription(await peer.pc.createOffer()); await gathered(peer.pc);
      peer.offerMsg = { k: 'offer', sdp: { type: peer.pc.localDescription.type, sdp: peer.pc.localDescription.sdp } }; reply(peer.offerMsg);
      setTimeout(() => { if (!peer.open && !peer.closed) peer.drop('handshake timeout'); }, T.host);
    } catch (e) { peer.drop('offer failed'); }
  } else if (m.k === 'answer' && m.sdp) {
    const peer = Net.byUid[m.from]; if (!peer || peer.answered) return; peer.answered = true;
    try { await peer.pc.setRemoteDescription(m.sdp); } catch (e) { peer.drop('bad answer'); }
  }
}
})(typeof window !== 'undefined' ? window : globalThis);
