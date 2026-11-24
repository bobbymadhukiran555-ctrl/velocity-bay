import * as THREE from 'three';
import { heightAt } from './logic/map.js';

const MODES = ['chase', 'far', 'cockpit'];
const COCKPIT_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

export function createCameraRig(camera) {
  let mode = 0, yaw = null, shake = 0;
  const pos = new THREE.Vector3(), look = new THREE.Vector3(), fwd = new THREE.Vector3(), tmp = new THREE.Vector3();

  return {
    next() { mode = (mode + 1) % MODES.length; yaw = null; return MODES[mode]; },
    update(dt, car) {
      const m = car.mesh, kmh = car.speedKmh, nitro = car.state.nitroOn;
      fwd.set(1, 0, 0).applyQuaternion(m.quaternion);
      const carYaw = Math.atan2(-fwd.z, fwd.x);
      const targetFov = MODES[mode] === 'cockpit' ? 70 + kmh * 0.04 : 60 + Math.min(24, kmh * 0.09) + (nitro ? 8 : 0);
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();

      if (MODES[mode] === 'cockpit') {
        camera.position.copy(tmp.set(0.05, 0.58, -0.36).applyQuaternion(m.quaternion).add(m.position));
        camera.quaternion.copy(m.quaternion).multiply(COCKPIT_TURN);
        return;
      }
      if (yaw === null) yaw = carYaw;
      let d = carYaw - yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw += d * Math.min(1, dt * (car.state.speed < -1 ? 1.5 : 4.5));
      const far = MODES[mode] === 'far';
      const dist = (far ? 10.5 : 6.6) + kmh * 0.012, height = far ? 3.6 : 2.2;
      pos.set(m.position.x - Math.cos(yaw) * dist, m.position.y + height, m.position.z + Math.sin(yaw) * dist);
      pos.y = Math.max(pos.y, heightAt(pos.x, pos.z) + 0.8);
      shake = nitro ? 0.04 : shake * 0.9;
      camera.position.lerp(pos, Math.min(1, dt * 12)).add(tmp.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
      look.set(m.position.x + Math.cos(yaw) * 3, m.position.y + 1.1, m.position.z - Math.sin(yaw) * 3);
      camera.lookAt(look);
    },
  };
}
