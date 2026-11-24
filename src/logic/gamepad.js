// Gamepad -> the same input names the keyboard uses. Pure, so it can be tested without a browser.
// Standard mapping: RT gas, LT brake, left stick steer, A handbrake, B nitro, X enter/exit, Y camera,
// LB/RB gears, Back map, Start pause, D-pad up weapon / left lights, L3 horn, R3 back on the road.
export const DEAD = 0.15;

const dz = x => (Math.abs(x) < DEAD ? 0 : Math.sign(x) * ((Math.abs(x) - DEAD) / (1 - DEAD)));
const val = (b, i) => b[i]?.value ?? 0;

export function readPad(pad, prev = []) {
  const b = pad.buttons || [], ax = pad.axes || [];
  const down = i => val(b, i) > 0.5;
  const edge = i => down(i) && !((prev[i] ?? 0) > 0.5);
  const held = [], edges = [];
  if (down(0)) held.push('handbrake');
  if (down(1)) held.push('nitro');
  if (down(10)) held.push('horn');
  for (const [i, n] of [[2, 'interact'], [3, 'camera'], [4, 'shiftDown'], [5, 'shiftUp'], [8, 'map'], [9, 'pause'], [11, 'reset'], [12, 'weapon'], [14, 'lights']]) {
    if (edge(i)) edges.push(n);
  }
  const sx = dz(ax[0] ?? 0), sy = dz(ax[1] ?? 0);
  return {
    throttle: dz(val(b, 7)),
    brake: dz(val(b, 6)),
    steer: sx,
    pitch: sy, // left stick forward = dive, back = climb (planes)
    look: { x: dz(ax[2] ?? 0), y: dz(ax[3] ?? 0) }, // right stick: cockpit look
    stick: { x: sx, y: -sy || 0 },
    held,
    edges,
    buttons: b.map(x => x?.value ?? 0),
  };
}
