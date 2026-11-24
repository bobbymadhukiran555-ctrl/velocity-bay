// Career stats and achievements. Pure so the rules can be tested without a browser.
export const DEFAULT_STATS = Object.freeze({
  distance: 0, topSpeed: 0, jumps: 0, events: 0, kills: 0, robberies: 0, stunts: 0, earned: 0,
});

export const ACHIEVEMENTS = Object.freeze([
  { id: 'first-mile', name: 'First Mile', desc: 'Drive 1 km', reward: 500, test: s => s.distance >= 1000 },
  { id: 'long-haul', name: 'Long Haul', desc: 'Drive 20 km', reward: 3000, test: s => s.distance >= 20000 },
  { id: 'speed-demon', name: 'Speed Demon', desc: 'Hit 180 km/h', reward: 1000, test: s => s.topSpeed >= 180 },
  { id: 'airborne', name: 'Airborne', desc: 'Land 10 stunt jumps', reward: 750, test: s => s.jumps >= 10 },
  { id: 'event-pro', name: 'Event Pro', desc: 'Win 3 events', reward: 1000, test: s => s.events >= 3 },
  { id: 'vigilante', name: 'Notorious', desc: 'Take down 10 people', reward: 750, test: s => s.kills >= 10 },
  { id: 'robber', name: 'Robber', desc: 'Pull 3 robberies', reward: 1500, test: s => s.robberies >= 3 },
  { id: 'stunt-man', name: 'Stunt Driver', desc: 'Find 3 unique jumps', reward: 1000, test: s => s.stunts >= 3 },
  { id: 'tycoon', name: 'Tycoon', desc: 'Earn $50,000', reward: 2500, test: s => s.earned >= 50000 },
]);

export function bump(stats, key, amount = 1) {
  if (!(key in DEFAULT_STATS)) return;
  if (key === 'topSpeed') stats.topSpeed = Math.max(stats.topSpeed || 0, amount);
  else stats[key] = Math.round(((stats[key] || 0) + amount) * 100) / 100;
}

// Adds newly earned achievements to `have` and returns them, once each.
export function checkAchievements(stats, have) {
  const got = ACHIEVEMENTS.filter(a => !have.includes(a.id) && a.test(stats));
  for (const a of got) have.push(a.id);
  return got;
}
