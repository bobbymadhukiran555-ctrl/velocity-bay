import * as THREE from 'three';
import { heightAt } from './logic/map.js';

const MODES = ['chase', 'far', 'cockpit'];
const COCKPIT_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

// target: a vehicle, or anything with { mesh, speedKmh, state: { nitroOn, speed }, camDist?, camHeight? }.
export function createCameraRig(camera) {
  let mode = 0, yaw = null, shake = 0, kick = 0;
  const pos = new THREE.Vector3(), look = new THREE.Vector3(), fwd = new THREE.Vector3(), tmp = new THREE.Vector3();

  // Pull the camera in front of any wall between it and the target.
  function unblock(x, y, z) {
    if (!rig.collide) return;
    const full = Math.hypot(pos.x - x, pos.y - y, pos.z - z), d = rig.collide(x, y, z, pos.x, pos.y, pos.z);
    if (d < full) { const k = Math.max(0.12, (d - 0.4) / full); pos.set(x + (pos.x - x) * k, y + (pos.y - y) * k, z + (pos.z - z) * k); }
  }
  const rig = {
    collide: null,
    orbit: null, // { yaw, dist, height, spin } for the showroom and photo mode
    get mode() { return MODES[mode]; },
    next() { mode = (mode + 1) % MODES.length; yaw = null; return MODES[mode]; },
    snap() { yaw = null; },
    // The most open direction around a point (for showroom / photo cameras next to buildings).
    openYaw(c) {
      let best = 0, bd = -1;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const d = rig.collide ? rig.collide(c.x, c.y + 1.5, c.z, c.x + Math.cos(a) * 12, c.y + 3, c.z - Math.sin(a) * 12) : 12;
        if (d > bd) { bd = d; best = a; }
      }
      return best;
    },
    kick(a) { kick = Math.max(kick, a); },
    update(dt, target) {
      const m = target.mesh, kmh = target.speedKmh, nitro = target.state.nitroOn;
      if (rig.orbit) {
        const o = rig.orbit;
        o.yaw += (o.spin || 0) * dt;
        pos.set(m.position.x + Math.cos(o.yaw) * o.dist, m.position.y + o.height, m.position.z - Math.sin(o.yaw) * o.dist);
        unblock(m.position.x, m.position.y + 0.8, m.position.z);
        camera.position.copy(pos);
        camera.position.y = Math.max(camera.position.y, heightAt(camera.position.x, camera.position.z) + 0.4);
        camera.lookAt(m.position.x, m.position.y + 0.4, m.position.z);
        camera.fov += (55 - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
        return;
      }
      const cockpit = MODES[mode] === 'cockpit' && !target.onFoot;
      fwd.set(1, 0, 0).applyQuaternion(m.quaternion);
      const carYaw = Math.atan2(-fwd.z, fwd.x);
      const targetFov = cockpit ? 70 + kmh * 0.04 : 60 + Math.min(24, kmh * 0.09) + (nitro ? 8 : 0);
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
      kick = Math.max(0, kick - dt * 1.5);
      const k = (Math.random() - 0.5) * kick * 0.6;
      if (cockpit) {
        camera.position.copy(tmp.set(0.05, 0.58, -0.36).applyQuaternion(m.quaternion).add(m.position));
        camera.quaternion.copy(m.quaternion).multiply(COCKPIT_TURN);
        return;
      }
      if (yaw === null) yaw = carYaw;
      let d = carYaw - yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw += d * Math.min(1, dt * (target.state.speed < -1 ? 1.5 : target.onFoot ? 6 : 4.5));
      const far = MODES[mode] === 'far';
      const dist = target.camDist ?? (far ? 10.5 : 6.6) + kmh * 0.012, height = target.camHeight ?? (far ? 3.6 : 2.2);
      pos.set(m.position.x - Math.cos(yaw) * dist, m.position.y + height, m.position.z + Math.sin(yaw) * dist);
      pos.y = Math.max(pos.y, heightAt(pos.x, pos.z) + 0.8);
      unblock(m.position.x, m.position.y + (target.onFoot ? 0.6 : 1), m.position.z);
      shake = nitro ? 0.04 : shake * 0.9;
      camera.position.lerp(pos, Math.min(1, dt * 12)).add(tmp.set((Math.random() - 0.5) * shake + k, (Math.random() - 0.5) * shake + k, k));
      look.set(m.position.x + Math.cos(yaw) * 3, m.position.y + (target.onFoot ? 0.6 : 1.1), m.position.z - Math.sin(yaw) * 3);
      camera.lookAt(look);
    },
  };
  return rig;
}
