# Velocity Bay — open-world driving + crime game (design)

Working title: **Velocity Bay** (a made-up coastal city). Change it any time.
Status: waiting for your OK. Date: 2026-11-24.

## What it is and why

An original, browser-based 3D open-world game in the street-racing + open-world-crime genre.
Free roam a city, drive with weight and grip, drift, race, get chased by police, get out and walk,
take any car, do crime and missions. It must feel **realistic but stay lite**: loads fast, runs
smoothly on a mid-range laptop (your performance pick: 3 of 5), and goes live by pushing to
GitHub, with Cloudflare Pages serving it.

Not allowed: any names, cars, characters, logos, maps, music or art from GTA, Need for Speed or
any other real game or car brand. Everything is original.

## Goals

- Sim-lite driving: weight transfer, grip that breaks into a drift, handbrake, nitro, manual or
  auto gears, damage that you can see.
- One connected map with seven areas, readable from a minimap.
- The full crime loop: do crime → wanted stars → police chase → escape, get busted, or get wasted.
- Live on Cloudflare after each milestone, so you can play the game while it grows.

## Non-goals (for now)

- Online multiplayer and leaderboards (you didn't pick them).
- Gamepad and steering wheel (you didn't pick them; easy to add later).
- Licensed car models or music.
- A Windows/Mac download (the website comes first; a download can wrap it later).

## Anti-goals (bad even if it "works")

- Loads slowly or stutters on a normal laptop.
- Toy-like driving: instant turns, no weight, no slide.
- Looks like a copy of a real game.
- Gore. Violence is cartoon-level: people fall over, no blood.

## Your picks (all of them go in)

| Area | Picks |
|---|---|
| Feel / look | Sim-lite driving, Realistic-lite look, performance 3/5 |
| Map | Downtown, highway loop, mountain roads, beach coast, docks + industrial, desert, airport |
| Driving | Drift, nitro, handbrake, tire smoke, skid marks, damage, manual gears, several cars, tuning + paint, motorbikes, cockpit camera, jumps + ramps |
| Open world | Walk on foot, take any car, wanted level, missions, money + shops, garage safehouse, weapons |
| Modes | Free roam, checkpoint races, police pursuit, time trial, drift score, drag race, speed cameras, stunt jumps |
| World life | AI traffic, traffic lights, pedestrians, police patrols, helicopter, day/night, rain + wet roads, fog, street lights + headlights, breakable props |
| HUD / audio | Speedo + gear, minimap, GPS route, full map, photo mode, RPM engine sound, sirens/horn/crashes, in-car radio, city ambience |
| Controls | Keyboard, phone touch |
| Save / launch | Auto-save in the browser; website on Cloudflare Pages from GitHub |

"Racing only" was also ticked. Since you then asked for crime features too, it becomes a
**setting**: crime on (default) or off for a pure-racing session.

## Added later on your request

- **Dynamic weather**: clear, cloudy, fog, rain and storm drift into each other; wet roads cost grip; lightning and thunder.
- **Car selector**: V anywhere (when not wanted), the garage and the dealer; live preview, stats, paint, upgrades.
- **Mod menu** (F2): god mode, infinite ammo/nitro, never wanted, set wanted level, spawn any vehicle, super speed/grip, rainbow paint, weather, time, slow motion, moon gravity, teleports. Not saved.

## Crime features (added on your request)

- **Carjacking**: pull a driver out of any car; parked cars can be broken into (alarm = more heat).
- **Robberies**: rob shops and ATMs for cash. The cash bag drops if you get busted.
- **Wanted level, 1–5 stars**: hitting people/cops, theft, speeding past cops, robberies.
  1–2 stars: patrol cars. 3: roadblocks + spike strips. 4: helicopter with a spotlight. 5: armoured trucks.
- **Escape**: leave the search circle and stay out of sight, use a respray shop, or hide in the garage.
- **Busted / wasted**: you lose some cash and wake up at the police station or hospital.
- **Weapons**: fists, bat, pistol, SMG, and drive-by from the car. Ammo is bought at shops.
- **Crime missions**: getaway driver, stolen-car delivery, chase down a target, bank job.
- **Gang turf**: two rival gangs in the docks and the desert; driving in their area makes them aggressive.

## Approaches (how it gets built)

1. **Three.js + Rapier physics, plain files, no build step** — *picked.* Three.js draws the 3D;
   Rapier (a fast WebAssembly physics engine) gives real vehicle suspension, crashes, ragdoll-ish
   falls, ramps and breakable props. Plain ES modules, so Cloudflare Pages serves the folder as-is.
   About 3 MB to download. This gives the best mix of realism and lightness.
2. Three.js with hand-written car physics, no physics engine. Smaller (about 1 MB) but collisions,
   ramps, bikes and props would feel fake, and they'd take longer to write. Rejected: it hurts the "realistic feel".
3. Godot (or Unity) exported to the web. It has a real editor, but the web build is 30–60 MB, slow
   to load and heavy on laptops, and you'd need to install the engine. Rejected: it fails "lite".

## How it's built (my calls — change any)

- **Tech**: Three.js 0.187 and Rapier 0.21, loaded through an import map (pinned versions on a CDN).
  No npm build. The only tool is `node --test` for the logic tests.
- **Look**: realistic-lite comes from PBR materials, real-time sun shadows, a sky shader, fog,
  light bloom and wet-road reflections in rain. Buildings and cars are generated in code from
  shapes and generated textures, so there are no downloads and no licensing. The cars are original designs.
- **Map**: one seeded map about 3 × 3 km. Downtown in the middle, a highway ring around it,
  mountains to the north, desert to the north-west, airport to the west, beach to the south,
  docks to the east. Far objects are hidden and repeated objects are drawn in one pass to keep FPS up.
- **Driving**: Rapier ray-cast vehicle with a tuned tire-grip curve, weight transfer, a handbrake
  that cuts rear grip, a gearbox (auto or manual), nitro, and a damage model where panels dent
  and smoke appears as health drops.
- **Motorbikes**: the same vehicle core with two wheels plus a lean/balance assist.
- **AI**: traffic and pedestrians follow a road/sidewalk graph, are pooled near the player and
  stop at lights. Police use pursuit steering and ramming, and set roadblocks on the graph ahead of you.
- **Audio**: everything is made in the browser with WebAudio (engine by RPM, sirens, crashes,
  ambience). The radio plays three generated music stations, so there's no licensed music.
- **Controls**: keyboard (WASD/arrows, Space handbrake, Shift nitro, F enter/exit, C camera, M map,
  Q/E shift gears) and an on-screen touch layout on phones.
- **Save**: money, cars, upgrades and progress in the browser's localStorage, saved automatically.
- **Settings**: graphics quality (low/med/high), crime on/off, auto/manual gears.

## Build order (5 milestones, each one playable and live)

1. **Drive the city**: the map with all 7 areas, sim-lite car with drift/handbrake/nitro/gears,
   chase + cockpit camera, speedo + minimap, engine sound, day/night, keyboard + touch,
   auto-save, deploy to Cloudflare.
2. **Living city**: traffic + lights, pedestrians, street lights + headlights, rain/fog/wet roads,
   tire smoke, skid marks, damage, breakable props, ramps + jumps.
3. **Crime**: on foot, carjacking, weapons, wanted stars, police patrols/pursuit/roadblocks/
   helicopter, busted/wasted, robberies, gang turf.
4. **Career**: money, shops, garage safehouse, several cars + motorbikes, tuning + paint, crime and
   story missions, GPS route, full map.
5. **Events + polish**: checkpoint races, time trial, drift score, drag, speed cameras, stunt
   jumps, photo mode, radio, city ambience, graphics menu.

This is a big project: a few sessions of work, not one.

## Testing

- `node --test` covers the logic: gearbox, wanted level rules, save/load, road graph, mission state.
- Each milestone is played in the browser to check FPS, controls and the look before it ships.

## Deploy

A git repo in this folder pushed to a GitHub repo you name. In Cloudflare Pages: connect that repo,
leave the build command empty and set the output folder to `/`. After that, every push goes live.
(The `gh` tool isn't installed here, so the first push uses plain `git` with your GitHub login.)

## Left to the builder

Exact tuning numbers, building styles, mission scripts, the station music, the touch layout details.
