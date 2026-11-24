// Turns Kenney Car Kit models (CC0) into the parts the game's vehicles use: a tintable paint mesh, a baked-colour trim mesh,
// lights and per-side wheels. The model is stretched between its axles to match each vehicle's real wheelbase and size.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MODELS } from './logic/vehicles.js';
import { CAR_FILES } from './logic/carfiles.js';

const PARTS = new Map();
export const kenneyParts = id => PARTS.get(id);

const HEAD_CELL = 25, TAIL_CELL = 26, GLASS_CELLS = new Set([0, 1]); // 64x128 palette cells, row-major, 8 per row

function readPixels(tex) {
  const img = tex.image, c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  return { d: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
}
const sample = (px, u, v) => {
  const x = Math.min(px.w - 1, Math.max(0, Math.floor(u * px.w))), y = Math.min(px.h - 1, Math.max(0, Math.floor(v * px.h))), i = (y * px.w + x) * 4;
  return [px.d[i] / 255, px.d[i + 1] / 255, px.d[i + 2] / 255, Math.floor(x / 64) + 8 * Math.floor(y / 128)];
};
const linear = new THREE.Color();

// Positions -> game space (+x forward, +z right), stretched between the axles; returns a flat-shaded, non-indexed geometry
// with a `color` attribute (baked from the palette) and `cell` (palette cell) as a plain array.
function bake(geo, px, T) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, uv = g.attributes.uv, n = p.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), cell = new Array(n);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = T(p.getX(i), p.getY(i), p.getZ(i));
    pos.set([x, y, z], i * 3);
    const s = sample(px, uv.getX(i), uv.getY(i));
    linear.setRGB(s[0], s[1], s[2], THREE.SRGBColorSpace); col.set([linear.r, linear.g, linear.b], i * 3);
    cell[i] = s[3];
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeVertexNormals();
  return { geo: out, cell };
}
// Keep only the triangles whose first vertex satisfies `keep(vertexIndex)`.
function pick(g, keep) {
  const idx = [];
  for (let t = 0; t < g.geo.attributes.position.count; t += 3) if (keep(t)) idx.push(t, t + 1, t + 2);
  if (!idx.length) return new THREE.BoxGeometry(0.001, 0.001, 0.001).toNonIndexed();
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'color', 'normal']) {
    const a = g.geo.attributes[k], arr = new Float32Array(idx.length * 3);
    idx.forEach((v, j) => arr.set([a.getX(v), a.getY(v), a.getZ(v)], j * 3));
    out.setAttribute(k, new THREE.BufferAttribute(arr, 3));
  }
  return out;
}

function build(id, gltf) {
  const m = MODELS[id], R = m.wheelR, bodyY = R + 0.28, [xf, xr] = m.axles;
  gltf.scene.updateMatrixWorld(true);
  const node = {}; gltf.scene.traverse(o => { node[o.name] = o; });
  const body = node.body, px = readPixels(body.material.map);
  // Everything that isn't a wheel (body, spoiler, doors, grill) becomes one geometry in body space.
  const shell = [];
  gltf.scene.traverse(o => {
    if (!o.isMesh || o.name.startsWith('wheel')) return;
    const c = o.geometry.clone().applyMatrix4(o.matrixWorld).toNonIndexed();
    for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'uv') c.deleteAttribute(k);
    shell.push(c);
  });
  const bg = mergeGeometries(shell); bg.computeBoundingBox();
  const bb = bg.boundingBox, zf = node['wheel-front-left'].position.z, zr = node['wheel-back-left'].position.z;
  const wbox = new THREE.Box3().setFromObject(node['wheel-front-left']), R0 = (wbox.max.y - wbox.min.y) / 2;
  const sw = m.width / (bb.max.x - bb.min.x), sy = Math.min(1.5, Math.max(R / R0, m.height / bb.max.y)), sr = R / R0;
  const front = m.len / 2 - xf, rear = m.len / 2 + xr;
  const X = z => (z >= zf ? xf + ((z - zf) * front) / (bb.max.z - zf) : z <= zr ? xr - ((zr - z) * rear) / (zr - bb.min.z) : xr + ((z - zr) / (zf - zr)) * (xf - xr));
  const g = bake(bg, px, (x, y, z) => [X(z), y * sy, -x * sw]);
  // Paint = the biggest non-glass, non-dark, non-light palette cell on the body.
  const area = new Map();
  for (let t = 0; t < g.cell.length; t += 3) { const c = g.cell[t]; area.set(c, (area.get(c) || 0) + 1); }
  const lum = c => { const s = sample(px, ((c % 8) * 64 + 32) / px.w, (Math.floor(c / 8) * 128 + 20) / px.h); return 0.3 * s[0] + 0.59 * s[1] + 0.11 * s[2]; };
  let paintCell = -1, best = 0;
  for (const [c, a] of area) if (a > best && c !== HEAD_CELL && c !== TAIL_CELL && !GLASS_CELLS.has(c) && lum(c) > 0.22) { best = a; paintCell = c; }
  const cx = id2 => g.cell[id2], len = m.len;
  const posAt = (t, axis) => g.geo.attributes.position.getComponent(t, axis);
  const paint = pick(g, t => cx(t) === paintCell);
  const heads = pick(g, t => cx(t) === HEAD_CELL && posAt(t, 0) > len * 0.2);
  const tails = pick(g, t => cx(t) === TAIL_CELL && posAt(t, 0) < -len * 0.2);
  const trim = pick(g, t => cx(t) !== paintCell && !(cx(t) === HEAD_CELL && posAt(t, 0) > len * 0.2) && !(cx(t) === TAIL_CELL && posAt(t, 0) < -len * 0.2));
  const wheel = side => {
    const w = node[`wheel-front-${side}`].geometry.clone();
    const b = bake(w, px, (x, y, z) => [z * sr, y * sr, -x * sr]).geo;
    b.computeBoundingBox(); const mid = (b.boundingBox.min.z + b.boundingBox.max.z) / 2;
    return b.translate(0, 0, -mid);
  };
  const wl = wheel('left'), wr = wheel('right');
  // Visual wheel plane: where the model keeps its wheels, scaled to the vehicle's width.
  const visTrack = Math.abs((wbox.min.x + wbox.max.x) / 2) * sw;
  for (const k of [paint, trim, heads, tails]) k.translate(0, -bodyY, 0);
  const roof = bb.max.y * sy;
  return { paint, trim, heads, tails, wheel: wl, wheelL: wl, wheelR: wr, visTrack, bodyY, lampY: 0.62 * roof, roof, impactY: 0.65,
    cockpit: { x: (xf + xr) / 2 + 0.2, y: roof * 0.82 - bodyY, z: -m.width * 0.22 } };
}

// Loads every model in CAR_FILES (falls back to the procedural body for any that fail).
export async function loadKenneyCars(onProgress) {
  const loader = new GLTFLoader(), files = [...new Set(Object.values(CAR_FILES))], gltfs = {};
  let done = 0;
  await Promise.all(files.map(f => loader.loadAsync(`assets/cars/${f}.glb`).then(g => { gltfs[f] = g; }, e => console.warn('car model failed', f, e)).finally(() => onProgress?.(++done, files.length))));
  for (const [id, f] of Object.entries(CAR_FILES)) if (gltfs[f]) { try { PARTS.set(id, build(id, gltfs[f])); } catch (e) { console.warn('car build failed', id, e); } }
}
