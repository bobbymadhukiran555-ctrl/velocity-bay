import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STATS, bump, checkAchievements, ACHIEVEMENTS } from '../src/logic/achievements.js';
import { parseSave } from '../src/logic/save.js';

test('stats accumulate, top speed keeps the peak, junk keys are ignored', () => {
  const s = { ...DEFAULT_STATS };
  bump(s, 'distance', 600); bump(s, 'distance', 500); bump(s, 'topSpeed', 120); bump(s, 'topSpeed', 80); bump(s, 'nope', 9);
  assert.equal(s.distance, 1100);
  assert.equal(s.topSpeed, 120);
  assert.equal(s.nope, undefined);
});

test('achievements unlock once and pay nothing twice', () => {
  const s = { ...DEFAULT_STATS, distance: 1000 }, have = [];
  assert.deepEqual(checkAchievements(s, have).map(a => a.id), ['first-mile']);
  assert.deepEqual(checkAchievements(s, have), []);
  assert.ok(have.includes('first-mile'));
});

test('save validates stats and unknown achievement ids', () => {
  const s = parseSave({ stats: { distance: 2500, topSpeed: -4, kills: 'lots' }, achievements: ['first-mile', 'bogus'] });
  assert.equal(s.stats.distance, 2500);
  assert.equal(s.stats.topSpeed, 0);
  assert.equal(s.stats.kills, 0);
  assert.deepEqual(s.achievements, ['first-mile']);
  assert.ok(ACHIEVEMENTS.length > 0);
});
