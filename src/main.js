import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildWorld } from './world.js';
import { buildCoaster } from './coaster.js';
import { createPostFx } from './postfx.js';
import { createInput } from './input.js';
import { createCameraRig } from './camera.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createParticles, createSkids, createDebris } from './fx.js';
import { buildStreets } from './streets.js';
import { createWeatherFx } from './weatherfx.js';
import { createFleet } from './fleet.js';
import { createHumans } from './humans.js';
import { createPlayer } from './player.js';
import { createCombat, WEAPON_ORDER } from './combat.js';
import { createPolice } from './police.js';
import { createPois } from './poi.js';
import { createActivities } from './activities.js';
import { createMenus } from './menus.js';
import { HOLD } from './ai.js';
import { loadSave, writeSave } from './logic/save.js';
import { bump, checkAchievements } from './logic/achievements.js';
import { nearestRoadPoint, SEA_LEVEL, heightAt, zoneAt } from './logic/map.js';
import { DAY_LENGTH_S } from './logic/daynight.js';
import { createWeather } from './logic/weather.js';
import { createWanted, penalty } from './logic/wanted.js';
import { route } from './logic/roadgraph.js';
import { RESPAWN } from './logic/places.js';
import { MODELS } from './logic/vehicles.js';

const STEP = 1 / 60;
const loading = document.getElementById('loading'), status = document.getElementById('loading-status');
const setStatus = t => (status.textContent = t);
const frameYield = () => new Promise(r => requestAnimationFrame(() => r()));

async function boot() {
  const save = loadSave(localStorage);
  const quality = new URLSearchParams(location.search).get('q') || save.settings.quality;
  setStatus('Starting physics…');
  await RAPIER.init();
  await frameYield();

  const renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 2 : quality === 'low' ? 1 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = quality === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.getElementById('game').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 6000);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;

  const G = {
    RAPIER, world, scene, renderer, camera, quality, save, settings: save.settings,
    t01: save.time, clock: 0, timeScale: 1, paused: false, freezePlayer: false, night: 0, bag: 0,
    focus: new THREE.Vector3(save.pos.x, save.pos.y, save.pos.z),
    mods: {}, gps: { target: null, route: null, dirty: false, timer: 0 }, activity: null,
    get money() { return save.money; }, set money(v) { save.money = v; },
  };
  G.statsProgress = (key, amount = 1) => {
    bump(save.stats, key, amount);
    for (const a of checkAchievements(save.stats, save.achievements)) {
      save.money += a.reward;
      G.hud?.toast(`Achievement: ${a.name}  +$${a.reward}`, 4);
      G.audio?.cash?.();
    }
  };
  G.addMoney = n => { save.money = Math.max(0, Math.round(save.money + n)); if (n > 0) bump(save.stats, 'earned', n); };
  window.__game = G; // console debugging aid

  setStatus('Building Velocity Bay…');
  await frameYield();
  const env = buildWorld(scene, renderer, RAPIER, world, quality);
  buildCoaster(scene, RAPIER, world);
  G.smoke = createParticles(scene, 900, false);
  G.glow = createParticles(scene, 600, true);
  G.skids = createSkids(scene);
  G.debris = createDebris(scene, heightAt);
  setStatus('Wiring up the streets…');
  await frameYield();
  G.streets = buildStreets(G);
  G.weather = createWeather();
  G.wfx = createWeatherFx(scene);
  G.wanted = createWanted();
  G.wanted.enabled = G.settings.crime;

  const camDir = new THREE.Vector3();
  G.inView = (x, z) => {
    const dx = x - camera.position.x, dz = z - camera.position.z, d = Math.hypot(dx, dz);
    if (d > 260) return false;
    return (dx * camDir.x + dz * camDir.z) / (d * Math.hypot(camDir.x, camDir.z) || 1) > 0.4;
  };
  // Is the straight line between two points blocked by the static world (buildings, terrain)?
  G.rayBlocked = (x1, y1, z1, x2, y2, z2) => {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1, L = Math.hypot(dx, dy, dz);
    if (L < 0.6) return false;
    const ray = new RAPIER.Ray({ x: x1, y: y1, z: z1 }, { x: dx / L, y: dy / L, z: dz / L });
    return !!world.castRay(ray, L - 0.5, true, RAPIER.QueryFilterFlags.ONLY_FIXED);
  };

  G.rig = createCameraRig(camera);
  G.rig.collide = (x1, y1, z1, x2, y2, z2) => {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1, L = Math.hypot(dx, dy, dz);
    if (L < 0.3) return Infinity;
    const hit = world.castRay(new RAPIER.Ray({ x: x1, y: y1, z: z1 }, { x: dx / L, y: dy / L, z: dz / L }), L, true, RAPIER.QueryFilterFlags.ONLY_FIXED);
    return hit ? (hit.timeOfImpact ?? hit.toi) : Infinity;
  };
  G.audio = createAudio(G);
  G.fleet = createFleet(G);
  G.humans = createHumans(G);
  G.hud = createHud(G);
  G.player = createPlayer(G, save);
  G.combat = createCombat(G);
  G.police = createPolice(G);
  G.pois = createPois(G);
  G.activities = createActivities(G);
  G.menus = createMenus(G);
  const P = G.player;

  // Headlights: one pair of spotlights that rides on whichever vehicle the player drives.
  const headlights = [-1, 1].map(() => { const l = new THREE.SpotLight(0xfff2d8, 0, 140, 0.42, 0.45, 1.2); scene.add(l.target); return l; });
  G.onEnterVehicle = v => {
    const y = v.view.parts.lampY - v.view.parts.bodyY, x = v.spec.len / 2 - 0.1;
    headlights.forEach((l, i) => {
      const z = v.spec.kind === 'bike' ? 0 : (i ? 1 : -1) * (v.spec.width / 2 - 0.35);
      v.mesh.add(l, l.target); l.position.set(x, y, z); l.target.position.set(x + 30, y - 3, z * 3);
    });
    G.hud.toast(`${MODELS[v.model].name}  ·  ${G.audio.station}`, 1.8);
  };
  G.onExitVehicle = () => headlights.forEach(l => (l.intensity = 0));

  // ---- Game flow ----
  const snapshot = () => {
    const t = P.target(), heading = P.vehicle ? P.vehicle.heading : P.yaw;
    return { v: 2, money: save.money, pos: { x: t.x, y: t.y + 0.5, z: t.z }, heading, time: G.t01, garage: save.garage, current: save.current,
      weapons: { bat: P.weapons.bat, pistol: P.weapons.pistol, smg: P.weapons.smg }, missions: save.missions, stunts: save.stunts, best: save.best,
      stats: save.stats, achievements: save.achievements, settings: G.settings };
  };
  const persist = () => { if (!P.dead && !G.activity) writeSave(localStorage, snapshot()); else writeSave(localStorage, { ...snapshot(), pos: save.pos }); };

  function swapVehicle(model, color, up, owned) {
    const old = P.vehicle;
    let p, heading;
    if (old) { p = old.body.translation(); heading = old.heading; P.vehicle = null; G.fleet.remove(old); }
    else { p = { x: P.human.x, y: P.human.y, z: P.human.z }; heading = P.yaw; P.collider.setEnabled(false); }
    const v = G.fleet.spawn({ model, color, pos: { x: p.x, y: p.y + 0.5, z: p.z }, heading, up, role: 'player' });
    v.reset(p.x, p.z, heading, Math.max(heightAt(p.x, p.z), p.y - 0.3) + 1.2);
    if (owned !== undefined) v.owned = owned;
    P.enter(v);
    v.render(1, 0);
    return v;
  }
  function respawn(where, title) {
    if (P.dead) return;
    P.dead = true;
    G.timeScale = 0.3;
    G.activities.cancel(title === 'WASTED' ? 'Wasted' : 'Busted');
    const lost = penalty(save.money);
    G.addMoney(-lost);
    const bag = G.bag; G.bag = 0;
    if (title === 'BUSTED') { P.weapons.pistol = 0; P.weapons.smg = 0; P.weapon = 'fists'; }
    G.hud.banner(title, `-$${lost}${bag ? ` and the $${bag} bag` : ''}`, 'bad');
    G.audio.fail();
    setTimeout(() => {
      G.timeScale = 1;
      G.wanted.clear(); G.police.clear();
      if (P.vehicle) { P.vehicle.role = 'abandoned'; P.vehicle.driverInside = false; P.vehicle = null; }
      P.health = 100; P.dead = false;
      Object.assign(P.human, { state: 'walk', fall: 0, health: 100, dead: false });
      if (!G.humans.list.includes(P.human)) G.humans.list.push(P.human);
      P.placeOnFoot(where.x, where.z, where.heading);
      G.rig.snap();
      persist();
    }, 3500);
  }
  // A plane picked away from the airfield starts in the air, flying.
  function airStart() {
    const v = P.vehicle;
    if (!v || v.spec.kind !== 'plane') return;
    const p = v.body.translation(), h = v.heading;
    if (zoneAt(p.x, p.z) === 'airport') return;
    v.reset(p.x, p.z, h, heightAt(p.x, p.z) + 160);
    v.state.thr = 0.8;
    v.setVelocity(Math.cos(h) * v.spec.stall * 1.6, 0, -Math.sin(h) * v.spec.stall * 1.6);
    G.rig.snap();
    G.hud.toast('Airborne! Space climb · Shift dive · A/D turn · W/S throttle', 4);
  }
  G.game = {
    persist, snapshot, swapVehicle, airStart,
    wasted: () => respawn(RESPAWN.wasted, 'WASTED'),
    busted: () => respawn(RESPAWN.busted, 'BUSTED'),
    drowned: () => respawn(RESPAWN.wasted, 'WASTED'),
    teleport(x, z, heading = 0) {
      if (G.activity) { G.hud.toast('Not during a mission or event'); return; }
      const r = nearestRoadPoint(x, z), onRoad = Math.hypot(r.x - x, r.z - z) < 30;
      const tx = onRoad ? r.x : x, tz = onRoad ? r.z : z;
      if (P.mode === 'car' && P.vehicle) P.vehicle.reset(tx, tz, onRoad ? r.heading : heading);
      else P.placeOnFoot(tx, tz, heading);
      G.rig.snap();
    },
    spawnForPlayer(model) {
      const owned = save.garage.findIndex(c => c.model === model);
      swapVehicle(model, owned >= 0 ? save.garage[owned].color : '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'), owned >= 0 ? save.garage[owned].up : undefined, owned >= 0 ? owned : undefined);
      airStart();
    },
    load(s) { writeSave(localStorage, s); location.reload(); },
  };
  G.onEscaped = () => {
    if (G.bag > 0) { G.addMoney(G.bag); G.hud.banner('CLEAN GETAWAY', `+$${G.bag.toLocaleString()}`, 'good'); G.audio.cash(); G.bag = 0; }
    else G.hud.toast('You lost the cops');
  };
  G.onKill = h => { G.activity?.onKill?.(h); G.statsProgress('kills'); };
  G.onRobbed = p => { G.activity?.onRobbed?.(p); G.statsProgress('robberies'); };

  // Start in your current car.
  const mine = save.garage[save.current];
  const car = G.fleet.spawn({ model: mine.model, color: mine.color, pos: save.pos, heading: save.heading, up: mine.up, role: 'player' });
  car.owned = save.current;
  P.enter(car);
  for (let i = 0; i < 10; i++) { G.fleet.fixed(STEP, HOLD); world.step(); G.fleet.postStep(); } // let it settle

  const input = createInput(() => { G.audio.start(); loading.classList.add('hidden'); });
  input.attach(renderer.domElement);
  setInterval(() => { if (!G.paused) persist(); }, 10000);
  addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { persist(); G.audio.suspend(); } else G.audio.start(); });
  // Fit the canvas to the window (also catches a page that started hidden at size 0).
  let fitW = 0, fitH = 0;
  const fit = () => {
    if (innerWidth === fitW && innerHeight === fitH) return;
    fitW = innerWidth; fitH = innerHeight;
    camera.aspect = fitW / Math.max(1, fitH); camera.updateProjectionMatrix(); renderer.setSize(fitW, fitH); post?.setSize(fitW, fitH);
    G.smoke.mat.uniforms.scale.value = G.glow.mat.uniforms.scale.value = fitH * renderer.getPixelRatio() * 0.6;
    G.menus.redrawMap();
  };
  document.getElementById('fps').hidden = !G.settings.showFps;

  const resetToRoad = () => { if (!P.vehicle) return; const p = P.vehicle.body.translation(), r = nearestRoadPoint(p.x, p.z); P.vehicle.reset(r.x, r.z, r.heading); G.rig.snap(); };
  let stuckTime = 0, lastDrive = null;
  // Fullscreen (Android Chrome, desktop). iPhone Safari has no fullscreen API, so the button just does nothing there.
  G.toggleFullscreen = () => {
    const d = document;
    if (d.fullscreenElement) return d.exitFullscreen();
    d.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  };
  const fsBtn = document.getElementById('fs');
  if (fsBtn) fsBtn.onclick = G.toggleFullscreen;
  // First-person gun in your hands: kicks back when you fire.
  const viewGun = new THREE.Group(), grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), new THREE.MeshStandardMaterial({ color: 0x2a1d14 }));
  grip.position.set(0, -0.12, 0.14);
  viewGun.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.42), new THREE.MeshStandardMaterial({ color: 0x1b1b1d, metalness: 0.6, roughness: 0.4 })),
    grip);
  viewGun.visible = false; camera.add(viewGun); scene.add(camera);
  let recoil = 0;
  const speedFx = document.getElementById('speedfx');
  const flightKeys = [...document.querySelectorAll('#flightkeys [data-k]')];

  function edges() {
    if (G.menus.open) return;
    if (input.consume('pause') || input.consume('help')) return G.menus.pause();
    if (input.consume('map')) return G.menus.openMap();
    if (input.consume('photo')) return G.menus.photo();
    if (input.consume('mods')) return G.menus.mods();
    if (input.consume('selector')) return G.menus.openSelector('anywhere');
    if (input.consume('camera')) G.hud.toast(`Camera: ${G.rig.next()}`, 1.2);
    if (input.consume('reset')) resetToRoad();
    if (input.consume('timeSkip')) G.t01 = (G.t01 + 1 / 24) % 1;
    if (input.consume('radio')) G.hud.toast(`📻 ${G.audio.nextStation()}`, 2);
    const v = P.vehicle;
    if (input.consume('lights') && v) { v.state.headlightsOn = !v.state.headlightsOn; v.manualLights = true; }
    if (input.consume('gearMode') && v) {
      G.settings.gearMode = v.state.gearMode = v.state.gearMode === 'auto' ? 'manual' : 'auto';
      if (v.state.gear < 2) v.state.gear = 2;
      G.hud.toast(`Gears: ${v.state.gearMode}  (Q / E to shift)`);
    }
    if (input.consume('weapon')) {
      const have = WEAPON_ORDER.filter(w => w === 'fists' || (w === 'bat' ? P.weapons.bat : P.weapons[w] > 0 || G.mods.infAmmo));
      P.weapon = have[(have.indexOf(P.weapon) + 1) % have.length];
      G.hud.toast(P.weapon[0].toUpperCase() + P.weapon.slice(1), 1);
    }
    if (input.consume('interact') && !P.dead) {
      const a = G.pois.action;
      if (a?.run) a.run(); else if (!a?.rob) P.interact();
    }
  }

  setStatus('Ready — press any key or tap to play');
  document.getElementById('loading-spinner').remove();
  document.body.classList.add('ready');

  const post = createPostFx(renderer, scene, camera, quality);
  const render = () => (post ? post.render() : renderer.render(scene, camera));
  G.renderNow = render;
  let last = performance.now(), acc = 0, fpsT = 0, fpsN = 0;
  renderer.setAnimationLoop(now => {
    const raw = Math.min(0.1, (now - last) / 1000);
    last = now;
    fit();
    input.enabled = !G.menus.open;
    edges();
    camera.getWorldDirection(camDir);
    G.camYaw = Math.atan2(-camDir.z, camDir.x);
    const vehicleKind = P.vehicle?.spec?.kind;
    const controlMode = P.mode === 'foot' ? (P.weapon === 'fists' ? 'foot' : 'shoot')
      : vehicleKind === 'plane' ? 'plane' : vehicleKind === 'bike' ? 'bike' : 'car';
    document.body.classList.toggle('on-foot', P.mode === 'foot');
    for (const m of ['car', 'bike', 'plane', 'foot', 'shoot']) document.body.classList.toggle(`mode-${m}`, m === controlMode);
    if (controlMode === 'plane') for (const el of flightKeys) el.classList.toggle('on', input.held(el.dataset.k));
    P.aiming = input.held('aim') && P.mode === 'foot';
    const locked = P.mode === 'foot' && input.pointerLocked();
    P.look = locked;
    recoil = Math.max(0, recoil - raw * 7);
    viewGun.visible = P.fps && (P.weapon === 'pistol' || P.weapon === 'smg');
    viewGun.scale.set(0.32, 0.32, P.weapon === 'smg' ? 0.5 : 0.32);
    viewGun.position.set(0.16 - recoil * 0.004, -0.15 + recoil * 0.008, -0.55 + recoil * 0.04);
    viewGun.rotation.y = 0.06;
    viewGun.rotation.x = recoil * 0.12;
    G.aiming = P.fps;
    if (P.mode === 'foot') P.human.visible = !P.fps;
    if (P.fps && !G.fpsHint && matchMedia('(pointer: fine)').matches) { G.fpsHint = true; G.hud.toast('Click the game to aim with the mouse · Esc releases it', 4); }
    document.body.classList.toggle('aiming', locked || P.fps);
    document.body.classList.toggle('fps', P.fps);
    if (!locked && input.pointerLocked()) document.exitPointerLock?.();
    const md = input.mouseDelta();
    if (P.mode === 'foot' && (locked || md.touch) && (md.x || md.y)) {
      P.yaw -= md.x * 0.0022;
      P.pitch = Math.max(-1, Math.min(1, P.pitch - md.y * 0.0022));
    }
    const dt = G.paused ? 0 : raw * G.timeScale * (G.mods.slowmo ? 0.35 : 1);
    const driven = P.mode === 'car' && P.vehicle && !G.paused ? P.vehicle : null;
    if (driven) {
      const p = driven.body.translation();
      if (lastDrive) G.statsProgress('distance', Math.min(2, Math.hypot(p.x - lastDrive.x, p.z - lastDrive.z)));
      lastDrive = { x: p.x, z: p.z };
      G.statsProgress('topSpeed', driven.speedKmh);
    } else lastDrive = null;
    let n = 0;
    if (!G.paused) {
      acc += dt;
      while (acc >= STEP && n < 5) {
        const inp = input.read();
        if (controlMode === 'plane' && inp.stick?.active) { inp.steer = inp.stick.x; inp.pitch = inp.stick.y; } // touch stick: bank + climb/dive
        P.fixed(STEP, inp);
        G.fleet.fixed(STEP, G.freezePlayer ? HOLD : inp);
        world.step();
        G.fleet.postStep();
        acc -= STEP; n++;
      }
      if (n === 5) acc = 0;
      G.clock += dt;
      if (!G.mods.freezeTime) G.t01 = (G.t01 + dt / DAY_LENGTH_S) % 1;
      G.weather.update(dt);
      G.police.update(dt);
      G.activities.update(dt);
      G.fleet.update(dt);
      G.humans.update(dt);
      P.update(dt);
      G.combat.update(dt);
      G.pois.action = G.pois.update(dt, { use: input.held('use') });
      if ((input.held('fire') || input.held('mouseFire')) && !P.dead) {
        if (!G.settings.crime && !G.mods.neverWanted && P.weapon !== 'fists') { if (!G.noGunToast) { G.hud.toast('Weapons are off in racing-only mode'); G.noGunToast = true; } }
        else { const ammo = P.weapons[P.weapon]; G.combat.playerFire(); if (P.weapons[P.weapon] < ammo || G.mods.infAmmo) recoil = 1; }
      }
      const v = P.vehicle;
      if (v) v.state.horn = input.held('horn') && P.mode === 'car';
      // GPS route to the waypoint or the current objective.
      const gps = G.gps;
      if (gps.target && ((gps.timer -= dt) <= 0 || gps.dirty)) { gps.timer = 1.5; gps.dirty = false; gps.route = route(P.target(), gps.target); }
      if (!gps.target) gps.route = null;
      else if (!G.activity && Math.hypot(G.focus.x - gps.target.x, G.focus.z - gps.target.z) < 15) { gps.target = null; G.hud.toast('You have arrived'); }
      for (const fx of [G.smoke, G.glow, G.debris]) fx.update(dt);
      G.skids.update();
      // Fell in the sea, or upside down and stopped: back on the nearest road.
      if (v && P.mode === 'car') {
        const p = v.body.translation();
        stuckTime = (v.upY < 0.3 && v.speedKmh < 8 && !v.dead) ? stuckTime + dt : 0;
        if (stuckTime > 2.5) { stuckTime = 0; resetToRoad(); G.hud.toast('Back on the road'); }
        if (p.y < SEA_LEVEL - 3) { resetToRoad(); G.hud.toast('Back on the road'); }
      }
      G.menus.rainbow(dt);
    }
    G.fleet.render(G.paused ? 1 : acc / STEP, dt);
    G.humans.render();
    const t = P.target();
    G.focus.set(t.x, t.y, t.z);
    const w = G.weather.params;
    const flash = G.wfx.flash;
    const sun = env.update(G.t01, G.focus, { cloud: w.cloud, fog: w.fog, rain: w.rain, wet: G.weather.wet, flash });
    G.night = Math.min(1, 1 - sun.daylight * (1 - 0.45 * w.cloud));
    if (G.wfx.update(raw, w, camera, sun.daylight) === 'thunder') G.audio.thunder();
    G.smoke.mat.uniforms.light.value = 0.3 + 0.7 * sun.daylight;
    G.streets.update(raw, G.night);
    // Lights on at night and in bad weather.
    const dark = G.night > 0.55 || w.fog > 0.5 || w.rain > 0.5;
    for (const u of G.fleet.list) if (!u.manualLights && u.driverInside) u.state.headlightsOn = dark;
    const pv = P.mode === 'car' ? P.vehicle : null;
    const fxKmh = pv && pv.spec.kind !== 'plane' ? pv.speedKmh : 0;
    speedFx.style.opacity = Math.min(0.55, Math.max(0, (fxKmh - 110) / 220) + (pv?.state.nitroOn ? 0.25 : 0));
    speedFx.classList.toggle('nitro', !!pv?.state.nitroOn);
    if (post) post.set(Math.min(1, Math.max(0, (fxKmh - 130) / 200) + (pv?.state.nitroOn ? 0.3 : 0)), document.body.classList.contains('photo') ? Math.max(2, camera.position.distanceTo(G.focus)) : 0);
    headlights.forEach(l => (l.intensity = pv?.state.headlightsOn ? 260 : 0));
    G.rig.look = input.look();
    G.rig.update(raw, P.camTarget());
    G.hud.update(raw);
    G.audio.update(raw);
    render();
    fpsT += raw; fpsN++;
    if (fpsT > 1) { document.getElementById('fps').textContent = `${Math.round(fpsN / fpsT)} fps`; fpsT = fpsN = 0; }
  });
}

boot().catch(err => {
  console.error(err);
  setStatus(`Couldn't start the game: ${err.message}. Try a recent Chrome, Edge, Firefox or Safari.`);
});
