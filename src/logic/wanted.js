// Wanted level rules. Crimes add heat; heat sets the stars; staying out of sight clears it. Pure.
export const HEAT = {
  hitPed: 30, killPed: 70, hitCop: 90, killCop: 260, carjack: 25, stealParked: 12, shoot: 22,
  robAtm: 30, robShop: 120, robBank: 470, crashCop: 40, speeding: 22, gang: 6,
};
export const STAR_HEAT = [0, 20, 100, 250, 450, 750]; // minimum heat for 0..5 stars

export const starsFor = heat => STAR_HEAT.reduce((s, h, i) => (heat >= h ? i : s), 0);
export const searchTime = stars => 10 + stars * 6; // seconds out of sight to escape

export function policeFor(stars) {
  return {
    cars: [0, 1, 2, 3, 4, 5][stars] ?? 5,
    armoured: stars >= 5 ? 2 : 0,
    roadblocks: stars >= 3,
    heli: stars >= 4,
    shoot: stars >= 2,
  };
}

export function createWanted() {
  const w = { heat: 0, unseen: 0, seen: false, lastSeen: null, enabled: true };
  const api = {
    get stars() { return starsFor(w.heat); },
    get heat() { return w.heat; },
    get unseen() { return w.unseen; },
    get searching() { return api.stars > 0 && !w.seen; },
    get lastSeen() { return w.lastSeen; },
    get enabled() { return w.enabled; },
    set enabled(v) { w.enabled = v; if (!v) api.clear(); },
    // A crime. Returns true if the stars went up.
    crime(kind, mult = 1) {
      if (!w.enabled) return false;
      const before = api.stars;
      w.heat = Math.min(STAR_HEAT[5] + 200, w.heat + (HEAT[kind] ?? 0) * mult);
      w.unseen = 0;
      return api.stars > before;
    },
    setStars(n) { w.heat = n > 0 && w.enabled ? STAR_HEAT[Math.min(5, n)] + 1 : 0; w.unseen = 0; },
    clear() { w.heat = 0; w.unseen = 0; w.lastSeen = null; },
    // Call every frame with whether any police unit can see the player. Returns 'escaped' once the stars clear.
    update(dt, seen, pos) {
      w.seen = seen;
      if (api.stars === 0) { w.heat = Math.max(0, w.heat - dt * 3); return null; }
      if (seen) { w.unseen = 0; w.lastSeen = { x: pos.x, z: pos.z }; return null; }
      w.unseen += dt;
      if (w.unseen >= searchTime(api.stars)) { api.clear(); return 'escaped'; }
      return null;
    },
  };
  return api;
}

// Busted: police close while the player is (nearly) stopped. progress 0..1, busted at 1.
export function bustStep(progress, dt, { copDist, playerSpeed, onFoot }) {
  const close = onFoot ? copDist < 2.2 : copDist < 8;
  const slow = onFoot ? playerSpeed < 2.5 : playerSpeed < 0.8;
  return close && slow ? Math.min(1, progress + dt / (onFoot ? 1.5 : 2.5)) : Math.max(0, progress - dt);
}

// Busted or wasted: lose 10% of your money (at least $100 if you have it).
export const penalty = money => Math.min(money, Math.max(100, Math.floor(money * 0.1)));
