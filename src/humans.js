// Everyone on foot: pedestrians, cops, gang members and the player's body. Drawn with four instanced meshes.
import * as THREE from 'three';
import { HUMAN } from './models.js';
import { CITY, heightAt } from './logic/map.js';
import { gangAt, GANGS } from './logic/places.js';

const MAX = 90;
const SHIRTS = ['#3b5b92', '#a33b3b', '#2f7d4f', '#d9d9d9', '#222', '#8a5a9a', '#c4892f', '#5d6d7e', '#e0c9a6', '#1f6f8b'];
const PANTS = ['#26303f', '#3a3a3a', '#5b4a36', '#1d2733', '#6b6f75'];
const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
const pick = a => a[Math.floor(Math.random() * a.length)];
const inCity = (x, z) => Math.abs(x) < CITY.max + 5 && Math.abs(z) < CITY.max + 5;
export const groundAt = (x, z) => (inCity(x, z) ? 0.03 : heightAt(x, z));

const M = new THREE.Matrix4(), L = new THREE.Matrix4(), T = new THREE.Matrix4(), R = new THREE.Matrix4(), C = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export function createHumans(G) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const torso = new THREE.InstancedMesh(HUMAN.torso, mat, MAX), head = new THREE.InstancedMesh(HUMAN.head, mat, MAX);
  const arms = new THREE.InstancedMesh(HUMAN.arm, mat, MAX * 2), legs = new THREE.InstancedMesh(HUMAN.leg, mat, MAX * 2);
  for (const m of [torso, head, arms, legs]) { m.castShadow = true; m.frustumCulled = false; G.scene.add(m); m.count = 0; }
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.06), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.4 }));
  const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.85, 6), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
  G.scene.add(gun, bat);
  const list = [];
  let nextId = 1, spawnTimer = 0;

  function spawn(o) {
    if (list.length >= MAX) return null;
    const h = { id: nextId++, role: 'ped', x: 0, y: 0, z: 0, yaw: 0, speed: 0, phase: Math.random() * 6, state: 'walk', health: 100, fall: 0, vx: 0, vy: 0, vz: 0, timer: 0,
      shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKIN), visible: true, pose: null, cool: 0, ...o };
    h.y = o.y ?? groundAt(h.x, h.z);
    list.push(h);
    return h;
  }
  const remove = h => { const i = list.indexOf(h); if (i >= 0) list.splice(i, 1); };

  // City pedestrians walk loops around a block on the sidewalk.
  function corners(h) { const a = h.bx, b = h.bz; return [[a + 12, b + 12], [a + 88, b + 12], [a + 88, b + 88], [a + 12, b + 88]]; }
  function cityPed(x, z) {
    const bx = Math.floor((x - CITY.min) / 100) * 100 + CITY.min, bz = Math.floor((z - CITY.min) / 100) * 100 + CITY.min;
    if (bx < CITY.min || bx >= CITY.max || bz < CITY.min || bz >= CITY.max) return null;
    const c = Math.floor(Math.random() * 4), side = [[bx + 12 + Math.random() * 76, bz + 12], [bx + 88, bz + 12 + Math.random() * 76], [bx + 88 - Math.random() * 76, bz + 88], [bx + 12, bz + 88 - Math.random() * 76]][c];
    return spawn({ x: side[0], z: side[1], bx, bz, corner: (c + 1) % 4, dir: 1, walk: 1.2 + Math.random() * 0.5 });
  }

  const threatDist = h => Math.hypot(h.x - G.focus.x, h.z - G.focus.z);
  function flee(h, from, secs = 7) {
    if (h.role !== 'ped' || h.state === 'down' || h.state === 'dead') return;
    h.state = 'flee'; h.timer = secs;
    if (h.bx !== undefined) { // run along the sidewalk, away from the threat
      const cs = corners(h), a = cs[(h.corner + 4) % 4], b = cs[(h.corner + 2) % 4];
      if (Math.hypot(a[0] - from.x, a[1] - from.z) < Math.hypot(b[0] - from.x, b[1] - from.z)) { h.dir = -h.dir; h.corner = (h.corner + h.dir * 2 + 8) % 4; }
    } else h.yaw = Math.atan2(-(h.z - from.z), h.x - from.x);
  }
  function panicAround(x, z, r) { for (const h of list) if (h.role === 'ped' && Math.hypot(h.x - x, h.z - z) < r) flee(h, { x, z }); }

  // Hit by a car, a bullet or a fist. Returns true if this took them down for good.
  function hurt(h, dmg, push = null, attacker = null) {
    if (h.state === 'dead') return false;
    h.health -= dmg;
    if (h.role === 'player') { G.player.hurt(dmg, push); return false; }
    if (h.role === 'cop' || h.role === 'gang') h.hostile = true;
    const knock = push || dmg >= 30 || h.health <= 0;
    if (knock) {
      h.state = 'down'; h.timer = h.health <= 0 ? 15 : 2.5;
      h.vx = push?.x ?? 0; h.vz = push?.z ?? 0; h.vy = push?.y ?? 2;
      h.dead = h.health <= 0;
    }
    if (attacker === 'player') panicAround(h.x, h.z, 30);
    return h.health <= 0;
  }

  // Vehicles knock people over. Cartoon rules: they fly and fall over, no gore.
  function vehicleHits() {
    for (const v of G.fleet.list) {
      const lv = v.body.linvel(), sp = Math.hypot(lv.x, lv.z);
      if (sp < 3) continue;
      const p = v.body.translation(), hd = v.heading, c = Math.cos(hd), s = Math.sin(hd), hl = v.spec.len / 2 + 0.3, hw = v.spec.width / 2 + 0.3;
      for (const h of list) {
        if (h.state === 'down' || h.state === 'dead' || !h.visible || h.ride) continue;
        const dx = h.x - p.x, dz = h.z - p.z;
        if (dx * dx + dz * dz > 30) continue;
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) > hl || Math.abs(lz) > hw || Math.abs(h.y - p.y) > 2.5) continue;
        const byPlayer = v === G.player.vehicle, dmg = sp * 7;
        const killed = hurt(h, dmg, { x: lv.x * 0.8 + (Math.random() - 0.5) * 2, y: 3 + sp * 0.18, z: lv.z * 0.8 + (Math.random() - 0.5) * 2 }, byPlayer ? 'player' : null);
        G.audio?.thud(h);
        if (byPlayer && h.role !== 'player') {
          if (h.role === 'cop') G.wanted.crime(killed ? 'killCop' : 'hitCop');
          else if (h.role === 'gang') G.wanted.crime('gang');
          else G.wanted.crime(killed ? 'killPed' : 'hitPed');
          if (killed) G.onKill?.(h);
        }
        v.damage(0.004);
      }
    }
  }

  function think(h, dt) {
    const g = groundAt(h.x, h.z);
    if (h.state === 'down' || h.state === 'dead') {
      h.fall = Math.min(1, h.fall + dt * 3);
      if (h.y > g + 0.02 || h.vy > 0) {
        h.vy -= 18 * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.z += h.vz * dt;
        if (h.y <= g) { h.y = g; h.vy = 0; h.vx *= 0.3; h.vz *= 0.3; }
      } else { h.vx *= 0.9; h.vz *= 0.9; h.x += h.vx * dt; h.z += h.vz * dt; h.y = g; }
      if ((h.timer -= dt) <= 0) {
        if (h.dead) { remove(h); return; }
        if (h.role === 'player') return;
        h.state = h.role === 'ped' ? 'flee' : 'walk'; h.timer = 6; h.fall = 0;
      }
      return;
    }
    h.fall = Math.max(0, h.fall - dt * 3);
    h.cool -= dt;
    if (h.role === 'cop' || h.role === 'gang') return fighter(h, dt, g);
    if (h.role !== 'ped') return;
    let sp = h.state === 'flee' ? 4.6 : h.walk;
    if (h.state === 'flee' && (h.timer -= dt) <= 0) h.state = 'walk';
    if (h.state === 'idle') { sp = 0; if ((h.timer -= dt) <= 0) h.state = 'walk'; }
    else if (h.state === 'walk' && Math.random() < dt * 0.02) { h.state = 'idle'; h.timer = 2 + Math.random() * 4; }
    if (h.bx !== undefined) {
      const [tx, tz] = corners(h)[h.corner];
      const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz);
      if (d < 0.5) h.corner = (h.corner + h.dir + 4) % 4;
      else h.yaw = Math.atan2(-dz, dx);
    } else if (h.state === 'walk' && Math.random() < dt * 0.1) h.yaw += (Math.random() - 0.5) * 2;
    h.speed = sp;
    h.x += Math.cos(h.yaw) * sp * dt; h.z -= Math.sin(h.yaw) * sp * dt; h.y = g;
  }

  // Cops and gang members chase and shoot; gangs only once provoked or when you walk into their turf.
  function fighter(h, dt, g) {
    const P = G.player, tgt = P.target();
    const dx = tgt.x - h.x, dz = tgt.z - h.z, d = Math.hypot(dx, dz);
    if (h.role === 'gang' && !h.hostile && G.wanted.enabled) h.hostile = d < (P.mode === 'foot' ? 22 : 10);
    const active = h.role === 'cop' ? G.wanted.stars > 0 : h.hostile;
    if (!active) { h.speed = 0; if (h.role === 'cop' && (h.timer -= dt) <= 0) remove(h); return; }
    h.yaw = Math.atan2(-dz, dx);
    const shoot = (h.role === 'gang' || G.wanted.stars > 0) && d < (G.wanted.stars >= 2 ? 30 : 18);
    const close = h.role === 'cop' ? 1.2 : 6;
    h.pose = shoot ? 'aim' : null;
    if (d > close && !(shoot && d < 14)) {
      if ((h.blockT = (h.blockT ?? 0) - dt) <= 0) { h.blockT = 0.5; h.blocked = G.rayBlocked(h.x, h.y + 1, h.z, h.x + (dx / d) * 2, h.y + 1, h.z + (dz / d) * 2); }
      h.speed = h.blocked ? 0 : 4.2;
      h.x += (dx / d) * h.speed * dt; h.z += (dz / d) * h.speed * dt; h.y = g;
    } else h.speed = 0;
    if (shoot && h.cool <= 0 && !P.dead) { h.cool = 0.9 + Math.random() * 0.8; G.combat.npcFire(h, tgt); }
  }

  function populate() {
    const P = G.focus, want = Math.round(26 * G.settings.peds);
    let peds = 0;
    for (const h of list) {
      if (h.role === 'player') continue;
      const d = Math.hypot(h.x - P.x, h.z - P.z);
      if (d > 230 || (h.role === 'cop' && d > 160 && G.wanted.stars === 0)) { remove(h); continue; }
      if (h.role === 'ped') peds++;
    }
    if (peds < want && inCity(P.x, P.z) || peds < want / 3) {
      for (let k = 0; k < 2 && peds < want; k++) {
        const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 120, x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
        if (G.inView(x, z) && r < 90) continue;
        if (inCity(x, z)) { if (cityPed(x, z)) peds++; }
        else if (z > 730 && z < 770 && Math.abs(x) < 650) { spawn({ x, z, yaw: Math.random() * 6, walk: 1.2 }); peds++; }
      }
    }
    // Gang members hang out on their turf.
    for (const gang of GANGS) {
      const cx = Math.max(gang.x0, Math.min(gang.x1, P.x)), cz = Math.max(gang.z0, Math.min(gang.z1, P.z));
      if (Math.hypot(cx - P.x, cz - P.z) > 120) continue;
      if (list.filter(h => h.role === 'gang' && h.gang === gang.id).length >= 7) continue;
      const x = gang.id === 'kings' ? 815 + Math.random() * 30 : cx + (Math.random() - 0.5) * 160, z = cz + (Math.random() - 0.5) * 160;
      if (!gangAt(x, z) && gang.id !== 'kings') continue;
      for (let i = 0; i < 3; i++) spawn({ role: 'gang', gang: gang.id, x: x + (Math.random() - 0.5) * 6, z: Math.max(gang.z0, Math.min(gang.z1, z)) + (Math.random() - 0.5) * 6, shirt: gang.shirt, pants: '#151515', health: 70, state: 'walk' });
    }
  }

  function limb(mesh, i, a, y, z, angle) {
    L.makeTranslation(0, y, z).multiply(R.makeRotationZ(angle));
    mesh.setMatrixAt(i, T.multiplyMatrices(M, L));
  }

  return {
    list, spawn, remove, hurt, flee, panicAround, cityPed,
    update(dt) {
      if ((spawnTimer -= dt) <= 0) { spawnTimer = 0.5; populate(); }
      vehicleHits();
      for (let i = list.length - 1; i >= 0; i--) if (list[i].role !== 'player' && list[i]) think(list[i], dt);
      const p = G.player.human;
      if (p && (p.state === 'down' || p.state === 'dead')) think(p, dt);
    },
    render() {
      let n = 0;
      gun.visible = bat.visible = false;
      for (const h of list) {
        if (!h.visible) continue;
        if (h.matrix) M.copy(h.matrix);
        else M.makeTranslation(h.x, h.y + h.fall * 0.15, h.z).multiply(R.makeRotationY(h.yaw)).multiply(L.makeRotationZ(h.fall * Math.PI / 2));
        torso.setMatrixAt(n, M); head.setMatrixAt(n, M);
        h.phase += (h.speed || 0) * 0.016 * 3.2;
        const run = Math.min(1, (h.speed || 0) / 4), sw = Math.sin(h.phase) * (0.35 + 0.45 * run) * Math.min(1, (h.speed || 0) * 2);
        let la = sw, ra = -sw, ll = -sw, rl = sw;
        if (h.state === 'down' || h.state === 'dead') { la = 1.2; ra = -1.2; ll = 0.15; rl = -0.15; }
        if (h.ride) { ll = rl = 1.3; la = ra = 1.0; }
        if (h.pose === 'aim') ra = 1.5;
        limb(arms, n * 2, 0, HUMAN.shoulder, -HUMAN.shoulderZ, la);
        limb(arms, n * 2 + 1, 0, HUMAN.shoulder, HUMAN.shoulderZ, ra);
        limb(legs, n * 2, 0, HUMAN.hip, -HUMAN.hipZ, ll);
        limb(legs, n * 2 + 1, 0, HUMAN.hip, HUMAN.hipZ, rl);
        torso.setColorAt(n, C.set(h.shirt)); head.setColorAt(n, C.set(h.skin));
        arms.setColorAt(n * 2, C.set(h.shirt)); arms.setColorAt(n * 2 + 1, C.set(h.shirt));
        legs.setColorAt(n * 2, C.set(h.pants)); legs.setColorAt(n * 2 + 1, C.set(h.pants));
        if (h.role === 'player' && !h.ride && h.state !== 'down') {
          const w = G.player.weapon;
          const item = w === 'pistol' || w === 'smg' ? gun : w === 'bat' ? bat : null;
          if (item) {
            L.makeTranslation(0, HUMAN.shoulder, HUMAN.shoulderZ).multiply(R.makeRotationZ(ra)).multiply(T.makeTranslation(0, -0.62, 0));
            item.matrixAutoUpdate = false;
            item.matrix.multiplyMatrices(M, L);
            if (item === bat) item.matrix.multiply(R.makeRotationZ(Math.PI / 2 - 0.3)).multiply(T.makeTranslation(0, 0.35, 0));
            else item.matrix.multiply(T.makeTranslation(0.1, 0, 0));
            item.visible = true;
          }
        }
        n++;
      }
      for (const m of [torso, head]) m.count = n;
      for (const m of [arms, legs]) m.count = n * 2;
      for (const m of [torso, head, arms, legs]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    },
  };
}
