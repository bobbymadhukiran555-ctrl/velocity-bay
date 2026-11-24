// The Skyloop: an elevated, banked stunt circuit by the airfield. Drivable surface + static collider.
import * as THREE from 'three';
import { COASTER_POINTS, COASTER_WIDTH } from './logic/coaster.js';
import { heightAt } from './logic/map.js';

function stripeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1b1d20'; ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#e8b622';
  for (let i = -128; i < 256; i += 48) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 18, 0); ctx.lineTo(i + 146, 128); ctx.lineTo(i + 128, 128); ctx.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCoaster(scene, RAPIER, world) {
  const controls = COASTER_POINTS.map(([x, z, y]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(controls, false, 'centripetal');
  const N = 260, half = COASTER_WIDTH / 2;
  const pos = [], uv = [], idx = [], railPos = [], railIdx = [], centers = [], ups = [];
  const p = new THREE.Vector3(), fwd = new THREE.Vector3(), up = new THREE.Vector3(), side = new THREE.Vector3();
  const ta = new THREE.Vector3(), tb = new THREE.Vector3();

  for (let i = 0; i <= N; i++) {
    const t = i / N;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, fwd).normalize();
    curve.getTangentAt(Math.max(0, t - 0.003), ta);
    curve.getTangentAt(Math.min(1, t + 0.003), tb);
    const turn = ta.x * tb.z - ta.z * tb.x; // signed curvature
    const bank = Math.max(-0.28, Math.min(0.28, turn * 8));
    up.set(0, 1, 0).applyAxisAngle(fwd, bank);
    side.crossVectors(fwd, up).normalize();
    centers.push(p.clone()); ups.push(up.clone());
    pos.push(p.x - side.x * half, p.y - side.y * half, p.z - side.z * half,
             p.x + side.x * half, p.y + side.y * half, p.z + side.z * half);
    uv.push(0, t * 50, 1, t * 50);
    const rail = 1.1;
    railPos.push(pos[i * 6], pos[i * 6 + 1], pos[i * 6 + 2],
                 pos[i * 6] + up.x * rail, pos[i * 6 + 1] + up.y * rail, pos[i * 6 + 2] + up.z * rail,
                 pos[i * 6 + 3], pos[i * 6 + 4], pos[i * 6 + 5],
                 pos[i * 6 + 3] + up.x * rail, pos[i * 6 + 4] + up.y * rail, pos[i * 6 + 5] + up.z * rail);
  }
  for (let i = 0; i < N; i++) {
    const a = 2 * i, b = a + 2;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
    const l = 4 * i, r = l + 2;
    railIdx.push(l, l + 4, l + 1, l + 1, l + 4, l + 5,
                 r, r + 1, r + 4, r + 1, r + 5, r + 4);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.72, metalness: 0.12, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);

  const railGeo = new THREE.BufferGeometry();
  railGeo.setAttribute('position', new THREE.Float32BufferAttribute(railPos, 3));
  railGeo.setIndex(railIdx); railGeo.computeVertexNormals();
  const railMesh = new THREE.Mesh(railGeo, new THREE.MeshStandardMaterial({ color: 0xd9dee2, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }));
  railMesh.castShadow = true;
  scene.add(railMesh);

  // Pillars every ~35 m make it read as a coaster rather than a floating road.
  const pillarGeo = new THREE.CylinderGeometry(0.45, 0.75, 1, 8).translate(0, 0.5, 0);
  const spots = [];
  for (let i = 0; i < N; i += 14) if (centers[i].y - heightAt(centers[i].x, centers[i].z) > 4) spots.push(centers[i]);
  const pillars = new THREE.InstancedMesh(pillarGeo, new THREE.MeshStandardMaterial({ color: 0x8b9096, metalness: 0.5, roughness: 0.6 }), spots.length);
  const m = new THREE.Matrix4(), s = new THREE.Vector3(), q = new THREE.Quaternion();
  spots.forEach((c, i) => {
    const ground = heightAt(c.x, c.z), h = c.y - ground;
    pillars.setMatrixAt(i, m.compose(new THREE.Vector3(c.x, ground, c.z), q, s.set(1, h, 1)));
  });
  pillars.castShadow = true;
  scene.add(pillars);

  // Solid guard rails: same triangles as the visible walls, offset into the collider mesh.
  const collPos = [...pos, ...railPos];
  const collIdx = [...idx, ...railIdx.map(i => i + pos.length / 3)];
  world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(collPos), new Uint32Array(collIdx)).setFriction(1.15));

  const signCanvas = document.createElement('canvas'); signCanvas.width = 512; signCanvas.height = 128;
  const sctx = signCanvas.getContext('2d');
  sctx.fillStyle = '#141620'; sctx.fillRect(0, 0, 512, 128);
  sctx.fillStyle = '#f2c200'; sctx.fillRect(0, 0, 512, 12); sctx.fillRect(0, 116, 512, 12);
  sctx.font = 'bold 66px system-ui, sans-serif'; sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
  sctx.fillText('SKYLOOP', 256, 66);
  const st = new THREE.CanvasTexture(signCanvas); st.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: st, side: THREE.DoubleSide }));
  sign.position.set(-900, 8, 168); sign.rotation.y = 0.5;
  scene.add(sign);

  return mesh;
}
