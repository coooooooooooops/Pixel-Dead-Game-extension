# Pixel Dead

Pixel-art top-down zombie survival that lives in your browser toolbar. Play it in the extension popup or a full tab: endless survival against zombies and bosses, arena waves, and online co-op, PvP and hide-and-seek with friends (up to 8 players, with AI bots to fill empty seats).

Chrome / Edge / Brave extension (Manifest V3). No account, no server to run, no build step.

---

## Install

Pixel Dead is loaded as an unpacked extension.

1. Download or clone this repo.
   ```bash
   git clone https://github.com/<your-username>/<repo-name>.git
   ```
2. Open `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the **`pixel-dead-ext`** folder (the one containing `manifest.json`).
5. Pin the Pixel Dead icon to your toolbar and click it to play.

To update, pull the latest changes and press the reload icon on the extension's card in `chrome://extensions`.

**Popup or full tab?** The toolbar button opens a popup by default, but a popup closes the moment you click away. For long runs and for online games, switch to **Full tab** in the in-game *How to play* screen (the "Toolbar button opens" setting).

---

## Controls

| Key | Action |
|---|---|
| `W` `A` `S` `D` | Move |
| `Shift` | Sprint |
| Mouse | Aim and fire |
| `R` | Reload |
| `E` | Buy a wall weapon, or open the mystery box |
| `1` `2` `3` / `Q` | Switch weapon |
| `V` | Pickaxe: chop trees, break rocks and crates, restock ammo from AMMO crates, repair walls |
| `B` | Build mode. Click to place, right click to remove, `1` / `2` picks wood or stone |
| `F` | Seeker scan (Hide and Seek) |
| `M` | Full map |
| `Tab` | Scoreboard (kills / deaths / K/D) |
| `Enter` | Chat (online games). `Enter` sends, `Esc` cancels |
| `Esc` | Menu |

---

## Game modes

| Mode | Players | What it is |
|---|---|---|
| **Single player** (Survival) | 1 | Endless zombies. A boss every 5th round. |
| **Arena Rush** | 1 to 8 | Waves of zombies pour through the gates of a walled arena. Build combos, grab loot drops, boss every 3rd wave. |
| **Endless** (online co-op) | up to 8 | Co-op endless survival. Bosses every 5th round. |
| **PvP** | 2 to 8 | Free-for-all deathmatch, first to 20 kills. A roaming boss appears now and then (killing it is worth 3 kills). |
| **Hide and Seek** | 2 to 8 | Hide in bushes. Seekers tag hiders into seekers. Last hider wins. |

### Maps

| Map | Size (tiles) | Modes | Description |
|---|---|---|---|
| **Dead Town** | 200 x 150 | Single, Endless, PvP, Hide and Seek | Huge streets, many buildings, a lake. |
| **Downtown** | 120 x 90 | Single, Endless, PvP, Hide and Seek | Dense city: towers, avenues, a plaza, tight alleys. |
| **Freighter** | 90 x 70 | Single, Endless, PvP, Hide and Seek | A cargo ship at sea: containers, cabins, a bridge, a pier and a trawler. |
| **Dustwater** | 150 x 110 | Single, Endless, PvP, Hide and Seek | Desert town: adobe houses, cactus, sagebrush, an oasis. |
| **The Pit** | 60 x 44 | Arena Rush, PvP | Small walled arena, four gates. |
| **Colosseum** | 84 x 60 | Arena Rush, PvP | Roman amphitheatre: oval stone arena, sand pit, arched rings and four gate tunnels. |
| **The Crucible** | 72 x 72 | Arena Rush, PvP | Round arena. A lava moat, four bridges, an island in the middle. |
| **Frostbite** | 80 x 80 | Arena Rush, PvP | Cross-shaped ice arena. Long corridors and a frozen pond. |

Maps are generated from a seed, so every online player sees the identical map.

---

## Weapons

Start with an M1911 and a pickaxe. Buy bigger guns from the wall plaques inside buildings and around the arenas (`E`), or gamble on the mystery box. You carry two guns plus the pickaxe.

| Weapon | Type | Notes |
|---|---|---|
| M1911 | Pistol | Starting weapon |
| Magnum | Revolver | Slow, heavy hits |
| Pump | Shotgun | 8 pellets, short range |
| MP5K | SMG | Automatic |
| AK-47 | Rifle | Automatic |
| Sniper | Rifle | Long range, pierces up to 3 targets |
| Minigun | LMG | 150-round mag, slows you down while held |
| Flamer | Flamethrower | Short range, sets zombies on fire |
| Rocket | Launcher | Splash damage |
| Grenade | Launcher | Bouncing, fused splash damage |
| Railgun | Beam | Pierces everything in line |
| Tesla | Arc | Chains between nearby zombies |
| Plasma | Energy | Automatic, piercing splash shots |
| Pickaxe | Melee | Weak melee that mines and repairs. Never breaks, needs no ammo. Cosmetic skins: pickaxe, katana, lightsaber, zombie arm. |

### Power-ups

Max Ammo, 2x Points, Insta-Kill, Nuke, Freeze (shared with the team in co-op), plus Heal, Shield, Speed, Rapid Fire, Cloak and Turret (personal). Which ones drop depends on the mode.

### Zombies and bosses

Walkers, runners, fatties, spitters (ranged) and bloaters (explode) show up as rounds go on. Bosses smash through walls: **The Brute, Acid Queen, Necromancer, Juggernaut** and **The Bloat**.

### Building

Chop trees and break rocks with the pickaxe to collect wood and stone, then press `B` to place walls. Zombies chew through them, so swing the pickaxe at a damaged wall to repair it. In PvP you can raid other players' walls.

### Your survivor

Change your name, skin, shirt, pants, hat, hat colour, face accessory and pickaxe look from the survivor screen (or hit Randomize).

---

## Playing online

1. One player picks **Host a game**, chooses a mode and map, and gets a 5-character **room code**.
2. Friends choose **Join** and type the code. If a code ever fails, "Connect by copy and paste" in the lobby exchanges the connection details by hand.
3. The host presses **Start game**.

How it works:

- Players connect **peer to peer** (WebRTC). The host runs the simulation and everyone else mirrors it.
- Room codes use public MQTT relay servers only to introduce the players to each other (signalling). Game traffic goes directly between players. Play with people you trust.
- **Bots** fill empty seats in PvP, Hide and Seek and other online lobbies (Off / 4 / 6 / 8 total players, default 4). Bots never take a seat from a friend.
- **Text chat** works in the lobby and in game.
- The lobby and the in-game HUD show whether your connection is **direct** or goes **through a relay**, plus your ping.
- Online games never pause. Hide and Seek and PvP need at least two players (a solo host can start them when bots are on).

### Friends cannot connect?

Strict NATs sometimes need a TURN relay. In-game, open **How to play, Connection settings (advanced)** and enter a TURN host, username and password (run your own [coturn](https://github.com/coturn/coturn) or use a free account at a TURN provider). There is also a "Force relay only" switch for testing. If you leave it empty, the game falls back to a shared public relay on a best-effort basis, which is not guaranteed to be available.

---

## Project layout

```
pixel-dead-ext/
  manifest.json      Chrome MV3 manifest
  background.js      service worker (popup / tab preference)
  game.html          the game page
  style.css
  js/
    data.js          constants, weapons, power-ups, zombies, bosses, maps
    map.js           seeded map generators, collision, rays, flow field, textures
    sim.js           authoritative simulation (all modes)
    bots.js          bot AI
    online.js        host / client sessions, roster, chat, bots, mirror
    net.js           WebRTC + MQTT signalling, ICE / TURN config, stats
    render.js scene.js ui.js main.js audio.js
tests / scripts      node + Playwright tests in the repo root
HANDOFF*.md          development notes and verification history
```

---

## Development

No build step: edit the files in `pixel-dead-ext/` and reload the extension.

Unit and simulation tests (Node):

```bash
node bottest.js cratetest.js buildtest.js maptest.js simtest.js modetest.js mapmodetest.js onlinetest.js mqtttest.js nettest.js
```

(run each file with `node <file>`). Two-browser online tests use Playwright with Chromium:

```bash
python3 smoke_ui.py        # single-page UI smoke test
python3 onlinebrowser.py   # host + client over real WebRTC, chat, bots, K/D
python3 onlinemaps.py      # online PvP on Dead Town and the Colosseum
python3 onlinerelay.py     # forced relay; needs a local coturn on 127.0.0.1:3478 (user u / pass p)
```

`mqttbroker.js` is a tiny local MQTT broker the online tests use so they do not touch the internet. A few simulation tests are known to be occasionally flaky (about 1 in 15 runs); re-run once before investigating.

### Verification status

Online play has been verified between two real Chromium pages over real WebRTC on one machine, including through a local TURN relay. It has **not** been tested across two separate networks or against the shared public relay, and the public MQTT brokers were not reachable from the test environment. See `HANDOFF.md` for the details.

---

## License

Add a license of your choice here (for example MIT) before publishing.
