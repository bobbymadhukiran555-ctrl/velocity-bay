import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildWorld } from './world.js';
import { createCar } from './car.js';
import { createInput } from './input.js';
import { createCameraRig } from './camera.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { loadSave, writeSave } from './logic/save.js';
import { nearestRoadPoint, SEA_LEVEL } from './logic/map.js';
import { DAY_LENGTH_S, sunState } from './logic/daynight.js';

const STEP = 1 / 60;
const loading = document.getElementById('loading'), status = document.getElementById('loading-status');
const setStatus = t => (status.textContent = t);
const frameYield = () => new Promise(r => requestAnimationFrame(() => r()));

async function boot() {
  const quality = new URLSearchParams(location.search).get('q') || 'med';
  setStatus('Starting physics…');
  await RAPIER.init();
  await frameYield();

  const renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 2 : quality === 'low' ? 1 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.getElementById('game').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 6000);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;

  setStatus('Building Velocity Bay…');
  await frameYield();
  const env = buildWorld(scene, renderer, RAPIER, world, quality);

  const save = loadSave(localStorage);
  let money = save.money, t01 = save.time;
  const car = createCar(scene, RAPIER, world, { color: save.color, pos: save.pos, heading: save.heading, gearMode: save.gearMode });
  const rig = createCameraRig(camera);
  const audio = createAudio();
  const hud = createHud();
  const input = createInput(() => { audio.start(); loading.classList.add('hidden'); });

  const persist = () => {
    const p = car.body.translation();
    writeSave(localStorage, { v: 1, money, color: save.color, pos: { x: p.x, y: p.y + 0.5, z: p.z }, heading: car.heading, time: t01, gearMode: car.state.gearMode });
  };
  setInterval(persist, 10000);
  addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { persist(); audio.suspend(); } else audio.start(); });
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  window.__game = { car, world, scene, renderer, camera }; // console debugging aid
  const resetToRoad = () => { const p = car.body.translation(), r = nearestRoadPoint(p.x, p.z); car.reset(r.x, r.z, r.heading); };
  let stuckTime = 0;

  setStatus('Ready — press any key or tap to drive');
  document.getElementById('loading-spinner').remove();
  document.body.classList.add('ready');

  let last = performance.now(), acc = 0, fpsT = 0, fpsN = 0;
  renderer.setAnimationLoop(now => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (input.consume('camera')) hud.toast(`Camera: ${rig.next()}`, 1.2);
    if (input.consume('reset')) resetToRoad();
    if (input.consume('lights')) { car.state.headlightsOn = !car.state.headlightsOn; car.state.manualLights = true; }
    if (input.consume('gearMode')) { car.state.gearMode = car.state.gearMode === 'auto' ? 'manual' : 'auto'; if (car.state.gear < 2) car.state.gear = 2; hud.toast(`Gears: ${car.state.gearMode}  (Q / E to shift)`); }
    if (input.consume('timeSkip')) t01 = (t01 + 1 / 24) % 1;
    if (input.consume('help')) document.getElementById('help').classList.toggle('open');

    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      car.step(STEP, input.read());
      world.step();
      car.snap();
      acc -= STEP; n++;
    }
    if (n === 5) acc = 0;
    car.render(acc / STEP);

    t01 = (t01 + dt / DAY_LENGTH_S) % 1;
    if (!car.state.manualLights) car.state.headlightsOn = sunState(t01).daylight < 0.35;

    // Fell in the sea, or upside down and stopped: put the car back on the nearest road.
    const p = car.body.translation();
    stuckTime = p.y < SEA_LEVEL - 0.6 || (car.upY < 0.3 && car.speedKmh < 8) ? stuckTime + dt : 0;
    if (stuckTime > 2) { stuckTime = 0; resetToRoad(); hud.toast('Back on the road'); }

    env.update(t01, car.mesh.position);
    rig.update(dt, car);
    hud.update(dt, car, t01, money);
    audio.update(car);
    renderer.render(scene, camera);

    fpsT += dt; fpsN++;
    if (fpsT > 1) { document.getElementById('fps').textContent = `${Math.round(fpsN / fpsT)} fps`; fpsT = fpsN = 0; }
  });
}

boot().catch(err => {
  console.error(err);
  setStatus(`Couldn't start the game: ${err.message}. Try a recent Chrome, Edge, Firefox or Safari.`);
});
