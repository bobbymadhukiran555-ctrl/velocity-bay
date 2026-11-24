# Velocity Bay

An original open-world driving game that runs in the browser (plain HTML + JavaScript, Three.js + Rapier physics). There's no build step.

## Play locally

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173. Add `?q=low` or `?q=high` to the URL to change the graphics quality.

## What's in it

- **Driving**: 8 original cars, a motorbike and two police vehicles; drift, nitro, handbrake, manual gears, tyre smoke, skid marks, dents, fire and explosions, ramps and stunt jumps.
- **Living city**: traffic that follows lanes and traffic lights, pedestrians, street lights, breakable props, dynamic weather (clear, cloudy, fog, rain, storm with lightning, wet roads), day and night.
- **Crime** (turn off in Settings for racing only): walk around, carjack, fists/bat/pistol/SMG and drive-bys, 1–5 wanted stars, police pursuit, cops on foot, roadblocks with spike strips, helicopter, armoured trucks, busted/wasted, robbing stores, ATMs and the bank, gang turf.
- **Career**: money, garage, car dealer, car selector (V), upgrades and paint, Spray & Fix, Arms Depot, 6 story missions, GPS route, full map (M).
- **Events**: street races vs AI, time trial, timed delivery, headhunter (wreck a fleeing car), drift, drag race, hot pursuit, speed cameras, stunt jumps.
- **Career stats**: distance, top speed, jumps, events, takedowns, robberies and earnings, with 9 achievements that pay cash (pause → Stats & achievements).
- **Roads**: tarmac, dirt and sand have different grip; the textures now include wear, cracks, manholes and normal/roughness detail.
- **Extras**: photo mode (P), procedural radio with 3 stations (N), mod menu (F2), save codes to move progress between devices.

## Controls

W/↑ gas · S/↓ brake and reverse · A D steer · Space handbrake/jump · Shift nitro/sprint · F get in/out, use (hold to rob) · K or click shoot · X weapon · H horn · G auto/manual · Q/E shift · C camera · L lights · N radio · R back on the road · T skip an hour · M map · V car selector · P photo mode · F2 mod menu · Esc pause

Gamepad (standard layout): right trigger gas · left trigger brake · left stick steer/walk · A handbrake/jump · B nitro · X get in/out · Y camera · LB/RB shift gears · Back map · Start pause · D-pad up weapon, left lights · L3 horn · R3 back on the road

## Tests

```bash
npm test
```

## Deploy (Cloudflare Pages)

1. Push this folder to a GitHub repo.
2. In Cloudflare, go to Workers & Pages → Create → Pages → Connect to Git and pick the repo.
3. Framework preset: **None**. Build command: *(empty)*. Build output directory: **/**.
4. Save. After that, every push to `main` goes live.

Design and plans: `docs/superpowers/`.
