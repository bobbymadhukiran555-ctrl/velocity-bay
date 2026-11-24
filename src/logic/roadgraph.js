// Road network as a graph (junction nodes + edges with polylines), for traffic, police, racers and the GPS.
// Pure: no Three.js. Traffic drives on the right.
import { ROADS, ROAD_PROFILES, heightAt } from './map.js';

const STEP = 5, MERGE = 9;
const SPEED = { street: 13, road: 22, highway: 30 }; // m/s cruising speeds

function lines() {
  const out = ROAD_PROFILES.map(p => ({ name: p.road.name, width: p.road.width, kind: p.road.name === 'highway' ? 'highway' : 'road', closed: p.closed, pts: p.pts.map(q => ({ ...q })) }));
  for (const r of ROADS) {
    if (r.kind !== 'street') continue;
    const [a, b] = r.points, n = Math.round(Math.hypot(b.x - a.x, b.z - a.z) / STEP), pts = [];
    for (let i = 0; i <= n; i++) { const x = a.x + ((b.x - a.x) * i) / n, z = a.z + ((b.z - a.z) * i) / n; pts.push({ x, z, y: heightAt(x, z) }); }
    out.push({ name: r.name, width: r.width, kind: 'street', closed: false, pts });
  }
  return out;
}

function offsetLine(pts, off) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    return { x: p.x - dz * off, z: p.z + dx * off, y: p.y };
  });
}
const cumulative = pts => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)); return c; };

function build() {
  const L = lines();
  // Spatial hash of every sample point.
  const cell = 10, hash = new Map(), key = (i, j) => i * 100003 + j;
  L.forEach((l, li) => l.pts.forEach((p, pi) => {
    const k = key(Math.floor(p.x / cell), Math.floor(p.z / cell));
    if (!hash.has(k)) hash.set(k, []);
    hash.get(k).push([li, pi]);
  }));
  const near = (x, z, r, skip) => {
    const out = [], R = Math.ceil(r / cell);
    for (let i = Math.floor(x / cell) - R; i <= Math.floor(x / cell) + R; i++)
      for (let j = Math.floor(z / cell) - R; j <= Math.floor(z / cell) + R; j++)
        for (const [li, pi] of hash.get(key(i, j)) || []) {
          if (li === skip) continue;
          const p = L[li].pts[pi], d = Math.hypot(p.x - x, p.z - z);
          if (d <= r) out.push({ li, pi, d });
        }
    return out;
  };
  const splits = L.map(l => new Set(l.closed ? [] : [0, l.pts.length - 1]));
  L.forEach((l, li) => {
    // T-junctions: an open road's end touching another road splits that road.
    if (!l.closed) for (const pi of [0, l.pts.length - 1]) {
      const best = near(l.pts[pi].x, l.pts[pi].z, 14, li).sort((a, b) => a.d - b.d)[0];
      if (best) splits[best.li].add(best.pi);
    }
    // Crossings split both roads.
    l.pts.forEach((p, pi) => { for (const h of near(p.x, p.z, 2.6, li)) { splits[li].add(pi); splits[h.li].add(h.pi); } });
  });

  const nodes = [], edges = [];
  const nodeAt = p => {
    let n = nodes.find(q => Math.hypot(q.x - p.x, q.z - p.z) < MERGE);
    if (!n) { n = { id: nodes.length, x: p.x, z: p.z, y: p.y, edges: [] }; nodes.push(n); }
    return n;
  };
  L.forEach((l, li) => {
    const idx = [...splits[li]].sort((a, b) => a - b);
    const pieces = [];
    for (let i = 0; i < idx.length - 1; i++) pieces.push(l.pts.slice(idx[i], idx[i + 1] + 1));
    if (l.closed && idx.length) pieces.push([...l.pts.slice(idx[idx.length - 1]), ...l.pts.slice(0, idx[0] + 1)]);
    for (const pts of pieces) {
      const a = nodeAt(pts[0]), b = nodeAt(pts[pts.length - 1]);
      if (a === b || pts.length < 2) continue;
      const lane = l.kind === 'street' ? 5 : l.kind === 'highway' ? 6 : l.width / 4;
      const e = { id: edges.length, a, b, pts, cum: cumulative(pts), width: l.width, kind: l.kind, name: l.name, lane, speed: SPEED[l.kind] };
      e.len = e.cum[e.cum.length - 1];
      const fwd = offsetLine(pts, lane), back = offsetLine([...pts].reverse(), lane);
      e.lanes = { 1: fwd, [-1]: back };
      e.laneCum = { 1: cumulative(fwd), [-1]: cumulative(back) };
      edges.push(e);
      a.edges.push({ edge: e, dir: 1 });
      b.edges.push({ edge: e, dir: -1 });
    }
  });
  for (const n of nodes) {
    n.signal = n.edges.length >= 3; // every junction has lights, so fast roads never T-bone side traffic
    n.stop = Math.max(...n.edges.map(o => o.edge.width)) / 2 + 2; // stop line distance from the junction centre
    n.offset = (((n.x + n.z) / 100) * 4 % 30 + 30) % 30;
  }
  return { nodes, edges };
}

export const GRAPH = build();

// Segment grid for locate().
const SEG_CELL = 40, segGrid = new Map();
for (const e of GRAPH.edges)
  for (let i = 0; i < e.pts.length - 1; i++) {
    const a = e.pts[i], b = e.pts[i + 1];
    for (let cx = Math.floor((Math.min(a.x, b.x) - 20) / SEG_CELL); cx <= Math.floor((Math.max(a.x, b.x) + 20) / SEG_CELL); cx++)
      for (let cz = Math.floor((Math.min(a.z, b.z) - 20) / SEG_CELL); cz <= Math.floor((Math.max(a.z, b.z) + 20) / SEG_CELL); cz++) {
        const k = cx * 100003 + cz;
        if (!segGrid.has(k)) segGrid.set(k, []);
        segGrid.get(k).push([e, i]);
      }
  }

function projSeg(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
  const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / L2));
  const px = a.x + dx * t, pz = a.z + dz * t;
  return { t, px, pz, d: Math.hypot(x - px, z - pz) };
}

// Nearest point on the network: { edge, d (metres from edge start), x, z, dist }.
export function locate(x, z) {
  let best = null;
  const test = (e, i) => {
    const p = projSeg(x, z, e.pts[i], e.pts[i + 1]);
    if (!best || p.d < best.dist) best = { edge: e, d: e.cum[i] + p.t * (e.cum[i + 1] - e.cum[i]), x: p.px, z: p.pz, dist: p.d };
  };
  for (let cx = Math.floor(x / SEG_CELL) - 1; cx <= Math.floor(x / SEG_CELL) + 1; cx++)
    for (let cz = Math.floor(z / SEG_CELL) - 1; cz <= Math.floor(z / SEG_CELL) + 1; cz++)
      for (const [e, i] of segGrid.get(cx * 100003 + cz) || []) test(e, i);
  if (!best) for (const e of GRAPH.edges) for (let i = 0; i < e.pts.length - 1; i++) test(e, i);
  return best;
}

// Point at distance d along a polyline with cumulative lengths.
export function along(pts, cum, d) {
  if (d <= 0) return { ...pts[0], i: 0 };
  let lo = 0, hi = cum.length - 1;
  if (d >= cum[hi]) return { ...pts[hi], i: hi - 1 };
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
  const t = (d - cum[lo]) / (cum[hi] - cum[lo] || 1), a = pts[lo], b = pts[hi];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, i: lo };
}

function slice(e, from, to) {
  // Points of edge e between distances from..to (either order), in travel order.
  const rev = to < from, lo = Math.min(from, to), hi = Math.max(from, to), out = [along(e.pts, e.cum, lo)];
  for (let i = 0; i < e.pts.length; i++) if (e.cum[i] > lo && e.cum[i] < hi) out.push(e.pts[i]);
  out.push(along(e.pts, e.cum, hi));
  return rev ? out.reverse() : out;
}

// Shortest drive between two world points, as a polyline along the roads.
export function route(from, to) {
  const A = locate(from.x, from.z), B = locate(to.x, to.z);
  if (A.edge === B.edge) return slice(A.edge, A.d, B.d);
  const N = GRAPH.nodes.length, dist = new Float64Array(N).fill(Infinity), prev = new Array(N).fill(null), done = new Uint8Array(N);
  dist[A.edge.a.id] = A.d; dist[A.edge.b.id] = Math.min(dist[A.edge.b.id], A.edge.len - A.d);
  for (;;) {
    let u = -1;
    for (let i = 0; i < N; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = 1;
    for (const { edge, dir } of GRAPH.nodes[u].edges) {
      const v = (dir === 1 ? edge.b : edge.a).id, nd = dist[u] + edge.len;
      if (nd < dist[v]) { dist[v] = nd; prev[v] = { u, edge, dir }; }
    }
  }
  const endA = dist[B.edge.a.id] + B.d, endB = dist[B.edge.b.id] + B.edge.len - B.d;
  const end = endA <= endB ? B.edge.a : B.edge.b;
  if (!Number.isFinite(Math.min(endA, endB))) return [{ x: from.x, z: from.z, y: 0 }, { x: to.x, z: to.z, y: 0 }];
  const chain = [];
  for (let n = end.id; prev[n]; n = prev[n].u) chain.unshift(prev[n]);
  const start = chain.length ? chain[0].u : end.id;
  const out = slice(A.edge, A.d, start === A.edge.a.id ? 0 : A.edge.len);
  for (const { edge, dir } of chain) out.push(...(dir === 1 ? edge.pts : [...edge.pts].reverse()).slice(1));
  out.push(...slice(B.edge, end === B.edge.a ? 0 : B.edge.len, B.d).slice(1));
  return out;
}

export const routeLength = pts => cumulative(pts)[pts.length - 1];

// Traffic lights: 30 s cycle, north-south first, with 3 s of yellow and 1.5 s of all-red.
export function signalAt(t, node, axis) {
  const ph = (((t + node.offset) % 30) + 30) % 30;
  if (axis === 'ns') return ph < 10.5 ? 'green' : ph < 13.5 ? 'yellow' : 'red';
  return ph >= 15 && ph < 25.5 ? 'green' : ph >= 25.5 && ph < 28.5 ? 'yellow' : 'red';
}
export const axisOf = (dx, dz) => (Math.abs(dz) > Math.abs(dx) ? 'ns' : 'ew');

// Spawn spots every 20 m of every lane.
export const SAMPLES = [];
for (const e of GRAPH.edges) for (let d = 10; d < e.len - 10; d += 20) for (const dir of [1, -1]) SAMPLES.push({ edge: e, dir, d });
