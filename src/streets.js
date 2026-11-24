// Street furniture: street lights, traffic lights, breakable props, ramps, shop signs and speed cameras.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GRAPH, signalAt, axisOf, locate } from './logic/roadgraph.js';
import { CITY, heightAt, ROAD_PROFILES } from './logic/map.js';
import { RAMPS, POIS, SPEED_CAMS } from './logic/places.js';

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const place = (x, y, z, rot, s = S1) => M4.compose(V.set(x, y, z), Q.setFromAxisAngle(UP, rot), s);
const geo = (g, x = 0, y = 0, z = 0) => { const o = g.translate(x, y, z); return o.index ? o.toNonIndexed() : o; };
const merge = list => mergeGeometries(list.map(g => { g.deleteAttribute('uv'); return g; }));

function radial(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d'), gr = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function stripes(a, b) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = a; ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = b;
  for (let i = -128; i < 256; i += 32) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 16, 0); ctx.lineTo(i + 16 + 128, 128); ctx.lineTo(i + 128, 128); ctx.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function labelTexture(text, bg, fg = '#fff') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 192);
  ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, 496, 176);
  ctx.fillStyle = fg; ctx.font = 'bold 72px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 100, 470);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildStreets(G) {
  const { scene, RAPIER, world } = G;
  const metal = new THREE.MeshStandardMaterial({ color: 0x3b3f44, metalness: 0.6, roughness: 0.5 });

  // ---- Street lights ----
  const lamps = [];
  for (let v = CITY.min; v <= CITY.max; v += CITY.block)
    for (let w = CITY.min + 25; w < CITY.max; w += 50)
      for (const side of [-11, 11]) {
        if ((v === CITY.min && side < 0) || (v === CITY.max && side > 0)) continue;
        lamps.push({ x: v + side, z: w, rot: side > 0 ? Math.PI : 0 });
        lamps.push({ x: w, z: v + side, rot: side > 0 ? Math.PI / 2 : -Math.PI / 2 });
      }
  const hw = ROAD_PROFILES.find(p => p.road.name === 'highway');
  for (let i = 0; i < hw.pts.length; i += 12) {
    const p = hw.pts[i], q = hw.pts[(i + 1) % hw.pts.length];
    let nx = -(q.z - p.z), nz = q.x - p.x; const L = Math.hypot(nx, nz); nx /= L; nz /= L;
    if ((p.x + nx) ** 2 + (p.z + nz) ** 2 > p.x ** 2 + p.z ** 2) { nx = -nx; nz = -nz; } // inner side
    const off = hw.road.width / 2 + 2.5, x = p.x + nx * off, z = p.z + nz * off;
    lamps.push({ x, z, rot: Math.atan2(nz, nx), y: p.y });
  }
  const poleGeo = merge([geo(new THREE.CylinderGeometry(0.09, 0.13, 7, 6), 0, 3.5), geo(new THREE.BoxGeometry(2.5, 0.08, 0.08), 1.25, 6.9), geo(new THREE.BoxGeometry(0.6, 0.14, 0.32), 2.4, 6.82)]);
  const poles = new THREE.InstancedMesh(poleGeo, metal, lamps.length);
  const bulbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.04, 0.24).translate(2.4, 6.74, 0), new THREE.MeshBasicMaterial({ color: 0x555555 }), lamps.length);
  const poolMat = new THREE.MeshBasicMaterial({ map: radial('rgba(255,210,150,1)', 'rgba(255,210,150,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -6 });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(15, 15).rotateX(-Math.PI / 2), poolMat, lamps.length);
  lamps.forEach((l, i) => {
    l.y ??= heightAt(l.x, l.z);
    poles.setMatrixAt(i, place(l.x, l.y, l.z, l.rot));
    bulbs.setMatrixAt(i, M4);
    const hx = l.x + Math.cos(l.rot) * 2.4, hz = l.z - Math.sin(l.rot) * 2.4;
    pools.setMatrixAt(i, place(hx, heightAt(hx, hz) + 0.08, hz, 0));
  });
  poles.castShadow = true;
  pools.frustumCulled = false;
  scene.add(poles, bulbs, pools);

  // ---- Traffic lights ----
  const signals = [];
  for (const n of GRAPH.nodes) {
    if (!n.signal) continue;
    for (const { edge, dir } of n.edges) {
      const p = dir === 1 ? edge.pts[2] : edge.pts[edge.pts.length - 3];
      let ax = n.x - p.x, az = n.z - p.z; const L = Math.hypot(ax, az); ax /= L; az /= L;
      const back = n.stop + 0.5, side = edge.width / 2 + 1.5, x = n.x - ax * back + -az * side, z = n.z - az * back + ax * side;
      signals.push({ node: n, axis: axisOf(ax, az), x, z, rot: Math.atan2(az, -ax), state: '' });
    }
  }
  const sigGeo = merge([geo(new THREE.CylinderGeometry(0.08, 0.1, 4, 6), 0, 2), geo(new THREE.BoxGeometry(0.3, 1.1, 0.34), 0, 4.25)]);
  const sigPoles = new THREE.InstancedMesh(sigGeo, new THREE.MeshStandardMaterial({ color: 0x1c1e21, roughness: 0.6 }), signals.length);
  const sigLamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), signals.length * 3);
  signals.forEach((s, i) => {
    const y = heightAt(s.x, s.z);
    sigPoles.setMatrixAt(i, place(s.x, y, s.z, s.rot));
    for (let k = 0; k < 3; k++) {
      const lx = s.x + Math.cos(s.rot) * 0.17, lz = s.z - Math.sin(s.rot) * 0.17;
      sigLamps.setMatrixAt(i * 3 + k, place(lx, y + 4.6 - k * 0.34, lz, 0));
      sigLamps.setColorAt(i * 3 + k, new THREE.Color(0x222222));
    }
  });
  scene.add(sigPoles, sigLamps);
  const COLORS = { red: [0xff2a1a, 0x2a0606, 0x062a0a], yellow: [0x2a0606, 0xffb020, 0x062a0a], green: [0x2a0606, 0x2a1c06, 0x30ff60] }, col = new THREE.Color();

  // ---- Breakable props ----
  const T = {
    hydrant: { geo: merge([geo(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 8), 0, 0.35), geo(new THREE.SphereGeometry(0.17, 8, 5), 0, 0.72)]), color: 0xb8322a, r: 0.35, push: 0.05, water: true },
    bin: { geo: geo(new THREE.CylinderGeometry(0.32, 0.28, 1, 10), 0, 0.5), color: 0x2f5d3f, r: 0.4, push: 0.02 },
    bench: { geo: merge([geo(new THREE.BoxGeometry(0.5, 0.08, 1.8), 0, 0.45), geo(new THREE.BoxGeometry(0.08, 0.45, 1.8), -0.22, 0.7), geo(new THREE.BoxGeometry(0.4, 0.45, 0.08), 0, 0.22, -0.8), geo(new THREE.BoxGeometry(0.4, 0.45, 0.08), 0, 0.22, 0.8)]), color: 0x6b4a2b, r: 0.9, push: 0.03 },
    barrel: { geo: geo(new THREE.CylinderGeometry(0.33, 0.33, 0.95, 10), 0, 0.48), color: 0x1f4e8c, r: 0.4, push: 0.03 },
    fence: { geo: merge([geo(new THREE.BoxGeometry(0.1, 0.12, 4), 0, 0.85), geo(new THREE.BoxGeometry(0.1, 0.12, 4), 0, 0.45), geo(new THREE.BoxGeometry(0.12, 1.1, 0.12), 0, 0.55, -1.9), geo(new THREE.BoxGeometry(0.12, 1.1, 0.12), 0, 0.55, 1.9)]), color: 0x8a6a42, r: 2, push: 0.015 },
    cone: { geo: merge([geo(new THREE.ConeGeometry(0.2, 0.7, 10), 0, 0.35), geo(new THREE.BoxGeometry(0.45, 0.04, 0.45), 0, 0.02)]), color: 0xff6a10, r: 0.3, push: 0.005 },
  };
  const items = Object.fromEntries(Object.keys(T).map(k => [k, []]));
  const add = (type, x, z, rot = 0) => items[type].push({ x, z, rot, y: heightAt(x, z) });
  for (let v = CITY.min + 100; v < CITY.max; v += 200) for (let w = CITY.min + 100; w < CITY.max; w += 100) add('hydrant', v + 12.5, w + 17);
  lamps.forEach((l, i) => {
    if (Math.abs(l.x) > 410 || Math.abs(l.z) > 410) return;
    const along = Math.abs(Math.sin(l.rot)) > 0.5 ? [1, 0] : [0, 1]; // lamps on east-west streets have the street along x
    if (i % 3 === 0) add('bin', l.x + along[0] * 3, l.z + along[1] * 3);
    if (i % 5 === 1) add('bench', l.x + along[0] * 8 + Math.cos(l.rot) * -0.8, l.z + along[1] * 8 - Math.sin(l.rot) * -0.8, l.rot + Math.PI);
  });
  for (let row = 0; row < 9; row++) for (let k = 0; k < 4; k++) add('barrel', 850 + ((row * 37 + k * 53) % 190), -380 + row * 95 + 47 + (k % 2) * 3, k);
  for (let x = -680; x < 680; x += 4.2) if (((x % 40) + 40) % 40 > 8) add('fence', x, 729, Math.PI / 2);
  for (const [x0, z0, dx, dz] of [[120, 108, 5, 0], [-292, -180, 0, 5], [208, 260, 0, 5]]) for (let i = 0; i < 8; i++) add('cone', x0 + dx * i, z0 + dz * i);

  const props = [], grid = new Map(), CELL = 16;
  const index = p => { const k = Math.floor(p.x / CELL) * 100003 + Math.floor(p.z / CELL); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); };
  for (const [type, list] of Object.entries(items)) {
    const t = T[type];
    t.mat = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.7 });
    t.mesh = new THREE.InstancedMesh(t.geo, t.mat, list.length);
    t.mesh.castShadow = true;
    list.forEach((p, i) => { t.mesh.setMatrixAt(i, place(p.x, p.y, p.z, p.rot)); props.push(Object.assign(p, { type, i, alive: true, r: t.r })); index(p); });
    scene.add(t.mesh);
  }
  lamps.forEach((l, i) => { const p = { type: 'lamp', i, x: l.x, z: l.z, y: l.y, rot: l.rot, alive: true, r: 0.3 }; props.push(p); index(p); });
  const lampDebris = { geo: poleGeo, mat: metal };

  function breakProp(p, v) {
    p.alive = false; p.brokenAt = G.clock;
    const lv = v.body.linvel(), m = v.spec.mass;
    if (p.type === 'lamp') {
      for (const im of [poles, bulbs, pools]) { im.setMatrixAt(p.i, ZERO); im.instanceMatrix.needsUpdate = true; }
      G.debris.spawn(lampDebris.geo, lampDebris.mat, p.x, p.y, p.z, lv.x * 0.5, 2, lv.z * 0.5);
      v.body.applyImpulse({ x: -lv.x * m * 0.08, y: 0, z: -lv.z * m * 0.08 }, true);
      v.damage(0.03);
    } else {
      const t = T[p.type];
      t.mesh.setMatrixAt(p.i, ZERO); t.mesh.instanceMatrix.needsUpdate = true;
      G.debris.spawn(t.geo, t.mat, p.x, p.y + 0.2, p.z, lv.x * (0.6 + Math.random() * 0.4), 2 + Math.random() * 4, lv.z * (0.6 + Math.random() * 0.4));
      v.body.applyImpulse({ x: -lv.x * m * t.push, y: 0, z: -lv.z * m * t.push }, true);
      if (t.water) jets.push({ x: p.x, y: p.y, z: p.z, t: 8 });
    }
    G.audio?.crash(p.type === 'lamp' ? 0.6 : 0.25, p);
  }
  const jets = [];

  // Knock over any prop a moving vehicle touches.
  function collide(v) {
    const lv = v.body.linvel();
    if (lv.x * lv.x + lv.z * lv.z < 2.5) return;
    const p0 = v.body.translation(), h = v.heading, c = Math.cos(h), s = Math.sin(h), hl = v.spec.len / 2, hwid = v.spec.width / 2;
    for (let cx = Math.floor((p0.x - 4) / CELL); cx <= Math.floor((p0.x + 4) / CELL); cx++)
      for (let cz = Math.floor((p0.z - 4) / CELL); cz <= Math.floor((p0.z + 4) / CELL); cz++)
        for (const p of grid.get(cx * 100003 + cz) || []) {
          if (!p.alive) continue;
          const dx = p.x - p0.x, dz = p.z - p0.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
          if (Math.abs(lx) < hl + p.r && Math.abs(lz) < hwid + p.r && Math.abs(p.y - p0.y) < 3) breakProp(p, v);
        }
  }

  // ---- Ramps ----
  const rampMats = { stunt: new THREE.MeshStandardMaterial({ map: stripes('#f2c200', '#111'), roughness: 0.6 }), plain: new THREE.MeshStandardMaterial({ map: stripes('#8d8b86', '#6d6b66'), roughness: 0.8 }) };
  for (const r of RAMPS) {
    const L = r.len / 2, W = r.width / 2, H = r.height;
    const verts = [[-L, 0, -W], [L, 0, -W], [L, H, -W], [-L, 0, W], [L, 0, W], [L, H, W]];
    const g = new THREE.BufferGeometry();
    const tri = [0, 3, 5, 0, 5, 2, 0, 2, 1, 3, 4, 5, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3];
    const pos = [], uv = [];
    for (const i of tri) { pos.push(...verts[i]); uv.push((verts[i][0] + L) / 4, (verts[i][2] + W) / 4); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const y = Math.min(heightAt(r.x, r.z), heightAt(r.x - Math.cos(r.heading) * L, r.z + Math.sin(r.heading) * L)) - 0.05;
    const mesh = new THREE.Mesh(g, r.stunt ? rampMats.stunt : rampMats.plain);
    mesh.position.set(r.x, y, r.z); mesh.rotation.y = r.heading; mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    mesh.updateMatrixWorld();
    const world3 = new Float32Array(verts.flatMap(p => V.set(...p).applyMatrix4(mesh.matrixWorld).toArray()));
    world.createCollider(RAPIER.ColliderDesc.convexHull(world3).setFriction(0.9));
    r.y = y;
  }

  // ---- Signs, ATMs, speed cameras ----
  const SIGN_COLORS = { garage: '#2f8f46', spray: '#1f6fb2', dealer: '#7a3fb0', arms: '#b5541b', shop: '#c23b3b', bank: '#1d4e89', police: '#123a7a', hospital: '#e8e8e8', atm: '#0e7c66' };
  for (const p of POIS) {
    const dx = p.x - Math.round(p.x / 100) * 100, dz = p.z - Math.round(p.z / 100) * 100;
    const ns = Math.abs(dx) < Math.abs(dz); // next to a north-south street
    const ox = ns ? Math.sign(dx) : 0, oz = ns ? 0 : Math.sign(dz), k = p.drive ? 5 : 2;
    const sx = p.x + ox * k, sz = p.z + oz * k, y = heightAt(sx, sz), face = Math.atan2(-ox, -oz);
    if (p.type === 'atm') {
      const atm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.7, 0.5), new THREE.MeshStandardMaterial({ color: 0x0e7c66, roughness: 0.4, metalness: 0.4 }));
      atm.position.set(p.x + ox * 1.2, y + 0.85, p.z + oz * 1.2); atm.rotation.y = face; scene.add(atm);
      continue;
    }
    const tex = labelTexture(p.label, SIGN_COLORS[p.type], p.type === 'hospital' ? '#c62828' : '#fff');
    for (const turn of [0, Math.PI]) { // two single-sided faces, so the text reads correctly from both sides
      const board = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.5), new THREE.MeshBasicMaterial({ map: tex }));
      board.position.set(sx, y + 4, sz); board.rotation.y = face + turn; scene.add(board);
    }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.3, 6), metal);
    post.position.set(sx, y + 1.65, sz); scene.add(post);
  }
  for (const c of SPEED_CAMS) {
    const l = locate(c.x, c.z), e = l.edge, i = Math.min(e.pts.length - 2, Math.max(0, Math.round((l.d / e.len) * (e.pts.length - 1))));
    let nx = -(e.pts[i + 1].z - e.pts[i].z), nz = e.pts[i + 1].x - e.pts[i].x; const L = Math.hypot(nx, nz); nx /= L; nz /= L;
    const off = e.width / 2 + 2, x = l.x + nx * off, z = l.z + nz * off, y = heightAt(x, z);
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5, 6).translate(0, 2.5, 0), metal);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.8).translate(0, 5.1, 0), new THREE.MeshStandardMaterial({ color: 0xe0b000, roughness: 0.5 }));
    g.add(pole, head); g.position.set(x, y, z); scene.add(g);
    Object.assign(c, { px: l.x, pz: l.z });
  }

  let sigTimer = 0;
  return {
    collide,
    signals,
    update(dt, night) {
      bulbs.material.color.setScalar(0.35 + night * 0.65).multiply(col.setRGB(1, 0.85, 0.6));
      poolMat.opacity = night * 0.5;
      if ((sigTimer -= dt) <= 0) {
        sigTimer = 0.2;
        signals.forEach((s, i) => {
          const st = signalAt(G.clock, s.node, s.axis);
          if (st === s.state) return;
          s.state = st;
          COLORS[st].forEach((c, k) => sigLamps.setColorAt(i * 3 + k, col.setHex(c)));
          sigLamps.instanceColor.needsUpdate = true;
        });
      }
      for (let i = jets.length - 1; i >= 0; i--) {
        const j = jets[i];
        if ((j.t -= dt) <= 0) { jets.splice(i, 1); continue; }
        for (let n = 0; n < 3; n++) G.smoke.emit(j.x, j.y + 0.6, j.z, (Math.random() - 0.5) * 1.5, 8 + Math.random() * 3, (Math.random() - 0.5) * 1.5, 0.35, 0.8, 1.3, 0xcfe3ff, 0.55, -9.8);
      }
      // Broken props come back once you're far away.
      if (Math.random() < dt) for (const p of props) {
        if (p.alive || G.clock - p.brokenAt < 120) continue;
        const pp = G.focus;
        if (Math.hypot(pp.x - p.x, pp.z - p.z) < 150) continue;
        p.alive = true;
        if (p.type === 'lamp') {
          const l = lamps[p.i], hx = l.x + Math.cos(l.rot) * 2.4, hz = l.z - Math.sin(l.rot) * 2.4;
          poles.setMatrixAt(p.i, place(l.x, l.y, l.z, l.rot)); bulbs.setMatrixAt(p.i, M4);
          pools.setMatrixAt(p.i, place(hx, heightAt(hx, hz) + 0.08, hz, 0));
          for (const im of [poles, bulbs, pools]) im.instanceMatrix.needsUpdate = true;
        } else { const t = T[p.type]; t.mesh.setMatrixAt(p.i, place(p.x, p.y, p.z, p.rot)); t.mesh.instanceMatrix.needsUpdate = true; }
      }
    },
  };
}
