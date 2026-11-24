import test from 'node:test';
import assert from 'node:assert/strict';
import { readPad, DEAD } from '../src/logic/gamepad.js';

const pad = (buttons = [], axes = []) => ({ buttons: buttons.map(v => ({ value: v })), axes });

test('triggers and stick map to throttle, brake, steer and stick', () => {
  const p = readPad(pad([0, 0, 0, 0, 0, 0, 1, 0.5], [0.6, -1]));
  assert.equal(p.brake, 1);
  assert.ok(p.throttle > 0 && p.throttle < 1);
  assert.ok(p.steer > 0);
  assert.equal(p.stick.y, 1);
});

test('stick inside the deadzone reads as zero', () => {
  const p = readPad(pad([], [DEAD / 2, -DEAD / 2]));
  assert.equal(p.steer, 0);
  assert.deepEqual(p.stick, { x: 0, y: 0 });
});

test('holds and edges: a pressed button is held, edges fire once', () => {
  const b = [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1];
  const first = readPad(pad(b), []);
  assert.deepEqual(first.held.sort(), ['handbrake', 'horn', 'nitro']);
  assert.deepEqual(first.edges, ['interact']);
  const next = readPad(pad(b), first.buttons);
  assert.deepEqual(next.edges, []);
});

test('a missing axes array does not throw', () => {
  assert.doesNotThrow(() => readPad({ buttons: [] }));
});
