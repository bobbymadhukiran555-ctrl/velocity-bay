import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CAR_FILES } from '../src/logic/carfiles.js';
import { MODELS } from '../src/logic/vehicles.js';

test('every Kenney car mapping points at a real vehicle and a bundled model with its palette texture', () => {
  for (const [id, file] of Object.entries(CAR_FILES)) {
    assert.ok(MODELS[id] && MODELS[id].kind === 'car', `${id} must be a car`);
    assert.ok(fs.existsSync(new URL(`../assets/cars/${file}.glb`, import.meta.url)), `${file}.glb missing`);
  }
  assert.ok(fs.existsSync(new URL('../assets/cars/Textures/colormap.png', import.meta.url)));
  assert.ok(fs.existsSync(new URL('../assets/cars/LICENSE-kenney-car-kit.txt', import.meta.url)));
});
