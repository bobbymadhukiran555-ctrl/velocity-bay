// Events (races, time trial, drift, drag, pursuit) and story missions. One activity runs at a time.
import { route } from './logic/roadgraph.js';
import { createDrift, driftStep, driftTotal, medalForTime, medalForScore, MEDAL_PAY, raceOrder, fmtTime } from './logic/scoring.js';
import { routeAI, laneAI } from './ai.js';
import { locate } from './logic/roadgraph.js';
import { createMarker } from './poi.js';
import { poi, MISSIONS } from './logic/places.js';

const RIVALS = [['vanta', '#1f6fb2'], ['brutus', '#e0a400'], ['vanta', '#2f9e44']];

export function createActivities(G) {
  let cp = null, cp2 = null;
  const setCp = (x, z, color = 0xffd23a, r = 7) => {
    if (!cp) { cp = createMarker(G.scene, x, z, r, color, 14); cp2 = createMarker(G.scene, x, z, r * 0.6, color, 6); }
    cp.set(x, z); cp.group.visible = true;
    G.gps.target = { x, z };
  };
  const setNext = (x, z) => { if (cp2) { cp2.set(x, z); cp2.group.visible = x !== undefined; } };
  const hideCp = () => { if (cp) cp.group.visible = cp2.group.visible = false; G.gps.target = null; };

  function finish(act, ok, title, sub = '') {
    if (G.activity !== act) return;
    G.activity = null;
    act.cleanup?.();
    hideCp();
    G.hud.objective(''); G.hud.info('');
    G.hud.banner(title, sub, ok ? 'good' : 'bad');
    G.freezePlayer = false;
    G.audio?.[ok ? 'win' : 'fail']();
    G.game.persist();
  }
  const needVehicle = () => { if (G.player.mode !== 'car' || !G.player.vehicle) { G.hud.toast('You need a vehicle for this'); return true; } return false; };

  // Teleport the player's vehicle to a start line.
  function toStart(s, lateral = 0) {
    const v = G.player.vehicle, x = s.x - Math.sin(s.heading) * lateral, z = s.z - Math.cos(s.heading) * lateral;
    v.reset(x, z, s.heading);
    v.repair();
    G.rig.snap?.();
  }
  function countdown(act, onGo) {
    act.count = 3.5;
    G.freezePlayer = true;
    act.tick = dt => {
      const before = Math.ceil(act.count - 0.5);
      act.count -= dt;
      const now = Math.ceil(act.count - 0.5);
      if (now !== before && now > 0) { G.hud.banner(String(now), '', 'count'); G.audio?.beep(440); }
      if (act.count <= 0.5 && !act.go) { act.go = true; G.freezePlayer = false; G.hud.banner('GO!', '', 'count'); G.audio?.beep(880); onGo(); }
    };
  }
  // Polyline through all checkpoints in order (for AI racers).
  function racePath(start, cps) {
    const pts = [];
    let from = start;
    for (const [x, z] of cps) { const leg = route(from, { x, z }); pts.push(...(pts.length ? leg.slice(1) : leg)); from = { x, z }; }
    return pts;
  }

  function startRace(e) {
    if (needVehicle()) return;
    const timed = e.type === 'timetrial', laps = e.laps ?? 1;
    toStart(e.start, timed ? 0 : 3.5);
    const seq = [], snapped = e.checkpoints.map(([x, z]) => { const l = locate(x, z); return [l.x, l.z]; });
    for (let l = 0; l < laps; l++) seq.push(...snapped);
    const act = { kind: 'event', id: e.id, name: e.name, t: 0 };
    const racers = [{ me: true, passed: 0, toNext: 0, done: null }];
    const rivals = [];
    if (!timed) {
      const path = racePath(e.start, seq);
      RIVALS.forEach(([model, color], i) => {
        const back = i === 2 ? 16 : 8, lat = i === 2 ? 0 : i === 0 ? -3.5 : 3.5;
        const h = e.start.heading, x = e.start.x - Math.cos(h) * back - Math.sin(h) * lat, z = e.start.z + Math.sin(h) * back - Math.cos(h) * lat;
        const v = G.fleet.spawn({ model, color, pos: { x, y: 0, z }, heading: h, role: 'racer', up: { engine: 2, tires: 2, nitro: 1, armor: 0 } });
        v.reset(x, z, h);
        v.ai = routeAI(path, { latG: 8.2, maxSpeed: 58, nitro: true, avoid: true, frozen: true });
        rivals.push(v);
        racers.push({ v, passed: 0, toNext: 0, done: null });
      });
    }
    G.activity = act;
    G.hud.objective(timed ? `${e.name}: hit every checkpoint` : `${e.name}: finish in the top 3`);
    setCp(...seq[0]); if (seq[1]) setNext(...seq[1]);
    countdown(act, () => rivals.forEach(v => (v.ai.frozen = false)));
    act.update = dt => {
      act.tick(dt);
      if (!act.go) return;
      act.t += dt;
      const P = G.player;
      if (P.mode !== 'car') { act.away = (act.away || 0) + dt; if (act.away > 12) return finish(act, false, 'EVENT FAILED', 'You left your vehicle'); } else act.away = 0;
      for (const r of racers) {
        if (r.done !== null) continue;
        const p = r.me ? P.target() : r.v.body.translation();
        const [cx, cz] = seq[r.passed];
        r.toNext = Math.hypot(p.x - cx, p.z - cz);
        if (r.toNext < 16) {
          r.passed++;
          if (r.me) { G.audio?.beep(1200); if (seq[r.passed]) { setCp(...seq[r.passed]); setNext(...(seq[r.passed + 1] || [])); } }
          if (r.passed >= seq.length) r.done = act.t;
        }
      }
      const me = racers[0];
      // Rubber band: rivals ease off when far ahead and push when behind.
      for (const r of racers.slice(1)) if (r.v.ai) r.v.ai.rubber = r.passed > me.passed + 1 ? 0.88 : r.passed < me.passed - 1 ? 1.15 : 1;
      const order = raceOrder(racers.map(r => ({ ...r, passed: r.done !== null ? 1e6 - r.done : r.passed })));
      const pos = order.findIndex(r => r.me) + 1;
      const lap = Math.min(laps, Math.floor(me.passed / snapped.length) + 1);
      G.hud.info(`${timed ? '' : `Pos ${pos}/${racers.length} · `}${laps > 1 ? `Lap ${lap}/${laps} · ` : ''}CP ${me.passed}/${seq.length} · ${fmtTime(act.t)}`);
      if (me.done !== null) {
        const best = G.save.best[e.id];
        if (best === undefined || me.done < best) G.save.best[e.id] = me.done;
        if (timed) {
          const medal = medalForTime(me.done, e.targets), pay = medal ? Math.round(e.reward * MEDAL_PAY[medal]) : 0;
          G.addMoney(pay);
          return finish(act, !!medal, medal ? `${medal.toUpperCase()} MEDAL` : 'TOO SLOW', `${fmtTime(me.done)}${pay ? ` · +$${pay}` : ` · bronze is ${fmtTime(e.targets[2])}`}`);
        }
        const pay = e.reward[pos - 1] ?? 0;
        G.addMoney(pay);
        return finish(act, pos <= 3, pos === 1 ? 'YOU WIN!' : `FINISHED ${pos}${['st', 'nd', 'rd', 'th'][Math.min(3, pos - 1)]}`, `${fmtTime(me.done)}${pay ? ` · +$${pay}` : ''}`);
      }
    };
    act.cleanup = () => setTimeout(() => rivals.forEach(v => { if (v !== G.player.vehicle) G.fleet.remove(v); }), 4000);
  }

  function startDrift(e) {
    if (needVehicle()) return;
    toStart(e.start);
    const act = { kind: 'event', id: e.id, name: e.name, d: createDrift(), left: e.time };
    G.activity = act;
    G.hud.objective(`${e.name}: drift inside the pink zone. Gold: ${e.targets[0].toLocaleString()}`);
    setCp(e.start.x, e.start.z, 0xff4fd8, e.radius);
    G.gps.target = null;
    countdown(act, () => {});
    act.update = dt => {
      act.tick(dt);
      if (!act.go) return;
      const v = G.player.vehicle;
      if (!v || G.player.mode !== 'car') return finish(act, false, 'EVENT FAILED', 'You left your vehicle');
      act.left -= dt;
      const p = v.body.translation(), inside = Math.hypot(p.x - e.start.x, p.z - e.start.z) < e.radius;
      const res = inside ? driftStep(act.d, { slipAngle: v.state.slipAngle || 0, speed: Math.abs(v.state.speed), dt, crashed: (v.impact?.strength || 0) > 1 }) : null;
      if (res === 'lost') G.hud.toast('Crashed: drift chain lost');
      const total = driftTotal(act.d);
      G.hud.info(`${inside ? '' : 'Back in the zone! · '}Score ${total.toLocaleString()}${act.d.chain > 0 ? ` · chain +${Math.round(act.d.chain)} x${act.d.mult}` : ''} · ${Math.max(0, act.left).toFixed(1)} s`);
      if (act.left <= 0) {
        const medal = medalForScore(total, e.targets), pay = medal ? Math.round(e.reward * MEDAL_PAY[medal]) : 0;
        if (total > (G.save.best[e.id] ?? 0)) G.save.best[e.id] = total;
        G.addMoney(pay);
        finish(act, !!medal, medal ? `${medal.toUpperCase()} MEDAL` : 'NOT ENOUGH', `${total.toLocaleString()} points${pay ? ` · +$${pay}` : ''}`);
      }
    };
  }

  function startDrag(e) {
    if (needVehicle()) return;
    toStart(e.start);
    const h = e.start.heading, fx = Math.cos(h), fz = -Math.sin(h);
    const ox = e.start.x + 16, oz = e.start.z;
    const rival = G.fleet.spawn({ model: 'brutus', color: '#e0a400', pos: { x: ox, y: 0, z: oz }, heading: h, role: 'racer', up: { engine: 2, tires: 2, nitro: 0, armor: 0 } });
    rival.reset(ox, oz, h);
    rival.ai = routeAI([{ x: ox, z: oz }, { x: ox + fx * (e.length + 300), z: oz + fz * (e.length + 300) }], { latG: 50, maxSpeed: 95, frozen: true });
    const act = { kind: 'event', id: e.id, name: e.name, t: 0 };
    G.activity = act;
    G.hud.objective(`${e.name}: beat the Brutus over ${e.length} m. Tip: G for manual gears, E to shift up`);
    const fin = { x: e.start.x + fx * e.length, z: e.start.z + fz * e.length };
    setCp(fin.x + 8, fin.z, 0xff9f1a, 14);
    countdown(act, () => (rival.ai.frozen = false));
    const prog = p => (p.x - e.start.x) * fx + (p.z - e.start.z) * fz;
    act.update = dt => {
      act.tick(dt);
      if (!act.go) return;
      act.t += dt;
      const v = G.player.vehicle;
      if (!v) return finish(act, false, 'EVENT FAILED', 'You left your vehicle');
      const me = prog(v.body.translation()), them = prog(rival.body.translation());
      G.hud.info(`${Math.round(v.speedKmh)} km/h · ${Math.max(0, Math.round(e.length - me))} m to go · ${fmtTime(act.t)}`);
      if (me >= e.length || them >= e.length) {
        const won = me >= e.length && me >= them;
        if (won) { G.addMoney(e.reward); if (!(act.t > (G.save.best[e.id] ?? 1e9))) G.save.best[e.id] = act.t; }
        finish(act, won, won ? 'YOU WIN!' : 'YOU LOST', `${fmtTime(act.t)}${won ? ` · +$${e.reward}` : ''}`);
      }
    };
    act.cleanup = () => setTimeout(() => { if (rival !== G.player.vehicle) G.fleet.remove(rival); }, 3000);
  }

  function startPursuit(e) {
    if (needVehicle()) return;
    if (!G.settings.crime) G.wanted.enabled = true;
    const act = { kind: 'event', id: e.id, name: e.name, left: e.time, phase: 'survive' };
    G.activity = act;
    G.wanted.setStars(e.stars);
    G.hud.objective(`${e.name}: survive the chase`);
    act.update = dt => {
      if (act.phase === 'survive') {
        act.left -= dt;
        G.hud.info(`Survive ${Math.max(0, act.left).toFixed(1)} s`);
        if (act.left <= 0) { act.phase = 'lose'; G.hud.objective('Now lose the cops!'); }
        if (G.wanted.stars === 0) G.wanted.setStars(e.stars); // can't shake them before the time is up
      } else {
        G.hud.info(G.wanted.searching ? 'They lost sight of you…' : 'Lose the cops');
        if (G.wanted.stars === 0) { G.addMoney(e.reward); finish(act, true, 'PURSUIT SURVIVED', `+$${e.reward}`); }
      }
    };
    act.cleanup = () => { if (!G.settings.crime) G.wanted.enabled = false; };
  }

  // ---- Missions ----
  function startMission(m) {
    const act = { kind: 'mission', id: m.id, name: m.name, i: -1, spawned: [] };
    G.activity = act;
    G.hud.banner(m.name.toUpperCase(), 'Mission', 'count');
    const next = () => {
      act.i++;
      act.timer = 0;
      const s = m.steps[act.i];
      if (!s) {
        G.save.missions = Math.max(G.save.missions, MISSIONS.findIndex(x => x.id === m.id) + 1);
        G.addMoney(m.reward);
        return finish(act, true, 'MISSION PASSED', `+$${m.reward.toLocaleString()}`);
      }
      G.hud.objective(s.text || '');
      hideCp();
      if (s.type === 'drive_to' || s.type === 'walk_to' || s.type === 'deliver') setCp(s.x, s.z, 0xffd23a, s.type === 'walk_to' ? 1.6 : 5);
      if (s.type === 'stars') { G.wanted.setStars(s.n); next(); }
      if (s.type === 'steal') {
        const v = G.fleet.spawn({ model: s.model, color: '#d61f1f', pos: { x: s.x, y: 0, z: s.z }, heading: s.heading, role: 'mission' });
        v.reset(s.x, s.z, s.heading); v.driverInside = false;
        act.car = v; act.spawned.push(v);
        setCp(s.x, s.z, 0xffd23a, 3);
      }
      if (s.type === 'chase') {
        const v = G.fleet.spawn({ model: s.model, color: '#5a1a1a', pos: { x: s.x, y: 0, z: s.z }, heading: s.heading, role: 'mission-target', up: { engine: 1, tires: 1, nitro: 0, armor: 1 } });
        v.reset(s.x, s.z, s.heading);
        const l = locate(s.x, s.z);
        v.ai = laneAI(l.edge, 1, l.d, { speedMul: 1.8, ignoreLights: true, speedCap: 40, frozen: true });
        act.target = v; act.spawned.push(v);
      }
      if (s.type === 'kill_gang') act.kills = 0;
    };
    act.cleanup = () => {
      for (const v of act.spawned) if (v !== G.player.vehicle && !v.removed) v.role = 'abandoned';
    };
    act.fail = why => finish(act, false, 'MISSION FAILED', why);
    act.onKill = h => { if (m.steps[act.i]?.type === 'kill_gang' && h.role === 'gang') act.kills++; };
    act.onRobbed = p => { if (m.steps[act.i]?.type === 'rob' && p.id === m.steps[act.i].poi) next(); };
    act.update = dt => {
      const s = m.steps[act.i], P = G.player, t = P.target();
      if (!s) return;
      act.timer += dt;
      const at = (x, z, r) => Math.hypot(t.x - x, t.z - z) < r;
      if (s.time) { const left = s.time - act.timer; G.hud.info(`Time ${fmtTime(Math.max(0, left))}`); if (left <= 0) return act.fail('Out of time'); }
      switch (s.type) {
        case 'drive_to': if (P.mode === 'car' && at(s.x, s.z, 8)) next(); break;
        case 'walk_to': if (P.mode === 'foot' && at(s.x, s.z, 2.6)) next(); break;
        case 'wait': G.hud.info(`${Math.max(0, s.secs - act.timer).toFixed(1)} s`); if (act.timer >= s.secs) next(); break;
        case 'lose_cops': G.hud.info(G.wanted.searching ? 'They lost sight of you…' : `${G.wanted.stars} stars`); if (G.wanted.stars === 0) next(); break;
        case 'steal':
          if (act.car.exploded) return act.fail('The car was destroyed');
          if (P.vehicle === act.car) { act.car.role = 'mission'; next(); }
          break;
        case 'deliver':
          if (act.car.exploded || act.car.health < s.minHealth) return act.fail('The car is too damaged');
          G.hud.info(`Car health ${Math.round(act.car.health * 100)}%`);
          if (P.vehicle !== act.car) G.hud.objective('Get back in the car');
          else { G.hud.objective(s.text); if (at(s.x, s.z, 8)) next(); }
          break;
        case 'chase': {
          const v = act.target, p = v.body.translation(), d = Math.hypot(p.x - t.x, p.z - t.z);
          G.gps.target = { x: p.x, z: p.z };
          if (v.ai?.frozen && (d < 80 || act.timer > 60)) v.ai.frozen = false; // it bolts once you get close
          G.hud.info(`Runner's car ${Math.round(v.health * 100)}% · ${Math.round(d)} m`);
          if (v.dead) { if (v.ai) v.ai = null; next(); }
          else if (d > 600) act.fail('The runner got away');
          break;
        }
        case 'rob': if (!at(poi(s.poi).x, poi(s.poi).z, 6)) G.hud.info('Go back to the vault'); else G.hud.info(''); break;
        case 'kill_gang': G.hud.info(`${act.kills}/${s.n} down`); if (act.kills >= s.n) next(); break;
      }
    };
    next();
  }

  return {
    startEvent(e) {
      if (G.activity) return;
      ({ race: startRace, timetrial: startRace, drift: startDrift, drag: startDrag, pursuit: startPursuit })[e.type](e);
    },
    startMission(m) { if (!G.activity) startMission(m); },
    update(dt) { G.activity?.update(dt); },
    cancel(why) { const a = G.activity; if (a) finish(a, false, a.kind === 'mission' ? 'MISSION FAILED' : 'EVENT OVER', why); },
  };
}
