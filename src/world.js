import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as M from './logic/map.js';
import { sunState } from './logic/daynight.js';
import * as T from './textures.js';

const rand = (() => { let s = 99; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); })();
let texScale = 1; // set from the graphics quality in buildWorld

function fixedTrimesh(RAPIER, world, geo) {
  const pos = geo.attributes.position.array;
  const idx = geo.index ? geo.index.array : [...Array(pos.length / 3).keys()];
  world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(pos), new Uint32Array(idx)).setFriction(1));
}
const fixedBox = (RAPIER, world, x, y, z, hx, hy, hz, rotY = 0) =>
  world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setRotation({ x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) }));

function terrain(RAPIER, world, aniso) {
  const N = 300, size = M.MAP_HALF * 2;
  const geo = new THREE.PlaneGeometry(size, size, N, N).rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, M.heightAt(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const n = geo.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color();
  const grass = new THREE.Color(0.11, 0.2, 0.06), dry = new THREE.Color(0.26, 0.25, 0.12), rock = new THREE.Color(0.24, 0.22, 0.2);
  const snow = new THREE.Color(0.92, 0.93, 0.97), sand = new THREE.Color(0.62, 0.48, 0.28), beach = new THREE.Color(0.72, 0.64, 0.45);
  const concrete = new THREE.Color(0.26, 0.26, 0.25), seabed = new THREE.Color(0.35, 0.33, 0.25);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), slope = 1 - n.getY(i), zone = M.zoneAt(x, z);
    c.copy(grass).lerp(dry, 0.5 + 0.5 * M.fbm(x / 90, z / 90));
    if (zone === 'desert' || (x < -650 && z < -300)) c.copy(sand).lerp(dry, Math.max(0, M.fbm(x / 60, z / 60)) * 0.4);
    if (zone === 'airport' || zone === 'docks' || zone === 'downtown') c.copy(concrete);
    if (z > 715) c.copy(beach);
    if (y < M.SEA_LEVEL - 0.5) c.copy(seabed);
    if (slope > 0.28 || y > 110) c.lerp(rock, Math.min(1, Math.max(0, (slope - 0.2) * 4) + Math.max(0, (y - 110) / 25)));
    if (y > 150) c.lerp(snow, Math.min(1, (y - 150) / 15));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: T.detailTexture(aniso, texScale), roughness: 0.95 }));
  mesh.receiveShadow = true;
  fixedTrimesh(RAPIER, world, geo);
  return mesh;
}

// A flat strip along a road profile, with sloped shoulders so wheels never hit a step.
function roadRibbon(prof) {
  const { pts, closed } = prof, hw = prof.road.width / 2;
  const list = closed ? [...pts, pts[0]] : pts;
  const pos = [], uv = [], idx = [];
  let dist = 0;
  for (let i = 0; i < list.length; i++) {
    const a = list[Math.max(0, i - 1)], b = list[Math.min(list.length - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const nx = -dz, nz = dx, p = list[i];
    if (i > 0) dist += Math.hypot(p.x - list[i - 1].x, p.z - list[i - 1].z);
    const v = dist / 10;
    for (const [off, dy, u] of [[-hw - 1.2, -0.45, -0.05], [-hw, 0, 0], [hw, 0, 1], [hw + 1.2, -0.45, 1.05]]) {
      pos.push(p.x + nx * off, p.y + dy, p.z + nz * off);
      uv.push(u, v);
    }
  }
  for (let i = 0; i < list.length - 1; i++)
    for (let k = 0; k < 3; k++) {
      const a = i * 4 + k, b = a + 4;
      idx.push(a, a + 1, b, a + 1, b + 1, b); // counter-clockwise from above, so the road faces up
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Box with facade UVs on the walls, split into wall and roof geometry.
function building(b) {
  const box = new THREE.BoxGeometry(b.w, b.h, b.d).toNonIndexed();
  const uv = box.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const faceW = f < 2 ? b.d : b.w;
    for (let k = 0; k < 6; k++) { const i = f * 6 + k; uv.setXY(i, uv.getX(i) * faceW / 24, uv.getY(i) * b.h / 56); }
  }
  box.translate(b.x, b.h / 2, b.z);
  const pick = faces => {
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const a = box.attributes[name], out = [];
      for (const f of faces) for (let k = 0; k < 6 * a.itemSize; k++) out.push(a.array[f * 6 * a.itemSize + k]);
      g.setAttribute(name, new THREE.Float32BufferAttribute(out, a.itemSize));
    }
    return g;
  };
  const walls = pick([0, 1, 4, 5]);
  const tint = new THREE.Color().setHSL(0.05 + rand() * 0.55, 0.06 + rand() * 0.14, 0.3 + rand() * 0.35);
  walls.setAttribute('color', new THREE.Float32BufferAttribute(Array(24).fill(0).flatMap(() => [tint.r, tint.g, tint.b]), 3));
  return { walls, roof: pick([2]) };
}

function city(scene, RAPIER, world, aniso, mats) {
  const tile = T.cityTileTexture(aniso, texScale);
  for (const t of Object.values(tile)) { t.repeat.set(8.2, 8.2); t.offset.set(-0.1, -0.1); }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(820, 820).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ ...tile, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
  ground.position.y = 0.02;
  ground.receiveShadow = true;
  scene.add(ground);
  mats.wet.push(ground.material);

  const { buildings, parks } = M.cityBuildings();
  const walls = [], roofs = [];
  for (const b of buildings) {
    const g = building(b);
    walls.push(g.walls); roofs.push(g.roof);
    fixedBox(RAPIER, world, b.x, b.h / 2, b.z, b.w / 2, b.h / 2, b.d / 2);
  }
  const facade = T.facadeTextures(aniso, texScale);
  mats.windows = new THREE.MeshStandardMaterial({ map: facade.map, normalMap: facade.normalMap, roughnessMap: facade.roughnessMap, vertexColors: true, emissiveMap: facade.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughness: 1, metalness: 0.35 });
  const w = new THREE.Mesh(mergeGeometries(walls), mats.windows);
  const r = new THREE.Mesh(mergeGeometries(roofs), new THREE.MeshStandardMaterial({ color: 0x55575a, roughness: 0.9 }));
  for (const m of [w, r]) { m.castShadow = m.receiveShadow = true; scene.add(m); }

  const grass = new THREE.MeshStandardMaterial({ color: 0x3f6b2c, roughness: 1 });
  for (const p of parks) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(p.size, p.size).rotateX(-Math.PI / 2), grass);
    g.position.set(p.x, 0.06, p.z); g.receiveShadow = true; scene.add(g);
  }
  return parks;
}

function trees(scene, RAPIER, world, parks) {
  const spots = [];
  for (const p of parks) for (let i = 0; i < 9; i++) spots.push([p.x + (rand() - 0.5) * p.size * 0.85, p.z + (rand() - 0.5) * p.size * 0.85, 'park']);
  for (let tries = 0; spots.length < 900 && tries < 20000; tries++) {
    const x = (rand() - 0.5) * 2300, z = (rand() - 0.5) * 2300, zone = M.zoneAt(x, z), y = M.heightAt(x, z);
    if (!['outskirts', 'mountains', 'beach'].includes(zone) || y < 0.5 || y > 110) continue;
    if (zone === 'beach' && z > 800) continue;
    const r = M.nearestRoadPoint(x, z);
    if (Math.hypot(r.x - x, r.z - z) < 22) continue;
    spots.push([x, z, zone]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 3, 6).translate(0, 1.5, 0);
  const leafGeo = new THREE.ConeGeometry(2.4, 7, 7).translate(0, 6, 0);
  const palmLeaf = new THREE.SphereGeometry(2.4, 7, 5).scale(1, 0.45, 1).translate(0, 6.2, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 1 }), spots.length);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x2f5a26, roughness: 0.9 }), spots.length);
  const palms = new THREE.InstancedMesh(palmLeaf, new THREE.MeshStandardMaterial({ color: 0x4f7d2a, roughness: 0.9 }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  let nl = 0, np = 0;
  spots.forEach(([x, z, zone], i) => {
    const y = zone === 'park' ? 0.05 : M.heightAt(x, z), k = 0.8 + rand() * 0.6;
    q.setFromAxisAngle(v.set(0, 1, 0), rand() * 6.28);
    m.compose(v.set(x, y, z), q, s.set(k, zone === 'beach' ? k * 2.2 : k, k));
    trunks.setMatrixAt(i, m);
    if (zone === 'beach') palms.setMatrixAt(np++, m.compose(v.set(x, y, z), q, s.set(k, k, k)));
    else leaves.setMatrixAt(nl++, m);
    world.createCollider(RAPIER.ColliderDesc.cylinder(2, 0.35 * k).setTranslation(x, y + 2, z));
  });
  leaves.count = nl; palms.count = np;
  for (const im of [trunks, leaves, palms]) { im.castShadow = true; scene.add(im); }
}

function airport(scene, RAPIER, world, aniso) {
  const t = T.runwayTexture(aniso, texScale);
  t.repeat.set(1, 110);
  const runway = new THREE.Mesh(new THREE.PlaneGeometry(60, 1100).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
  runway.position.set(-1010, 0.03, 150); runway.receiveShadow = true; scene.add(runway);
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.5, metalness: 0.6 });
  for (let i = 0; i < 4; i++) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 70, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), metal);
    h.position.set(-860, 0, -250 + i * 110); h.castShadow = h.receiveShadow = true; scene.add(h);
    fixedBox(RAPIER, world, -860, 11, -250 + i * 110, 22, 11, 35);
  }
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 40, 12), new THREE.MeshStandardMaterial({ color: 0xd6d2c8, roughness: 0.7 }));
  tower.position.set(-880, 20, 520); tower.castShadow = true; scene.add(tower);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(7, 6, 6, 12), new THREE.MeshStandardMaterial({ color: 0x24364a, roughness: 0.1, metalness: 0.8 }));
  cab.position.set(-880, 43, 520); scene.add(cab);
  fixedBox(RAPIER, world, -880, 23, 520, 5, 23, 5);
}

function docks(scene, RAPIER, world) {
  const boxes = [];
  for (let row = 0; row < 10; row++)
    for (let col = 0; col < 5; col++) {
      if (rand() < 0.2) continue;
      const x = 860 + col * 40, z = -380 + row * 95, stack = 1 + Math.floor(rand() * 3);
      for (let s = 0; s < stack; s++) boxes.push([x, 1.3 + s * 2.6, z, rand() < 0.5 ? 0 : Math.PI / 2]);
      fixedBox(RAPIER, world, x, 1.3 * stack, z, 6, 1.3 * stack, 1.2);
    }
  const geo = new THREE.BoxGeometry(12, 2.6, 2.4);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.4 }), boxes.length);
  const palette = [0xa5352b, 0x2f5f8a, 0x3c7d4b, 0xc9902c, 0x7b7f86, 0x8a4a2b].map(c => new THREE.Color(c));
  const m = new THREE.Matrix4();
  boxes.forEach(([x, y, z], i) => { im.setMatrixAt(i, m.makeTranslation(x, y, z)); im.setColorAt(i, palette[Math.floor(rand() * palette.length)]); });
  im.castShadow = im.receiveShadow = true; scene.add(im);
  const crane = new THREE.MeshStandardMaterial({ color: 0xd8a32a, roughness: 0.6 });
  for (let i = 0; i < 4; i++) {
    const z = -300 + i * 260, g = new THREE.Group();
    for (const [dx, dz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 40, 1.2), crane); leg.position.set(dx, 20, dz); g.add(leg); }
    const boom = new THREE.Mesh(new THREE.BoxGeometry(70, 3, 3), crane); boom.position.set(15, 41, 0); g.add(boom);
    g.position.set(1065, 0, z); g.traverse(o => (o.castShadow = true)); scene.add(g);
    for (const dz of [-6, 6]) for (const dx of [-6, 6]) fixedBox(RAPIER, world, 1065 + dx, 20, z + dz, 0.6, 20, 0.6);
  }
}

function desertRocks(scene, RAPIER, world) {
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 1, flatShading: true }), 120);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  let n = 0;
  for (let tries = 0; n < 120 && tries < 3000; tries++) {
    const x = -720 - rand() * 460, z = -380 - rand() * 760;
    const r = M.nearestRoadPoint(x, z);
    if (Math.hypot(r.x - x, r.z - z) < 20) continue;
    const s = 1.5 + rand() * 5, y = M.heightAt(x, z);
    im.setMatrixAt(n++, m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(rand() * 3, rand() * 3, rand() * 3)), new THREE.Vector3(s, s * 0.7, s)));
    world.createCollider(RAPIER.ColliderDesc.ball(s * 0.7).setTranslation(x, y, z));
  }
  im.count = n; im.castShadow = im.receiveShadow = true; scene.add(im);
}

function stars() {
  const pos = [];
  for (let i = 0; i < 1500; i++) {
    const u = rand() * 2 - 1, a = rand() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos.push(Math.cos(a) * r * 4000, Math.abs(u) * 4000, Math.sin(a) * r * 4000);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
}

export function buildWorld(scene, renderer, RAPIER, world, quality) {
  const aniso = renderer.capabilities.getMaxAnisotropy();
  texScale = quality === 'high' ? 2 : quality === 'low' ? 0.5 : 1;
  const mats = { wet: [] };
  scene.add(terrain(RAPIER, world, aniso));

  const roadMat = new THREE.MeshStandardMaterial({ ...T.roadTexture(aniso, texScale), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1 });
  mats.wet.push(roadMat);
  for (const prof of M.ROAD_PROFILES) {
    const geo = roadRibbon(prof);
    const mesh = new THREE.Mesh(geo, roadMat);
    mesh.receiveShadow = true;
    scene.add(mesh);
    fixedTrimesh(RAPIER, world, geo);
  }
  const parks = city(scene, RAPIER, world, aniso, mats);
  trees(scene, RAPIER, world, parks);
  airport(scene, RAPIER, world, aniso);
  docks(scene, RAPIER, world);
  desertRocks(scene, RAPIER, world);

  // Invisible walls at the map edge.
  const H = M.MAP_HALF;
  fixedBox(RAPIER, world, 0, 50, -H, H, 200, 2); fixedBox(RAPIER, world, 0, 50, H, H, 200, 2);
  fixedBox(RAPIER, world, -H, 50, 0, 2, 200, H); fixedBox(RAPIER, world, H, 50, 0, 2, 200, H);

  const sea = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x1d4a63, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88 }));
  sea.position.y = M.SEA_LEVEL;
  scene.add(sea);

  // Sky, sun, ambient light, fog, reflections.
  const sky = new Sky(); sky.scale.setScalar(9000); scene.add(sky);
  const envSky = new Sky(); envSky.scale.setScalar(9000);
  const envScene = new THREE.Scene(); envScene.add(envSky);
  const su = sky.material.uniforms;
  su.turbidity.value = 6; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.85;
  Object.keys(su).forEach(k => { if (envSky.material.uniforms[k] && k !== 'sunPosition') envSky.material.uniforms[k].value = su[k].value; });

  const starField = stars(); scene.add(starField);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  const sm = quality === 'high' ? 4096 : quality === 'low' ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 1, far: 1200 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4436, 1);
  scene.add(hemi);
  scene.fog = new THREE.Fog(0xaabbcc, 250, 1800);

  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null, lastEnvT = -1;
  const sunDir = new THREE.Vector3(), dayFog = new THREE.Color(0xb8c6d4), duskFog = new THREE.Color(0xd99a6c), nightFog = new THREE.Color(0x0b0f18);

  const grey = new THREE.Color(0x8a9099), WET = new THREE.Color();
  const CALM = { cloud: 0, fog: 0, rain: 0, wet: 0, flash: 0 };
  // wx: weather { cloud, fog, rain, wet, flash } from the weather system.
  function update(t01, focus, wx = CALM) {
    const s = sunState(t01);
    const up = s.elevation > -0.12, overcast = 1 - 0.8 * wx.cloud;
    sunDir.setFromSphericalCoords(1, Math.PI / 2 - s.elevation, s.azimuth);
    su.sunPosition.value.copy(sunDir);
    su.turbidity.value = 6 + 12 * wx.cloud;
    const lightDir = up ? sunDir : sunDir.clone().negate().setY(Math.abs(sunDir.y) + 0.3).normalize(); // moonlight after dark
    sun.position.copy(focus).addScaledVector(lightDir, 600);
    sun.target.position.copy(focus);
    sun.intensity = (up ? 2.6 * Math.max(0.05, s.daylight) : 0.35) * overcast;
    sun.color.setHSL(0.09, up ? 0.9 - 0.8 * s.daylight : 0.3, up ? 0.6 + 0.3 * s.daylight : 0.75);
    if (!up) sun.color.setRGB(0.6, 0.7, 1);
    hemi.intensity = (0.25 + 0.85 * s.daylight) * (1 - 0.35 * wx.cloud) + wx.flash * 1.2;
    const dusk = Math.max(0, 1 - Math.abs(s.elevation) * 6) * (1 - s.daylight * 0.5);
    scene.fog.color.copy(nightFog).lerp(dayFog, s.daylight).lerp(duskFog, dusk * 0.5 * overcast).lerp(grey.clone().multiplyScalar(0.15 + 0.85 * s.daylight), wx.cloud * 0.7);
    scene.fog.near = 250 + (12 - 250) * wx.fog;
    scene.fog.far = Math.min(1800 + (160 - 1800) * wx.fog, 1800 + (420 - 1800) * wx.rain);
    renderer.toneMappingExposure = (0.8 + (1 - s.daylight) * 0.3) * (1 - 0.15 * wx.cloud) + wx.flash * 0.2;
    starField.material.opacity = Math.max(0, 1 - s.daylight * 3) * (1 - wx.cloud);
    starField.position.copy(focus);
    mats.windows.emissiveIntensity = Math.max(0, 1 - s.daylight * 1.6) * 1.4;
    for (const m of mats.wet) { m.roughness = 0.82 - 0.4 * wx.wet; m.color.copy(WET.setScalar(1 - 0.45 * wx.wet)); }
    if (Math.abs(t01 - lastEnvT) > 0.004 || lastEnvT < 0) {
      lastEnvT = t01;
      envSky.material.uniforms.sunPosition.value.copy(sunDir);
      envRT?.dispose();
      envRT = pmrem.fromScene(envScene, 0, 1, 10000);
      scene.environment = envRT.texture;
    }
    scene.environmentIntensity = (0.05 + 0.17 * s.daylight) * (1 - 0.6 * wx.cloud) * (1 + 0.6 * wx.wet); // the sky is HDR: keep reflections from flooding the shadows
    return s;
  }
  return { update, mats };
}
