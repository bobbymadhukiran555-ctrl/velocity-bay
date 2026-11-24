// Vehicle catalogue (all original designs) and upgrade maths. Pure data, no Three.js.
// axles = [front x, rear x] in metres from the centre; track = half the distance between left and right wheels.

export const MODELS = {
  pico:    { name: 'Pico Hatch',     kind: 'car',  style: 'hatch',  price: 6000,  mass: 1050, power: 0.62, grip: 0.96, drag: 0.40, armor: 0.9, wheelR: 0.31, axles: [1.2, -1.15], track: 0.74, len: 3.9, width: 1.66, height: 1.5 },
  metro:   { name: 'Metro Sedan',    kind: 'car',  style: 'sedan',  price: 8000,  mass: 1350, power: 0.72, grip: 0.96, drag: 0.38, armor: 1.0, wheelR: 0.33, axles: [1.4, -1.35], track: 0.78, len: 4.7, width: 1.78, height: 1.45 },
  viper:   { name: 'Viper 600 Bike', kind: 'bike', style: 'bike',   price: 9000,  mass: 260,  power: 0.24, grip: 1.05, drag: 0.30, armor: 0.6, wheelR: 0.32, axles: [0.72, -0.72], track: 0.3, len: 2.1, width: 0.7, height: 1.15 },
  hauler:  { name: 'Hauler Pickup',  kind: 'car',  style: 'pickup', price: 12000, mass: 1900, power: 0.88, grip: 0.92, drag: 0.48, armor: 1.4, wheelR: 0.38, axles: [1.65, -1.6], track: 0.85, len: 5.2, width: 1.9, height: 1.75 },
  vanta:   { name: 'Vanta GT',       kind: 'car',  style: 'coupe',  price: 15000, mass: 1300, power: 1.0,  grip: 1.0,  drag: 0.36, armor: 1.0, wheelR: 0.34, axles: [1.4, -1.35], track: 0.8, len: 4.6, width: 1.76, height: 1.36 },
  ranger:  { name: 'Ranger SUV',     kind: 'car',  style: 'suv',    price: 18000, mass: 1850, power: 0.95, grip: 0.97, drag: 0.45, armor: 1.3, wheelR: 0.38, axles: [1.45, -1.4], track: 0.84, len: 4.8, width: 1.9, height: 1.8 },
  brutus:  { name: 'Brutus V8',      kind: 'car',  style: 'muscle', price: 26000, mass: 1550, power: 1.18, grip: 0.95, drag: 0.38, armor: 1.15, wheelR: 0.35, axles: [1.55, -1.45], track: 0.82, len: 4.9, width: 1.85, height: 1.35 },
  comet:   { name: 'Comet R',        kind: 'car',  style: 'super',  price: 65000, mass: 1250, power: 1.45, grip: 1.12, drag: 0.33, armor: 0.9, wheelR: 0.35, axles: [1.45, -1.35], track: 0.86, len: 4.6, width: 1.95, height: 1.15 },
  patrol:  { name: 'Patrol Cruiser', kind: 'car',  style: 'sedan',  price: null,  mass: 1500, power: 1.1,  grip: 1.05, drag: 0.36, armor: 1.3, wheelR: 0.34, axles: [1.4, -1.35], track: 0.8, len: 4.8, width: 1.82, height: 1.45, police: true },
  bulwark: { name: 'Bulwark Armour', kind: 'car',  style: 'van',    price: null,  mass: 3200, power: 1.35, grip: 0.95, drag: 0.55, armor: 3.0, wheelR: 0.42, axles: [1.8, -1.7], track: 0.95, len: 5.6, width: 2.2, height: 2.3, police: true },
};

export const MODEL_IDS = Object.keys(MODELS);
export const TRAFFIC_MODELS = ['metro', 'metro', 'metro', 'pico', 'pico', 'hauler', 'ranger', 'ranger', 'vanta', 'brutus'];
export const TRAFFIC_COLORS = ['#e8e8e6', '#1b1c1f', '#9a9ea3', '#5b6067', '#1d3557', '#8d1b1b', '#c9b99a', '#2e4a35', '#6b2d5c', '#c46a1b'];

export const UPGRADES = {
  engine: { label: 'Engine', costs: [2000, 5000, 10000], effect: [0, 0.1, 0.2, 0.32] },
  tires:  { label: 'Tyres',  costs: [1500, 4000, 8000],  effect: [0, 0.06, 0.12, 0.18] },
  nitro:  { label: 'Nitro',  costs: [1500, 3500, 7000],  effect: [0, 1, 2, 3] },
  armor:  { label: 'Armour', costs: [2000, 5000, 9000],  effect: [1, 0.8, 0.6, 0.45] },
};
export const NO_UPGRADES = Object.freeze({ engine: 0, tires: 0, nitro: 0, armor: 0 });

const lvl = (up, k) => Math.max(0, Math.min(3, Math.floor(up?.[k] ?? 0)));

// What a model plus its upgrades actually drives like.
export function tunedStats(id, up = NO_UPGRADES) {
  const m = MODELS[id];
  const n = lvl(up, 'nitro');
  return {
    power: m.power * (1 + UPGRADES.engine.effect[lvl(up, 'engine')]),
    grip: m.grip * (1 + UPGRADES.tires.effect[lvl(up, 'tires')]),
    nitroSecs: 6 + 2 * n,
    nitroBoost: 1.45 + 0.1 * n,
    damageTaken: UPGRADES.armor.effect[lvl(up, 'armor')] / m.armor,
  };
}

export const nextUpgradeCost = (up, k) => (lvl(up, k) >= 3 ? null : UPGRADES[k].costs[lvl(up, k)]);

// 0..1 bars for the car selector.
export function statBars(id, up = NO_UPGRADES) {
  const s = tunedStats(id, up), m = MODELS[id];
  const top = Math.sqrt((s.power * 420) / m.drag); // drag-limited top speed, arbitrary units
  return {
    speed: Math.min(1, top / 50),
    accel: Math.min(1, (s.power * 1300) / m.mass / 1.6),
    handling: Math.min(1, (s.grip - 0.8) / 0.5),
    durability: Math.min(1, 1 / s.damageTaken / 3),
  };
}
