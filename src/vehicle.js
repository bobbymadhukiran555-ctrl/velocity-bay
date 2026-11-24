// One drivable vehicle (car or bike): Rapier ray-cast physics + its mesh. Players and AI drive it through the same input.
import * as THREE from 'three';
import { rpmFromSpeed, driveForce, autoShift, GEARS, REDLINE, IDLE, gearLabel } from './logic/gearbox.js';
import { heightAt } from './logic/map.js';
import { MODELS, tunedStats, NO_UPGRADES } from './logic/vehicles.js';
import { buildVehicleMesh } from './models.js';

// Collision groups: people (the character capsule) never touch vehicle bodies; cars hit people through game logic instead.
export const GROUP = { VEHICLE: (0x0002 << 16) | 0xfffb, CHAR: (0x0004 << 16) | 0xfffd };

let nextId = 1;
const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
const yawQ = h => ({ x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) });

export function createVehicle(G, { model = 'vanta', color = '#b3122e', pos, heading = 0, up = NO_UPGRADES, role = 'traffic' }) {
  const { RAPIER, world, scene } = G, spec = MODELS[model], bike = spec.kind === 'bike', plane = spec.kind === 'plane';
  const k = spec.mass / 1300, R = spec.wheelR;
  const view = buildVehicleMesh(model, color);
  scene.add(view.root);
  const bodyY = view.parts.bodyY;

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setRotation(yawQ(heading))
      .setAdditionalMassProperties(450 * k, { x: 0, y: -0.3, z: 0 }, bike ? { x: 30, y: 90, z: 90 } : { x: 120 * k, y: 420 * k, z: 400 * k }, { x: 0, y: 0, z: 0, w: 1 })
      .setLinearDamping(0.02).setAngularDamping(bike ? 1.2 : 0.4).setCanSleep(false).setCcdEnabled(true));
  const hx = spec.len / 2 - 0.1, hz = spec.width / 2 - 0.05;
  const colliders = [
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, 0.28, bike ? 0.22 : hz).setMass(760 * k).setFriction(0.4).setRestitution(0.1).setCollisionGroups(GROUP.VEHICLE), body),
  ];
  if (!bike && !plane) colliders.push(world.createCollider(RAPIER.ColliderDesc.cuboid(hx * 0.43, 0.2 + (view.parts.roof - 1.32) * 0.5, hz * 0.82)
    .setTranslation(-0.2, 0.5 + (view.parts.roof - 1.32) * 0.5, 0).setMass(90 * k).setFriction(0.4).setCollisionGroups(GROUP.VEHICLE), body));

  const ctl = world.createVehicleController(body);
  const wheelPos = [[spec.axles[0], -spec.track], [spec.axles[0], spec.track], [spec.axles[1], -spec.track], [spec.axles[1], spec.track]];
  wheelPos.forEach(([x, z], i) => {
    ctl.addWheel({ x, y: 0, z }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, 0.35, R); // axle +z => drive direction +x
    ctl.setWheelSuspensionStiffness(i, bike ? 40 : 32);
    ctl.setWheelSuspensionCompression(i, 3.2);
    ctl.setWheelSuspensionRelaxation(i, 3.8);
    ctl.setWheelMaxSuspensionTravel(i, 0.28);
    ctl.setWheelMaxSuspensionForce(i, 1e5 * Math.max(1, k));
    ctl.setWheelSideFrictionStiffness(i, 1);
  });

  let stats = tunedStats(model, up);
  const state = {
    gear: 2, gearMode: 'auto', rpm: IDLE, speed: 0, nitro: 1, nitroOn: false, slip: 0, steer: 0, braking: false, throttle: 0,
    headlightsOn: false, siren: false, horn: false, thr: 0, slipAngle: 0,
  };
  const v = {
    id: nextId++, model, spec, role, body, colliders, ctl, mesh: view.root, view, state, up: { ...up }, color,
    health: 1, dead: false, burning: 0, exploded: false, tiresPopped: false, ai: null, impact: null, driverInside: role !== 'parked' && role !== 'abandoned',
    airTime: 0, onGround: true, lastHitBy: null,
  };
  if (plane) { v.camDist = spec.len * 1.35 + 4; v.camHeight = spec.height + 1.2; }

  const prev = { p: new THREE.Vector3(), q: new THREE.Quaternion() }, cur = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  const lastVel = new THREE.Vector3();
  v.snap = () => {
    prev.p.copy(cur.p); prev.q.copy(cur.q);
    const t = body.translation(), r = body.rotation();
    cur.p.set(t.x, t.y, t.z); cur.q.set(r.x, r.y, r.z, r.w);
    // Crash detection: a sudden change of horizontal velocity that brakes and grip can't produce.
    const lv = body.linvel(), dvx = lv.x - lastVel.x, dvz = lv.z - lastVel.z, dv = Math.hypot(dvx, dvz);
    if (dv > 1.3 && !v.ignoreImpacts) {
      const s = dv - 1.3;
      v.impact = { strength: (v.impact?.strength || 0) + s, dx: dvx / dv, dz: dvz / dv, x: t.x, y: t.y, z: t.z };
      v.damage(s * 0.03, dvx / dv, dvz / dv);
    }
    lastVel.set(lv.x, lv.y, lv.z);
  };
  v.snap(); v.snap();

  function localVelocity() {
    const lv = body.linvel(), r = body.rotation();
    tmpQ.set(r.x, r.y, r.z, r.w).invert();
    return tmpV.set(lv.x, lv.y, lv.z).applyQuaternion(tmpQ);
  }
  v.maxSteer = () => 0.58 / (1 + Math.abs(state.speed) / 22);

  // Arcade flight: W/S throttle lever, A/D bank and turn, Space climb, Shift dive. Wheels still carry it on the ground.
  const fwdW = new THREE.Vector3(), upW = new THREE.Vector3(), rightW = new THREE.Vector3(), wl = new THREE.Vector3();
  function stepPlane(dt, input, env) {
    const lv = localVelocity(), fwd = lv.x, M = body.mass(), g = 9.81;
    state.speed = fwd;
    const off = input.hold || v.dead;
    state.thr = off ? 0 : Math.min(1, Math.max(0, state.thr + (input.throttle - input.brake) * dt * 0.7));
    state.throttle = state.thr;
    state.rpm = IDLE + state.thr * 5200;
    state.nitroOn = false; state.slip = 0;
    const q = Math.max(0, fwd) / spec.stall, lift01 = Math.min(1, q * q), air = Math.min(1, q);
    const r = body.rotation(); tmpQ.set(r.x, r.y, r.z, r.w);
    fwdW.set(1, 0, 0).applyQuaternion(tmpQ); upW.set(0, 1, 0).applyQuaternion(tmpQ); rightW.set(0, 0, 1).applyQuaternion(tmpQ);
    // Forces: thrust along the nose, lift along the wings' up, wings resist sideways/vertical slip (turns velocity toward the nose), drag.
    const thrust = state.thr * spec.thrust * M * env.power * (0.5 + 0.5 * v.health);
    const lift = M * g * lift01 * (v.dead ? 0.3 : 1);
    const lin = body.linvel(), v2 = lin.x * lin.x + lin.y * lin.y + lin.z * lin.z, vl = Math.sqrt(v2) || 1;
    const grip = M * 2.2 * air;
    const F = wl.copy(fwdW).multiplyScalar(thrust).addScaledVector(upW, lift - grip * lv.y).addScaledVector(rightW, -grip * lv.z);
    F.x -= (spec.drag * M * v2 * lin.x) / vl; F.y -= (spec.drag * M * v2 * lin.y) / vl; F.z -= (spec.drag * M * v2 * lin.z) / vl;
    body.resetForces(true);
    body.addForce({ x: F.x, y: F.y, z: F.z }, true);

    // Ground: nose-wheel steering and brakes.
    state.steer += Math.max(-dt * 3, Math.min(dt * 3, -input.steer * 0.5 / (1 + Math.abs(fwd) / 10) - state.steer));
    ctl.setWheelSteering(0, state.steer); ctl.setWheelSteering(1, state.steer);
    state.braking = input.brake > 0 && v.onGround;
    for (let i = 0; i < 4; i++) {
      ctl.setWheelEngineForce(i, 0);
      ctl.setWheelBrake(i, state.braking || off ? 40 * k : 0.15 * k);
      ctl.setWheelFrictionSlip(i, 2.2);
    }
    ctl.updateVehicle(dt, undefined, GROUP.VEHICLE);
    let contact = 0;
    for (let i = 0; i < 4; i++) if (ctl.wheelIsInContact(i)) contact++;
    v.onGround = contact > 0;
    v.airTime = contact ? 0 : v.airTime + dt;

    // Rotation: steer the angular velocity toward what the stick asks for (scaled by airspeed).
    const pitchIn = (input.handbrake ? 1 : 0) - (input.nitro ? 1 : 0);
    if (v.dead) return;
    if (!v.onGround) {
      const bank = -rightW.y; // + = banked right
      // Fly to an angle, not a rate: bank up to ~55°, climb ~28°, dive ~32°, and drift back to level when you let go.
      const clamp1 = x => Math.max(-1.6, Math.min(1.6, x));
      const wx = clamp1((input.steer * 0.82 - bank) * 3);
      const pitch = Math.asin(Math.max(-1, Math.min(1, fwdW.y)));
      const wz = clamp1(((pitchIn > 0 ? 0.5 : pitchIn < 0 ? -0.55 : pitch * 0.6) - pitch) * 2.2);
      const turn = -bank * 1.35 * air;
      wl.set(wx * air + 0.3 * input.steer * (1 - air), 0, wz * air).applyQuaternion(tmpQ);
      wl.y += turn;
      if (air < 0.85) wl.addScaledVector(rightW, -(1 - air) * 0.6); // stall: the nose drops
      const av = body.angvel(), b = Math.min(1, dt * 6);
      body.setAngvel({ x: av.x + (wl.x - av.x) * b, y: av.y + (wl.y - av.y) * b, z: av.z + (wl.z - av.z) * b }, true);
    } else if (pitchIn > 0 && q > 0.8) { // rotate for take-off
      const av = body.angvel(); wl.copy(rightW).multiplyScalar(0.45);
      body.setAngvel({ x: av.x + wl.x * dt * 8, y: av.y, z: av.z + wl.z * dt * 8 }, true);
    }
  }

  // env: { grip, power, infiniteNitro } from weather and mods.
  v.step = (dt, input, env) => {
    if (plane) return stepPlane(dt, input, env);
    const lv = localVelocity();
    const fwd = lv.x, speed = Math.hypot(lv.x, lv.z);
    state.speed = fwd;
    let throttle = input.throttle, brake = input.brake;
    const hold = input.hold || v.dead; // brakes on without dropping into reverse
    if (hold) { throttle = 0; brake = v.dead ? 0.3 : 1; if (state.gear === 0) state.gear = 2; }
    else if (state.gearMode === 'auto') {
      if (state.gear >= 2 && brake > 0 && fwd < 0.8) state.gear = 0;
      else if (state.gear === 0 && throttle > 0 && fwd > -0.8) state.gear = 2;
      else if (state.gear === 1 && throttle > 0) state.gear = 2;
      if (state.gear === 0) [throttle, brake] = [brake, throttle];
    } else {
      if (input.shiftUp && state.gear < GEARS.length - 1) state.gear++;
      if (input.shiftDown && state.gear > 0) state.gear--;
    }
    const wheelRpm = rpmFromSpeed(fwd, state.gear, R);
    const launch = state.gear !== 1 && Math.abs(fwd) < 6 ? IDLE + throttle * 3400 * (1 - Math.abs(fwd) / 6) : 0;
    const free = state.gear === 1 ? IDLE + throttle * (REDLINE - IDLE) : 0;
    state.rpm = Math.min(REDLINE + 150, Math.max(wheelRpm, launch, free, IDLE));
    if (state.gearMode === 'auto') state.gear = autoShift(state.gear, state.rpm, throttle, fwd);

    state.nitroOn = input.nitro && state.nitro > 0 && throttle > 0 && state.gear >= 2;
    if (!env.infiniteNitro) state.nitro = Math.min(1, Math.max(0, state.nitro + (state.nitroOn ? -dt / stats.nitroSecs : dt / 20)));
    const health = 0.6 + 0.4 * v.health;
    let force = driveForce(state.rpm, state.gear, throttle, R) * stats.power * env.power * health * (state.nitroOn ? stats.nitroBoost : 1) * (v.tiresPopped ? 0.6 : 1);
    if (state.gear === 0 && fwd < -10) force = 0;
    state.throttle = throttle;

    const target = -input.steer * v.maxSteer();
    state.steer += Math.max(-dt * 3.2, Math.min(dt * 3.2, target - state.steer));
    ctl.setWheelSteering(0, state.steer);
    ctl.setWheelSteering(1, state.steer);

    state.braking = brake > 0;
    if (state.braking) force = 0;
    // Loose ground costs grip and drags the car down; tarmac lets it coast.
    const loose = (env.surface ?? 1) < 0.9;
    const coast = throttle === 0 && !state.braking ? (loose ? 4 : 1.2) * k : 0, grip = stats.grip * env.grip * (v.tiresPopped ? 0.45 : 1);
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      ctl.setWheelEngineForce(i, front ? 0 : force / 2);
      let b = brake * (front ? 75 : 45) * k + coast;
      if (!front && input.handbrake) b = 18 * k;
      ctl.setWheelBrake(i, b);
      ctl.setWheelFrictionSlip(i, (front ? 2.5 : input.handbrake ? 1.35 : 2.3) * grip);
    }

    // Drift assist: let the rear slide but damp yaw beyond what the steering asks for.
    const av = body.angvel(), wantYaw = (fwd / (spec.axles[0] - spec.axles[1])) * Math.tan(state.steer);
    const err = av.y - wantYaw, band = input.handbrake ? 0.8 : 0.45;
    const excess = Math.sign(err) * Math.max(0, Math.abs(err) - band);
    if (excess && speed > 4) body.applyTorqueImpulse({ x: 0, y: -excess * 2900 * k * dt * 8, z: 0 }, true);

    if (bike) {
      // Keep the bike upright (the lean is only drawn), like a rider balancing.
      const r = body.rotation(); tmpQ.set(r.x, r.y, r.z, r.w);
      const f = tmpV2.set(1, 0, 0).applyQuaternion(tmpQ), right = new THREE.Vector3(0, 0, 1).applyQuaternion(tmpQ);
      const tq = (19000 * right.y - 1400 * (av.x * f.x + av.y * f.y + av.z * f.z)) * dt;
      body.applyTorqueImpulse({ x: f.x * tq, y: f.y * tq, z: f.z * tq }, true);
    }

    const lin = body.linvel(), v2 = lin.x * lin.x + lin.y * lin.y + lin.z * lin.z, vl = Math.sqrt(v2) || 1;
    body.resetForces(true);
    body.addForce({ x: (-spec.drag * v2 * lin.x) / vl, y: (-spec.drag * v2 * lin.y) / vl - 0.9 * k * v2, z: (-spec.drag * v2 * lin.z) / vl }, true);

    ctl.updateVehicle(dt, undefined, GROUP.VEHICLE);
    state.slip = speed > 3 ? Math.min(1, (Math.abs(lv.z) / Math.max(6, speed)) * 2.2 + (state.rpm > wheelRpm * 1.35 && throttle > 0.6 ? 0.35 : 0)) : 0;
    state.slipAngle = speed > 3 ? Math.atan2(lv.z, Math.abs(lv.x)) : 0;
    let contact = 0;
    for (let i = 0; i < 4; i++) if (ctl.wheelIsInContact(i)) contact++;
    v.onGround = contact > 0;
    v.airTime = contact ? 0 : v.airTime + dt;
  };

  let flash = 0;
  v.render = (alpha, dt = 0) => {
    view.root.position.lerpVectors(prev.p, cur.p, alpha);
    view.root.quaternion.slerpQuaternions(prev.q, cur.q, alpha);
    view.wheels.forEach((w, i) => {
      const pi = bike ? i * 2 : i;
      w.steer.position.y = -(ctl.wheelSuspensionLength(pi) ?? 0.3);
      w.steer.rotation.y = ctl.wheelSteering(pi) ?? 0;
      w.spin.rotation.z = ctl.wheelRotation(pi) ?? 0;
    });
    if (view.prop) view.prop.rotation.x += dt * (8 + state.thr * 55);
    if (bike) view.lean.rotation.x += (Math.max(-0.6, Math.min(0.6, -state.steer * Math.max(0, state.speed) * 0.09)) - view.lean.rotation.x) * 0.2;
    view.tailMat.emissiveIntensity = state.braking ? 3 : state.headlightsOn ? 1 : 0.3;
    view.headMat.emissiveIntensity = state.headlightsOn ? 4 : 0.4;
    if (view.bar) {
      flash += dt;
      const on = state.siren && Math.floor(flash * 6) % 2 === 0;
      view.bar.r.color.setHex(state.siren ? (on ? 0xff2020 : 0x330000) : 0x330000);
      view.bar.b.color.setHex(state.siren ? (!on ? 0x2060ff : 0x000033) : 0x000033);
    }
  };

  // Dent the body where it was hit: push nearby vertices inward. The mesh gets its own geometry on the first dent.
  let ownGeo = false;
  v.damage = (amount, dirX = 0, dirZ = 0) => {
    if (v.god || amount <= 0 || v.exploded) return;
    v.health = Math.max(0, v.health - amount * stats.damageTaken);
    if (v.health === 0 && !v.dead) { v.dead = true; v.burning = 6; }
    if (!dirX && !dirZ) return;
    if (!ownGeo) { view.paint.geometry = view.paint.geometry.clone(); ownGeo = true; }
    const r = body.rotation(); tmpQ.set(r.x, r.y, r.z, r.w).invert();
    const d = tmpV.set(dirX, 0, dirZ).applyQuaternion(tmpQ); // velocity change in car space; the hit came from the opposite side
    const cx = -d.x * spec.len * 0.5, cz = -d.z * spec.width * 0.5, cy = view.parts.impactY - bodyY;
    const pos = view.paint.geometry.attributes.position, dent = Math.min(0.35, amount * 2.5);
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - cx, dy = pos.getY(i) - cy, dz = pos.getZ(i) - cz, dist = Math.sqrt(dx * dx + dy * dy * 2 + dz * dz);
      if (dist > 1.1) continue;
      const f = (1 - dist / 1.1) ** 2 * dent;
      pos.setXYZ(i, pos.getX(i) + d.x * f, pos.getY(i) - f * 0.25, pos.getZ(i) + d.z * f);
    }
    pos.needsUpdate = true;
    view.paint.geometry.computeVertexNormals();
  };
  v.repair = () => {
    v.health = 1; v.dead = false; v.burning = 0; v.exploded = false; v.tiresPopped = false;
    if (ownGeo) { view.paint.geometry.dispose(); view.paint.geometry = view.parts.paint; ownGeo = false; }
    view.paintMat.color.set(v.color); view.paintMat.roughness = 0.32;
  };
  v.setColor = c => { v.color = c; if (!v.exploded) view.paintMat.color.set(c); };
  v.setUpgrades = u => { v.up = { ...u }; stats = tunedStats(model, u); };
  v.burn = () => { view.paintMat.color.set(0x161616); view.paintMat.roughness = 1; view.paintMat.clearcoat = 0; };

  v.reset = (x, z, h, y = heightAt(x, z) + 1.2) => {
    body.setTranslation({ x, y, z }, true);
    body.setRotation(yawQ(h), true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    state.steer = 0;
    lastVel.set(0, 0, 0);
    v.snap(); v.snap();
  };
  v.setVelocity = (x, y, z) => { body.setLinvel({ x, y, z }, true); lastVel.set(x, y, z); };
  v.remove = () => {
    world.removeVehicleController(ctl);
    world.removeRigidBody(body);
    scene.remove(view.root);
    view.paintMat.dispose(); view.headMat.dispose(); view.tailMat.dispose();
    if (ownGeo) view.paint.geometry.dispose();
    v.removed = true;
  };

  const up3 = new THREE.Vector3(), bodyQ = new THREE.Quaternion();
  const rot = () => { const r = body.rotation(); return bodyQ.set(r.x, r.y, r.z, r.w); };
  Object.defineProperties(v, {
    speedKmh: { get: () => Math.abs(state.speed) * 3.6 },
    gearText: { get: () => plane ? `${Math.round(state.thr * 100)}% · ${v.altitude}m` : gearLabel(state.gear) },
    altitude: { get: () => { const t = body.translation(); return Math.max(0, Math.round(t.y - heightAt(t.x, t.z) - 1)); } },
    heading: { get: () => { const f = up3.set(1, 0, 0).applyQuaternion(rot()); return Math.atan2(-f.z, f.x); } },
    upY: { get: () => up3.set(0, 1, 0).applyQuaternion(rot()).y },
    pos: { get: () => body.translation() },
  });
  // World position of wheel i's contact patch (for skid marks and smoke).
  v.wheelWorld = (i, out) => {
    const [x, z] = wheelPos[i];
    return out.set(x, -(ctl.wheelSuspensionLength(i) ?? 0.3) - R + 0.04, z).applyQuaternion(view.root.quaternion).add(view.root.position);
  };
  v.wheelContact = i => ctl.wheelIsInContact(i);
  return v;
}
