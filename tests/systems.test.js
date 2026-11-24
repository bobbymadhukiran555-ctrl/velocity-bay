import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, tunedStats, nextUpgradeCost, statBars } from '../src/logic/vehicles.js';
import { GRAPH, route, routeLength, locate, signalAt, SAMPLES } from '../src/logic/roadgraph.js';
import { createWeather, WEATHER } from '../src/logic/weather.js';
import { createWanted, starsFor, bustStep, penalty, policeFor } from '../src/logic/wanted.js';
import { createDrift, driftStep, driftTotal, medalForTime, medalForScore, raceOrder } from '../src/logic/scoring.js';
import { POIS, EVENTS, MISSIONS, RAMPS, SPEED_CAMS } from '../src/logic/places.js';
import { parseSave, exportCode, importCode, DEFAULT_SAVE } from '../src/logic/save.js';
import { MAP_HALF, heightAt, SEA_LEVEL } from '../src/logic/map.js';

test('upgrades make cars better and cap at level 3', () => {
  const base = tunedStats('vanta'), max = tunedStats('vanta', { engine: 3, tires: 3, nitro: 3, armor: 3 });
  assert.ok(max.power > base.power && max.grip > base.grip && max.nitroSecs > base.nitroSecs && max.damageTaken < base.damageTaken);
  assert.equal(nextUpgradeCost({ engine: 3 }, 'engine'), null);
  assert.equal(nextUpgradeCost({}, 'engine'), 2000);
  for (const id in MODELS) for (const v of Object.values(statBars(id))) assert.ok(v >= 0 && v <= 1, id);
});

test('road graph is one connected network', () => {
  const seen = new Set([0]), q = [GRAPH.nodes[0]];
  while (q.length) for (const { edge, dir } of q.pop().edges) { const v = dir === 1 ? edge.b : edge.a; if (!seen.has(v.id)) { seen.add(v.id); q.push(v); } }
  assert.equal(seen.size, GRAPH.nodes.length);
  assert.ok(SAMPLES.length > 500);
});

test('GPS route follows roads to the target', () => {
  const r = route({ x: 0, z: 150 }, { x: -660, z: -700 });
  const end = r[r.length - 1];
  assert.ok(Math.hypot(end.x + 660, end.z + 700) < 5);
  assert.ok(routeLength(r) > Math.hypot(660, 850));
  for (let i = 1; i < r.length; i++) assert.ok(Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z) < 30, 'no jumps');
});

test('lanes are on the right-hand side', () => {
  const e = GRAPH.edges.find(e => e.kind === 'street' && Math.abs(e.pts[0].z - e.pts[e.pts.length - 1].z) < 1 && e.pts[0].x < e.pts[e.pts.length - 1].x);
  assert.ok(e, 'an eastbound street edge');
  assert.ok(e.lanes[1][3].z > e.pts[3].z, 'eastbound traffic keeps to the south (right)');
});

test('crossing traffic lights are never both green', () => {
  const n = GRAPH.nodes.find(n => n.signal);
  for (let t = 0; t < 60; t += 0.5) assert.ok(!(signalAt(t, n, 'ns') === 'green' && signalAt(t, n, 'ew') === 'green'));
});

test('weather blends, can be forced, and roads get wet then dry', () => {
  const w = createWeather(() => 0.5, 'clear');
  w.set('storm');
  for (let i = 0; i < 600; i++) w.update(0.5);
  assert.ok(Math.abs(w.params.rain - WEATHER.storm.rain) < 0.01);
  assert.equal(w.wet, 1);
  w.set('clear');
  for (let i = 0; i < 600; i++) w.update(0.5);
  assert.ok(w.params.rain < 0.01 && w.wet === 0);
});

test('wanted level: crimes add stars, hiding clears them', () => {
  const w = createWanted();
  assert.equal(w.stars, 0);
  w.crime('robShop');
  assert.equal(w.stars, 2);
  w.crime('killCop');
  assert.ok(w.stars >= 3);
  let out = null;
  for (let i = 0; i < 400 && !out; i++) out = w.update(0.1, false, { x: 0, z: 0 });
  assert.equal(out, 'escaped');
  assert.equal(w.stars, 0);
  w.enabled = false;
  w.crime('killCop');
  assert.equal(w.stars, 0, 'racing-only mode never gets stars');
  assert.equal(starsFor(800), 5);
  assert.equal(policeFor(4).heli, true);
});

test('busted needs a stopped player next to the police', () => {
  let p = 0;
  for (let i = 0; i < 30; i++) p = bustStep(p, 0.1, { copDist: 5, playerSpeed: 0, onFoot: false });
  assert.equal(p, 1);
  assert.equal(bustStep(0.5, 0.1, { copDist: 5, playerSpeed: 20, onFoot: false }), 0.4);
  assert.equal(penalty(50), 50);
  assert.equal(penalty(10000), 1000);
});

test('drift chains bank, multiply and are lost on a crash', () => {
  const d = createDrift();
  for (let i = 0; i < 60; i++) driftStep(d, { slipAngle: 0.5, speed: 15, dt: 0.1, crashed: false });
  assert.ok(d.mult > 1 && d.chain > 0);
  for (let i = 0; i < 20; i++) driftStep(d, { slipAngle: 0, speed: 15, dt: 0.1, crashed: false });
  assert.ok(d.score > 0 && d.chain === 0);
  const banked = d.score;
  driftStep(d, { slipAngle: 0.5, speed: 15, dt: 0.1, crashed: false });
  assert.equal(driftStep(d, { slipAngle: 0.5, speed: 15, dt: 0.1, crashed: true }), 'lost');
  assert.equal(driftTotal(d), banked);
});

test('medals and race order', () => {
  assert.equal(medalForTime(40, [44, 52, 62]), 'gold');
  assert.equal(medalForTime(70, [44, 52, 62]), null);
  assert.equal(medalForScore(12000, [20000, 10000, 4000]), 'silver');
  const order = raceOrder([{ id: 'a', passed: 3, toNext: 50 }, { id: 'b', passed: 4, toNext: 90 }, { id: 'c', passed: 3, toNext: 10 }]);
  assert.deepEqual(order.map(r => r.id), ['b', 'c', 'a']);
});

test('places are on the map, on land, and events start on a road', () => {
  const all = [...POIS, ...SPEED_CAMS, ...RAMPS, ...MISSIONS.map(m => m.start), ...EVENTS.map(e => e.start)];
  for (const p of all) {
    assert.ok(Math.abs(p.x) < MAP_HALF - 30 && Math.abs(p.z) < MAP_HALF - 30, JSON.stringify(p));
    assert.ok(heightAt(p.x, p.z) > SEA_LEVEL + 0.3, `on land: ${JSON.stringify(p)}`);
  }
  for (const e of EVENTS.filter(e => !['drift', 'drag'].includes(e.type))) { // drift and drag use the open airfield
    assert.ok(locate(e.start.x, e.start.z).dist < 12, e.id);
    for (const [x, z] of e.checkpoints || []) assert.ok(locate(x, z).dist < 35, `${e.id} checkpoint ${x},${z}`); // races snap them onto the road
  }
  const types = new Set(['drive_to', 'walk_to', 'wait', 'stars', 'lose_cops', 'steal', 'deliver', 'chase', 'rob', 'kill_gang']);
  for (const m of MISSIONS) for (const s of m.steps) assert.ok(types.has(s.type), `${m.id}: ${s.type}`);
});

test('save v2: validates every field and round-trips through a save code', () => {
  const bad = parseSave({ money: -5, garage: [{ model: 'patrol' }, { model: 'comet', color: 'red', up: { engine: 9 } }], current: 7, weapons: { pistol: 'lots' }, stunts: ['stunt-beach', 'nope'], settings: { traffic: 99, quality: 'ultra' } });
  assert.equal(bad.money, DEFAULT_SAVE.money);
  assert.deepEqual(bad.garage.map(c => c.model), ['comet'], 'police cars cannot be owned');
  assert.equal(bad.garage[0].up.engine, 3);
  assert.equal(bad.current, 0);
  assert.equal(bad.weapons.pistol, 0);
  assert.deepEqual(bad.stunts, ['stunt-beach']);
  assert.equal(bad.settings.traffic, 2);
  assert.equal(bad.settings.quality, 'med');
  const good = parseSave({ money: 4321, missions: 2 });
  assert.deepEqual(importCode(exportCode(good)), good);
  assert.equal(importCode('not a code!!'), null);
});
