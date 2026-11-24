import test from 'node:test';
import assert from 'node:assert/strict';
import { IDLE, REDLINE, rpmFromSpeed, torqueAt, driveForce, autoShift } from '../src/logic/gearbox.js';
import { sunState } from '../src/logic/daynight.js';
import { loadSave, writeSave, DEFAULT_SAVE } from '../src/logic/save.js';

const R = 0.34;
const fakeStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

test('rpm idles at standstill and rises with speed', () => {
  assert.equal(rpmFromSpeed(0, 2, R), IDLE);
  assert.ok(rpmFromSpeed(20, 2, R) > rpmFromSpeed(10, 2, R));
});

test('no torque past the redline', () => {
  assert.equal(torqueAt(REDLINE + 1), 0);
  assert.ok(torqueAt(4800) > torqueAt(1500));
});

test('drive force is negative in reverse and zero in neutral', () => {
  assert.ok(driveForce(3000, 0, 1, R) < 0);
  assert.equal(driveForce(3000, 1, 1, R), 0);
  assert.ok(driveForce(3000, 2, 1, R) > 0);
});

test('auto gearbox shifts up high and down low, never into R or N', () => {
  assert.equal(autoShift(2, 6800, 1, 20), 3);
  assert.equal(autoShift(4, 2000, 0.5, 15), 3);
  assert.equal(autoShift(2, 1000, 0, 1), 2);
  assert.equal(autoShift(7, 7000, 1, 80), 7);
});

test('sun is up at noon and down at midnight', () => {
  assert.ok(sunState(0.5).elevation > 0);
  assert.ok(sunState(0).elevation < 0);
  assert.ok(sunState(0.5).daylight > sunState(0).daylight);
});

test('corrupt save falls back to defaults', () => {
  assert.deepEqual(loadSave(fakeStorage({ 'velocitybay.save': '{nope' })), DEFAULT_SAVE);
});

test('out-of-bounds or NaN position falls back to defaults', () => {
  const bad = { ...DEFAULT_SAVE, money: 50, pos: { x: 99999, y: 0, z: 0 } };
  assert.deepEqual(loadSave(fakeStorage({ 'velocitybay.save': JSON.stringify(bad) })).pos, DEFAULT_SAVE.pos);
  const nan = { ...DEFAULT_SAVE, pos: { x: 'a', y: 0, z: 0 } };
  assert.deepEqual(loadSave(fakeStorage({ 'velocitybay.save': JSON.stringify(nan) })).pos, DEFAULT_SAVE.pos);
});

test('save round-trips', () => {
  const s = fakeStorage();
  writeSave(s, { ...DEFAULT_SAVE, money: 1234, gearMode: 'manual' });
  const got = loadSave(s);
  assert.equal(got.money, 1234);
  assert.equal(got.gearMode, 'manual');
});

test('storage that throws still loads defaults', () => {
  const s = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSave(s), DEFAULT_SAVE);
  assert.doesNotThrow(() => writeSave(s, DEFAULT_SAVE));
});
