// The player: driving a vehicle or walking (Rapier character controller), getting in and out, carjacking, health.
import * as THREE from 'three';
import { GROUP } from './vehicle.js';
import { groundAt } from './humans.js';
import { SEA_LEVEL } from './logic/map.js';

const CAP_HALF = 0.55, CAP_R = 0.3, FEET = CAP_HALF + CAP_R;
const seat = new THREE.Matrix4(), Y = new THREE.Vector3(0, 1, 0);

export function createPlayer(G, save) {
  const { RAPIER, world } = G;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(save.pos.x, save.pos.y + 1, save.pos.z));
  const col = world.createCollider(RAPIER.ColliderDesc.capsule(CAP_HALF, CAP_R).setCollisionGroups(GROUP.CHAR), body);
  const cc = world.createCharacterController(0.05);
  cc.enableAutostep(0.45, 0.2, true);
  cc.enableSnapToGround(0.5);
  cc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
  col.setEnabled(false);

  const human = G.humans.spawn({ role: 'player', x: save.pos.x, z: save.pos.z, shirt: '#b3122e', pants: '#1f2a44', skin: '#e0ac69', visible: false });
  const P = {
    mode: 'car', vehicle: null, human, health: 100, dead: false, vy: 0, grounded: false, yaw: 0, hurtT: 0,
    weapons: { fists: true, bat: save.weapons.bat, pistol: save.weapons.pistol, smg: save.weapons.smg }, weapon: 'fists',
    lastVehicle: null,
  };
  // Camera target while on foot.
  const footCam = { mesh: new THREE.Object3D(), state: { nitroOn: false, speed: 0 }, speedKmh: 0, camDist: 4.2, camHeight: 1.0, onFoot: true };

  P.target = () => {
    if (P.mode === 'car' && P.vehicle) { const p = P.vehicle.body.translation(); return { x: p.x, y: p.y, z: p.z, vehicle: P.vehicle }; }
    return { x: human.x, y: human.y + 1, z: human.z };
  };
  P.camTarget = () => {
    if (P.mode === 'car' && P.vehicle) return P.vehicle;
    footCam.mesh.position.set(human.x, human.y + 0.9, human.z);
    footCam.mesh.quaternion.setFromAxisAngle(Y, P.yaw);
    footCam.speedKmh = Math.abs(human.speed) * 3.6;
    footCam.state.speed = human.speed;
    return footCam;
  };

  P.enter = v => {
    P.vehicle = v; P.mode = 'car';
    v.role = 'player'; v.ai = null; v.hangar = null; v.driverInside = true; v.state.gearMode = G.settings.gearMode;
    col.setEnabled(false);
    human.visible = v.spec.kind === 'bike';
    human.ride = v.spec.kind === 'bike';
    human.state = 'walk'; human.speed = 0; human.fall = 0;
    G.onEnterVehicle?.(v);
  };
  P.placeOnFoot = (x, z, yaw, y = groundAt(x, z)) => {
    P.mode = 'foot';
    human.visible = true; human.ride = false; human.matrix = null;
    Object.assign(human, { x, y, z, yaw, speed: 0 });
    P.yaw = yaw; P.vy = 0;
    body.setTranslation({ x, y: y + FEET + 0.05, z }, true);
    col.setEnabled(true);
  };
  P.exit = () => {
    const v = P.vehicle;
    if (!v) return;
    const h = v.heading, fx = Math.cos(h), fz = -Math.sin(h), side = v.spec.width / 2 + 0.8;
    const c = v.body.translation();
    // Left door, or the right one if a wall is in the way.
    let x = c.x - fz * side, z = c.z + fx * side;
    if (G.rayBlocked(c.x, c.y + 0.5, c.z, x, c.y + 0.5, z)) { x = c.x + fz * side; z = c.z - fx * side; }
    const fast = v.speedKmh > 25, lv = v.body.linvel();
    v.role = 'abandoned'; v.driverInside = false; v.state.nitroOn = false;
    P.lastVehicle = v; P.vehicle = null;
    P.placeOnFoot(x, z, h, Math.max(groundAt(x, z), c.y - 0.6));
    if (fast) { // bail out: tumble along the road
      G.humans.hurt(human, 8, { x: lv.x * 0.6, y: 3, z: lv.z * 0.6 });
    }
    G.onExitVehicle?.(v);
  };

  // F: get in the nearest vehicle (pulling out whoever is driving) or get out.
  P.interact = () => {
    if (P.dead) return;
    if (P.mode === 'car') { P.exit(); return; }
    if (human.state === 'down') return;
    let best = null, bd = Infinity;
    for (const v of G.fleet.list) {
      if (v.exploded) continue;
      const p = v.body.translation(), d = Math.hypot(p.x - human.x, p.z - human.z);
      if (d < v.spec.len / 2 + 2.2 && d < bd && Math.abs(p.y - human.y) < 3) { best = v; bd = d; }
    }
    if (!best) return false;
    if (best.speedKmh > 15) { G.hud.toast('Too fast to get in'); return true; }
    if (best.driverInside && best.role !== 'abandoned') {
      const p = best.body.translation(), h = best.heading;
      const driver = G.humans.spawn({ x: p.x - Math.sin(h) * 1.4, z: p.z - Math.cos(h) * 1.4, yaw: h });
      if (driver) { G.humans.hurt(driver, 5, { x: -Math.sin(h) * 3, y: 2, z: -Math.cos(h) * 3 }); driver.timer = 1.2; }
      if (best.role === 'mission-target') { /* missions decide */ }
      else if (best.spec.police) G.wanted.crime('carjack', 2.5);
      else G.wanted.crime('carjack');
    } else if (best.role === 'parked') {
      if (Math.random() < 0.5) { G.audio?.alarm(); G.wanted.crime('stealParked'); G.hud.toast('Car alarm!'); }
    }
    P.enter(best);
    return true;
  };

  P.hurt = (dmg, push) => {
    if (P.dead || G.mods.god) return;
    P.health = Math.max(0, P.health - dmg);
    P.hurtT = 0;
    G.hud.hit();
    if (push && P.mode === 'foot' && human.state !== 'down') { human.state = 'down'; human.timer = 1.8; human.vx = push.x; human.vy = push.y; human.vz = push.z; }
    if (P.health <= 0) G.game.wasted();
  };

  // Fixed-step movement on foot.
  P.fixed = (dt, input) => {
    if (P.mode !== 'foot' || P.dead) return;
    if (human.state === 'down') {
      body.setNextKinematicTranslation({ x: human.x, y: human.y + FEET + 0.05, z: human.z });
      if (human.timer <= 0) { human.state = 'walk'; human.fall = 0; }
      return;
    }
    let sp;
    const st = input.stick, mag = st ? Math.hypot(st.x, st.y) : 0;
    if (st) { // joystick: walk the way it points, relative to the camera; push it all the way to run
      if (mag > 0.15) {
        const want = (G.camYaw ?? P.yaw) - Math.atan2(st.x, st.y), d = Math.atan2(Math.sin(want - P.yaw), Math.cos(want - P.yaw));
        P.yaw += d * Math.min(1, dt * 10);
      }
      sp = mag < 0.15 ? 0 : mag > 0.9 || input.nitro ? 6.8 : 3.3 * Math.min(1, mag / 0.6);
    } else {
      P.yaw -= input.steer * 2.8 * dt;
      sp = input.throttle ? (input.nitro ? 6.8 : 3.3) : input.brake ? -2 : 0;
    }
    P.vy -= 20 * dt;
    if (P.grounded && input.handbrake && P.vy <= 0) P.vy = 6.2;
    const desired = { x: Math.cos(P.yaw) * sp * dt, y: P.vy * dt, z: -Math.sin(P.yaw) * sp * dt };
    cc.computeColliderMovement(col, desired);
    const m = cc.computedMovement(), t = body.translation();
    P.grounded = cc.computedGrounded();
    if (P.grounded && P.vy < 0) P.vy = 0;
    const nx = t.x + m.x, ny = Math.max(t.y + m.y, groundAt(t.x, t.z) + FEET - 0.3), nz = t.z + m.z;
    body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    Object.assign(human, { x: nx, y: ny - FEET, z: nz, yaw: P.yaw, speed: sp });
  };

  P.update = dt => {
    if (P.dead) return;
    if ((P.hurtT += dt) > 6 && P.health < 100) P.health = Math.min(100, P.health + dt * 4);
    const v = P.vehicle;
    if (P.mode === 'car' && v) {
      if (human.ride) {
        human.matrix ??= new THREE.Matrix4();
        v.view.lean.updateWorldMatrix(true, false);
        human.matrix.copy(v.view.lean.matrixWorld).multiply(seat.makeTranslation(-0.25, 0.12 - v.view.parts.bodyY, 0));
        const p = v.body.translation(); human.x = p.x; human.z = p.z; human.y = p.y;
      } else { const p = v.body.translation(); human.x = p.x; human.y = p.y; human.z = p.z; }
      if (v.dead && v.exploded && !G.mods.god) P.hurt(200);
      if (v.body.translation().y < SEA_LEVEL - 1.5 && v.speedKmh < 5) G.game.drowned();
    } else if (P.mode === 'foot' && human.y < SEA_LEVEL - 1.2) G.game.drowned();
  };
  P.collider = col;
  P.body = body;
  return P;
}
