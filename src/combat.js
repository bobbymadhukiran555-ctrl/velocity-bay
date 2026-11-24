// Weapons, shooting (player, drive-by, cops, gangs) and explosions. Cartoon level: people fall over, no gore.
import * as THREE from 'three';
import { GROUP } from './vehicle.js';

export const WEAPONS = {
  fists:  { name: 'Fists',  melee: true, range: 1.9, dmg: 35, rate: 2.5 },
  bat:    { name: 'Bat',    melee: true, range: 2.5, dmg: 75, rate: 1.7, price: 60 },
  pistol: { name: 'Pistol', range: 70, dmg: 34, rate: 3.2, spread: 0.025, price: 300, ammoPack: 36, ammoPrice: 60 },
  smg:    { name: 'SMG',    range: 55, dmg: 16, rate: 11, spread: 0.06, price: 900, ammoPack: 120, ammoPrice: 120 },
};
export const WEAPON_ORDER = ['fists', 'bat', 'pistol', 'smg'];

export function createCombat(G) {
  const { RAPIER, world, scene } = G;
  // Tracers: short-lived line segments.
  const N = 48, pos = new Float32Array(N * 6), life = new Float32Array(N);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.85 }));
  tracers.frustumCulled = false;
  scene.add(tracers);
  let tc = 0, cool = 0, lastShootCrime = -9;

  function tracer(a, b) {
    const i = tc; tc = (tc + 1) % N;
    pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6); life[i] = 0.07;
    tg.attributes.position.needsUpdate = true;
  }

  // First thing a ray hits: a person (analytic capsule) or the world (Rapier). Returns { t, human?, vehicle?, point }.
  function trace(o, d, range, skipHuman, excludeBody) {
    let best = { t: range };
    const ray = new RAPIER.Ray(o, d);
    const hit = world.castRay(ray, range, true, undefined, GROUP.VEHICLE, undefined, excludeBody); // people are tested below, not their capsule
    if (hit) {
      const t = hit.timeOfImpact ?? hit.toi;
      if (t < best.t) best = { t, vehicle: G.fleet.byBody.get(hit.collider.parent()?.handle) };
    }
    for (const h of G.humans.list) {
      if (h === skipHuman || !h.visible || h.state === 'dead' || h.ride) continue;
      const cx = h.x - o.x, cy = h.y + 1 - o.y, cz = h.z - o.z, t = cx * d.x + cy * d.y + cz * d.z;
      if (t <= 0 || t >= best.t) continue;
      const px = o.x + d.x * t - h.x, py = o.y + d.y * t - h.y, pz = o.z + d.z * t - h.z;
      const down = h.state === 'down';
      if (px * px + pz * pz < (down ? 0.8 : 0.17) && py > -0.1 && py < (down ? 0.6 : 1.85)) best = { t, human: h };
    }
    best.point = { x: o.x + d.x * best.t, y: o.y + d.y * best.t, z: o.z + d.z * best.t };
    return best;
  }

  function sparks(p, color = 0xffd080) {
    for (let i = 0; i < 4; i++) G.glow.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 0.08, 0, 0.25, color, 1);
    G.smoke.emit(p.x, p.y, p.z, 0, 0.5, 0, 0.3, 1.2, 0.6, 0xbbbbbb, 0.25);
  }

  function applyHit(res, dmg, byPlayer, from) {
    if (res.human) {
      const h = res.human, dx = h.x - from.x, dz = h.z - from.z, L = Math.hypot(dx, dz) || 1;
      const wasCop = h.role === 'cop', wasGang = h.role === 'gang';
      const killed = G.humans.hurt(h, dmg, dmg >= 30 ? { x: (dx / L) * 3, y: 2.5, z: (dz / L) * 3 } : null, byPlayer ? 'player' : null);
      G.glow.emit(res.point.x, res.point.y, res.point.z, 0, 0.4, 0, 0.22, 0, 0.1, 0xffb070, 0.5);
      if (byPlayer) {
        G.wanted.crime(wasCop ? (killed ? 'killCop' : 'hitCop') : wasGang ? 'gang' : killed ? 'killPed' : 'hitPed');
        if (killed) G.onKill?.(h);
      }
    } else if (res.vehicle) {
      const v = res.vehicle;
      v.damage(dmg * 0.0015);
      if (byPlayer) {
        if (v.spec.police) G.wanted.crime('hitCop', 0.3);
        if (v.ai?.type === 'lane') { v.ai.speedMul = 1.7; v.ai.ignoreLights = true; }
      }
      sparks(res.point);
    } else if (res.t < 200) sparks(res.point, 0xcccccc);
  }

  // Best target in front of the shooter (people first, then police cars when wanted).
  function autoAim(o, yaw, range, cone, anyDir) {
    let best = null, bs = Infinity;
    const fx = Math.cos(yaw), fz = -Math.sin(yaw);
    const consider = (x, y, z, w, ref) => {
      const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz);
      if (d > range || d < 0.5 || G.rayBlocked(o.x, o.y, o.z, x, y, z)) return;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d)));
      if (!anyDir && ang > cone) return;
      const score = d * (1 + ang) * w;
      if (score < bs) { bs = score; best = { x, y, z, ref }; }
    };
    for (const h of G.humans.list) {
      if (h.role === 'player' || !h.visible || h.state === 'dead') continue;
      const hostile = (h.role === 'cop' && G.wanted.stars > 0) || (h.role === 'gang' && h.hostile);
      consider(h.x, h.y + (h.state === 'down' ? 0.25 : 1.2), h.z, hostile ? 0.25 : 1, h);
    }
    if (G.wanted.stars > 0) for (const v of G.fleet.list) if (v.spec.police && !v.dead) { const p = v.body.translation(); consider(p.x, p.y + 0.3, p.z, 0.8, v); }
    return best;
  }

  function playerFire() {
    const P = G.player, w = WEAPONS[P.weapon];
    if (cool > 0 || P.dead) return;
    const inCar = P.mode === 'car';
    if (inCar && w.melee) return;
    if (!w.melee && P.weapons[P.weapon] <= 0 && !G.mods.infAmmo) { G.hud.toast('Out of ammo'); cool = 0.4; return; }
    cool = 1 / w.rate;
    const h = P.human;
    if (w.melee) {
      // Swing: hit the closest person in front.
      let tgt = null, bd = w.range;
      for (const o of G.humans.list) {
        if (o === h || !o.visible || o.state === 'dead') continue;
        const dx = o.x - h.x, dz = o.z - h.z, d = Math.hypot(dx, dz);
        if (d < bd && (dx * Math.cos(P.yaw) - dz * Math.sin(P.yaw)) / (d || 1) > 0.4) { bd = d; tgt = o; }
      }
      h.pose = 'aim'; setTimeout(() => (h.pose = null), 180);
      G.audio?.swing();
      if (tgt) { applyHit({ human: tgt, point: tgt }, w.dmg, true, h); G.audio?.thud(tgt); }
      return;
    }
    if (!G.mods.infAmmo) P.weapons[P.weapon]--;
    let o, yaw;
    if (inCar) { const p = P.vehicle.body.translation(); o = { x: p.x, y: p.y + 1.1, z: p.z }; yaw = P.vehicle.heading; }
    else { o = { x: h.x + Math.cos(P.yaw) * 0.5, y: h.y + 1.35, z: h.z - Math.sin(P.yaw) * 0.5 }; yaw = P.yaw; h.pose = 'aim'; clearTimeout(h.poseT); h.poseT = setTimeout(() => (h.pose = null), 400); }
    const tgt = autoAim(o, yaw, w.range, 0.7, inCar);
    let d;
    if (tgt) { d = new THREE.Vector3(tgt.x - o.x, tgt.y - o.y, tgt.z - o.z).normalize(); }
    else if (inCar) d = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)); // no target: fire out of the left window
    else d = new THREE.Vector3(Math.cos(yaw), -0.02, -Math.sin(yaw));
    d.x += (Math.random() - 0.5) * w.spread * 2; d.y += (Math.random() - 0.5) * w.spread; d.z += (Math.random() - 0.5) * w.spread * 2;
    d.normalize();
    const res = trace(o, d, w.range, h, inCar ? P.vehicle.body : undefined);
    tracer(o, res.point);
    G.glow.emit(o.x + d.x * 0.4, o.y + d.y * 0.4, o.z + d.z * 0.4, 0, 0, 0, 0.5, 0, 0.05, 0xffd27a, 1);
    G.audio?.gun(P.weapon, 0);
    G.rig?.kick(P.weapon === 'smg' ? 0.035 : 0.07);
    applyHit(res, w.dmg, true, o);
    if (G.clock - lastShootCrime > 1.5) { lastShootCrime = G.clock; G.wanted.crime('shoot'); G.humans.panicAround(o.x, o.z, 45); }
  }

  // Cops and gang members shoot at the player. They miss a lot.
  function npcFire(h, tgt) {
    const o = { x: h.x + Math.cos(h.yaw) * 0.4, y: h.y + 1.35, z: h.z - Math.sin(h.yaw) * 0.4 };
    const d = new THREE.Vector3(tgt.x - o.x, tgt.y - o.y, tgt.z - o.z), dist = d.length();
    d.normalize();
    // Accuracy falls off with range and rises with heat; still never a laser.
    const hitChance = Math.max(0.2, Math.min(0.55, 0.58 - dist * 0.012 + (tgt.vehicle ? 0.05 : 0) + G.wanted.stars * 0.03));
    const miss = Math.random() > hitChance;
    if (miss) { d.x += (Math.random() - 0.5) * 0.2; d.y += Math.random() * 0.08; d.z += (Math.random() - 0.5) * 0.2; d.normalize(); }
    const res = trace(o, d, 60, h);
    tracer(o, res.point);
    G.audio?.gun('pistol', dist);
    const P = G.player;
    if (res.human === P.human && P.mode === 'foot') P.hurt(9);
    else if (res.vehicle && res.vehicle === P.vehicle) { res.vehicle.damage(0.012); if (Math.random() < 0.35) P.hurt(4); sparks(res.point); }
    else if (res.human && res.human.role === 'ped') G.humans.hurt(res.human, 20);
    else sparks(res.point, 0xcccccc);
  }

  function explode(x, y, z, source) {
    for (let i = 0; i < 40; i++) G.glow.emit(x, y + 0.5, z, (Math.random() - 0.5) * 14, Math.random() * 10, (Math.random() - 0.5) * 14, 1.4, 2, 0.7, Math.random() < 0.5 ? 0xff7a1a : 0xffc040, 1);
    for (let i = 0; i < 25; i++) G.smoke.emit(x, y + 1, z, (Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6, 2.5, 4, 4, 0x222222, 0.7, 0.6);
    G.audio?.boom(Math.hypot(x - G.focus.x, z - G.focus.z));
    G.rig?.kick(Math.max(0, 1 - Math.hypot(x - G.focus.x, z - G.focus.z) / 60));
    const R = 9;
    for (const v of G.fleet.list) {
      if (v === source) continue;
      const p = v.body.translation(), d = Math.hypot(p.x - x, p.y - y, p.z - z);
      if (d > R) continue;
      const f = 1 - d / R;
      v.damage(f * 0.7);
      v.body.applyImpulse({ x: ((p.x - x) / (d || 1)) * v.spec.mass * 6 * f, y: v.spec.mass * 5 * f, z: ((p.z - z) / (d || 1)) * v.spec.mass * 6 * f }, true);
    }
    for (const h of G.humans.list) {
      const d = Math.hypot(h.x - x, h.z - z);
      if (d > R || h.state === 'dead' || h.ride) continue;
      const f = 1 - d / R;
      G.humans.hurt(h, 130 * f, { x: ((h.x - x) / (d || 1)) * 8 * f, y: 5 * f + 2, z: ((h.z - z) / (d || 1)) * 8 * f });
    }
  }

  return {
    playerFire, npcFire, explode, autoAim,
    update(dt) {
      cool -= dt;
      let any = false;
      for (let i = 0; i < N; i++) if (life[i] > 0 && (life[i] -= dt) <= 0) { pos.fill(0, i * 6, i * 6 + 6); any = true; }
      if (any) tg.attributes.position.needsUpdate = true;
    },
  };
}
