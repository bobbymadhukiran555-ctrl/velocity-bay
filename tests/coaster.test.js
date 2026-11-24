import test from 'node:test';
import assert from 'node:assert/strict';
import { COASTER_POINTS, COASTER_WIDTH } from '../src/logic/coaster.js';
import { MAP_HALF, SEA_LEVEL, zoneAt } from '../src/logic/map.js';
import { RAMPS, STUNT_IDS } from '../src/logic/places.js';

test('Skyloop stays on the map, above the sea and near the airport', () => {
  assert.ok(COASTER_POINTS.length >= 8);
  for (const [x, z, y] of COASTER_POINTS) {
    assert.ok(Math.abs(x) < MAP_HALF && Math.abs(z) < MAP_HALF);
    assert.ok(y > SEA_LEVEL + 1);
    assert.ok(x >= -920 && x < -350 && z > 50 && z < 450, `point ${x},${z} is not by the airfield`);
  }
  assert.ok(COASTER_POINTS.some(([, , y]) => y > 30), 'needs a real drop');
  assert.ok(COASTER_WIDTH >= 10);
});

test('the airport has a big stunt ramp and it counts as a stunt', () => {
  const r = RAMPS.find(r => r.id === 'stunt-skyloop');
  assert.ok(r && r.stunt && STUNT_IDS.includes(r.id));
  assert.ok(r.len >= 30 && r.height >= 6);
  assert.equal(zoneAt(r.x, r.z), 'airport');
});
