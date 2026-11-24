import { MAP_HALF, SPAWN, heightAt } from './map.js';

export const SAVE_KEY = 'velocitybay.save';

export const DEFAULT_SAVE = Object.freeze({
  v: 1,
  money: 500,
  color: '#b3122e',
  pos: Object.freeze({ x: SPAWN.x, y: heightAt(SPAWN.x, SPAWN.z) + 1, z: SPAWN.z }),
  heading: SPAWN.heading,
  time: 0.33,
  gearMode: 'auto',
});

const num = v => typeof v === 'number' && Number.isFinite(v);

// localStorage is a trust boundary: anything old, edited or corrupt falls back field by field.
export function loadSave(storage) {
  let raw = null;
  try { raw = JSON.parse(storage.getItem(SAVE_KEY)); } catch { raw = null; }
  const d = structuredClone(DEFAULT_SAVE);
  if (!raw || typeof raw !== 'object') return d;
  if (num(raw.money) && raw.money >= 0) d.money = Math.floor(raw.money);
  if (typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color)) d.color = raw.color;
  const p = raw.pos;
  if (p && num(p.x) && num(p.y) && num(p.z) && Math.abs(p.x) < MAP_HALF - 20 && Math.abs(p.z) < MAP_HALF - 20 && p.y > -20 && p.y < 400) {
    d.pos = { x: p.x, y: p.y, z: p.z };
  }
  if (num(raw.heading)) d.heading = raw.heading;
  if (num(raw.time) && raw.time >= 0 && raw.time < 1) d.time = raw.time;
  if (raw.gearMode === 'manual' || raw.gearMode === 'auto') d.gearMode = raw.gearMode;
  return d;
}

export function writeSave(storage, data) {
  try { storage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* private mode / quota: keep playing */ }
}
