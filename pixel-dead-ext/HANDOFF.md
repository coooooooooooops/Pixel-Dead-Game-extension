# PIXEL DEAD v2.3 — HANDOFF (checkpoint 11: online verification run; no game code changed since checkpoint 10)

Date: 2026-10-14 · Package: `pixel-dead-checkpoint11.zip` · Target: Chrome MV3 extension (`pixel-dead-ext/`)
Standing user instructions: when they ask to package, do it immediately (zip + updated handoff). Package at 80-85% of a session. Never claim something works that is not under "VERIFIED". Final online testing is done ELSEWHERE, not in the session that produced this file.
Older docs: `HANDOFF_checkpoint10.md` (Dead Town in PvP + Colosseum redesign), `HANDOFF_checkpoint9.md` (bots/chat/K-D/network, the full online TODO list), `HANDOFF_checkpoint8.md` (new maps + bot AI), 7, 6, 5, 4, 3.

## 000. Checkpoint 11: ONLINE VERIFICATION (this supersedes the "NOT VERIFIED / online" parts of sections 0, 3 and 4 below)
No game code changed. Added test scripts only: `onlinemaps.py`, `onlinerelay.py` (`onlinebrowser.py` already existed). All three drive TWO real Chromium pages over REAL WebRTC data channels with the included local MQTT broker (`mqttbroker.js`), flags `--no-sandbox --allow-loopback-in-peer-connection --disable-features=WebRtcHideLocalIpsWithMdns`.
### VERIFIED (ran, all passed, no page/console errors)
- `python3 onlinebrowser.py` (BROWSER ONLINE TEST PASSED, 40+ checks): room code join, host+client lobbies, bot seats on both sides ("2 bots will join"), lobby chat both ways (sanitised, echoed), connection lines (host "1 direct", client "direct, N ms"), start PvP on The Crucible, host sim 2 humans + 2 bots, client mirror has the same 4 names, bots move, `client.rtt` measured (9 ms), link reported direct, in-game chat bar (Enter opens, Esc cancels, WASD typed in chat does not move, host and client messages arrive), match end on both sides, results K/D tile + column + "(bot)" tags, `pdPvpK/D` saved, menu chip "PvP K/D", lobby chat after a game, chat cleared on leave/teardown.
- `python3 onlinemaps.py` (ONLINE MAPS TEST PASSED): online PvP on **Dead Town** (200x150) and on the **new Colosseum** (84x60): map card offered in the host lobby and clickable, client lobby shows the map name, both reach play, client generated a tile-for-tile identical map (hash), players on open ground after 6 s, ping works, client->host chat works.
- `python3 onlinerelay.py` (RELAY TEST PASSED): local **coturn** (`apt-get update && apt-get install -y coturn`; run `setsid turnserver -n --listening-ip=127.0.0.1 --relay-ip=127.0.0.1 --min-port=50000 --max-port=50200 --lt-cred-mech --user=u:p --realm=pd --no-tls --no-dtls --no-cli --allow-loopback-peers`), TURN entered as `{host:'127.0.0.1',username:'u',credential:'p'}` + `pdRelayOnly=1`: client joined, `Net.stats` reports type `relay` / via `relay` / udp, lobby lines say "through a relay", lobby chat, start, 4-player mirror, rtt 18 ms, in-game chat all work over the relay. Short `{host,...}` TURN parsing therefore works end to end in real Chrome.
- Screenshots now VIEWED: host lobby (fits, no scroll, bots + connection line + chat + 8 map cards OK; names truncate "Downto...", "Colosse..." in the cards - cosmetic, pre-existing), scoreboard K/D column, results screen with 5 tiles + K/D column + "(bot)", Colosseum in game, chat log bottom-left, `PING 10 DIRECT` readout.
### STILL NOT VERIFIED (cannot be done in this sandbox)
- Two machines on different networks / real NAT / mobile data. Everything above is loopback on one machine (host candidates, or a local TURN on 127.0.0.1).
- The shared public Open Relay (`openrelay.metered.ca`) - sandbox network is allow-listed, so its availability/quota is unknown; keep treating it as best effort and use your own TURN or a Metered account for strict NATs.
- Reachability of the public brokers incl. the new `wss://mqtt.eclipseprojects.io:443/mqtt` (sandbox cannot reach them; only the local broker was used).
- TURN over TLS (`turns:...:443`) was not exercised (coturn ran with `--no-tls`); only udp was selected.
- Gameplay feel: Dead Town PvP, the new Colosseum, bots difficulty, Freighter/Frostbite, bots never buy wall weapons / use the box; chat bar on window resize / popup mode / window blur while typing; the unpacked EXTENSION itself (`exttest.py`) was not re-run this checkpoint.
- Remaining TODO unchanged: Stage 3 (more weapon slots, `PD.MAXGUNS`), extend `cratetest/maptest` to `arena2/3/4`, final online test across real networks.

## 00. Checkpoint 10 changes (only these two tasks were done; nothing else touched)
1. **Dead Town in PvP.** `data.js`: `PD.MODES.pvp.maps` now includes `'town'` (listed after Downtown). The picker (`UI.buildMaps`) and the online host/client map checks (`HostSession.setMap`, `PD.pickMap`) all read that list, so it is a choice in solo-host and online PvP. No other code changed for this.
2. **Colosseum redesign** (same name, same id `arena2`, same 84x60 size, still in Arena Rush and PvP). Was a bigger copy of The Pit; now a Roman amphitheatre: `genColosseum()` in `map.js` (oval outer wall, paved outer concourse, a ring of 26 stone piers with open arches, ambulatory, podium wall with 8 openings (4 on the axes, 4 diagonal), sand pit in the middle with four stone blocks, mystery box in the centre, 4 wall weapons on the pit side, crates/ammo/pickups on sand and paving, 4 gate tunnels N/S/E/W where Arena Rush zombies spawn). New tile theme `6` (sand pit, travertine walls, paving) and minimap palette `MINI_R`. Description text updated in `PD.MAPS.arena2`. Hooked in `PD.genMap`.
- Gameplay change in Arena Rush on this map: zombies now have to come through the outer concourse and the arches / podium openings to reach the pit instead of straight across open floor.

### Verified (this sandbox) for checkpoint 10
- All Node tests pass (`bottest cratetest buildtest maptest simtest modetest mapmodetest onlinetest mqtttest nettest`), all `js/*.js` pass `node --check`. `mapmodetest` now exercises `pvp/town` (3 players spawn on open ground, 40 s sim) and `arena/arena2` + `pvp/arena2` on the new layout.
- Ad hoc (not saved as a test file): Colosseum over seeds 1..200: no dropped objects, no sealed pockets, all 4 gates reachable, 4 wall weapons, 1 box, >= 13 pickup spots, >= 47 crates/ammo every seed. PvP on Dead Town with 8 players for 90 s: finite positions, no errors.
- Browser: `PD.MODES.pvp.maps` lists `town`; Colosseum renders with the new theme (screenshot viewed: oval with sand pit, pier ring, openings). No page errors.
### NOT verified for checkpoint 10
- Dead Town PvP was not hand-played. It is 200x150 with spawns chosen far apart (`spotFar`, 450-500 px minimum), so with few players fights may be slow to start; bots only engage within about 520 px. If it feels empty, cap the spawn distance on big maps (`P.spotFar` / `P.spawnApart` in `sim.js`) - NOT done, not asked for.
- Colosseum was not hand-played in Arena Rush or PvP (difficulty, bot pathing through the arches, wall-weapon placement). The thumbnail in the map picker was not looked at. No test was added specifically for `arena2`'s layout.
- Everything in sections 3 and 4 below is still outstanding (real two-browser online test, screenshots, etc).

## 0. Status
| Item | Status |
|---|---|
| Bots filling online lobbies | CODED + Node-tested + browser smoke (solo host) |
| Text chat (lobby + in-game) | CODED + Node-tested + browser smoke (host side only) |
| K/D (scoreboard, results, profile) | CODED; scoreboard/results layout NOT looked at (screenshots written, not viewed) |
| Network hardening | CODED + unit-tested with fakes; real relay path UNPROVEN |
| Two real browsers over real WebRTC | NOT RUN (see section 4, item 1: script not written; broker is ready) |

## 1. What changed
### online.js
- `HostSession.botFill` (0 = off, else target TOTAL players), `botsToAdd()`, `setBots(n)`. `canStart` counts humans + bots, so a solo host can start PvP / Hide and Seek. `start()` appends bots `b1..` (`'Bot ' + PD.BOTNAMES[i]`, `PD.randomLook()`, `bot:1`) to the Sim; the `start` message and `Mirror.info` carry `bot`. Bots are not in `roster`/`cl`, nothing is sent to them. `rosterMsg`/`welcome` carry `bots` (client lobby shows "N bots will join"). `ClientSession.onroster(list, mode, map, bots)`. Library default `botFill = 0` (tests rely on it); main.js sets it from the pref.
- Chat: client `{t:'chat', s}` -> host `_chat` (string only, `PD.cleanChat`, 4 msgs / 5 s per sender via overridable `host.now`, drops silently but tells the sender `{sys:1,s:'Slow down.'}`), broadcast `{t:'chat', id, name, s}` (name from the roster, never from the client), log of 40, last 12 sent in `welcome`. `HostSession.chat(text)`, `ClientSession.chat(text)`, `onchat(msg)`; replayed history has `old:1`.
- Ping: `ClientSession.ping()` (every 2 s, unreliable lane, host answers `pong`), `client.rtt` smoothed. main.js calls `ping()` right after `sendInput` each frame.
### net.js
- `PD.iceConfig()` is used by every peer: STUN google x2 + cloudflare, `iceCandidatePoolSize: 4`; TURN from `window.PD_TURN` or `localStorage.pdTurn` (entries `{urls,username,credential}` or short `{host,username,credential}` -> udp 3478, tcp 3478, tls 443; max 6; bad URLs dropped). If you set no TURN, the shared Open Relay (`openrelay.metered.ca`, creds `openrelayproject`) is appended as best effort. `localStorage.pdNoRelay='1'` / `PD_NO_PUBLIC_RELAY` removes it. `pdRelayOnly='1'` / `PD_RELAY_ONLY` sets `iceTransportPolicy:'relay'` (test toggle).
- `gathered()`: ends on completion, 300 ms after the first relay candidate, 2 s after the first srflx if no relay, or hard 5 s; also counts candidates already in the local SDP (pool). Result on `pc.__gather`.
- Timeouts (`Net.T`): joiner 15->25 s, host 25->35 s, disconnected grace 5->8 s, gather 2.5->5 s.
- Brokers: added `wss://mqtt.eclipseprojects.io:443/mqtt` (4 total; the Hub tolerates dead ones).
- `Net.stats()` / `Peer.stats()`: selected pair -> `{type host|srflx|prflx|relay, via direct|relay, proto, rtt}`. main.js polls every 2.5 s: host lobby line "Connections: N direct, M through a relay", client lobby "Connection to host: direct/through a relay, X ms", in-game `PING nn DIRECT|RELAY` (client only).
### UI
- Host screen: bots segmented control Off/4/6/8 (default 4, pref `pdBots`), bot seats shown in the roster ("Bot / AI"), note under it, chat box, connection line. Client wait screen: bots note, chat box, connection line.
- In game (online only): Enter opens an HTML bar over the bottom-left of the canvas (Enter sends, Esc cancels, movement/fire are idle while typing), canvas log bottom-left (lines fade after ~10 s, last 8 shown while the bar is open). Chat cleared in `teardown`.
- K/D: scoreboard column (`PD.kd`, not shown in Hide and Seek), results table column (+ "(bot)" tag), PvP results tile, lifetime `pdPvpK`/`pdPvpD` shown on the menu chip as `Best: round N · PvP K/D x.xx` after a PvP game.
- How to play -> "Connection settings (advanced)": TURN host / username / password and "Force relay only". Stored in localStorage, read at the next peer creation.

## 2. VERIFIED (this sandbox)
- Node, all pass: `node bottest.js cratetest.js buildtest.js maptest.js simtest.js modetest.js mapmodetest.js onlinetest.js mqtttest.js nettest.js`; all `js/*.js` pass `node --check`. (`onlinetest` re-run 5+ times after the final edit: passes.)
- `onlinetest` new: bots (counts, canStart, ids/names/looks identical on client Mirror, bots move on host and client, not in network table, results rows flag bots, all 4 modes start solo with bots, 8 humans -> 0 bots); chat (broadcast, forged id/name ignored, markup/control chars stripped, 80 char cut, blanks and non-string payloads dropped, rate limit 4/5 s per sender with "Slow down." to sender only, host messages, log cap 40, welcome replay of 12, works in game, stranger ignored, cleared on close); ping/pong.  A real bug was found and fixed by these tests: a non-string chat payload used to be broadcast as "[object Object]".
- `nettest.js` (new, fake RTCPeerConnection): ICE config variants, TURN parsing/validation, gather early-exit rules, stats parsing (incl. hung getStats), timeouts constants, shared config reaches the host peer.
- Browser smoke `python3 smoke_ui.py` (Chromium, file://, one page): no page errors; host screen shows bots control, default 4 -> "3 bots will join"; PvP starts for a solo host with Survivor + Bot Rex/Nova/Duke; Enter opens chat, a message lands in `ST.chatHist`; bots moved over 8 s; `RTCPeerConnection` accepts `PD.iceConfig()` in real Chrome.
## 3. NOT VERIFIED (do not claim)
- ANY real multi-peer online play: host + joiner over real WebRTC, chat client->host->client in a browser, client-side `PING`/connection lines, bots seen by a real client, new broker reachability (eclipse 443 only comes from its documented sample URL).
- Relay path. No TURN server was available; Open Relay's free static credentials are widely cited but I could not confirm the service is still open or its quota; a Metered signup (API key) may now be needed. For reliable strict-NAT support run your own coturn or a free Metered account and enter it under How to play -> Connection settings. `relay only` + a real TURN is the way to prove it.
- Screenshots `shots/smoke_host.png`, `shots/smoke_play.png` were written but NOT viewed: lobby layout with the added rows (host `.lobby` has `max-height:17.2rem; overflow:auto`, may scroll), results tiles with 5 PvP tiles, scoreboard K/D column width.
- Bots never buy wall weapons / use the mystery box; gameplay feel/difficulty; Freighter/Frostbite not hand-played; `cratetest/maptest` not extended to `arena3/arena4`.
- Chat bar position on a window resize while open, popup mode (the extension popup closes on blur), and `window blur` while typing.
## 4. TODO
1. **Real two-browser test** (the missing piece): `node mqttbroker.js` (included, prints `BROKER ws://127.0.0.1:PORT`), launch Chromium with `--no-sandbox --allow-loopback-in-peer-connection --disable-features=WebRtcHideLocalIpsWithMdns`, `window.PD_BROKERS=[that url]` in an init script, page A: Host, page B: Join with the code; check lobby chat both ways, bots note on B, `waitConn` text, start PvP, in-game chat both ways, `client.rtt >= 0`, results with K/D. Then repeat with `pdRelayOnly=1` and a real TURN.
2. View the screenshots, tune layout (lobby scroll, results tiles).
3. Stage 3 from the older roadmap (more weapon slots, `PD.MAXGUNS`), extend `cratetest/maptest` to the new arenas, then final online testing elsewhere.

## 5. How to run
- Extension: `chrome://extensions` -> Developer mode -> Load unpacked -> `pixel-dead-ext`; reload after updating.
- Tests (zip root): `node bottest.js cratetest.js buildtest.js maptest.js simtest.js modetest.js mapmodetest.js onlinetest.js mqtttest.js nettest.js`. Browser (Playwright, `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`): `python3 smoke_ui.py`, `mapshots.py`, `exttest.py`.
- Flaky (known): `onlinetest` "client shooting kills a zombie on the host" ~1 in 15; `simtest` failed once on the very first run this session and then passed 6+ times; `modetest` PvP hitscan very rarely. Re-run once before investigating.
