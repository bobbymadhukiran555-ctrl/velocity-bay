// Velocity Bay map data. Pure functions only (no Three.js), so node --test can check them.
// World axes: x = east, z = south, y = up. Heading h means forward = (cos h, -sin h) on (x, z).

export const MAP_HALF = 1200;
export const SEA_LEVEL = -2;
export const CITY = { min: -400, max: 400, block: 100, street: 20 };
export const ZONES = {
  airport: { x0: -1150, x1: -750, z0: -350, z1: 650 },
  docks: { x0: 750, x1: 1080, z0: -500, z1: 700 },
};

const clamp01 = t => Math.min(1, Math.max(0, t));
export const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function hash(i, j) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash(i, j), hash(i + 1, j), u), lerp(hash(i, j + 1), hash(i + 1, j + 1), u), v);
}
// Roughly -1..1
export const fbm = (x, z) => ((vnoise(x, z) * 0.5 + vnoise(x * 2.03 + 17, z * 2.03) * 0.25 + vnoise(x * 4.1, z * 4.1 + 31) * 0.125) / 0.875) * 2 - 1;

const boxMask = (x, z, b, f) =>
  smoothstep(b.x0 - f, b.x0, x) * (1 - smoothstep(b.x1, b.x1 + f, x)) * smoothstep(b.z0 - f, b.z0, z) * (1 - smoothstep(b.z1, b.z1 + f, z));

// Terrain before roads are cut in.
export function naturalHeight(x, z) {
  const cheb = Math.max(Math.abs(x), Math.abs(z));
  let h = 0;
  h += 3 * fbm(x / 180, z / 180) * smoothstep(430, 540, cheb) * (1 - boxMask(x, z, ZONES.airport, 80)) * (1 - boxMask(x, z, ZONES.docks, 80));
  h += smoothstep(-680, -1100, z) * smoothstep(-820, -640, x) * (110 + 50 * fbm(x / 260, z / 260));
  h += smoothstep(-650, -820, x) * smoothstep(-300, -420, z) * (4 * Math.sin(x / 41 + z / 97) * Math.cos(z / 33) + 2);
  h -= 10 * smoothstep(720, 1000, z);
  h -= 10 * smoothstep(1080, 1110, x) * smoothstep(-650, -550, z);
  h += 60 * smoothstep(1110, 1190, -z) + 40 * smoothstep(1110, 1190, -x);
  return h;
}

// ---- Roads ----
function roundedSquare(half, r, perArc = 10) {
  const pts = [];
  const corners = [[half - r, -(half - r), 0], [-(half - r), -(half - r), 1], [-(half - r), half - r, 2], [half - r, half - r, 3]];
  for (const [cx, cz, q] of corners) {
    for (let i = 0; i <= perArc; i++) {
      const a = (q * Math.PI) / 2 + (i / perArc) * (Math.PI / 2);
      pts.push({ x: cx + Math.cos(a) * r, z: cz - Math.sin(a) * r });
    }
  }
  return pts;
}
const P = (...xz) => xz.map(([x, z]) => ({ x, z }));
// Round the corners of a winding road (Chaikin corner cutting, ends kept).
function smooth(pts, passes = 3) {
  for (let k = 0; k < passes; k++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (i > 0) out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
      if (i < pts.length - 2) out.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

const streets = [];
for (let v = CITY.min; v <= CITY.max; v += CITY.block) {
  streets.push({ name: `street-ns-${v}`, kind: 'street', width: CITY.street, points: P([v, CITY.min], [v, CITY.max]) });
  streets.push({ name: `street-ew-${v}`, kind: 'street', width: CITY.street, points: P([CITY.min, v], [CITY.max, v]) });
}

export const ROADS = [
  ...streets,
  { name: 'highway', kind: 'road', width: 24, closed: true, points: roundedSquare(600, 150) },
  { name: 'north-ave', kind: 'road', width: 16, points: P([0, -405], [0, -595]) },
  { name: 'south-ave', kind: 'road', width: 16, points: P([0, 405], [0, 595]) },
  { name: 'east-ave', kind: 'road', width: 16, points: P([405, 0], [595, 0]) },
  { name: 'west-ave', kind: 'road', width: 16, points: P([-405, 0], [-595, 0]) },
  { name: 'mountain-pass', kind: 'road', width: 14, points: smooth(P([0, -605], [0, -720], [-110, -800], [-60, -900], [110, -950], [230, -1040], [90, -1110], [-150, -1085], [-320, -1000], [-430, -880], [-560, -770], [-660, -700])) },
  { name: 'desert-road', kind: 'road', width: 14, points: smooth(P([-660, -700], [-790, -640], [-950, -560], [-1050, -440], [-960, -360])) },
  { name: 'airport-road', kind: 'road', width: 16, points: P([-605, 0], [-760, 0], [-900, 0]) },
  { name: 'coaster-access', kind: 'road', width: 14, points: P([-900, 0], [-900, 180]) },
  { name: 'coast-connector', kind: 'road', width: 16, points: P([0, 605], [0, 700]) },
  { name: 'coast-road', kind: 'road', width: 16, points: smooth(P([-700, 700], [-350, 712], [0, 700], [350, 712], [690, 695], [800, 620])) },
  { name: 'docks-road', kind: 'road', width: 16, points: P([605, 0], [800, 0], [1000, 0]) },
  { name: 'docks-main', kind: 'road', width: 16, points: P([800, -420], [800, 0], [800, 620]) },
];

function resample(points, closed, step) {
  const src = closed ? [...points, points[0]] : points;
  const out = [];
  for (let i = 0; i < src.length - 1; i++) {
    const a = src[i], b = src[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
    for (let k = 0; k < n; k++) out.push({ x: lerp(a.x, b.x, k / n), z: lerp(a.z, b.z, k / n) });
  }
  if (!closed) out.push({ ...src[src.length - 1] });
  return out;
}

// Each 'road' gets a smoothed height profile (sampled every 5 m) so ramps are drivable.
export const ROAD_PROFILES = ROADS.filter(r => r.kind === 'road').map(road => {
  const pts = resample(road.points, road.closed, 5);
  let ys = pts.map(p => naturalHeight(p.x, p.z));
  // Cap the grade at 14% (cut/fill into hills), then smooth out the kinks.
  const MAX_RISE = 0.14 * 5;
  for (let i = 1; i < ys.length; i++) ys[i] = Math.min(ys[i - 1] + MAX_RISE, Math.max(ys[i - 1] - MAX_RISE, ys[i]));
  for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i + 1] + MAX_RISE, Math.max(ys[i + 1] - MAX_RISE, ys[i]));
  for (let pass = 0; pass < 3; pass++) {
    ys = ys.map((_, i) => {
      let s = 0, c = 0;
      for (let k = -10; k <= 10; k++) {
        let j = i + k;
        if (road.closed) j = (j + ys.length) % ys.length;
        else if (j < 0 || j >= ys.length) continue;
        s += ys[j]; c++;
      }
      return s / c;
    });
  }
  return { road, closed: !!road.closed, pts: pts.map((p, i) => ({ ...p, y: Math.max(SEA_LEVEL + 1, ys[i]) })) };
});

// Spatial grid of profile segments for fast terrain flattening.
const CELL = 40, REACH = 30;
const grid = new Map();
const segs = [];
for (const prof of ROAD_PROFILES) {
  const { pts, closed } = prof;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], hw = prof.road.width / 2;
    const seg = { a, b, hw };
    segs.push(seg);
    const r = hw + REACH;
    for (let cx = Math.floor((Math.min(a.x, b.x) - r) / CELL); cx <= Math.floor((Math.max(a.x, b.x) + r) / CELL); cx++)
      for (let cz = Math.floor((Math.min(a.z, b.z) - r) / CELL); cz <= Math.floor((Math.max(a.z, b.z) + r) / CELL); cz++) {
        const key = cx * 100000 + cz;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(seg);
      }
  }
}

function closestOnSeg(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
  const t = clamp01(((x - a.x) * dx + (z - a.z) * dz) / L2);
  const px = a.x + dx * t, pz = a.z + dz * t;
  return { d: Math.hypot(x - px, z - pz), t, px, pz };
}

export const ROAD_SINK = 0.15; // terrain sits just under the road mesh so the road collider is the driving surface

export function heightAt(x, z) {
  const nat = naturalHeight(x, z);
  const cell = grid.get(Math.floor(x / CELL) * 100000 + Math.floor(z / CELL));
  if (!cell) return nat;
  let best = null;
  for (const s of cell) {
    const c = closestOnSeg(x, z, s.a, s.b);
    const edge = c.d - s.hw;
    if (!best || edge < best.edge) best = { edge, y: lerp(s.a.y, s.b.y, c.t) };
  }
  if (best.edge > REACH) return nat;
  const roadBed = best.y - ROAD_SINK;
  return best.edge < 2 ? roadBed : lerp(roadBed, nat, smoothstep(2, REACH - 5, best.edge));
}

export function zoneAt(x, z) {
  if (Math.abs(x) <= 420 && Math.abs(z) <= 420) return 'downtown';
  const q = Math.max(Math.abs(x), Math.abs(z));
  const k = Math.hypot(Math.max(Math.abs(x) - 450, 0), Math.max(Math.abs(z) - 450, 0)) + Math.min(Math.max(Math.abs(x) - 450, Math.abs(z) - 450), 0) - 150;
  if (Math.abs(k) < 30 && q < 700) return 'highway';
  if (boxMask(x, z, ZONES.airport, 0.01) > 0.5) return 'airport';
  if (boxMask(x, z, ZONES.docks, 0.01) > 0.5) return 'docks';
  if (z >= 760) return 'beach';
  if (z <= -700 && x > -700) return 'mountains';
  if (x <= -700 && z < -350) return 'desert';
  return 'outskirts';
}

export function nearestRoadPoint(x, z) {
  let best = null;
  for (const road of ROADS) {
    const pts = road.closed ? [...road.points, road.points[0]] : road.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const c = closestOnSeg(x, z, pts[i], pts[i + 1]);
      if (!best || c.d < best.d) best = { d: c.d, x: c.px, z: c.pz, heading: Math.atan2(-(pts[i + 1].z - pts[i].z), pts[i + 1].x - pts[i].x) };
    }
  }
  return { x: best.x, z: best.z, heading: best.heading };
}

export const SPAWN = { x: 0, z: 150, heading: Math.PI / 2 };

// Deterministic downtown layout: lots per block, taller toward the centre, some parks.
export function cityBuildings(seed = 7) {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const out = [], parks = [];
  const inner = CITY.block - CITY.street - 8; // 72 m of buildable land per block
  for (let bx = CITY.min; bx < CITY.max; bx += CITY.block)
    for (let bz = CITY.min; bz < CITY.max; bz += CITY.block) {
      const cx = bx + CITY.block / 2, cz = bz + CITY.block / 2;
      if (rnd() < 0.1) { parks.push({ x: cx, z: cz, size: inner }); continue; }
      const central = Math.exp(-((cx * cx + cz * cz) / (260 * 260)));
      const split = rnd() < 0.35 ? 1 : 2;
      const lot = inner / split;
      for (let i = 0; i < split; i++)
        for (let j = 0; j < split; j++) {
          const w = lot - 4 - rnd() * 6, d = lot - 4 - rnd() * 6;
          const h = 10 + (split === 1 ? 160 : 90) * central * (0.35 + 0.65 * rnd()) + rnd() * 12;
          out.push({ x: bx + CITY.street / 2 + 4 + lot * (i + 0.5), z: bz + CITY.street / 2 + 4 + lot * (j + 0.5), w, d, h });
        }
    }
  return { buildings: out, parks };
}
