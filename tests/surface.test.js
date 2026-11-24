import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceGrip } from '../src/logic/surface.js';

test('tarmac gives full grip, desert and mountains less', () => {
  assert.equal(surfaceGrip(0, 200), 1);
  assert.equal(surfaceGrip(600, 100), 1);
  assert.ok(surfaceGrip(-1000, -800) < 0.7);
  assert.ok(surfaceGrip(0, -900) < 0.8);
});

test('grip changes smoothly at a road edge', () => {
  const a = surfaceGrip(20, 200), b = surfaceGrip(26, 200), c = surfaceGrip(40, 200);
  assert.ok(a >= b && b >= c, `${a} ${b} ${c}`);
  assert.ok(a - b < 0.5 && b - c < 0.5);
});
