// Procedural meshes for every vehicle, the helicopter and people. All original shapes, built once and shared.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MODELS } from './logic/vehicles.js';

// Side profiles. x values are fractions of half the length (+ = front), y values are metres above the ground.
const STYLES = {
  coupe:  { sill: 0.32, tailLow: 0.62, tail: 0.9,  belt: 0.95, deckR: -0.57, deckF: 0.43, noseTop: 0.8,  nose: 0.62, cab: [-0.57, -0.30, 0.11, 0.44], roof: 1.32 },
  sedan:  { sill: 0.32, tailLow: 0.6,  tail: 0.95, belt: 0.98, deckR: -0.62, deckF: 0.38, noseTop: 0.86, nose: 0.64, cab: [-0.62, -0.38, 0.12, 0.40], roof: 1.45 },
  hatch:  { sill: 0.32, tailLow: 0.6,  tail: 1.0,  belt: 0.98, deckR: -0.95, deckF: 0.36, noseTop: 0.86, nose: 0.62, cab: [-0.95, -0.88, 0.05, 0.38], roof: 1.5 },
  suv:    { sill: 0.48, tailLow: 0.75, tail: 1.15, belt: 1.15, deckR: -0.96, deckF: 0.42, noseTop: 1.05, nose: 0.85, cab: [-0.96, -0.92, 0.12, 0.44], roof: 1.82 },
  pickup: { sill: 0.48, tailLow: 0.8,  tail: 1.15, belt: 1.15, deckR: -0.95, deckF: 0.45, noseTop: 1.08, nose: 0.88, cab: [-0.14, -0.1, 0.2, 0.47], roof: 1.8 },
  muscle: { sill: 0.34, tailLow: 0.62, tail: 0.95, belt: 0.98, deckR: -0.66, deckF: 0.22, noseTop: 0.95, nose: 0.72, cab: [-0.66, -0.42, -0.02, 0.24], roof: 1.33 },
  super:  { sill: 0.28, tailLow: 0.55, tail: 0.85, belt: 0.82, deckR: -0.55, deckF: 0.45, noseTop: 0.6,  nose: 0.45, cab: [-0.55, -0.22, 0.12, 0.52], roof: 1.13, spoiler: true },
  wagon:  { sill: 0.32, tailLow: 0.62, tail: 1.02, belt: 1.0,  deckR: -0.96, deckF: 0.4,  noseTop: 0.88, nose: 0.64, cab: [-0.96, -0.9, 0.1, 0.4], roof: 1.5 },
  rally:  { sill: 0.42, tailLow: 0.7,  tail: 1.05, belt: 1.05, deckR: -0.94, deckF: 0.36, noseTop: 0.92, nose: 0.7,  cab: [-0.94, -0.84, 0.06, 0.38], roof: 1.56, spoiler: true },
  buggy:  { sill: 0.5,  tailLow: 0.7,  tail: 0.95, belt: 0.92, deckR: -0.9,  deckF: 0.5,  noseTop: 0.85, nose: 0.75, cab: [-0.5, -0.35, 0.05, 0.3], roof: 1.4 },
  limo:   { sill: 0.32, tailLow: 0.6,  tail: 0.95, belt: 0.98, deckR: -0.72, deckF: 0.5,  noseTop: 0.86, nose: 0.64, cab: [-0.72, -0.62, 0.3, 0.48], roof: 1.48 },
  fastback: { sill: 0.3, tailLow: 0.58, tail: 0.88, belt: 0.92, deckR: -0.82, deckF: 0.42, noseTop: 0.72, nose: 0.55, cab: [-0.82, -0.36, 0.12, 0.46], roof: 1.38 },
  truck:  { sill: 0.62, tailLow: 1.0,  tail: 3.1,  belt: 1.5,  deckR: -0.98, deckF: 0.72, noseTop: 1.4,  nose: 1.15, cab: [0.5, 0.56, 0.68, 0.8], roof: 2.5, box: true },
  van:    { sill: 0.5,  tailLow: 0.9,  tail: 1.9,  belt: 1.35, deckR: -0.98, deckF: 0.55, noseTop: 1.25, nose: 1.0,  cab: [0.5, 0.56, 0.64, 0.8], roof: 2.25, box: true },
};

function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
}
const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed(); g.deleteAttribute('uv'); return g; };
function extrude(shape, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 12 });
  g.translate(0, 0, -depth / 2);
  g.deleteAttribute('uv');
  return g;
}
const poly = pts => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); return s; };

// Small real-car details: mirrors, door seams and handles, plates, exhaust tips. All merged into the trim mesh.
function carDetails(m, p, h, c1, c2, c3) {
  const hw = m.width / 2, dark = 0x0a0a0c, out = [];
  for (const s of [-1, 1]) {
    out.push(colored(box(0.1, 0.08, 0.14, c3 - 0.02, p.belt + 0.07, s * (hw + 0.06)), dark));
    out.push(colored(box(0.012, p.belt - p.sill - 0.12, 0.012, c1 + 0.02, (p.belt + p.sill) / 2 + 0.02, s * (hw + 0.004)), dark));
    out.push(colored(box(0.012, p.belt - p.sill - 0.12, 0.012, (c2 + c3) / 2, (p.belt + p.sill) / 2 + 0.02, s * (hw + 0.004)), dark));
    out.push(colored(box(0.14, 0.025, 0.02, (c1 + c2) / 2, p.belt - 0.1, s * (hw + 0.006)), 0xaab0b6));
    const ex = new THREE.CylinderGeometry(0.045, 0.045, 0.12, 8).rotateZ(Math.PI / 2).translate(-h - 0.02, p.sill + 0.04, s * m.width * 0.28);
    out.push(colored(ex, 0x8d9298));
  }
  out.push(colored(box(0.02, 0.12, 0.36, h + 0.015, p.sill + 0.22, 0), 0xe8e4d0), colored(box(0.02, 0.12, 0.36, -h - 0.005, p.tailLow - 0.1, 0), 0xe8e4d0));
  return out;
}

function wheelGeo(r, w) {
  const tire = colored(new THREE.CylinderGeometry(r, r, w, 22).rotateX(Math.PI / 2), 0x141416);
  const rim = colored(new THREE.CylinderGeometry(r * 0.64, r * 0.64, w + 0.01, 14).rotateX(Math.PI / 2), 0xb8bcc2);
  const spokes = [0, 1, 2, 3, 4].map(k => colored(new THREE.BoxGeometry(r * 1.2, r * 0.13, w + 0.02).rotateZ((k * Math.PI) / 5), 0x9da2a8));
  const disc = colored(new THREE.CylinderGeometry(r * 0.5, r * 0.5, w * 0.5, 16).rotateX(Math.PI / 2), 0x55585c);
  const lip = colored(new THREE.TorusGeometry(r * 0.66, r * 0.035, 6, 20), 0xd2d6db); lip.translate(0, 0, w / 2 + 0.003);
  const lugs = [0, 1, 2, 3, 4].map(k => { const a = (k * Math.PI * 2) / 5; return colored(new THREE.CylinderGeometry(r * 0.04, r * 0.04, w + 0.04, 6).rotateX(Math.PI / 2).translate(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2, 0), 0x6c7075); });
  return mergeGeometries([tire, rim, disc, lip, ...lugs, ...spokes]);
}

const cache = new Map();
export function vehicleParts(id) {
  if (cache.has(id)) return cache.get(id);
  const m = MODELS[id], R = m.wheelR, bodyY = R + 0.28, h = m.len / 2;
  let parts;
  if (m.kind === 'bike') parts = bikeParts(m, bodyY);
  else if (m.kind === 'plane') parts = planeParts(m);
  else {
    const p = STYLES[m.style], [xf, xr] = m.axles, ar = R + 0.1;
    const s = new THREE.Shape();
    s.moveTo(h - 0.08, p.sill); s.lineTo(xf + ar, p.sill);
    s.absarc(xf, R, ar, 0, Math.PI, false);
    s.lineTo(xr + ar, p.sill);
    s.absarc(xr, R, ar, 0, Math.PI, false);
    s.lineTo(-h + 0.08, p.sill + 0.02); s.lineTo(-h, p.tailLow); s.lineTo(-h + 0.06, p.tail);
    s.lineTo(p.deckR * h, p.belt); s.lineTo(p.deckF * h, p.belt); s.lineTo(h - 0.22, p.noseTop); s.lineTo(h, p.nose); s.lineTo(h - 0.08, p.sill);
    const [c0, c1, c2, c3] = p.cab.map(f => f * h);
    const paint = [extrude(s, m.width - 0.16, 0.08)];
    const glass = extrude(poly([[c0, p.belt - 0.03], [c1, p.roof], [c2, p.roof], [c3, p.belt - 0.03]]), m.width * 0.84, 0.05);
    paint.push(extrude(poly([[c1 + 0.03, p.roof - 0.03], [c2 - 0.03, p.roof - 0.03], [c2 - 0.06, p.roof + 0.04], [c1 + 0.06, p.roof + 0.04]]), m.width * 0.8, 0.03));
    if (p.box) { const top = Math.max(p.roof, p.tail); paint.push(box(c0 - p.deckR * h + 0.02, top - p.belt, m.width - 0.1, (c0 + p.deckR * h) / 2, (top + p.belt) / 2, 0)); }
    if (p.spoiler) paint.push(box(0.3, 0.05, m.width - 0.1, -h + 0.25, p.tail + 0.25, 0), box(0.06, 0.25, 0.06, -h + 0.3, p.tail + 0.12, -0.6), box(0.06, 0.25, 0.06, -h + 0.3, p.tail + 0.12, 0.6));
    const trim = [...carDetails(m, p, h, c1, c2, c3), colored(glass, 0x0b1118),
      colored(box(0.24, 0.14, m.width * 0.78, c3 - 0.08, p.belt + 0.06, 0), 0x101418), // dashboard
      colored(box(0.08, 0.16, m.width * 0.42, h + 0.01, p.nose - 0.12, 0), 0x0d0d0f),
      colored(box(0.1, 0.12, m.width - 0.1, h - 0.02, p.sill + 0.04, 0), 0x18191b),
      colored(box(0.1, 0.12, m.width - 0.1, -h + 0.03, p.sill + 0.05, 0), 0x18191b),
      colored(box(0.14, 0.08, 0.16, c3 - 0.05, p.belt + 0.04, -m.width / 2 - 0.02), 0x18191b),
      colored(box(0.14, 0.08, 0.16, c3 - 0.05, p.belt + 0.04, m.width / 2 + 0.02), 0x18191b)];
    const ly = (p.nose + p.noseTop) / 2, lz = m.width / 2 - 0.32;
    parts = {
      paint: mergeGeometries(paint), trim: mergeGeometries(trim),
      heads: mergeGeometries([-lz, lz].map(z => box(0.06, 0.1, 0.36, h + 0.01, ly, z))),
      tails: mergeGeometries([-lz, lz].map(z => box(0.06, 0.09, 0.4, -h + 0.03, p.tail - 0.14, z))),
      lampY: ly, roof: p.roof, impactY: (p.sill + p.belt) / 2,
      cockpit: { x: Math.min(c3 - 0.18, m.axles[0] - 0.7), y: Math.max(p.roof - 0.16, 1.3) - bodyY, z: -m.width * 0.22 },
    };
    if (m.police) {
      parts.barRed = box(0.3, 0.12, 0.5, (c1 + c2) / 2, p.roof + 0.1, -0.28);
      parts.barBlue = box(0.3, 0.12, 0.5, (c1 + c2) / 2, p.roof + 0.1, 0.28);
      parts.trim = mergeGeometries([parts.trim, colored(box(c3 - c0, 0.12, m.width + 0.01, (c0 + c3) / 2, p.sill + 0.25, 0), 0x0c1830)]);
    }
  }
  for (const k of ['paint', 'trim', 'heads', 'tails', 'barRed', 'barBlue']) parts[k]?.translate(0, -bodyY, 0);
  parts.wheel = wheelGeo(R, m.kind === 'bike' ? 0.13 : 0.26);
  parts.bodyY = bodyY;
  cache.set(id, parts);
  return parts;
}

function bikeParts(m, bodyY) {
  const [xf, xr] = m.axles, R = m.wheelR;
  return {
    paint: mergeGeometries([box(0.62, 0.26, 0.32, 0.12, 0.86, 0), box(0.4, 0.42, 0.34, 0.6, 0.86, 0), box(0.45, 0.14, 0.22, -0.62, 0.94, 0)]),
    trim: mergeGeometries([
      colored(box(0.55, 0.1, 0.28, -0.28, 0.9, 0), 0x111111),
      colored(box(0.5, 0.36, 0.3, 0.02, 0.5, 0), 0x3a3d42),
      colored(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6).rotateZ(-0.45).translate((xf + 0.5) / 2 + 0.05, 0.68, 0), 0x9aa0a6),
      colored(box(0.05, 0.05, 0.7, 0.5, 1.07, 0), 0x111111),
      colored(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6).rotateZ(1.2).translate((xr - 0.1) / 2, 0.55, 0), 0x9aa0a6),
      colored(box(0.22, 0.12, 0.3, 0.68, 1.08, 0), 0x0b1118),
    ]),
    heads: box(0.05, 0.1, 0.14, 0.8, 0.9, 0),
    tails: box(0.05, 0.06, 0.16, -0.85, 0.95, 0),
    lampY: 0.9, roof: 1.1, impactY: 0.7, R,
    cockpit: { x: -0.05, y: 1.05 - bodyY, z: 0 },
  };
}

// Planes: forward = +x. 'prop' is a high-wing single-prop, 'jet' a low swept-wing business jet.
function planeParts(m) {
  const h = m.len / 2, jet = m.style === 'jet', fy = jet ? 1.55 : 1.35, r = m.width / 2;
  const tube = (r0, r1, len, x, y) => { const g = new THREE.CylinderGeometry(r1, r0, len, 16).rotateZ(-Math.PI / 2).translate(x, y, 0).toNonIndexed(); g.deleteAttribute('uv'); return g; };
  const flat = (pts, thick, y) => { const g = extrude(poly(pts), thick, 0.02).rotateX(Math.PI / 2).translate(0, y, 0); return g; };
  const sweep = jet ? 1.6 : 0.15, chord = jet ? 2.2 : 1.6, wy = jet ? fy - 0.45 : fy + 0.65, wx = jet ? -0.4 : 0.6, s2 = m.span / 2;
  const wing = flat([[wx + chord / 2, -s2 * 0.08], [wx + chord / 2 - sweep, -s2], [wx - chord / 2 - sweep + 0.6, -s2], [wx - chord / 2, -s2 * 0.08], [wx - chord / 2, s2 * 0.08], [wx - chord / 2 - sweep + 0.6, s2], [wx + chord / 2 - sweep, s2], [wx + chord / 2, s2 * 0.08]], 0.14, wy);
  const tx = -h + 0.9, ty = jet ? fy + 0.35 : fy + 0.15;
  const stab = flat([[tx + 0.5, -0.3], [tx - 0.2, -1.8], [tx - 0.7, -1.8], [tx - 0.6, -0.3], [tx - 0.6, 0.3], [tx - 0.7, 1.8], [tx - 0.2, 1.8], [tx + 0.5, 0.3]], 0.08, jet ? fy + 2.0 : ty);
  const fin = extrude(poly([[tx + 0.9, ty], [tx - 0.4, ty + (jet ? 2.1 : 1.5)], [tx - 0.9, ty + (jet ? 2.1 : 1.5)], [tx - 0.8, ty]]), 0.1, 0.02);
  const paint = [tube(r, r * 0.95, m.len * 0.55, 0.3, fy), tube(r * 0.95, 0.5, 0.9, h * 0.55 + 0.75, fy), tube(0.25, r, m.len * 0.36, -h * 0.62, fy + 0.15), wing, stab, fin];
  const trim = [colored(box(jet ? 1.4 : 1.2, 0.42, r * 1.6, h * 0.45, fy + r * 0.72, 0), 0x0b1118)];
  for (const s of [-1, 1]) {
    trim.push(colored(box(0.08, 1.1, 0.08, 0.1 + (m.axles[1] + 0.05), 0.75, s * m.track), 0x2a2c30));
    if (!jet) trim.push(colored(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 6).rotateX(s * 0.95).translate(0.6, fy + 0.0, s * 1.45), 0x9aa0a6));
    if (jet) trim.push(colored(tube(0.42, 0.36, 2.2, -h + 2.6, fy + 0.25).translate(0, 0, s * (r + 0.45)), 0x9aa0a6), colored(tube(0.3, 0.3, 0.05, -h + 1.48, fy + 0.25).translate(0, 0, s * (r + 0.45)), 0x111111));
  }
  trim.push(colored(box(0.08, 1.0, 0.08, m.axles[0], 0.8, 0), 0x2a2c30));
  const ly = fy - 0.1, nx = jet ? h : h - 0.05;
  return {
    paint: mergeGeometries(paint), trim: mergeGeometries(trim),
    heads: mergeGeometries([box(0.05, 0.12, 0.25, nx, ly, 0), box(0.15, 0.1, 0.1, wx, wy, -s2 + 0.1)]),
    tails: mergeGeometries([box(0.15, 0.1, 0.1, wx, wy, s2 - 0.1), box(0.08, 0.1, 0.1, tx - 0.85, ty + (jet ? 2.1 : 1.5), 0)]),
    prop: jet ? null : mergeGeometries([colored(box(0.08, 2.0, 0.16, 0, 0, 0), 0x1a1a1a), colored(box(0.08, 0.16, 2.0, 0, 0, 0), 0x1a1a1a), colored(new THREE.ConeGeometry(0.22, 0.4, 10).rotateZ(-Math.PI / 2).translate(0.13, 0, 0), 0xd0d0d0)]),
    propAt: [h + 0.32, fy],
    lampY: ly, roof: fy + r, impactY: fy,
    cockpit: { x: h * 0.35, y: fy + 0.35 - (m.wheelR + 0.28), z: 0 },
  };
}

const trimMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.3, roughness: 0.15, clearcoat: 1 });
const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.45 });

export function buildVehicleMesh(id, color) {
  const m = MODELS[id], parts = vehicleParts(id);
  const root = new THREE.Group(), lean = new THREE.Group();
  root.add(lean);
  const paintMat = new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xfff4dd, emissiveIntensity: 0.4 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a1a, emissiveIntensity: 0.3 });
  const paint = new THREE.Mesh(parts.paint, paintMat), trim = new THREE.Mesh(parts.trim, trimMat);
  paint.castShadow = trim.castShadow = true;
  lean.add(paint, trim, new THREE.Mesh(parts.heads, headMat), new THREE.Mesh(parts.tails, tailMat));
  let prop = null;
  if (parts.prop) { prop = new THREE.Mesh(parts.prop, trimMat); prop.position.set(parts.propAt[0], parts.propAt[1] - parts.bodyY, 0); lean.add(prop); }
  let bar = null;
  if (parts.barRed) {
    const r = new THREE.MeshBasicMaterial({ color: 0x330000 }), b = new THREE.MeshBasicMaterial({ color: 0x000033 });
    lean.add(new THREE.Mesh(parts.barRed, r), new THREE.Mesh(parts.barBlue, b));
    bar = { r, b };
  }
  const visual = m.kind === 'bike' ? [[m.axles[0], 0], [m.axles[1], 0]] : m.kind === 'plane' ? [[m.axles[0], -0.13], [m.axles[0], 0.13], [m.axles[1], -m.track], [m.axles[1], m.track]] : [[m.axles[0], -m.track], [m.axles[0], m.track], [m.axles[1], -m.track], [m.axles[1], m.track]];
  const wheels = visual.map(([x, z]) => {
    const steer = new THREE.Group(), spin = new THREE.Mesh(parts.wheel, wheelMat);
    spin.castShadow = true;
    steer.position.set(x, -0.3, z);
    steer.add(spin);
    lean.add(steer);
    return { steer, spin, x, z };
  });
  return { root, lean, paint, paintMat, headMat, tailMat, wheels, bar, parts, prop };
}

export function heliMesh() {
  const g = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: 0x1b2a4a, metalness: 0.5, roughness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.3, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b1118, metalness: 0.4, roughness: 0.1 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12).scale(1.7, 1, 1), blue);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 10, 0, Math.PI, 0, Math.PI / 2).scale(1.2, 0.9, 1).rotateZ(-Math.PI / 2).translate(1.1, 0.15, 0), dark);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.35, 5, 8).rotateZ(Math.PI / 2).translate(-4, 0.3, 0), white);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.1).translate(-6.3, 0.8, 0), blue);
  const skids = [-0.8, 0.8].map(z => new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.08).translate(0, -1.45, z), dark));
  const rotor = new THREE.Group();
  for (const a of [0, Math.PI / 2]) rotor.add(new THREE.Mesh(new THREE.BoxGeometry(10, 0.05, 0.3).rotateY(a), dark));
  rotor.position.y = 1.45;
  const tailRotor = new THREE.Group();
  tailRotor.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 0.04), dark));
  tailRotor.position.set(-6.3, 0.9, 0.12);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4).translate(-1, 1.2, 0), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  g.add(body, glass, tail, fin, ...skids, rotor, tailRotor, beacon);
  g.traverse(o => (o.castShadow = true));
  return { root: g, rotor, tailRotor, beacon };
}

// People: forward = +x, feet at y = 0. Limb geometries pivot at the joint.
// People: tapered torso, neck, hair, rounded limbs and shoes. Vertex colours (white = tinted by shirt/skin/pants per person)
// keep it to four instanced meshes. Forward is +x; limbs hang from the origin so they can swing.
const part = (geo, hex = 0xffffff, sx = 1, sz = 1) => colored(geo.scale(sx, 1, sz), hex);
export const HUMAN = {
  torso: mergeGeometries([
    part(new THREE.CylinderGeometry(0.23, 0.16, 0.6, 14).translate(0, 1.16, 0), 0xffffff, 0.6),
    part(new THREE.CylinderGeometry(0.165, 0.175, 0.16, 14).translate(0, 0.88, 0), 0x3a3a3a, 0.62),
  ]),
  head: mergeGeometries([
    part(new THREE.SphereGeometry(0.125, 14, 10).scale(0.95, 1.12, 0.9).translate(0, 1.64, 0)),
    part(new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.98, 1.1, 0.95).translate(-0.015, 1.665, 0), 0x2a2018),
    part(new THREE.CylinderGeometry(0.05, 0.057, 0.14, 8).translate(0, 1.5, 0)),
    part(new THREE.BoxGeometry(0.05, 0.06, 0.04).translate(0.12, 1.62, 0)),
  ]),
  arm: mergeGeometries([
    part(new THREE.CapsuleGeometry(0.052, 0.5, 4, 8).translate(0, -0.3, 0)),
    part(new THREE.SphereGeometry(0.05, 8, 6).translate(0, -0.6, 0), 0xe8c9b0),
  ]),
  leg: mergeGeometries([
    part(new THREE.CylinderGeometry(0.085, 0.062, 0.8, 10).translate(0, -0.4, 0)),
    part(new THREE.BoxGeometry(0.27, 0.08, 0.13).translate(0.05, -0.82, 0), 0x1a1a1a),
  ]),
  hip: 0.86, shoulder: 1.42, hipZ: 0.11, shoulderZ: 0.27,
};
