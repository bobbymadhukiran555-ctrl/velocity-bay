# Milestone 1 "Drive the city" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable, deployable browser game: drive a sim-lite car around a 7-area map with day/night, HUD, engine sound, keyboard + touch, and auto-save.

**Architecture:** Plain ES modules served as static files (no build). Pure logic modules (`src/logic/*`) import nothing from Three/Rapier, so `node --test` can test them. Scene modules (`src/*.js`) build Three.js meshes and Rapier colliders from that logic.

**Tech Stack:** Three.js 0.187.0, Rapier 0.21.0 (`@dimforge/rapier3d-compat`, `dist/rapier.mjs`), via import map on jsDelivr; WebAudio; `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-24-open-world-driving-design.md`

## Global Constraints

- No names, cars, logos, maps, music or art from real games or car brands. Title: "Velocity Bay".
- No build step; the folder must deploy to Cloudflare Pages as-is (output dir `/`).
- Must hold ~60 FPS on a mid-range laptop (performance target 3/5).
- Units: metres, seconds, kg, newtons. World: x = east, z = south, y = up. Map spans −1200..1200 on x and z.
- Car local frame: forward = +x, up = +y (Rapier vehicle default axes).

## Review Focus

1. Corrupt or old localStorage save → game must still start at the default spawn (test in Task 1).
2. Car flipped or stuck → `R` resets the car upright on the nearest road point (Task 4).
3. Driving off the map edge or into the sea → car is reset to the nearest road (Task 4, uses `nearestRoadPoint`, tested in Task 2).
4. Tab hidden / huge frame gap → the physics step is capped, so the car never tunnels or explodes (Task 6: `dt` clamp to 0.1 s, max 5 substeps).
5. Audio blocked until the first input → the game still runs silently, and sound starts on the first key or tap (Task 5).

---

### Task 1: Pure logic — gearbox, day/night, save

**Files:** Create `src/logic/gearbox.js`, `src/logic/daynight.js`, `src/logic/save.js`; Test `tests/logic.test.js`

**Interfaces (produces):**
- `GEARS = [-3.2, 0, 3.6, 2.3, 1.7, 1.3, 1.05, 0.85]` (index 0 = R, 1 = N), `FINAL_DRIVE = 3.7`, `REDLINE = 7200`, `IDLE = 900`
- `rpmFromSpeed(speedMs, gearIdx, wheelRadius) -> number` (≥ IDLE)
- `torqueAt(rpm) -> Nm` (peak ≈ 420 Nm @ 4800, 0 above REDLINE)
- `driveForce(rpm, gearIdx, throttle, wheelRadius) -> N`
- `autoShift(gearIdx, rpm, throttle, speedMs) -> gearIdx` (up at > 6600 rpm, down at < 2600 rpm, never into R/N)
- `sunState(t01) -> {elevation, azimuth, daylight 0..1}` (t01 = 0 midnight, 0.5 noon)
- `loadSave(storage) -> SaveData`, `writeSave(storage, data)`; `SaveData = {v:1, money, color, pos:{x,y,z}, heading, time, gearMode:'auto'|'manual'}`

- [ ] Write the tests: rpm at 0 m/s = IDLE; rpm rises with speed; `torqueAt(REDLINE+1) === 0`; autoShift 2→3 at 6800 rpm and 4→3 at 2000 rpm; noon elevation > 0, midnight < 0; corrupt JSON → defaults; out-of-bounds pos → defaults; round-trip keeps money.
- [ ] Run `node --test tests/` → FAIL (modules missing)
- [ ] Implement the three modules
- [ ] Run `node --test tests/` → PASS

### Task 2: Map data

**Files:** Create `src/logic/map.js`; Test `tests/map.test.js`

**Interfaces (produces):**
- `MAP_HALF = 1200`, `SEA_LEVEL = -2`
- `zoneAt(x, z) -> 'downtown'|'highway'|'mountains'|'desert'|'airport'|'beach'|'docks'|'outskirts'`
- `heightAt(x, z) -> y` (0 in downtown/airport/docks; mountains rise to ~160 m north; dunes ±5 m; beach slopes below SEA_LEVEL in the south; roads flattened)
- `ROADS: Array<{name, width, points:[{x,z}], closed?}>` (highway ring, mountain pass, coast road, airport link, docks link, desert road); `CITY = {min:-400, max:400, block:100, street:20}`
- `nearestRoadPoint(x, z) -> {x, z, heading}`; `SPAWN = {x, z, heading}`

- [ ] Tests: `zoneAt` returns each of the 7 areas at a known point; `heightAt(0,0) === 0`; `heightAt(0,-1100) > 60`; `heightAt(0,1150) < SEA_LEVEL`; every road point is inside ±MAP_HALF; `heightAt` on every road point ≥ SEA_LEVEL + 0.5; `nearestRoadPoint(5000, 5000)` lies inside the map.
- [ ] Run → FAIL; implement; run → PASS

### Task 3: World scene

**Files:** Create `src/world.js` (terrain mesh + trimesh collider, city ground texture, buildings merged per material + cuboid colliders, road ribbons + trimesh colliders, sea plane, airport runway, docks containers, sky + sun + hemisphere light + fog + env map), `src/textures.js` (canvas textures: asphalt/lines, city block tile, windows).

**Interfaces:** `buildWorld(scene, RAPIER, world) -> { update(t01, focusPos) }`. Consumes map.js and daynight.js.

- [ ] Check in the browser: all 7 areas are visible from the air (debug key `O` = orbit cam); the car rests on the terrain and the road surfaces with no gap.

### Task 4: Car

**Files:** Create `src/car.js` (procedural mesh: extruded side profile + glass + 4 wheels + head/tail lights + 2 headlight spots; Rapier chassis 1300 kg + ray-cast vehicle, RWD).

**Interfaces:** `createCar(scene, RAPIER, world, {color}) -> { body, mesh, update(dt, input), speedKmh, rpm, gear, nitro 0..1, slip 0..1, reset(x,z,heading) }`. `input = {throttle, brake, steer -1..1, handbrake, nitro, shiftUp, shiftDown}`.

- Tuning: suspension rest 0.35, travel 0.25, stiffness 30, compression 3.0, relaxation 3.5, max force 1e5; friction slip front 2.4 / rear 2.2, handbrake rear 0.7; steering max 0.55 rad, reduced with speed; downforce 0.9·v² N; nitro +45 % force for 6 s, refills over 20 s; upright assist torque when roll > 35°.
- [ ] Check in the browser: 0–100 km/h in ~5–6 s; holding Space in a turn starts a controllable drift; the car doesn't roll on normal turns; `R` resets it.

### Task 5: Input, camera, HUD, audio

**Files:** Create `src/input.js` (keys + touch buttons), `src/camera.js` (chase cam with speed FOV, cockpit cam, `C` toggles), `src/hud.js` (speed, gear, rpm bar, nitro bar, clock, minimap canvas), `src/audio.js` (engine: 2 oscillators + filter by rpm; tire screech from noise by slip; starts on first input).

- [ ] Check in the browser: every key in the spec works; touch buttons show up in mobile emulation; minimap rotates with the car.

### Task 6: Boot, loop, save, index

**Files:** Create `index.html` (import map, canvas, HUD markup, touch buttons, loading screen, controls help), `style.css`, `src/main.js` (init Rapier, fixed 60 Hz physics with dt clamp 0.1 s and max 5 substeps, day cycle 24 min, autosave every 10 s and on tab hide), `.claude/launch.json` (python3 http.server 5173), `README.md` (how to run + deploy).

- [ ] `node --test tests/` → PASS
- [ ] Browser: no console errors; FPS ≥ 55 in downtown at default quality.
- [ ] Commit.
