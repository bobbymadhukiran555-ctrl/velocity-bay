// AI drivers. Every AI follows a polyline with pure-pursuit steering; they differ in where the line goes and how fast.
import { GRAPH, signalAt, axisOf, route, along } from './logic/roadgraph.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const HOLD = { throttle: 0, brake: 1, steer: 0, handbrake: false, nitro: false, hold: true };

// Steer toward (tx, tz) and hold targetSpeed (m/s).
export function driveTo(v, tx, tz, targetSpeed, nitro = false) {
  const p = v.body.translation(), h = v.heading, dx = tx - p.x, dz = tz - p.z;
  const alpha = wrap(Math.atan2(-dz, dx) - h), Ld = Math.max(4, Math.hypot(dx, dz));
  const wb = v.spec.axles[0] - v.spec.axles[1];
  const steer = clamp(-Math.atan((2 * wb * Math.sin(alpha)) / Ld) / v.maxSteer(), -1, 1);
  const sp = v.state.speed;
  if (targetSpeed < 0.3 && Math.abs(sp) < 1) return HOLD;
  return {
    throttle: clamp((targetSpeed - sp) * 0.35, 0, 1) * (Math.abs(alpha) > 1.2 ? 0.5 : 1),
    brake: sp > targetSpeed + 1.5 ? clamp((sp - targetSpeed) * 0.15, 0.1, 1) : 0,
    steer, handbrake: false, nitro: nitro && Math.abs(alpha) < 0.15 && sp > 10,
  };
}

function cum(pts, from = 0, base = []) {
  const c = base.slice(0, from + 1);
  if (!c.length) c.push(0);
  for (let i = c.length; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return c;
}

// Follower state over a polyline: { pts, cum, i }.
function advance(f, x, z) {
  // Snap to the nearest point a little way ahead (robust if a crash knocked the car off its line).
  const p = f.pts, end = Math.min(p.length, f.i + 25);
  let best = f.i, bd = Infinity;
  for (let j = f.i; j < end; j++) { const d = (p[j].x - x) ** 2 + (p[j].z - z) ** 2; if (d < bd) { bd = d; best = j; } }
  f.i = best;
}
function lookahead(f, dist) {
  const d = f.cum[f.i] + dist;
  if (f.loop && d > f.cum[f.cum.length - 1]) return along(f.pts, f.cum, d - f.cum[f.cum.length - 1]);
  return along(f.pts, f.cum, d);
}
// Fastest safe speed for the bend ahead (lateral grip ~ latG m/s^2).
function bendSpeed(f, from, span, latG) {
  const a = lookahead(f, from), b = lookahead(f, from + span / 2), c = lookahead(f, from + span);
  const h1 = Math.atan2(b.z - a.z, b.x - a.x), h2 = Math.atan2(c.z - b.z, c.x - b.x);
  const turn = Math.abs(wrap(h2 - h1));
  return turn < 0.02 ? 99 : Math.sqrt(latG * ((span / 2) / turn));
}

// Nearest thing blocking the lane ahead: returns the gap in metres (Infinity if clear).
function gapAhead(G, v) {
  const p = v.body.translation(), h = v.heading, c = Math.cos(h), s = Math.sin(h);
  let gap = Infinity;
  const test = (x, z, half) => {
    const dx = x - p.x, dz = z - p.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (lx > 0 && lx < 40 && Math.abs(lz) < 2.3) gap = Math.min(gap, lx - v.spec.len / 2 - half);
  };
  for (const o of G.fleet.list) if (o !== v) { const q = o.body.translation(); test(q.x, q.z, o.spec.len / 2); }
  for (const hm of G.humans.list) if (hm.visible && hm.state !== 'dead' && !hm.ride) test(hm.x, hm.z, 0.4);
  return gap;
}

// ---- Lane driving: random routes through the road graph, obeying traffic lights ----
function appendEdge(ai, edge, dir) {
  // Trim the lane short of busy junctions so turns become smooth curves instead of overshooting the corner.
  const lane = edge.lanes[dir], lc = edge.laneCum[dir], len = lc[lc.length - 1];
  const from = dir === 1 ? edge.a : edge.b, to = dir === 1 ? edge.b : edge.a;
  const t0 = from.edges.length >= 3 ? Math.min(from.stop - 2, len / 3) : 0, t1 = to.edges.length >= 3 ? Math.min(to.stop - 2, len / 3) : 0;
  let pts = lane.filter((_, k) => lc[k] >= t0 && lc[k] <= len - t1);
  if (pts.length < 2) pts = [lane[0], lane[lane.length - 1]];
  const start = ai.pts.length, n = pts.length;
  ai.pts.push(...pts);
  ai.marks.push({ idx: start + n - 1, node: to, before: t1 ? 2 : to.stop, axis: axisOf(pts[n - 1].x - pts[n - 2].x, pts[n - 1].z - pts[n - 2].z) });
  ai.cum = cum(ai.pts, Math.max(0, start - 1), ai.cum);
  ai.edge = edge; ai.dir = dir;
}
function nextEdge(edge, dir) {
  const node = dir === 1 ? edge.b : edge.a;
  const opts = node.edges.filter(o => o.edge !== edge);
  if (!opts.length) return { edge, dir: -dir }; // dead end: turn around
  const inDir = dir === 1 ? edge.pts[edge.pts.length - 1].x - edge.pts[edge.pts.length - 2].x : edge.pts[0].x - edge.pts[1].x;
  const weights = opts.map(o => {
    const e = o.edge, p = o.dir === 1 ? [e.pts[0], e.pts[1]] : [e.pts[e.pts.length - 1], e.pts[e.pts.length - 2]];
    return Math.abs(Math.sign(p[1].x - p[0].x) - Math.sign(inDir)) < 0.5 ? 2 : 1; // prefer going straight
  });
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < opts.length; i++) if ((r -= weights[i]) <= 0) return opts[i];
  return opts[0];
}

export function laneAI(edge, dir, d, opts = {}) {
  const ai = { type: 'lane', pts: [], cum: [], marks: [], i: 0, speedMul: 1, ignoreLights: false, stuck: 0, reverse: 0, ...opts };
  appendEdge(ai, edge, dir);
  const at = along(edge.lanes[dir], edge.laneCum[dir], d);
  ai.i = ai.pts.reduce((b, p, k) => ((p.x - at.x) ** 2 + (p.z - at.z) ** 2 < (ai.pts[b].x - at.x) ** 2 + (ai.pts[b].z - at.z) ** 2 ? k : b), 0);
  return ai;
}

function laneInput(G, v, ai, dt) {
  const p = v.body.translation();
  advance(ai, p.x, p.z);
  // Keep a couple of hundred metres of road ahead; drop what's behind.
  if (ai.cum[ai.cum.length - 1] - ai.cum[ai.i] < 150) { const n = nextEdge(ai.edge, ai.dir); appendEdge(ai, n.edge, n.dir); }
  if (ai.i > 80) {
    const cut = ai.i - 2;
    ai.pts.splice(0, cut); ai.marks = ai.marks.filter(m => (m.idx -= cut) >= 0); ai.i -= cut;
    ai.cum = cum(ai.pts);
  }
  const edgeSpeed = ai.edgeSpeed ?? 13;
  let target = Math.min(ai.speedCap ?? 99, (v.spec.police && ai.patrol ? 14 : speedLimitAt(ai)) * ai.speedMul);
  const sp = Math.max(0, v.state.speed);
  target = Math.min(target, bendSpeed(ai, 4, 24, 4.5));
  if (!ai.ignoreLights) {
    const m = ai.marks.find(m => m.idx >= ai.i);
    if (m && m.node.signal) {
      const dStop = ai.cum[m.idx] - ai.cum[ai.i] - m.before;
      const st = signalAt(G.clock, m.node, m.axis);
      const canStop = sp * sp / (2 * 6) < dStop + 1; // could stop without slamming the brakes
      let wait = dStop > -2 && (st === 'red' || st === 'yellow') && canStop;
      // Green, but don't drive into a junction that still has cross traffic in it.
      if (!wait && dStop > 0 && dStop < 14) {
        const h = v.heading;
        for (const u of G.fleet.list) {
          if (u === v || u.speedKmh < 8) continue;
          const q = u.body.translation();
          if (Math.hypot(q.x - m.node.x, q.z - m.node.z) < m.node.stop + 3 && Math.abs(Math.sin(u.heading - h)) > 0.5) { wait = true; break; }
        }
      }
      if (wait) target = Math.min(target, dStop < 0.5 ? 0 : Math.sqrt(2 * 3.5 * dStop));
    }
  }
  const gap = gapAhead(G, v);
  if (gap < 30) target = Math.min(target, Math.max(0, (gap - 5) * 0.8));
  ai.blockedBy = gap < 8 ? (ai.blockedBy ?? 0) + dt : 0;
  v.state.horn = ai.blockedBy > 2.5 && ai.blockedBy % 3 < 0.4;
  const t = lookahead(ai, 4 + sp * 0.4);
  return driveTo(v, t.x, t.z, target, false);
  function speedLimitAt(a) { const e = a.edge; return e ? e.speed : edgeSpeed; }
}

// ---- Following a fixed route (races, chase targets, police routes) ----
// Resample a polyline so no two points are more than 5 m apart (the follower snaps to nearby points).
function densify(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 5);
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: (a.y ?? 0) + (((b.y ?? 0) - (a.y ?? 0)) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  return out;
}
export function routeAI(pts, opts = {}) {
  pts = densify(pts);
  return { type: 'route', pts, cum: cum(pts), i: 0, latG: 8, maxSpeed: 60, stuck: 0, reverse: 0, ...opts };
}
function routeInput(G, v, ai) {
  const p = v.body.translation();
  advance(ai, p.x, p.z);
  if (ai.loop && ai.i >= ai.pts.length - 2) ai.i = 0;
  const sp = Math.max(0, v.state.speed);
  let target = Math.min(ai.maxSpeed, bendSpeed(ai, 4 + sp * 0.3, 20 + sp * 1.2, ai.latG), bendSpeed(ai, 4 + sp * 1.2, 30 + sp, ai.latG));
  target *= ai.rubber ?? 1;
  if (!ai.loop && ai.cum[ai.cum.length - 1] - ai.cum[ai.i] < 3) return HOLD;
  const gap = ai.avoid ? gapAhead(G, v) : Infinity;
  if (gap < 25) target = Math.min(target, Math.max(4, gap * 1.2));
  const t = lookahead(ai, 5 + sp * 0.5);
  return driveTo(v, t.x, t.z, target, ai.nitro);
}

// ---- Police pursuit: road route to the player, straight at them when close ----
export function pursuitAI(opts = {}) { return { type: 'pursuit', pts: [], cum: [0], i: 0, timer: 0, stuck: 0, reverse: 0, ...opts }; }
function pursuitInput(G, v, ai, dt) {
  const tgt = G.player.target(), p = v.body.translation(), d = Math.hypot(tgt.x - p.x, tgt.z - p.z);
  if (d < 32) {
    const tv = tgt.vehicle ? tgt.vehicle.body.linvel() : { x: 0, z: 0 };
    const onFoot = !tgt.vehicle;
    if (onFoot && d < 14) return HOLD;
    return driveTo(v, tgt.x + tv.x * 0.45, tgt.z + tv.z * 0.45, onFoot ? 6 : 45, d > 15);
  }
  if ((ai.timer -= dt) <= 0 || ai.pts.length < 2) {
    ai.timer = 1.5;
    ai.pts = densify(route(p, tgt)); ai.cum = cum(ai.pts); ai.i = 0;
  }
  advance(ai, p.x, p.z);
  const sp = Math.max(0, v.state.speed);
  const target = Math.min(48, bendSpeed(ai, 4 + sp * 0.3, 20 + sp * 1.2, 8.5), bendSpeed(ai, 4 + sp * 1.2, 30 + sp, 8.5));
  const t = lookahead(ai, 5 + sp * 0.5);
  return driveTo(v, t.x, t.z, target, true);
}

// Common wrapper: dispatch, then back up when stuck against something.
export function aiInput(G, v, dt) {
  const ai = v.ai;
  if (!ai || ai.type === 'hold') return HOLD;
  if (ai.frozen) return HOLD;
  if (ai.reverse > 0) { ai.reverse -= dt; return { throttle: 0, brake: 1, steer: ai.revSteer, handbrake: false, nitro: false }; }
  const input = ai.type === 'lane' ? laneInput(G, v, ai, dt) : ai.type === 'route' ? routeInput(G, v, ai) : ai.type === 'pursuit' ? pursuitInput(G, v, ai, dt) : HOLD;
  if (input.throttle > 0.3 && Math.abs(v.state.speed) < 0.6) {
    if ((ai.stuck += dt) > 1.8) {
      ai.stuck = 0; ai.reverse = 1.3; ai.revSteer = -input.steer || 1; ai.stuckCount = (ai.stuckCount || 0) + 1;
      // Still stuck and nobody is looking: put it back on its route a little further on.
      const p = v.body.translation(), q = ai.pts?.[Math.min(ai.pts.length - 2, ai.i + 3)], r = ai.pts?.[Math.min(ai.pts.length - 1, ai.i + 4)];
      if (ai.stuckCount >= 2 && q && r && !G.inView(p.x, p.z)) { v.reset(q.x, q.z, Math.atan2(-(r.z - q.z), r.x - q.x)); ai.reverse = 0; ai.stuckCount = 0; }
    }
  } else { ai.stuck = 0; if (Math.abs(v.state.speed) > 4) ai.stuckCount = 0; }
  return input;
}
