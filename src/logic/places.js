// Fixed places on the map: shops, garages, events, missions, cameras, ramps, gang turf. Pure data.
const N = Math.PI / 2, S = -Math.PI / 2, E = 0, W = Math.PI; // headings: forward = (cos h, -sin h)

export const POIS = [
  { id: 'garage', type: 'garage', x: -92, z: 250, label: 'Garage', drive: true },
  { id: 'spray-city', type: 'spray', x: 208, z: -150, label: 'Spray & Fix', drive: true },
  { id: 'spray-docks', type: 'spray', x: 808, z: -200, label: 'Spray & Fix', drive: true },
  { id: 'dealer', type: 'dealer', x: -192, z: -50, label: 'Car Dealer', drive: true },
  { id: 'arms', type: 'arms', x: -112, z: -150, label: 'Arms Depot' },
  { id: 'shop-1', type: 'shop', x: 312, z: 50, label: '24/7 Store' },
  { id: 'shop-2', type: 'shop', x: -312, z: -250, label: '24/7 Store' },
  { id: 'shop-3', type: 'shop', x: 12, z: 350, label: 'Corner Mart' },
  { id: 'shop-4', type: 'shop', x: -212, z: 150, label: 'Corner Mart' },
  { id: 'shop-5', type: 'shop', x: 150, z: -288, label: '24/7 Store' },
  { id: 'atm-1', type: 'atm', x: 88, z: -12, label: 'ATM' },
  { id: 'atm-2', type: 'atm', x: -112, z: 88, label: 'ATM' },
  { id: 'atm-3', type: 'atm', x: 288, z: -212, label: 'ATM' },
  { id: 'atm-4', type: 'atm', x: -288, z: 312, label: 'ATM' },
  { id: 'atm-5', type: 'atm', x: 12, z: -388, label: 'ATM' },
  { id: 'bank', type: 'bank', x: -12, z: -150, label: 'Bay Bank' },
  { id: 'police', type: 'police', x: 312, z: 250, label: 'Police' },
  { id: 'hospital', type: 'hospital', x: -312, z: 350, label: 'Hospital' },
];
export const poi = id => POIS.find(p => p.id === id);

// Where you wake up.
export const RESPAWN = { busted: { x: 312, z: 250, heading: N }, wasted: { x: -312, z: 350, heading: S } };

export const ROB = {
  atm: { secs: 3, cash: [60, 160], heat: 'robAtm', needsGun: false, cooldown: 60 },
  shop: { secs: 5, cash: [300, 800], heat: 'robShop', needsGun: true, cooldown: 180 },
  bank: { secs: 10, cash: [5000, 8000], heat: 'robBank', needsGun: true, cooldown: 600 },
};

export const EVENTS = [
  { id: 'race-downtown', type: 'race', name: 'Downtown Dash', start: { x: 0, z: 200, heading: E }, laps: 2,
    checkpoints: [[200, 200], [200, 0], [200, -200], [0, -200], [-200, -200], [-200, 0], [-200, 200], [0, 200]], reward: [2000, 800, 300] },
  { id: 'race-ring', type: 'race', name: 'Ring Sprint', start: { x: 600, z: 100, heading: N }, laps: 1,
    checkpoints: [[600, -200], [556, -556], [200, -600], [-200, -600], [-556, -556], [-600, -200], [-600, 200]], reward: [3000, 1200, 500] },
  { id: 'race-granite', type: 'race', name: 'Granite Run', start: { x: 0, z: -640, heading: N }, laps: 1,
    checkpoints: [[0, -720], [-110, -800], [-60, -900], [110, -950], [230, -1040], [90, -1110], [-150, -1085], [-320, -1000], [-430, -880], [-560, -770], [-660, -700]], reward: [3500, 1400, 600] },
  { id: 'tt-coast', type: 'timetrial', name: 'Coastline Time Trial', start: { x: -650, z: 701, heading: E },
    checkpoints: [[-350, 712], [0, 700], [350, 712], [690, 695], [800, 560]], targets: [44, 52, 62], reward: 2500 },
  { id: 'drift-airfield', type: 'drift', name: 'Airfield Drift', start: { x: -930, z: 380, heading: N }, radius: 80, time: 90,
    targets: [20000, 10000, 4000], reward: 2500 },
  { id: 'drag-runway', type: 'drag', name: 'Runway Drag', start: { x: -1018, z: 620, heading: N }, length: 800, reward: 1500 },
  { id: 'pursuit', type: 'pursuit', name: 'Hot Pursuit', start: { x: 300, z: 600, heading: W }, stars: 3, time: 90, reward: 2000 },
  { id: 'delivery-docks', type: 'delivery', name: 'Dock Express', start: { x: 600, z: 100, heading: N }, time: 75,
    checkpoints: [[600, -200], [200, -600], [-200, -600], [-556, -556]], reward: 1800 },
  { id: 'hunt-ring', type: 'hunt', name: 'Headhunter', start: { x: 300, z: 600, heading: W }, time: 90, reward: 2500 },
];

export const SPEED_CAMS = [[600, -100], [-600, 300], [0, -660], [300, 710], [-750, 0], [700, 0]].map(([x, z], i) => ({ id: `cam-${i}`, x, z }));

// Ramps: len x width x height; stunt ramps pay out once.
export const RAMPS = [
  { id: 'stunt-beach', x: -300, z: 748, heading: E, stunt: true },
  { id: 'stunt-desert', x: -820, z: -480, heading: W, stunt: true },
  { id: 'stunt-docks', x: 830, z: -100, heading: N, stunt: true },
  { id: 'stunt-airfield', x: -940, z: -100, heading: N, stunt: true },
  { id: 'stunt-north', x: 250, z: -500, heading: E, stunt: true },
  { id: 'stunt-west', x: -500, z: 250, heading: S, stunt: true },
  { id: 'ramp-1', x: 300, z: 752, heading: W },
  { id: 'ramp-2', x: -600, z: 760, heading: E },
  { id: 'ramp-3', x: -1000, z: -750, heading: N },
  { id: 'ramp-4', x: 480, z: 300, heading: N },
  { id: 'ramp-5', x: -300, z: -500, heading: W },
  { id: 'ramp-6', x: 835, z: 400, heading: S },
].map(r => ({ ...r, len: r.stunt ? 14 : 11, width: r.stunt ? 7 : 6, height: r.stunt ? 3.2 : 2.2 }));
export const STUNT_IDS = RAMPS.filter(r => r.stunt).map(r => r.id);

export const GANGS = [
  { id: 'kings', name: 'Harbour Kings', x0: 840, x1: 1060, z0: -420, z1: 520, shirt: '#d4a017' },
  { id: 'vipers', name: 'Dust Vipers', x0: -1150, x1: -760, z0: -1100, z1: -420, shirt: '#2f9e44' },
];
export const gangAt = (x, z) => GANGS.find(g => x >= g.x0 && x <= g.x1 && z >= g.z0 && z <= g.z1) || null;

// Missions unlock one after another. Step types: drive_to, walk_to, wait, stars, lose_cops, steal, deliver, chase, rob, kill_gang.
export const MISSIONS = [
  { id: 'courier', name: 'Courier Run', crime: false, start: { x: 88, z: 150 }, reward: 800, steps: [
    { type: 'drive_to', x: 808, z: -300, text: 'Pick up the package at the Iron Docks' },
    { type: 'wait', secs: 2, text: 'Loading the package…' },
    { type: 'drive_to', x: -880, z: 0, time: 150, text: 'Deliver it to Velocity Airfield before time runs out' },
  ] },
  { id: 'getaway', name: 'Getaway', crime: true, start: { x: -88, z: -250 }, reward: 2000, steps: [
    { type: 'drive_to', x: -8, z: -150, text: 'Pick up the crew outside Bay Bank' },
    { type: 'wait', secs: 6, text: 'Wait for the crew…' },
    { type: 'stars', n: 3 },
    { type: 'lose_cops', text: 'The alarm went off. Lose the cops!' },
  ] },
  { id: 'hotwheels', name: 'Hot Wheels', crime: true, start: { x: 188, z: 350 }, reward: 3000, steps: [
    { type: 'steal', model: 'comet', x: 150, z: 714, heading: E, text: 'Steal the Comet R parked on the coast road' },
    { type: 'stars', n: 2 },
    { type: 'deliver', x: 808, z: 400, minHealth: 0.5, text: 'Bring it to the Iron Docks with over 50% health' },
  ] },
  { id: 'runner', name: 'Runner', crime: true, start: { x: -288, z: 50 }, reward: 2500, steps: [
    { type: 'chase', model: 'brutus', x: -700, z: 4, heading: W, text: 'Wreck the runner in the Brutus V8 (ram or shoot it)' },
  ] },
  { id: 'bankjob', name: 'Bank Job', crime: true, start: { x: 288, z: -350 }, reward: 8000, steps: [
    { type: 'walk_to', x: -12, z: -150, text: 'Walk into Bay Bank with a gun (buy one at the Arms Depot)' },
    { type: 'rob', poi: 'bank', text: 'Hold F to crack the vault' },
    { type: 'lose_cops', text: 'Get away: lose the cops!' },
    { type: 'drive_to', x: -92, z: 250, text: 'Stash the money at your garage' },
  ] },
  { id: 'turf', name: 'Turf War', crime: true, start: { x: 388, z: 150 }, reward: 4000, steps: [
    { type: 'drive_to', x: 808, z: 100, text: "Drive to the Harbour Kings' turf at the docks" },
    { type: 'kill_gang', gang: 'kings', n: 6, text: 'Take out 6 Harbour Kings' },
  ] },
];
