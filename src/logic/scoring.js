// Scoring for events: drift chains, medals, race order. Pure.

// Drift: points while sliding fast; the multiplier grows the longer the chain lasts; a crash loses the chain.
export function createDrift() {
  return { score: 0, chain: 0, mult: 1, time: 0, idle: 0 };
}
export function driftStep(d, { slipAngle, speed, dt, crashed }) {
  if (crashed && d.chain > 0) { d.chain = 0; d.mult = 1; d.time = 0; d.idle = 0; return 'lost'; }
  const drifting = speed > 8 && Math.abs(slipAngle) > 0.25;
  if (drifting) {
    d.idle = 0;
    d.time += dt;
    d.mult = Math.min(5, 1 + Math.floor(d.time / 2));
    d.chain += speed * Math.min(1, Math.abs(slipAngle)) * 10 * d.mult * dt;
    return 'drifting';
  }
  if (d.chain > 0 && (d.idle += dt) > 1.5) {
    d.score += Math.round(d.chain);
    d.chain = 0; d.mult = 1; d.time = 0; d.idle = 0;
    return 'banked';
  }
  return null;
}
export const driftTotal = d => Math.round(d.score + d.chain);

// Medals: lower is better for times, higher is better for scores. targets = [gold, silver, bronze].
export function medalForTime(t, [g, s, b]) { return t <= g ? 'gold' : t <= s ? 'silver' : t <= b ? 'bronze' : null; }
export function medalForScore(x, [g, s, b]) { return x >= g ? 'gold' : x >= s ? 'silver' : x >= b ? 'bronze' : null; }
export const MEDAL_PAY = { gold: 1, silver: 0.6, bronze: 0.3 };

// Race order: more checkpoints passed first, then closer to the next checkpoint.
export function raceOrder(racers) {
  return [...racers].sort((a, b) => b.passed - a.passed || a.toNext - b.toNext);
}

export const fmtTime = t => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};
