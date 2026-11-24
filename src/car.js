import * as THREE from 'three';
import { rpmFromSpeed, driveForce, autoShift, GEARS, REDLINE, IDLE, gearLabel } from './logic/gearbox.js';
import { heightAt } from './logic/map.js';

const WHEEL_R = 0.34;
const BODY_Y = 0.62; // body origin height above the ground in the mesh frame
// Chassis frame: forward = +x, up = +y, right = +z. Wheels: 0 FL, 1 FR, 2 RL, 3 RR.
const WHEELS = [[1.4, -0.8], [1.4, 0.8], [-1.35, -0.8], [-1.35, 0.8]];

function carMesh(color) {
  const root = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0b1118, metalness: 0.2, roughness: 0.05, clearcoat: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.7 });

  const s = new THREE.Shape();
  s.moveTo(2.25, 0.32); s.lineTo(1.86, 0.32);
  s.absarc(1.4, 0.34, 0.46, 0, Math.PI, false);
  s.lineTo(-0.89, 0.3);
  s.absarc(-1.35, 0.34, 0.46, 0, Math.PI, false);
  s.lineTo(-2.25, 0.36); s.lineTo(-2.3, 0.62); s.lineTo(-2.2, 0.9); s.lineTo(-1.3, 0.95);
  s.lineTo(1.0, 0.95); s.lineTo(2.05, 0.8); s.lineTo(2.3, 0.62); s.lineTo(2.25, 0.32);
  const ext = (shape, depth, bevel, mat) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 14 });
    g.translate(0, -BODY_Y, -depth / 2);
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
    root.add(m); return m;
  };
  ext(s, 1.74, 0.08, paint);
  const cabin = new THREE.Shape();
  cabin.moveTo(-1.3, 0.93); cabin.lineTo(-0.7, 1.3); cabin.lineTo(0.25, 1.32); cabin.lineTo(1.02, 0.93); cabin.lineTo(-1.3, 0.93);
  ext(cabin, 1.46, 0.05, glass);
  const roof = new THREE.Shape();
  roof.moveTo(-0.72, 1.29); roof.lineTo(0.27, 1.31); roof.lineTo(0.24, 1.36); roof.lineTo(-0.68, 1.34); roof.lineTo(-0.72, 1.29);
  ext(roof, 1.4, 0.04, paint);

  const lamp = (x, y, z, w, h, color) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, w), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 0.4 }));
    m.position.set(x, y - BODY_Y, z); root.add(m); return m;
  };
  const heads = [lamp(2.27, 0.66, -0.62, 0.38, 0.1, 0xfff4dd), lamp(2.27, 0.66, 0.62, 0.38, 0.1, 0xfff4dd)];
  const tails = [lamp(-2.29, 0.72, -0.6, 0.42, 0.09, 0xff1a1a), lamp(-2.29, 0.72, 0.6, 0.42, 0.09, 0xff1a1a)];
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.7), dark);
  grille.position.set(2.29, 0.45 - BODY_Y, 0); root.add(grille);

  const tireGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.26, 24).rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.27, 16).rotateX(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.42, 0.05, 0.28);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.9, roughness: 0.25 });
  const wheels = WHEELS.map(() => {
    const steer = new THREE.Group(), spin = new THREE.Group();
    spin.add(new THREE.Mesh(tireGeo, dark), new THREE.Mesh(rimGeo, rimMat));
    for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(spokeGeo, rimMat); sp.rotation.z = (k * Math.PI) / 3; spin.add(sp); }
    spin.children.forEach(c => (c.castShadow = true));
    steer.add(spin); root.add(steer);
    return { steer, spin };
  });

  const headlights = [-0.62, 0.62].map(z => {
    const l = new THREE.SpotLight(0xfff2d8, 0, 140, 0.42, 0.45, 1.2);
    l.position.set(2.2, 0.66 - BODY_Y, z);
    l.target.position.set(30, -3, z * 3);
    root.add(l, l.target);
    return l;
  });
  return { root, paint, wheels, heads, tails, headlights };
}

export function createCar(scene, RAPIER, world, { color, pos, heading, gearMode }) {
  const view = carMesh(color);
  scene.add(view.root);

  const q = h => ({ x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) });
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setRotation(q(heading))
      .setAdditionalMassProperties(450, { x: 0, y: -0.3, z: 0 }, { x: 120, y: 420, z: 400 }, { x: 0, y: 0, z: 0, w: 1 })
      .setLinearDamping(0.02).setAngularDamping(0.4).setCanSleep(false).setCcdEnabled(true));
  world.createCollider(RAPIER.ColliderDesc.cuboid(2.2, 0.28, 0.88).setMass(760).setFriction(0.4).setRestitution(0.1), body);
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.95, 0.2, 0.72).setTranslation(-0.2, 0.5, 0).setMass(90).setFriction(0.4), body);

  const vehicle = world.createVehicleController(body);
  WHEELS.forEach(([x, z], i) => {
    vehicle.addWheel({ x, y: 0, z }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, 0.35, WHEEL_R); // axle +z => drive direction +x
    vehicle.setWheelSuspensionStiffness(i, 32);
    vehicle.setWheelSuspensionCompression(i, 3.2);
    vehicle.setWheelSuspensionRelaxation(i, 3.8);
    vehicle.setWheelMaxSuspensionTravel(i, 0.28);
    vehicle.setWheelMaxSuspensionForce(i, 1e5);
    vehicle.setWheelFrictionSlip(i, i < 2 ? 2.5 : 2.3);
    vehicle.setWheelSideFrictionStiffness(i, 1);
  });

  const state = {
    gear: 2, gearMode, rpm: IDLE, speed: 0, nitro: 1, nitroOn: false, slip: 0, steer: 0, braking: false, throttle: 0,
    headlightsOn: false,
  };
  const prev = { p: new THREE.Vector3(), q: new THREE.Quaternion() }, cur = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  const snap = () => { prev.p.copy(cur.p); prev.q.copy(cur.q); const t = body.translation(), r = body.rotation(); cur.p.set(t.x, t.y, t.z); cur.q.set(r.x, r.y, r.z, r.w); };
  snap(); snap();
  const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3();

  function localVelocity() {
    const v = body.linvel(), r = body.rotation();
    tmpQ.set(r.x, r.y, r.z, r.w).invert();
    return tmpV.set(v.x, v.y, v.z).applyQuaternion(tmpQ);
  }

  function step(dt, input) {
    const lv = localVelocity();
    const fwd = lv.x, speed = Math.hypot(lv.x, lv.z);
    state.speed = fwd;

    // Gear selection.
    let throttle = input.throttle, brake = input.brake;
    if (state.gearMode === 'auto') {
      if (state.gear >= 2 && brake > 0 && fwd < 0.8) state.gear = 0;
      else if (state.gear === 0 && throttle > 0 && fwd > -0.8) state.gear = 2;
      else if (state.gear === 1 && throttle > 0) state.gear = 2;
      if (state.gear === 0) [throttle, brake] = [brake, throttle];
    } else {
      if (input.shiftUp && state.gear < GEARS.length - 1) state.gear++;
      if (input.shiftDown && state.gear > 0) state.gear--;
    }

    const wheelRpm = rpmFromSpeed(fwd, state.gear, WHEEL_R);
    const launch = state.gear !== 1 && Math.abs(fwd) < 6 ? IDLE + throttle * 3400 * (1 - Math.abs(fwd) / 6) : 0; // clutch slip off the line
    const free = state.gear === 1 ? IDLE + throttle * (REDLINE - IDLE) : 0;
    state.rpm = Math.min(REDLINE + 150, Math.max(wheelRpm, launch, free, IDLE));
    if (state.gearMode === 'auto') state.gear = autoShift(state.gear, state.rpm, throttle, fwd);

    state.nitroOn = input.nitro && state.nitro > 0 && throttle > 0 && state.gear >= 2;
    state.nitro = Math.min(1, Math.max(0, state.nitro + (state.nitroOn ? -dt / 6 : dt / 20)));
    let force = driveForce(state.rpm, state.gear, throttle, WHEEL_R) * (state.nitroOn ? 1.45 : 1);
    if (state.gear === 0 && fwd < -10) force = 0; // reverse tops out around 36 km/h
    state.throttle = throttle;

    // Steering: less lock at speed, smooth rate.
    const maxSteer = 0.58 / (1 + speed / 22);
    const target = -input.steer * maxSteer;
    state.steer += Math.max(-dt * 3.2, Math.min(dt * 3.2, target - state.steer));
    vehicle.setWheelSteering(0, state.steer);
    vehicle.setWheelSteering(1, state.steer);

    // Brakes (rapier ignores brake on a wheel with engine force, so zero the force while braking).
    state.braking = brake > 0;
    if (state.braking) force = 0;
    const coast = throttle === 0 && !state.braking ? 1.2 : 0;
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      vehicle.setWheelEngineForce(i, front ? 0 : force / 2);
      let b = brake * (front ? 75 : 45) + coast;
      if (!front && input.handbrake) b = 18;
      vehicle.setWheelBrake(i, b);
      vehicle.setWheelFrictionSlip(i, front ? 2.5 : input.handbrake ? 1.35 : 2.3);
    }

    // Drift assist (sim-lite): let the rear slide, but damp yaw beyond what the steering asks for so it doesn't spin out.
    const yaw = body.angvel().y, wantYaw = (fwd / 2.75) * Math.tan(state.steer);
    const err = yaw - wantYaw, band = input.handbrake ? 0.8 : 0.45;
    const excess = Math.sign(err) * Math.max(0, Math.abs(err) - band);
    if (excess && speed > 4) body.applyTorqueImpulse({ x: 0, y: -excess * 2900 * dt * 8, z: 0 }, true);

    // Aero: drag against motion and downforce for stability at speed.
    const v = body.linvel(), v2 = v.x * v.x + v.y * v.y + v.z * v.z, vl = Math.sqrt(v2) || 1;
    body.resetForces(true);
    body.addForce({ x: (-0.36 * v2 * v.x) / vl, y: (-0.36 * v2 * v.y) / vl - 0.9 * v2, z: (-0.36 * v2 * v.z) / vl }, true);

    vehicle.updateVehicle(dt);
    state.slip = speed > 3 ? Math.min(1, Math.abs(lv.z) / Math.max(6, speed) * 2.2 + (state.rpm > wheelRpm * 1.35 && throttle > 0.6 ? 0.35 : 0)) : 0;
  }

  function render(alpha) {
    view.root.position.lerpVectors(prev.p, cur.p, alpha);
    view.root.quaternion.slerpQuaternions(prev.q, cur.q, alpha);
    view.wheels.forEach((w, i) => {
      const [x, z] = WHEELS[i];
      w.steer.position.set(x, -(vehicle.wheelSuspensionLength(i) ?? 0.3), z);
      w.steer.rotation.y = vehicle.wheelSteering(i) ?? 0;
      w.spin.rotation.z = vehicle.wheelRotation(i) ?? 0;
    });
    for (const t of view.tails) t.material.emissiveIntensity = state.braking ? 3 : state.headlightsOn ? 1 : 0.3;
    for (const h of view.heads) h.material.emissiveIntensity = state.headlightsOn ? 4 : 0.4;
    for (const l of view.headlights) l.intensity = state.headlightsOn ? 260 : 0;
  }

  function reset(x, z, heading) {
    body.setTranslation({ x, y: heightAt(x, z) + 1.4, z }, true);
    body.setRotation(q(heading), true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    state.steer = 0;
    snap(); snap();
  }

  const up = new THREE.Vector3(), bodyQ = new THREE.Quaternion();
  const rot = () => { const r = body.rotation(); return bodyQ.set(r.x, r.y, r.z, r.w); };
  return {
    body, mesh: view.root, state, step, render, reset, snap,
    get speedKmh() { return Math.abs(state.speed) * 3.6; },
    get gearText() { return gearLabel(state.gear); },
    get heading() { const f = up.set(1, 0, 0).applyQuaternion(rot()); return Math.atan2(-f.z, f.x); },
    get upY() { return up.set(0, 1, 0).applyQuaternion(rot()).y; },
    setColor(c) { view.paint.color.set(c); },
  };
}
