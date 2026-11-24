import { locate } from './roadgraph.js';
import { zoneAt } from './map.js';

// Tyre grip multiplier by what's under the wheels: tarmac ~1, dirt/grass/sand less.
// The taper stops grip snapping when a wheel crosses the edge of a road.
export function surfaceGrip(x, z) {
  const lane = locate(x, z), onRoad = 1 - Math.min(1, Math.max(0, (lane.dist - 7) / 4));
  const zone = zoneAt(x, z);
  const loose = zone === 'desert' || zone === 'beach' ? 0.62 : zone === 'mountains' || zone === 'outskirts' ? 0.72 : 0.8;
  return loose + (1 - loose) * onRoad;
}
