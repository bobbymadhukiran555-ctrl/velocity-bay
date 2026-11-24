import { MAP_HALF, SPAWN, heightAt } from './map.js';
import { MODELS } from './vehicles.js';
import { MISSIONS, STUNT_IDS, EVENTS, SPEED_CAMS } from './places.js';

export const SAVE_KEY = 'velocitybay.save';

export const DEFAULT_SETTINGS = Object.freeze({ crime: true, quality: 'med', volume: 0.8, music: 0.6, showFps: true, traffic: 1, peds: 1, gearMode: 'auto' });

export const DEFAULT_SAVE = Object.freeze({
  v: 2,
  money: 500,
  pos: Object.freeze({ x: SPAWN.x, y: heightAt(SPAWN.x, SPAWN.z) + 1, z: SPAWN.z }),
  heading: SPAWN.heading,
  time: 0.33,
  garage: Object.freeze([Object.freeze({ model: 'vanta', color: '#b3122e', up: Object.freeze({ engine: 0, tires: 0, nitro: 0, armor: 0 }) })]),
  current: 0,
  weapons: Object.freeze({ bat: false, pistol: 0, smg: 0 }),
  missions: 0,
  stunts: Object.freeze([]),
  best: Object.freeze({}),
  settings: DEFAULT_SETTINGS,
});

const num = v => typeof v === 'number' && Number.isFinite(v);
const int = (v, lo, hi) => (num(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : lo);
const color = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

function car(raw) {
  if (!raw || !MODELS[raw.model] || MODELS[raw.model].police) return null;
  const up = raw.up || {};
  return { model: raw.model, color: color(raw.color) ? raw.color : '#b3122e', up: { engine: int(up.engine, 0, 3), tires: int(up.tires, 0, 3), nitro: int(up.nitro, 0, 3), armor: int(up.armor, 0, 3) } };
}

// localStorage (and pasted save codes) are a trust boundary: anything old, edited or corrupt falls back field by field.
export function parseSave(raw) {
  const d = structuredClone(DEFAULT_SAVE);
  if (!raw || typeof raw !== 'object') return d;
  if (num(raw.money) && raw.money >= 0) d.money = Math.min(1e9, Math.floor(raw.money));
  const p = raw.pos;
  if (p && num(p.x) && num(p.y) && num(p.z) && Math.abs(p.x) < MAP_HALF - 20 && Math.abs(p.z) < MAP_HALF - 20 && p.y > -20 && p.y < 400) d.pos = { x: p.x, y: p.y, z: p.z };
  if (num(raw.heading)) d.heading = raw.heading;
  if (num(raw.time) && raw.time >= 0 && raw.time < 1) d.time = raw.time;
  if (Array.isArray(raw.garage)) {
    const cars = raw.garage.map(car).filter(Boolean).slice(0, 24);
    if (cars.length) d.garage = cars;
  } else if (color(raw.color)) d.garage[0].color = raw.color; // v1 save: one car, its colour
  d.current = int(raw.current, 0, d.garage.length - 1);
  const w = raw.weapons || {};
  d.weapons = { bat: w.bat === true, pistol: int(w.pistol, 0, 999), smg: int(w.smg, 0, 999) };
  d.missions = int(raw.missions, 0, MISSIONS.length);
  if (Array.isArray(raw.stunts)) d.stunts = [...new Set(raw.stunts.filter(id => STUNT_IDS.includes(id)))];
  if (raw.best && typeof raw.best === 'object')
    for (const e of [...EVENTS, ...SPEED_CAMS]) if (num(raw.best[e.id]) && raw.best[e.id] >= 0) d.best[e.id] = raw.best[e.id];
  const s = raw.settings || {};
  d.settings = { ...DEFAULT_SETTINGS };
  if (typeof s.crime === 'boolean') d.settings.crime = s.crime;
  if (['low', 'med', 'high'].includes(s.quality)) d.settings.quality = s.quality;
  for (const k of ['volume', 'music']) if (num(s[k])) d.settings[k] = Math.max(0, Math.min(1, s[k]));
  if (typeof s.showFps === 'boolean') d.settings.showFps = s.showFps;
  for (const k of ['traffic', 'peds']) if (num(s[k])) d.settings[k] = Math.max(0, Math.min(2, s[k]));
  const gm = s.gearMode ?? raw.gearMode;
  if (gm === 'manual' || gm === 'auto') d.settings.gearMode = gm;
  return d;
}

export function loadSave(storage) {
  let raw = null;
  try { raw = JSON.parse(storage.getItem(SAVE_KEY)); } catch { raw = null; }
  return parseSave(raw);
}

export function writeSave(storage, data) {
  try { storage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* private mode / quota: keep playing */ }
}

// Save codes let you move progress to another browser or device.
export const exportCode = data => btoa(unescape(encodeURIComponent(JSON.stringify(data))));
export function importCode(code) {
  try { return parseSave(JSON.parse(decodeURIComponent(escape(atob(code.trim()))))); } catch { return null; }
}
