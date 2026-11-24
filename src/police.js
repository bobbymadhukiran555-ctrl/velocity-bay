// Police response to the wanted level: pursuit cars, cops on foot, roadblocks with spike strips, the helicopter, busting.
import * as THREE from 'three';
import { policeFor, bustStep } from './logic/wanted.js';
import { pursuitAI, laneAI } from './ai.js';
import { SAMPLES, locate, along } from './logic/roadgraph.js';
import { heightAt } from './logic/map.js';
import { heliMesh } from './models.js';

const pick = a => a[Math.floor(Math.random() * a.length)];

export function createPolice(G) {
  const { scene } = G;
  const heli = heliMesh();
  heli.root.visible = false;
  scene.add(heli.root);
  const spot = new THREE.SpotLight(0xe8f0ff, 0, 200, 0.2, 0.5, 1);
  scene.add(spot, spot.target);
  const H = { on: false, x: 0, y: 200, z: 0, ang: 0 };
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7, roughness: 0.4 });
  const spikes = [];
  let seenT = 0, spawnT = 0, blockT = 20, speedT = 0, bust = 0, seen = false;

  const units = () => G.fleet.list.filter(v => v.role === 'police' && !v.dead);
  const copsOnFoot = () => G.humans.list.filter(h => h.role === 'cop' && h.state !== 'dead');

  function spawnUnit(armoured) {
    const P = G.focus;
    // Pick from road samples near the player, not a uniform random pick from the whole map.
    const near = SAMPLES.filter(s => { const d = Math.hypot(s.x - P.x, s.z - P.z); return d > 140 && d < 260 && !G.inView(s.x, s.z); });
    for (let t = 0; t < 15; t++) {
      const s = pick(near.length ? near : SAMPLES), sp = G.fleet.spotOn(s), d = Math.hypot(sp.x - P.x, sp.z - P.z);
      if (d < 140 || d > 260 || G.inView(sp.x, sp.z)) continue;
      const v = G.fleet.spawn({ model: armoured ? 'bulwark' : 'patrol', color: armoured ? '#1b2433' : '#f2f2f2', pos: { x: sp.x, y: 0, z: sp.z }, heading: sp.heading, role: 'police' });
      v.reset(sp.x, sp.z, sp.heading);
      v.ai = pursuitAI(); v.state.siren = true; v.state.headlightsOn = true;
      return v;
    }
    return null;
  }

  function roadblock() {
    const P = G.player, v = P.vehicle;
    if (!v || v.speedKmh < 30) return;
    const p = v.body.translation(), h = v.heading, ax = p.x + Math.cos(h) * 150, az = p.z - Math.sin(h) * 150;
    const loc = locate(ax, az);
    if (!loc || loc.dist > 20) return;
    const e = loc.edge, a = along(e.pts, e.cum, loc.d), b = along(e.pts, e.cum, loc.d + 2);
    let dx = b.x - a.x, dz = b.z - a.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const nx = -dz, nz = dx, toward = ((p.x - a.x) * dx + (p.z - a.z) * dz) > 0 ? 1 : -1;
    for (const side of [-1, 1]) {
      const x = a.x + nx * side * e.width / 4, z = a.z + nz * side * e.width / 4, hd = Math.atan2(-nz, nx);
      const u = G.fleet.spawn({ model: 'patrol', color: '#f2f2f2', pos: { x, y: 0, z }, heading: hd, role: 'police' });
      u.reset(x, z, hd);
      u.ai = { type: 'hold' }; u.roadblock = true; u.state.siren = true; u.state.headlightsOn = true;
    }
    const s = along(e.pts, e.cum, loc.d + toward * 14);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, e.width - 1), spikeMat);
    mesh.position.set(s.x, heightAt(s.x, s.z) + 0.2, s.z);
    mesh.rotation.y = Math.atan2(-dz, dx);
    scene.add(mesh);
    spikes.push({ mesh, x: s.x, z: s.z, dx, dz, half: e.width / 2 - 0.5, t: 60 });
    G.hud.toast('Roadblock ahead!');
  }

  function canSee(ux, uy, uz, range, body) {
    const t = G.player.target(), d = Math.hypot(t.x - ux, t.z - uz);
    return d < range && !G.rayBlocked(ux, uy + 1.4, uz, t.x, t.y + 0.5, t.z, body);
  }

  return {
    get heli() { return H; },
    get bust() { return bust; },
    get seen() { return seen; },
    clear() {
      for (const v of units()) { v.state.siren = false; if (v.roadblock || v.copsOut) { v.ai = { type: 'hold' }; v.role = 'abandoned'; } }
      for (const s of spikes) scene.remove(s.mesh);
      spikes.length = 0; bust = 0;
    },
    update(dt) {
      const W = G.wanted, stars = W.stars, need = policeFor(stars), P = G.player, tgt = P.target(), list = units();
      // Patrols join the chase; when it's over, they go back to patrolling.
      for (const v of list) {
        if (stars > 0 && !v.roadblock && !v.copsOut && v.ai?.type !== 'pursuit') { v.ai = pursuitAI(); v.state.siren = true; }
        if (stars === 0 && v.ai?.type === 'pursuit') {
          const p = v.body.translation(), l = locate(p.x, p.z);
          v.ai = laneAI(l.edge, 1, l.d, { patrol: true }); v.state.siren = false;
        }
        if (v.roadblock && stars > 0) { const p = v.body.translation(); if (Math.hypot(p.x - tgt.x, p.z - tgt.z) < 25) { v.roadblock = false; v.ai = pursuitAI(); } }
        // Rammed a police car.
        if (v.impact && P.vehicle && v.impact.strength > 1) {
          const p = v.body.translation(), q = P.vehicle.body.translation();
          if (Math.hypot(p.x - q.x, p.z - q.z) < 8) W.crime('crashCop');
        }
      }
      const chasing = list.filter(v => v.ai?.type === 'pursuit').length;
      if (stars > 0 && chasing < need.cars && (spawnT -= dt) <= 0) {
        spawnT = 2.5;
        spawnUnit(list.filter(v => v.model === 'bulwark').length < need.armoured);
      }
      // Speeding right past a patrol car.
      if (stars === 0 && P.vehicle && P.vehicle.speedKmh > 115 && (speedT -= dt) <= 0) {
        const q = P.vehicle.body.translation();
        if (list.some(v => { const p = v.body.translation(); return Math.hypot(p.x - q.x, p.z - q.z) < 25; })) { W.crime('speeding'); speedT = 8; G.hud.toast('Speeding past the police!'); }
      }
      // Cops get out when you're on foot nearby, and back in when you drive off.
      if (stars > 0 && P.mode === 'foot') for (const v of list) {
        const p = v.body.translation();
        if (!v.copsOut && v.speedKmh < 12 && Math.hypot(p.x - tgt.x, p.z - tgt.z) < 30) {
          v.copsOut = true; v.ai = { type: 'hold' };
          const h = v.heading;
          for (const s of [-1, 1]) G.humans.spawn({ role: 'cop', car: v, x: p.x - Math.sin(h) * 1.5 * s, z: p.z - Math.cos(h) * 1.5 * s, shirt: '#1a2a4a', pants: '#14213d', skin: pick(['#f1c27d', '#c68642', '#8d5524', '#e0ac69']), health: 80, hostile: true });
        }
      }
      if (P.mode === 'car' && P.vehicle?.speedKmh > 40) for (const v of list) if (v.copsOut) {
        const p = v.body.translation();
        if (Math.hypot(p.x - tgt.x, p.z - tgt.z) > 40) {
          for (const h of copsOnFoot()) if (h.car === v) G.humans.remove(h);
          v.copsOut = false; if (stars > 0) v.ai = pursuitAI();
        }
      }
      // Can anyone see the player?
      if ((seenT -= dt) <= 0) {
        seenT = 0.3;
        seen = false;
        for (const v of list) { const p = v.body.translation(); if (canSee(p.x, p.y, p.z, 75, v.body)) { seen = true; break; } }
        if (!seen) for (const h of copsOnFoot()) if (canSee(h.x, h.y, h.z, 50)) { seen = true; break; }
        if (!seen && H.on && Math.hypot(H.x - tgt.x, H.z - tgt.z) < 170) seen = true;
      }
      if (W.update(dt, seen && stars > 0, tgt) === 'escaped') G.onEscaped?.();

      // Helicopter.
      if (need.heli && !H.on) { H.on = true; H.x = tgt.x + 250; H.z = tgt.z + 250; H.y = 120; heli.root.visible = true; }
      if (H.on) {
        const leaving = !need.heli;
        H.ang += dt * 0.35;
        const gx = leaving ? H.x + 60 : tgt.x + Math.cos(H.ang) * 38, gz = leaving ? H.z + 60 : tgt.z + Math.sin(H.ang) * 38, gy = leaving ? 260 : heightAt(tgt.x, tgt.z) + 48;
        const k = Math.min(1, dt * 0.8);
        const vx = (gx - H.x) * k, vz = (gz - H.z) * k;
        H.x += vx; H.y += (gy - H.y) * k; H.z += vz;
        heli.root.position.set(H.x, H.y, H.z);
        heli.root.rotation.y = Math.atan2(-(tgt.z - H.z), tgt.x - H.x);
        heli.root.rotation.z = -Math.min(0.3, Math.hypot(vx, vz) / dt * 0.01);
        heli.rotor.rotation.y += dt * 30; heli.tailRotor.rotation.z += dt * 40;
        heli.beacon.visible = Math.floor(G.clock * 2) % 2 === 0;
        spot.position.set(H.x, H.y - 1.5, H.z); spot.target.position.set(tgt.x, tgt.y, tgt.z);
        spot.intensity = leaving ? 0 : G.night * 700;
        if (leaving && H.y > 240) { H.on = false; heli.root.visible = false; spot.intensity = 0; }
      }
      // Roadblocks and spikes.
      if (need.roadblocks && (blockT -= dt) <= 0) { blockT = 35; roadblock(); }
      for (let i = spikes.length - 1; i >= 0; i--) {
        const s = spikes[i];
        if ((s.t -= dt) <= 0 || stars === 0) { scene.remove(s.mesh); spikes.splice(i, 1); continue; }
        const v = P.vehicle;
        if (!v || v.tiresPopped) continue;
        const p = v.body.translation(), rx = p.x - s.x, rz = p.z - s.z;
        if (Math.abs(rx * s.dx + rz * s.dz) < 1.6 && Math.abs(-rx * s.dz + rz * s.dx) < s.half + 0.5) { v.tiresPopped = true; G.hud.toast('Tyres popped! Get them fixed at a Spray & Fix'); G.audio?.crash(0.4, p); }
      }
      // Busted?
      if (stars > 0 && !P.dead) {
        const near = G.fleet.nearestPolice(tgt.x, tgt.z);
        let copDist = near ? near.d : Infinity;
        const foot = P.mode === 'foot';
        if (foot) { copDist = near ? near.d - 3 : Infinity; for (const h of copsOnFoot()) copDist = Math.min(copDist, Math.hypot(h.x - tgt.x, h.z - tgt.z)); }
        const sp = foot ? Math.abs(P.human.speed) : (P.vehicle ? P.vehicle.speedKmh / 3.6 : 0);
        bust = bustStep(bust, dt, { copDist, playerSpeed: sp, onFoot: foot });
        if (bust >= 1) { bust = 0; G.game.busted(); }
      } else bust = 0;
    },
  };
}
