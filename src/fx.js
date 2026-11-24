// Particles (smoke, fire, sparks, water), skid marks and short-lived debris.
import * as THREE from 'three';

export function createParticles(scene, max, additive) {
  const pos = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max), tint = new Float32Array(max * 3);
  const vel = new Float32Array(max * 3), life = new Float32Array(max), age = new Float32Array(max), grow = new Float32Array(max), a0 = new Float32Array(max), lift = new Float32Array(max);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  g.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 600 }, light: { value: 1 } },
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 tint; varying float vA; varying vec3 vC; uniform float scale;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; vA = alpha; vC = tint; }`,
    fragmentShader: `varying float vA; varying vec3 vC; uniform float light;
      void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vC * ${additive ? '1.0' : 'light'}, vA * smoothstep(0.5, 0.1, d)); }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  scene.add(points);
  let cursor = 0;
  const c = new THREE.Color();
  return {
    mat,
    emit(x, y, z, vx, vy, vz, s, gr, l, color, a, rise = 0) {
      const i = cursor; cursor = (cursor + 1) % max;
      pos.set([x, y, z], i * 3); vel.set([vx, vy, vz], i * 3);
      size[i] = s; grow[i] = gr; life[i] = l; age[i] = 0; a0[i] = alpha[i] = a; lift[i] = rise;
      c.set(color); tint.set([c.r, c.g, c.b], i * 3);
    },
    update(dt) {
      for (let i = 0; i < max; i++) {
        if (age[i] >= life[i]) { alpha[i] = 0; continue; }
        age[i] += dt;
        const k = i * 3, drag = 1 - Math.min(1, dt * 1.5);
        vel[k] *= drag; vel[k + 2] *= drag; vel[k + 1] = vel[k + 1] * drag + lift[i] * dt;
        pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
        size[i] += grow[i] * dt;
        alpha[i] = a0[i] * Math.max(0, 1 - age[i] / life[i]);
      }
      for (const n of ['position', 'size', 'alpha', 'tint']) g.attributes[n].needsUpdate = true;
    },
  };
}

export function createSkids(scene, max = 2400) {
  const pos = new Float32Array(max * 12), col = new Float32Array(max * 16), idx = [];
  for (let i = 0; i < max; i++) { const a = i * 4; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  mesh.frustumCulled = false;
  scene.add(mesh);
  const last = new Map();
  let cursor = 0, dirty = false;
  return {
    // Call each frame for each wheel; strength 0 breaks the trail.
    mark(key, p, strength) {
      const prev = last.get(key);
      if (strength <= 0) { last.delete(key); return; }
      if (!prev) { last.set(key, { x: p.x, y: p.y, z: p.z }); return; }
      const dx = p.x - prev.x, dz = p.z - prev.z, L = Math.hypot(dx, dz);
      if (L < 0.25) return;
      if (L > 4) { last.set(key, { x: p.x, y: p.y, z: p.z }); return; }
      const nx = (-dz / L) * 0.12, nz = (dx / L) * 0.12, i = cursor; cursor = (cursor + 1) % max;
      pos.set([prev.x + nx, prev.y, prev.z + nz, prev.x - nx, prev.y, prev.z - nz, p.x + nx, p.y, p.z + nz, p.x - nx, p.y, p.z - nz], i * 12);
      const a = Math.min(0.75, 0.25 + strength * 0.6);
      for (let k = 0; k < 4; k++) col.set([0.05, 0.05, 0.05, a], i * 16 + k * 4);
      last.set(key, { x: p.x, y: p.y, z: p.z });
      dirty = true;
    },
    update() { if (dirty) { g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = true; dirty = false; } },
  };
}

// Loose pieces that fly off when something breaks; they settle and vanish.
export function createDebris(scene, heightAt) {
  const list = [];
  return {
    spawn(geo, mat, x, y, z, vx, vy, vz, scale = 1) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.scale.setScalar(scale); m.castShadow = true;
      scene.add(m);
      list.push({ m, vx, vy, vz, wx: (Math.random() - 0.5) * 8, wz: (Math.random() - 0.5) * 8, t: 0 });
      if (list.length > 40) { const o = list.shift(); scene.remove(o.m); }
    },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const d = list[i], m = d.m, ground = heightAt(m.position.x, m.position.z);
        d.t += dt;
        if (m.position.y > ground + 0.05 || d.vy > 0) {
          d.vy -= 9.81 * dt;
          m.position.x += d.vx * dt; m.position.y += d.vy * dt; m.position.z += d.vz * dt;
          m.rotation.x += d.wx * dt; m.rotation.z += d.wz * dt;
          if (m.position.y < ground + 0.05) { m.position.y = ground + 0.05; d.vy = Math.abs(d.vy) > 3 ? -d.vy * 0.3 : 0; d.vx *= 0.5; d.vz *= 0.5; d.wx *= 0.4; d.wz *= 0.4; }
        }
        if (d.t > 25) { scene.remove(m); list.splice(i, 1); }
      }
    },
  };
}

const wp = new THREE.Vector3();
// Smoke, skids, nitro flames and fire for one vehicle.
export function vehicleFx(G, v, dt) {
  const s = v.state, sp = Math.abs(s.speed), smoke = G.smoke, glow = G.glow;
  const hardBrake = s.braking && sp > 10 && s.gear !== 0;
  for (let i = 0; i < 4; i++) {
    const rear = i >= 2, contact = v.wheelContact(i);
    const slide = contact && ((rear && s.slip > 0.42) || (hardBrake && s.slip > 0.2) || (s.slip > 0.7));
    v.wheelWorld(i, wp);
    G.skids.mark(v.id * 4 + i, wp, slide ? s.slip : 0);
    if (slide && rear && s.slip > 0.5 && Math.random() < dt * 40)
      smoke.emit(wp.x, wp.y + 0.2, wp.z, (Math.random() - 0.5) * 1.5, 0.6, (Math.random() - 0.5) * 1.5, 1.2, 3.2, 1.8, 0xdcdcdc, 0.35, 0.4);
    if (v.tiresPopped && contact && sp > 3 && Math.random() < dt * 30)
      glow.emit(wp.x, wp.y + 0.05, wp.z, (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.12, 0, 0.3, 0xffb040, 1);
  }
  const m = v.mesh, h = v.heading, fx = Math.cos(h), fz = -Math.sin(h), L = v.spec.len / 2;
  if (s.nitroOn && Math.random() < dt * 60)
    glow.emit(m.position.x - fx * (L + 0.2), m.position.y - 0.25, m.position.z - fz * (L + 0.2), -fx * 6, 0, -fz * 6, 0.45, -0.4, 0.15, Math.random() < 0.5 ? 0x4070ff : 0xff8030, 0.9);
  if (v.health < 0.45 && Math.random() < dt * (v.dead ? 30 : 14)) {
    const dark = v.health < 0.2 ? 0x2a2a2a : 0x8a8a8a;
    smoke.emit(m.position.x + fx * (L - 0.7), m.position.y + 0.5, m.position.z + fz * (L - 0.7), (Math.random() - 0.5), 1.2, (Math.random() - 0.5), 0.8, 2.6, 2.4, dark, v.health < 0.2 ? 0.55 : 0.3, 0.8);
  }
  if (v.dead && (v.burning > 0 || v.exploded) && Math.random() < dt * (v.exploded ? 15 : 40))
    glow.emit(m.position.x + (Math.random() - 0.5) * L, m.position.y + 0.4, m.position.z + (Math.random() - 0.5), 0, 2.5, 0, 0.9, -0.5, 0.6, Math.random() < 0.5 ? 0xff6a1a : 0xffb030, 0.85);
}
