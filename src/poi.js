// Map markers and what happens at them: garage, spray shop, dealer, arms depot, robberies, speed cameras, stunt jumps.
import * as THREE from 'three';
import { POIS, ROB, SPEED_CAMS, RAMPS, MISSIONS, EVENTS } from './logic/places.js';
import { heightAt } from './logic/map.js';
import { groundAt } from './humans.js';

const gradient = (() => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const ctx = c.getContext('2d'), g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
})();

export function createMarker(scene, x, z, r, color, height = 7) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(r, r, height, 28, 1, true).translate(0, height / 2, 0),
    new THREE.MeshBasicMaterial({ color, alphaMap: gradient, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.35, r, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
  ring.position.y = 0.12;
  g.add(beam, ring);
  scene.add(g);
  const m = {
    group: g, x, z, r,
    set(nx, nz) { m.x = nx; m.z = nz; g.position.set(nx, groundAt(nx, nz), nz); },
    pulse(t) { beam.material.opacity = 0.3 + 0.15 * Math.sin(t * 3); },
    remove() { scene.remove(g); beam.geometry.dispose(); ring.geometry.dispose(); },
  };
  m.set(x, z);
  return m;
}

const COLORS = { garage: 0x3ddc84, spray: 0x3aa0ff, dealer: 0xb06cff, arms: 0xff8a3a, mission: 0xffd23a, race: 0xff3b3b, timetrial: 0x31e1ff, drift: 0xff4fd8, drag: 0xff9f1a, pursuit: 0x4f7bff };
export const BLIP_COLORS = COLORS;

export function createPois(G) {
  const markers = [];
  for (const p of POIS) if (COLORS[p.type]) markers.push({ kind: 'poi', ref: p, m: createMarker(G.scene, p.x, p.z, p.drive ? 3.5 : 1.4, COLORS[p.type], p.drive ? 6 : 4) });
  for (const e of EVENTS) markers.push({ kind: 'event', ref: e, m: createMarker(G.scene, e.start.x, e.start.z, 4.5, COLORS[e.type], 10) });
  const missionMarker = createMarker(G.scene, 0, 0, 1.6, COLORS.mission, 6);
  const robCool = {};
  let robbing = null, robT = 0, stunt = null, camFlash = 0;
  const cams = SPEED_CAMS.map(c => ({ ...c, last: -99 }));
  const stunts = RAMPS.filter(r => r.stunt);

  const nextMission = () => MISSIONS.slice(G.save.missions).find(m => G.settings.crime || !m.crime);
  const near = (x, z, r) => { const t = G.player.target(); return Math.hypot(t.x - x, t.z - z) < r; };

  // What F would do right now, if anything special.
  function action() {
    const P = G.player, foot = P.mode === 'foot', car = P.mode === 'car';
    if (G.activity) return null;
    const m = nextMission();
    if (m && near(m.start.x, m.start.z, 3)) return { text: `F  Start mission: ${m.name}`, run: () => G.activities.startMission(m) };
    for (const e of EVENTS) if (near(e.start.x, e.start.z, 6)) return car ? { text: `F  Start ${e.name}`, run: () => G.activities.startEvent(e) } : { text: `${e.name}: bring a vehicle` };
    for (const p of POIS) {
      if (!near(p.x, p.z, p.drive ? 4.5 : 2.4)) continue;
      if (p.drive && car) {
        if (p.type === 'garage') return { text: 'F  Garage (save, change car, upgrades)', run: () => { G.game.persist(); G.menus.openSelector('garage'); } };
        if (p.type === 'dealer') return { text: 'F  Car dealer', run: () => G.menus.openSelector('dealer') };
        if (p.type === 'spray') return { text: 'F  Spray & Fix: repair, new paint, lose the cops ($100)', run: spray };
      }
      if (foot && p.type === 'arms') return { text: 'F  Arms Depot', run: () => G.menus.openShop() };
      if (foot && ROB[p.type]) {
        const r = ROB[p.type];
        if (!G.settings.crime) return null;
        if ((robCool[p.id] ?? -1e9) > G.clock) return { text: `${p.label}: robbed recently` };
        if (r.needsGun && !['pistol', 'smg'].includes(P.weapon)) return { text: `${p.label}: you need a gun out to rob it (X to switch)` };
        return { text: `Hold F  Rob the ${p.label}`, rob: p };
      }
    }
    return null;
  }

  function spray() {
    const v = G.player.vehicle;
    if (G.wanted.stars > 0 && G.police.seen) { G.hud.toast('Not while the cops can see you!'); return; }
    if (G.money < 100) { G.hud.toast('Spray & Fix costs $100'); return; }
    G.addMoney(-100);
    v.repair();
    const c = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    v.setColor(c);
    if (v.owned !== undefined && G.save.garage[v.owned]) G.save.garage[v.owned].color = c;
    if (G.wanted.stars > 0) { G.wanted.clear(); G.onEscaped?.(); }
    G.hud.toast('Fixed and resprayed!');
    G.audio?.cash();
  }

  return {
    nextMission,
    markers, missionMarker,
    update(dt, held) {
      const t = G.clock;
      const busy = !!G.activity;
      for (const k of markers) { k.m.group.visible = !busy || k.kind === 'poi'; k.m.pulse(t); }
      const m = nextMission();
      missionMarker.group.visible = !!m && !busy;
      if (m) { missionMarker.set(m.start.x, m.start.z); missionMarker.pulse(t); }

      const a = action();
      G.hud.prompt(robbing ? `Robbing… ${Math.round((robT / ROB[robbing.type].secs) * 100)}%` : a?.text || '');
      // Robbery: hold F.
      if (a?.rob && held.use) {
        if (robbing !== a.rob) { robbing = a.rob; robT = 0; G.humans.panicAround(robbing.x, robbing.z, 25); }
        robT += dt;
        const r = ROB[robbing.type];
        if (robT >= r.secs) {
          const cash = Math.round(r.cash[0] + Math.random() * (r.cash[1] - r.cash[0]));
          G.bag += cash;
          G.wanted.crime(r.heat);
          robCool[robbing.id] = G.clock + r.cooldown;
          G.hud.toast(`Grabbed $${cash}! Lose the cops to keep it.`);
          G.audio?.cash();
          G.onRobbed?.(robbing);
          robbing = null; robT = 0;
        }
      } else { robbing = null; robT = 0; }

      // Speed cameras and stunt jumps (free roam only).
      const v = G.player.vehicle;
      if (v && G.player.mode === 'car' && !busy) {
        const p = v.body.translation();
        for (const c of cams) {
          if (t - c.last < 6 || Math.hypot(p.x - c.px, p.z - c.pz) > 14) continue;
          c.last = t;
          const kmh = Math.round(v.speedKmh), best = G.save.best[c.id] ?? 0;
          G.hud.flash();
          if (kmh > best && kmh > 100) {
            const pay = Math.round((kmh - Math.max(best, 100)) * 10);
            G.save.best[c.id] = kmh; G.addMoney(pay);
            G.hud.banner(`SPEED CAMERA  ${kmh} km/h`, `New best! +$${pay}`);
          } else G.hud.toast(`Speed camera: ${kmh} km/h (best ${best})`);
        }
        if (!stunt) {
          for (const r of stunts) {
            const dx = p.x - r.x, dz = p.z - r.z, c = Math.cos(r.heading), s = Math.sin(r.heading);
            const lx = dx * c - dz * s, lz = dx * s + dz * c;
            if (Math.abs(lx) < r.len / 2 + 1 && Math.abs(lz) < r.width / 2 + 0.5 && v.speedKmh > 40 && Math.cos(v.heading - r.heading) > 0.7) { stunt = { r, armed: t, air: 0 }; break; }
          }
        } else {
          if (!v.onGround) stunt.air += dt / G.timeScale;
          if (stunt.air > 0.15) G.timeScale = 0.4;
          const landed = stunt.air > 0.15 && v.onGround;
          if (landed || (stunt.air === 0 && t - stunt.armed > 1.5)) {
            G.timeScale = 1;
            if (landed) {
              const ok = stunt.air > 0.8 && v.upY > 0.5, id = stunt.r.id;
              if (ok) G.statsProgress('jumps');
              if (ok && !G.save.stunts.includes(id)) { G.save.stunts.push(id); G.statsProgress('stunts'); G.addMoney(500); G.hud.banner('UNIQUE STUNT JUMP!', `+$500 · ${G.save.stunts.length}/${stunts.length} found`); G.audio?.cash(); }
              else if (ok) G.hud.toast(`Stunt jump! ${stunt.air.toFixed(1)} s air`);
              else G.hud.toast('Stunt failed');
            }
            stunt = null;
          }
        }
      } else if (stunt) { stunt = null; G.timeScale = 1; }
      camFlash = Math.max(0, camFlash - dt);
      return a;
    },
  };
}
