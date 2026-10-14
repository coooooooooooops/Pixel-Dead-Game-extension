# PIXEL DEAD v2.3 - HANDOFF (checkpoint 16: verification pass, no new features)

Package: `pixel-dead-checkpoint16.zip` (inner folder `pixel-dead-checkpoint16/`, extension in `pixel-dead-ext/`).
Standing instructions: package immediately when asked (zip + updated handoff). Never claim anything works that is not under VERIFIED. Final online testing is done ELSEWHERE.
Older docs kept: `HANDOFF_checkpoint15.md` (full description of the golden gun, 5 more guns, 6 power-ups, the hunt recap, all older open items), `HANDOFF_checkpoint13.md` ... `3`. Read checkpoint 15 for the game content; this file only records what this session did.

## What this session did
The user asked to "continue the testing to make it finally complete", then to package everything immediately. NO game code was changed. Only `huntbrowser.py` (a test) was edited, twice (outfit expectation, stale-frame race).

## VERIFIED this session (sandbox, Node 22, Playwright chromium)
- `node --check` passes on every `js/*.js`.
- All 13 Node suites exit 0 with 0 FAIL: hunttest emotetest buildtest cratetest maptest simtest modetest mapmodetest bottest onlinetest mqtttest nettest goldtest (one run each).
- `SEED=n node -r ./seedrand.js onlinetest.js` for n = 1..60: all 60 exit 0, 0 FAIL (closes checkpoint 15 TODO 1 part 1). The rare "hider within 150px becomes visible" failure did NOT appear in these 60 runs; still never root-caused.
- Browser (headless, `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`) PASSED, 1 run each: `smoke_ui.py`, `exttest.py`, `emotebrowser.py`, `popupshots.py`, `onlineemote.py`.
- `huntbrowser.py`: passes (3 of 3 runs after both test fixes; see open item 1). The check "every outfit unlocked after the full hunt" failed on every run because the test was wrong: out:7 HORSE COSTUME is tied to the secret code DEVELOPER, so it correctly stays locked after solving the 16 puzzles. Test fixed to expect exactly [7] locked; that check now passes (1 run).

- Online browser tests (two real Chromium pages over real WebRTC, local MQTT broker, one run each) PASSED: `onlinebrowser.py` (host + client, chat, bots, PvP K/D), `onlinemaps.py` (online PvP on town and the arena maps, identical map hash, ping, chat), `onlinerelay.py` (forced relay-only through a local coturn). To run the relay test, start coturn: `turnserver -n --listening-ip=127.0.0.1 --relay-ip=127.0.0.1 --listening-port=3478 --realm=test --lt-cred-mech --user=u:p --no-tls --no-dtls --no-cli --allow-loopback-peers` (without `--allow-loopback-peers` coturn denies the loopback peers the test uses and the test fails; that was a coturn config issue, not a game bug). These were run on the checkpoint-16 code (unchanged game code). NOT two machines, NOT two networks, NOT the public relay or public MQTT brokers; the final real-network test is still to be done elsewhere.

## USER DECISIONS 2026-10-14
- Weapon slots stay as is: `PD.MAXGUNS` = 2 (decided, do not raise).
- The user played the game and reported no issues; they say the new weapons and power-ups are all good (so checkpoint 15 D5 balance and D9 interpretations are accepted by the user; the HUD-overlap check D4 and screenshots are still never done by me).

- README.md rewritten 2026-10-14 (new guns, power-ups, The Hunt, test commands, relay/coturn command, verification status). Claims checked against code: gun replace/refill rule (`sim.js` pickup), locked cosmetics hidden in the survivor menu (`ui.js`), weapon/power-up names (`data.js`). The user confirmed the icons look good.

## NOT VERIFIED / OPEN (do not claim these work)
1. **RESOLVED (test race, not a game bug): `huntbrowser.py` "E again closes it" flake.** The failure output showed `PD.Hunt.reading` was None (the game DID close the note) while the draw log still held the panel text from a frame rendered just before the keypress. Fix in the test: `clear()` and wait 200 ms after the keypress before reading `drawn()`; the check now prints reading/panelDrawn. Result after the fix: `huntbrowser.py` PASSED 3 of 3 consecutive runs (before the fix it failed 4 of 4 runs with 2-4 notes each). Not verified: a long run count beyond 3.
2. No two-machine or cross-network online test (the three local online browser tests pass, see VERIFIED).
3. All of checkpoint 15 section D items 3-9 still open: no screenshots of the 6 new guns, golden glint, `$` popups, cryo flame, new pickups viewed; HUD overlap with 6+ power-up icons unchecked (D4); `gencodesheet.js` / `REDEEM_CODES.md` do not list puzzle locations, guns or power-ups (D8).
4. `bottest` hide-seeker and `simtest`/`modetest` PvP hitscan are known rare flaky tests (passed this session).

## TODO next session (in order)
1. (Done: hunt flake resolved.) 2. Write the Playwright script for the new guns/power-ups, take screenshots, VIEW them, fix HUD overlap (checkpoint 15 E3).
3. (Done: online browser tests pass.)
4. Update `gencodesheet.js` and regenerate `REDEEM_CODES.md` (puzzle locations/notes, guns, power-ups); (README is now updated.)
5. (Decided: slots stay at 2, balance accepted by the user.)
6. Remaining checkpoint 13 section 6 items and the real-network online test.

## How to run
Load `pixel-dead-ext` unpacked in `chrome://extensions`. Node tests from the zip root: `for t in hunttest emotetest buildtest cratetest maptest simtest modetest mapmodetest bottest onlinetest mqtttest nettest goldtest; do node $t.js >/tmp/$t.log 2>&1; echo $t $?; done`. Browser tests: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 <script>.py`.
