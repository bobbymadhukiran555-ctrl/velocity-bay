// All vehicles in the world: spawning traffic and parked cars around the player, stepping them, wrecks and explosions.
import { createVehicle } from './vehicle.js';
import { aiInput, laneAI, HOLD } from './ai.js';
import { SAMPLES, along, GRAPH } from './logic/roadgraph.js';
import { TRAFFIC_MODELS, TRAFFIC_COLORS, MODELS } from './logic/vehicles.js';
import { wetGrip } from './logic/weather.js';
import { vehicleFx } from './fx.js';
import { CITY } from './logic/map.js';

const pick = a => a[Math.floor(Math.random() * a.length)];
const KEEP = new Set(['player', 'mission', 'mission-target', 'racer', 'owned', 'airfield']);
const paintFor = m => MODELS[m].paint ?? pick(TRAFFIC_COLORS);
// Free planes waiting at the north end of the runway.
const HANGAR = [{ model: 'sparrow', x: -1000, z: 600, color: '#e8e8e6' }, { model: 'falcon', x: -1022, z: 590, color: '#d7dde4' }];

export function createFleet(G) {
  const list = [], byBody = new Map();
  let timer = 0;

  const spawn = opts => {
    const v = createVehicle(G, opts);
    list.push(v);
    byBody.set(v.body.handle, v);
    return v;
  };
  const remove = v => {
    if (v === G.player.vehicle || v.removed) return;
    v.remove();
    byBody.delete(v.body.handle);
    list.splice(list.indexOf(v), 1);
    if (G.player.lastVehicle === v) G.player.lastVehicle = null;
  };

  // A spot on a lane (or the parking strip beside it) at a SAMPLES entry.
  function spotOn(s, offset = 0) {
    const lane = s.edge.lanes[s.dir], p = along(lane, s.edge.laneCum[s.dir], s.d), q = along(lane, s.edge.laneCum[s.dir], s.d + 2);
    const dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz) || 1;
    return { x: p.x - (dz / L) * offset, z: p.z + (dx / L) * offset, heading: Math.atan2(-dz, dx) };
  }
  const clear = (x, z, r) => list.every(o => { const p = o.body.translation(); return Math.hypot(p.x - x, p.z - z) > r; });

  function spawnTraffic(police = false) {
    const P = G.focus;
    for (let tries = 0; tries < 12; tries++) {
      const s = pick(SAMPLES), sp = spotOn(s), d = Math.hypot(sp.x - P.x, sp.z - P.z);
      if (d < 110 || d > 250 || (G.inView(sp.x, sp.z) && d < 190) || !clear(sp.x, sp.z, 16)) continue;
      const model = police ? 'patrol' : pick(TRAFFIC_MODELS);
      const v = spawn({ model, color: police ? '#f2f2f2' : paintFor(model), pos: { x: sp.x, y: 0, z: sp.z }, heading: sp.heading, role: police ? 'police' : 'traffic' });
      v.reset(sp.x, sp.z, sp.heading);
      v.ai = laneAI(s.edge, s.dir, s.d, { patrol: police });
      const fwd = 0.7 * s.edge.speed;
      v.setVelocity(Math.cos(sp.heading) * fwd, 0, -Math.sin(sp.heading) * fwd);
      return v;
    }
    return null;
  }
  function spawnParked() {
    const P = G.focus;
    for (let tries = 0; tries < 10; tries++) {
      const s = pick(SAMPLES);
      if (s.edge.kind !== 'street') continue;
      const sp = spotOn(s, 2.8), d = Math.hypot(sp.x - P.x, sp.z - P.z);
      if (d < 70 || d > 200 || (G.inView(sp.x, sp.z) && d < 150) || !clear(sp.x, sp.z, 9)) continue;
      const model = pick(TRAFFIC_MODELS);
      const v = spawn({ model, color: paintFor(model), pos: { x: sp.x, y: 0, z: sp.z }, heading: sp.heading, role: 'parked' });
      v.reset(sp.x, sp.z, sp.heading);
      return v;
    }
    return null;
  }

  function manage(dt) {
    if ((timer -= dt) > 0) return;
    timer = 0.4;
    const P = G.focus;
    let traffic = 0, parked = 0, patrols = 0;
    for (const v of [...list]) {
      if (KEEP.has(v.role) || v === G.player.vehicle) continue;
      const p = v.body.translation(), d = Math.hypot(p.x - P.x, p.z - P.z);
      const far = v.role === 'police' && G.wanted.stars > 0 ? 420 : 300;
      v.flipT = v.upY < 0.4 ? (v.flipT || 0) + 0.4 : 0;
      if (d > far || ((d > 150 || v.flipT > 8) && (v.exploded || v.ai?.stuckCount > 3 || v.flipT > 8) && !G.inView(p.x, p.z)) || p.y < -30) { remove(v); continue; }
      if (v.role === 'traffic') traffic++;
      if (v.role === 'parked') parked++;
      if (v.role === 'police' && v.ai?.patrol) patrols++;
    }
    const want = Math.round(14 * G.settings.traffic);
    if (traffic < want) spawnTraffic();
    if (traffic < want - 4) spawnTraffic();
    const inCity = Math.abs(P.x) < CITY.max + 100 && Math.abs(P.z) < CITY.max + 100;
    if (inCity && parked < 6 * Math.min(1, G.settings.traffic + 0.3)) spawnParked();
    for (const h of HANGAR) if (!list.some(v => v.hangar === h) && Math.hypot(P.x - h.x, P.z - h.z) > 250) {
      const v = spawn({ model: h.model, color: h.color, pos: { x: h.x, y: 2, z: h.z }, heading: Math.PI / 2, role: 'airfield' });
      v.reset(h.x, h.z, Math.PI / 2); v.hangar = h; v.driverInside = false;
    }
    if (G.wanted.stars === 0 && patrols === 0 && Math.random() < 0.08) spawnTraffic(true);
    // Too many leftover cars: drop the farthest abandoned one.
    const left = list.filter(v => v.role === 'abandoned');
    if (left.length > 5) {
      left.sort((a, b) => dist(b) - dist(a));
      if (!G.inView(left[0].body.translation().x, left[0].body.translation().z)) remove(left[0]);
    }
    function dist(v) { const p = v.body.translation(); return Math.hypot(p.x - P.x, p.z - P.z); }
  }

  return {
    list, byBody, spawn, remove, spotOn,
    fixed(dt, playerInput) {
      const grip = wetGrip(G.weather.wet);
      for (const v of list) {
        const mine = v === G.player.vehicle && G.player.mode === 'car';
        const input = mine ? (G.player.dead ? HOLD : playerInput) : v.ai ? aiInput(G, v, dt) : HOLD;
        v.god = mine && G.mods.god;
        v.step(dt, input, { grip: grip * (mine && G.mods.superGrip ? 1.5 : 1), power: mine && G.mods.superPower ? 2.2 : 1, infiniteNitro: mine && G.mods.infNitro });
      }
    },
    postStep() { for (const v of list) v.snap(); },
    update(dt) {
      manage(dt);
      for (const v of list) {
        // Wrecks burn, then explode.
        if (v.dead && !v.exploded && (v.burning -= dt) <= 0) {
          v.exploded = true; v.burn();
          const p = v.body.translation();
          G.combat.explode(p.x, p.y, p.z, v);
          v.body.applyImpulse({ x: (Math.random() - 0.5) * 2000, y: v.spec.mass * 6, z: (Math.random() - 0.5) * 2000 }, true);
          v.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * 3000, y: 0, z: (Math.random() - 0.5) * 3000 }, true);
          G.onVehicleDestroyed?.(v);
        }
        if (v.impact) {
          const s = v.impact.strength;
          if (v === G.player.vehicle || v.lastHitBy === 'player') G.audio?.crash(Math.min(1, s / 8), v.impact);
          if (s > 2) for (let i = 0; i < 6; i++) G.glow.emit(v.impact.x, v.impact.y, v.impact.z, (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6, 0.12, 0, 0.35, 0xffc060, 1);
          const pv = G.player.vehicle, pp = pv?.body.translation();
          if (v.ai?.type === 'lane' && s > 1.5 && pv && pv !== v && Math.hypot(pp.x - v.impact.x, pp.z - v.impact.z) < 8) { v.ai.speedMul = 1.4; v.ai.ignoreLights = true; } // rammed by you: they floor it
          v.impact = null;
        }
        G.streets.collide(v);
      }
    },
    render(alpha, dt) {
      const P = G.focus;
      for (const v of list) {
        v.render(alpha, dt);
        const p = v.mesh.position;
        if (Math.abs(p.x - P.x) < 160 && Math.abs(p.z - P.z) < 160) vehicleFx(G, v, dt);
      }
    },
    nearestPolice(x, z) {
      let best = null, bd = Infinity;
      for (const v of list) if (v.role === 'police' && !v.dead) { const p = v.body.translation(), d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = v; } }
      return best ? { v: best, d: bd } : null;
    },
  };
}
