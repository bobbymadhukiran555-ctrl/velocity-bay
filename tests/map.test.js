import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_HALF, SEA_LEVEL, CITY, ROADS, ROAD_PROFILES, zoneAt, heightAt, nearestRoadPoint, SPAWN, cityBuildings } from '../src/logic/map.js';

test('every area of the map exists', () => {
  assert.equal(zoneAt(0, 0), 'downtown');
  assert.equal(zoneAt(600, 0), 'highway');
  assert.equal(zoneAt(400, -1000), 'mountains');
  assert.equal(zoneAt(-1000, -800), 'desert');
  assert.equal(zoneAt(-950, 100), 'airport');
  assert.equal(zoneAt(0, 1000), 'beach');
  assert.equal(zoneAt(950, 0), 'docks');
});

test('terrain heights', () => {
  assert.equal(heightAt(150, 150), 0);
  assert.ok(heightAt(400, -1100) > 60, 'mountains are high');
  assert.ok(heightAt(0, 1150) < SEA_LEVEL, 'south is sea');
});

test('roads stay inside the map and above the sea', () => {
  for (const r of ROADS) for (const p of r.points) assert.ok(Math.abs(p.x) < MAP_HALF && Math.abs(p.z) < MAP_HALF, r.name);
  for (const prof of ROAD_PROFILES)
    for (const p of prof.pts) assert.ok(heightAt(p.x, p.z) >= SEA_LEVEL + 0.5, `${prof.road.name} at ${p.x},${p.z}`);
});

test('road profiles are drivable (no grade over 22%)', () => {
  for (const { road, pts } of ROAD_PROFILES)
    for (let i = 1; i < pts.length; i++) {
      const run = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      assert.ok(Math.abs(pts[i].y - pts[i - 1].y) / run < 0.22, `${road.name} too steep at ${i}`);
    }
});

test('roads that meet share a height (no cliffs at junctions)', () => {
  const cell = 16, grid = new Map(), pts = [];
  for (const prof of ROAD_PROFILES) for (let i = 0; i < prof.pts.length; i += 2) {
    const p = prof.pts[i], q = { x: p.x, z: p.z, y: p.y, name: prof.road.name };
    pts.push(q);
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(q);
  }
  for (const p of pts) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    for (const q of grid.get(`${Math.floor(p.x / cell) + dx},${Math.floor(p.z / cell) + dz}`) || []) {
      if (q.name === p.name || Math.hypot(p.x - q.x, p.z - q.z) > 6) continue;
      assert.ok(Math.abs(p.y - q.y) < 1.5, `${p.name} meets ${q.name} at ${Math.round(p.x)},${Math.round(p.z)} with a ${Math.abs(p.y - q.y).toFixed(1)} m step`);
    }
  }
});

test('nearest road point from far outside is inside the map', () => {
  const p = nearestRoadPoint(5000, 5000);
  assert.ok(Math.abs(p.x) < MAP_HALF && Math.abs(p.z) < MAP_HALF);
  assert.ok(Number.isFinite(p.heading));
});

test('spawn is on a street', () => {
  const p = nearestRoadPoint(SPAWN.x, SPAWN.z);
  assert.ok(Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z) < 1);
});

test('no building sits on a street', () => {
  const { buildings } = cityBuildings();
  assert.ok(buildings.length > 60);
  for (const b of buildings) {
    for (let v = CITY.min; v <= CITY.max; v += CITY.block) {
      assert.ok(Math.abs(b.x - v) - b.w / 2 >= CITY.street / 2, `x street ${v}`);
      assert.ok(Math.abs(b.z - v) - b.d / 2 >= CITY.street / 2, `z street ${v}`);
    }
  }
});
