// Every overlay screen: pause menu, settings, controls, car selector (garage / dealer), arms shop, mod menu,
// full map with waypoints, photo mode and save codes. Plain DOM.
import { MODELS, MODEL_IDS, UPGRADES, nextUpgradeCost, statBars } from './logic/vehicles.js';
import { EVENTS, MISSIONS, STUNT_IDS, SPEED_CAMS } from './logic/places.js';
import { WEATHER_NAMES } from './logic/weather.js';
import { ACHIEVEMENTS } from './logic/achievements.js';
import { MAP_HALF } from './logic/map.js';
import { WEAPONS } from './combat.js';
import { PX_PER_M, blips, drawIcon } from './hud.js';
import { exportCode, importCode } from './logic/save.js';

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
  return e;
}
const btn = (label, onclick, cls = '', disabled = false) => h('button', { class: cls, onclick, disabled }, label);
const PAINTS = ['#b3122e', '#e8e8e6', '#1b1c1f', '#9a9ea3', '#1d3557', '#1f6fb2', '#2f9e44', '#e0a400', '#ff6a10', '#7a3fb0', '#ff4fd8', '#00b3a4'];

export function createMenus(G) {
  const menu = document.getElementById('menu'), body = document.getElementById('menu-body'), title = document.getElementById('menu-title');
  const mapEl = document.getElementById('fullmap'), mapCanvas = document.getElementById('fullmap-canvas'), photoEl = document.getElementById('photo');
  let open = null, onClose = null;

  function show(name, heading, ...content) {
    open = name; G.paused = true;
    title.textContent = heading;
    body.replaceChildren(...content);
    menu.classList.add('open');
    menu.classList.toggle('side', name === 'selector');
    document.body.classList.add('in-menu');
  }
  function close() {
    menu.classList.remove('open'); mapEl.classList.remove('open'); photoEl.classList.remove('open');
    document.body.classList.remove('in-menu', 'photo');
    G.renderer.domElement.style.filter = '';
    const cb = onClose; onClose = null;
    open = null; G.paused = false; G.rig.orbit = null;
    cb?.();
    G.game.persist();
  }
  document.getElementById('menu-close').onclick = () => close();

  // ---- Pause ----
  function pause() {
    const canSelect = !G.wanted.stars && !G.activity;
    show('pause', 'Paused',
      h('div', { class: 'grid' },
        btn('Resume', close, 'primary'),
        btn('Map  (M)', () => { close(); openMap(); }),
        btn('Car selector  (V)', () => { close(); openSelector('anywhere'); }, '', !canSelect),
        btn('Missions & events', events),
        btn('Stats & achievements', stats),
        btn('Settings', settings),
        btn('Controls', controls),
        btn('Mod menu  (F2)', mods),
        btn('Photo mode  (P)', () => { close(); photo(); }),
        document.documentElement.requestFullscreen ? btn('Fullscreen', () => G.toggleFullscreen()) : null,
        btn('Save code', saveCode),
        G.activity ? btn(`Quit: ${G.activity.name}`, () => { G.activities.cancel('You quit'); close(); }, 'danger') : null,
      ),
      !canSelect ? h('p', { class: 'note' }, G.activity ? 'Car selector is off during missions and events.' : 'Lose the cops to use the car selector.') : null);
  }

  function events() {
    const tp = (x, z, heading = 0) => { close(); G.game.teleport(x, z, heading); };
    const m = G.pois.nextMission();
    show('events', 'Missions & events',
      h('h3', {}, 'Story missions'),
      h('p', { class: 'note' }, `${G.save.missions} of ${MISSIONS.length} done.${G.settings.crime ? '' : ' Crime missions are skipped in racing-only mode.'}`),
      m ? h('div', { class: 'row' }, h('span', {}, `Next: ${m.name}  ($${m.reward.toLocaleString()})`), btn('Go there', () => tp(m.start.x, m.start.z), '', G.wanted.stars > 0)) : h('p', {}, 'All missions done. Nice!'),
      h('h3', {}, 'Events'),
      ...EVENTS.map(e => h('div', { class: 'row' },
        h('span', {}, `${e.name}`, h('small', {}, ` ${e.type}${G.save.best[e.id] !== undefined ? ` · best ${e.type === 'drift' ? Math.round(G.save.best[e.id]).toLocaleString() : G.save.best[e.id].toFixed(2) + ' s'}` : ''}`)),
        btn('Go there', () => tp(e.start.x, e.start.z, e.start.heading), '', G.wanted.stars > 0 || !!G.activity))),
      h('p', { class: 'note' }, `Stunt jumps found: ${G.save.stunts.length}/${STUNT_IDS.length} · Speed camera records: ${Object.keys(G.save.best).filter(k => k.startsWith('cam')).length}/${SPEED_CAMS.length}`),
      btn('Back', pause));
  }

  function stats() {
    const s = G.save.stats;
    const rows = [
      ['Distance driven', `${(s.distance / 1000).toFixed(1)} km`], ['Top speed', `${Math.round(s.topSpeed)} km/h`],
      ['Stunt jumps landed', String(s.jumps)], ['Unique jumps found', `${G.save.stunts.length}/${STUNT_IDS.length}`],
      ['Events won', String(s.events)], ['People taken down', String(s.kills)],
      ['Robberies', String(s.robberies)], ['Total earned', `$${Math.round(s.earned).toLocaleString()}`],
    ];
    const medals = ACHIEVEMENTS.map(a => [`${G.save.achievements.includes(a.id) ? '★' : '☆'} ${a.name}`, `${a.desc} · $${a.reward}`]);
    show('stats', 'Stats & achievements',
      h('dl', { class: 'keys' }, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      h('h3', {}, 'Achievements'),
      h('dl', { class: 'keys' }, ...medals.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      btn('Back', pause));
  }

  function settings() {
    const s = G.settings;
    const range = (label, key, min, max, step, apply) => h('label', { class: 'row' }, h('span', {}, label),
      h('input', { type: 'range', min, max, step, value: s[key], oninput: e => { s[key] = +e.target.value; apply?.(); } }));
    show('settings', 'Settings',
      h('label', { class: 'row' }, h('span', {}, 'Graphics quality'),
        h('select', { onchange: e => { s.quality = e.target.value; G.game.persist(); location.search = `?q=${s.quality}`; } },
          ...['low', 'med', 'high'].map(q => h('option', { value: q, selected: G.quality === q }, q)))),
      h('label', { class: 'row' }, h('span', {}, 'Crime (off = racing only)'),
        h('input', { type: 'checkbox', checked: s.crime, onchange: e => { s.crime = e.target.checked; G.wanted.enabled = s.crime && !G.mods.neverWanted; } })),
      h('label', { class: 'row' }, h('span', {}, 'Manual gears'),
        h('input', { type: 'checkbox', checked: s.gearMode === 'manual', onchange: e => { s.gearMode = e.target.checked ? 'manual' : 'auto'; if (G.player.vehicle) G.player.vehicle.state.gearMode = s.gearMode; } })),
      range('Volume', 'volume', 0, 1, 0.05, () => G.audio.setVolume(s.volume, s.music)),
      range('Radio volume', 'music', 0, 1, 0.05, () => G.audio.setVolume(s.volume, s.music)),
      range('Traffic', 'traffic', 0, 2, 0.25),
      range('Pedestrians', 'peds', 0, 2, 0.25),
      h('label', { class: 'row' }, h('span', {}, 'Show FPS'), h('input', { type: 'checkbox', checked: s.showFps, onchange: e => { s.showFps = e.target.checked; document.getElementById('fps').hidden = !s.showFps; } })),
      btn('Back', pause));
  }

  function controls() {
    const rows = [['W / ↑', 'Gas · walk'], ['S / ↓', 'Brake, reverse'], ['A D / ← →', 'Steer · turn'], ['Space', 'Handbrake · jump'], ['Shift', 'Nitro · sprint'],
      ['F', 'Get in / out, use, rob (hold)'], ['K / click', 'Attack · shoot (drive-by in a car)'], ['X / wheel', 'Next weapon'], ['H', 'Horn'], ['G', 'Auto / manual gears'], ['Q / E', 'Shift down / up'],
      ['Plane', 'W/S throttle · A/D bank · Space climb · Shift dive · B auto-land · S on ground brakes (key guide shows on screen)'], ['Plane (touch)', 'Left stick: bank and climb/dive · THR+/THR− · LAND assist · F exit'], ['Gamepad', 'RT gas · LT brake · left stick steer/climb-dive · A handbrake · B nitro · X get in/out · Y camera · LB/RB gears · right stick cockpit look · Back map · Start pause'], ['Plane pad', 'Left stick banks and climbs/dives · RT/LT throttle lever · right stick looks around in cockpit'], ['Touch', 'Buttons change by mode: car, bike, plane, on foot and shooting (big FIRE)'], ['C', 'Camera'], ['L', 'Headlights'], ['N', 'Radio station'], ['R', 'Back on the road'], ['T', 'Skip an hour'], ['M', 'Map'], ['V', 'Car selector'], ['P', 'Photo mode'], ['F2 / `', 'Mod menu'], ['Esc', 'Pause']];
    show('controls', 'Controls', h('dl', { class: 'keys' }, ...rows.flatMap(([k, d]) => [h('dt', {}, k), h('dd', {}, d)])), btn('Back', pause));
  }

  function saveCode() {
    G.game.persist();
    const code = exportCode(G.game.snapshot()), box = h('textarea', { readonly: true, rows: 4 }, code), input = h('textarea', { rows: 4, placeholder: 'Paste a save code here' });
    show('save', 'Save code',
      h('p', { class: 'note' }, 'Your game saves itself in this browser. To carry it to another browser or device, copy this code and load it there.'),
      box, btn('Copy', () => { navigator.clipboard?.writeText(code); G.hud.toast('Copied'); }),
      input, btn('Load this code', () => { const s = importCode(input.value); if (!s) G.hud.toast('That code is not valid'); else G.game.load(s); }),
      btn('Back', pause));
  }

  // ---- Car selector: garage, dealer, or anywhere (V) ----
  function openSelector(mode) {
    if (G.activity || (G.wanted.stars > 0 && mode === 'anywhere')) { G.hud.toast(G.activity ? 'Not during an activity' : 'Lose the cops first'); return; }
    const S = G.save, P = G.player;
    const original = P.vehicle ? { model: P.vehicle.model, color: P.vehicle.color, up: P.vehicle.up, owned: P.vehicle.owned } : null;
    let sel = P.vehicle?.owned ?? S.current, pick = mode === 'dealer' ? null : S.garage[sel] ? sel : 0, model = mode === 'dealer' ? (P.vehicle?.model || 'vanta') : S.garage[pick]?.model;
    G.rig.orbit = { yaw: G.rig.openYaw(P.target()), dist: 7, height: 2.4, spin: 0 };
    const preview = () => {
      const owned = mode !== 'dealer' ? S.garage[pick] : null, id = owned ? owned.model : model;
      G.game.swapVehicle(id, owned ? owned.color : MODELS[id].paint ?? '#b3122e', owned ? owned.up : undefined, owned ? pick : undefined);
      G.rig.orbit.dist = Math.max(7, MODELS[id].len * 1.5); G.rig.orbit.height = Math.max(2.4, MODELS[id].height);
    };
    onClose = () => {
      const v = P.vehicle;
      if (v && v.owned === undefined && mode === 'dealer' && original) G.game.swapVehicle(original.model, original.color, original.up, original.owned);
    };
    const render = () => {
      const owned = mode !== 'dealer' ? S.garage[pick] : null, id = owned ? owned.model : model, m = MODELS[id], bars = statBars(id, owned?.up);
      const list = mode === 'dealer'
        ? MODEL_IDS.filter(k => MODELS[k].price).map(k => h('button', { class: `item ${k === model ? 'on' : ''}`, onclick: () => { model = k; preview(); render(); } },
          h('span', {}, MODELS[k].name), h('small', {}, S.garage.some(c => c.model === k) ? 'owned' : `$${MODELS[k].price.toLocaleString()}`)))
        : S.garage.map((c, i) => h('button', { class: `item ${i === pick ? 'on' : ''}`, onclick: () => { pick = i; preview(); render(); } },
          h('span', {}, MODELS[c.model].name), h('small', {}, i === S.current ? 'current' : '')));
      const stat = (k, v) => h('div', { class: 'stat' }, h('span', {}, k), h('div', { class: 'bar' }, h('div', { style: `width:${Math.round(v * 100)}%` })));
      const paint = owned ? h('div', { class: 'swatches' }, ...PAINTS.map(c => h('button', { class: 'swatch', style: `background:${c}`, 'aria-label': c, onclick: () => { owned.color = c; P.vehicle?.setColor(c); render(); } })),
        h('input', { type: 'color', value: owned.color, oninput: e => { owned.color = e.target.value; P.vehicle?.setColor(e.target.value); } })) : null;
      const ups = owned ? h('div', {}, ...Object.entries(UPGRADES).map(([k, u]) => {
        const cost = nextUpgradeCost(owned.up, k);
        return h('div', { class: 'row' }, h('span', {}, `${u.label} `, h('b', {}, '●'.repeat(owned.up[k]) + '○'.repeat(3 - owned.up[k]))),
          cost === null ? h('small', {}, 'max') : btn(`Upgrade $${cost.toLocaleString()}`, () => {
            if (G.money < cost) return G.hud.toast('Not enough money');
            G.addMoney(-cost); owned.up[k]++; P.vehicle?.setUpgrades(owned.up); G.audio?.cash(); render();
          }));
      })) : null;
      const isOwned = mode === 'dealer' && S.garage.some(c => c.model === model);
      const actions = mode === 'dealer'
        ? (isOwned ? h('p', { class: 'note' }, 'You own this one. Change it at your garage.') : btn(`Buy for $${m.price.toLocaleString()}`, () => {
          if (G.money < m.price) return G.hud.toast('Not enough money');
          if (S.garage.length >= 24) return G.hud.toast('Your garage is full (24 vehicles)');
          G.addMoney(-m.price);
          S.garage.push({ model, color: m.paint ?? '#b3122e', up: { engine: 0, tires: 0, nitro: 0, armor: 0 } });
          S.current = S.garage.length - 1;
          G.game.swapVehicle(model, m.paint ?? '#b3122e', undefined, S.current);
          G.audio?.cash(); G.hud.banner(m.kind === 'plane' ? 'NEW PLANE!' : 'NEW CAR!', m.name, 'good');
          onClose = null; close(); G.game.airStart();
        }, 'primary'))
        : btn(m.kind === 'plane' ? 'Fly this' : 'Drive this', () => { S.current = pick; onClose = null; close(); G.game.airStart(); }, 'primary');
      const keep = mode === 'garage' && original && original.owned === undefined && P.vehicle && !MODELS[original.model].police
        ? btn(`Keep the ${MODELS[original.model].name} you brought`, () => {
          if (S.garage.length >= 24) return G.hud.toast('Your garage is full');
          S.garage.push({ model: original.model, color: original.color, up: { engine: 0, tires: 0, nitro: 0, armor: 0 } });
          pick = S.current = S.garage.length - 1; original.owned = pick; preview(); render(); G.hud.toast('Added to your garage');
        }) : null;
      show('selector', mode === 'dealer' ? 'Car dealer' : mode === 'garage' ? 'Garage' : 'Car selector',
        h('div', { class: 'selector' },
          h('div', { class: 'list' }, ...list),
          h('div', { class: 'detail' },
            h('h3', {}, m.name), h('p', { class: 'note' }, `${m.kind === 'bike' ? 'Motorbike' : m.kind === 'plane' ? 'Plane' : m.style} · ${m.mass} kg`),
            stat('Top speed', bars.speed), stat('Acceleration', bars.accel), stat('Handling', bars.handling), stat('Toughness', bars.durability),
            paint, ups, keep, actions, btn('Close', close))));
    };
    preview();
    render();
  }

  // ---- Arms Depot ----
  function openShop() {
    const P = G.player;
    const render = () => show('shop', 'Arms Depot',
      h('p', { class: 'note' }, 'Weapons stay with you. Busted = you lose your ammo.'),
      ...['bat', 'pistol', 'smg'].map(k => {
        const w = WEAPONS[k], has = k === 'bat' ? P.weapons.bat : P.weapons[k] > 0;
        const [label, cost, give] = k === 'bat' ? [has ? 'Owned' : `Buy $${w.price}`, has ? null : w.price, () => (P.weapons.bat = true)]
          : has ? [`+${w.ammoPack} ammo $${w.ammoPrice}`, w.ammoPrice, () => (P.weapons[k] += w.ammoPack)] : [`Buy $${w.price} (+${w.ammoPack} ammo)`, w.price, () => (P.weapons[k] += w.ammoPack)];
        return h('div', { class: 'row' }, h('span', {}, w.name, h('small', {}, k === 'bat' ? '' : ` · ammo ${P.weapons[k]}`)),
          btn(label, () => { if (cost === null) return; if (G.money < cost) return G.hud.toast('Not enough money'); G.addMoney(-cost); give(); P.weapon = k; G.audio?.cash(); render(); }, '', cost === null));
      }), btn('Done', close, 'primary'));
    render();
  }

  // ---- Mod menu ----
  function mods() {
    const M = G.mods;
    const tog = (label, key, apply) => h('label', { class: 'tog' }, h('input', { type: 'checkbox', checked: !!M[key], onchange: e => { M[key] = e.target.checked; apply?.(M[key]); } }), label);
    const spawnSel = h('select', {}, ...MODEL_IDS.map(k => h('option', { value: k }, MODELS[k].name)));
    const zones = [['Downtown', 0, 150, Math.PI / 2], ['Highway', 600, 100, Math.PI / 2], ['Granite Peaks', 0, -700, Math.PI / 2], ['Dust Flats', -790, -640, Math.PI], ['Airfield', -900, 0, Math.PI], ['Sunset Beach', 0, 700, 0], ['Iron Docks', 800, 0, Math.PI / 2]];
    show('mods', 'Mod menu',
      h('p', { class: 'note' }, 'Cheats for fun. They are not saved.'),
      h('h3', {}, 'Player'),
      h('div', { class: 'grid' },
        tog('God mode', 'god'), tog('Infinite ammo', 'infAmmo'),
        tog('Never wanted', 'neverWanted', on => { G.wanted.enabled = !on && G.settings.crime; }),
        btn('All weapons', () => { const w = G.player.weapons; w.bat = true; w.pistol = Math.max(w.pistol, 500); w.smg = Math.max(w.smg, 999); G.hud.toast('All weapons'); }),
        btn('Heal', () => (G.player.health = 100)), btn('+$10,000', () => G.addMoney(10000))),
      h('div', { class: 'row' }, h('span', {}, 'Wanted level'), h('div', { class: 'seg' }, ...[0, 1, 2, 3, 4, 5].map(n => btn(n ? '★'.repeat(n) : 'none', () => { if (n && !G.wanted.enabled) G.wanted.enabled = true; G.wanted.setStars(n); if (!n) { G.wanted.clear(); G.police.clear(); } })))),
      h('h3', {}, 'Vehicle'),
      h('div', { class: 'grid' },
        tog('Infinite nitro', 'infNitro'), tog('Super speed', 'superPower'), tog('Super grip', 'superGrip'), tog('Rainbow paint', 'rainbow'),
        btn('Repair & flip', () => { const v = G.player.vehicle; if (v) { v.repair(); const p = v.body.translation(); v.reset(p.x, p.z, v.heading); } })),
      h('div', { class: 'row' }, spawnSel, btn('Spawn & drive', () => { close(); G.game.spawnForPlayer(spawnSel.value); })),
      h('h3', {}, 'World'),
      h('div', { class: 'row' }, h('span', {}, 'Weather'), h('div', { class: 'seg' }, btn('auto', () => G.weather.set('auto')), ...WEATHER_NAMES.map(w => btn(w, () => G.weather.set(w, true))))),
      h('label', { class: 'row' }, h('span', {}, 'Time of day'), h('input', { type: 'range', min: 0, max: 0.999, step: 0.001, value: G.t01, oninput: e => (G.t01 = +e.target.value) })),
      h('div', { class: 'grid' }, tog('Freeze time', 'freezeTime'), tog('Slow motion', 'slowmo'), tog('Moon gravity', 'moon', on => G.world.gravity = { x: 0, y: on ? -1.62 * 2 : -9.81, z: 0 })),
      h('h3', {}, 'Teleport'),
      h('div', { class: 'grid' }, ...zones.map(([n, x, z, hd]) => btn(n, () => { close(); G.game.teleport(x, z, hd); })),
        btn('To waypoint', () => { const t = G.gps.target; if (!t) return G.hud.toast('Set a waypoint on the map (M) first'); close(); G.game.teleport(t.x, t.z, 0); })),
      btn('Back', pause));
  }

  // ---- Full map ----
  let view = { x: 0, z: 0, scale: 0.6 }, drag = null;
  function openMap() {
    open = 'map'; G.paused = true;
    mapEl.classList.add('open'); document.body.classList.add('in-menu');
    const t = G.player.target(); view.x = t.x; view.z = t.z;
    drawMap();
  }
  const toScreen = (x, z) => [mapCanvas.width / 2 + (x - view.x) * view.scale, mapCanvas.height / 2 + (z - view.z) * view.scale];
  function drawMap() {
    const c = mapCanvas, dpr = Math.min(2, devicePixelRatio);
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    const ctx = c.getContext('2d'), s = view.scale;
    ctx.fillStyle = '#183a54'; ctx.fillRect(0, 0, c.width, c.height);
    const [ox, oy] = toScreen(-MAP_HALF, -MAP_HALF);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(G.hud.mapImg, ox, oy, MAP_HALF * 2 * s, MAP_HALF * 2 * s);
    const route = G.gps.route;
    if (route?.length > 1) { ctx.strokeStyle = '#c64bff'; ctx.lineWidth = 5 * dpr; ctx.lineJoin = 'round'; ctx.beginPath(); route.forEach((q, i) => ctx[i ? 'lineTo' : 'moveTo'](...toScreen(q.x, q.z))); ctx.stroke(); }
    for (const b of blips(G, true)) { const [x, y] = toScreen(b.x, b.z); drawIcon(ctx, x, y, b.icon, (b.small ? 6 : 10) * dpr); }
    if (G.gps.target) { const [x, y] = toScreen(G.gps.target.x, G.gps.target.z); drawIcon(ctx, x, y, ['⚑', '#c64bff'], 11 * dpr); }
    const p = G.player.target(), hd = G.player.vehicle ? G.player.vehicle.heading : G.player.yaw, [px, py] = toScreen(p.x, p.z);
    ctx.save(); ctx.translate(px, py); ctx.rotate(-hd + Math.PI / 2);
    ctx.fillStyle = '#ff3b3b'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.moveTo(0, -13 * dpr); ctx.lineTo(9 * dpr, 10 * dpr); ctx.lineTo(0, 5 * dpr); ctx.lineTo(-9 * dpr, 10 * dpr); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  mapCanvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vz: view.z, moved: false }; mapCanvas.setPointerCapture(e.pointerId); });
  mapCanvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dpr = mapCanvas.width / innerWidth, dx = (e.clientX - drag.x) * dpr, dy = (e.clientY - drag.y) * dpr;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    view.x = drag.vx - dx / view.scale; view.z = drag.vz - dy / view.scale; drawMap();
  });
  mapCanvas.addEventListener('pointerup', e => {
    if (drag && !drag.moved) {
      const dpr = mapCanvas.width / innerWidth, x = view.x + (e.clientX * dpr - mapCanvas.width / 2) / view.scale, z = view.z + (e.clientY * dpr - mapCanvas.height / 2) / view.scale;
      if (G.activity) G.hud.toast('Waypoints are off during activities');
      else { G.gps.target = Math.abs(x) < MAP_HALF && Math.abs(z) < MAP_HALF ? { x, z } : null; G.gps.dirty = true; G.hud.toast(G.gps.target ? 'Waypoint set' : 'Waypoint cleared'); }
      setTimeout(drawMap, 50);
    }
    drag = null;
  });
  mapCanvas.addEventListener('wheel', e => { e.preventDefault(); view.scale = Math.min(4, Math.max(0.25, view.scale * (e.deltaY > 0 ? 0.85 : 1.18))); drawMap(); }, { passive: false });
  document.getElementById('map-clear').onclick = () => { if (!G.activity) { G.gps.target = null; G.gps.dirty = true; drawMap(); } };
  document.getElementById('map-close').onclick = () => close();
  document.getElementById('map-zoom-in').onclick = () => { view.scale = Math.min(4, view.scale * 1.4); drawMap(); };
  document.getElementById('map-zoom-out').onclick = () => { view.scale = Math.max(0.25, view.scale / 1.4); drawMap(); };

  // ---- Photo mode ----
  const FILTERS = [['None', ''], ['Black & white', 'grayscale(1) contrast(1.15)'], ['Warm', 'sepia(.35) saturate(1.3)'], ['Vivid', 'saturate(1.6) contrast(1.1)'], ['Noir', 'grayscale(1) contrast(1.6) brightness(.9)'], ['Dream', 'saturate(1.3) brightness(1.1) hue-rotate(-15deg) blur(.6px)']];
  let filter = 0;
  function photo() {
    open = 'photo'; G.paused = true;
    photoEl.classList.add('open'); document.body.classList.add('photo');
    G.rig.orbit = { yaw: G.rig.openYaw(G.player.target()), dist: 8, height: 2, spin: 0, free: true };
  }
  document.getElementById('photo-filter').onclick = () => {
    filter = (filter + 1) % FILTERS.length;
    G.renderer.domElement.style.filter = FILTERS[filter][1];
    document.getElementById('photo-filter').textContent = `Filter: ${FILTERS[filter][0]}`;
  };
  document.getElementById('photo-shot').onclick = () => {
    G.renderNow();
    const src = G.renderer.domElement, c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const ctx = c.getContext('2d');
    ctx.filter = FILTERS[filter][1] || 'none';
    ctx.drawImage(src, 0, 0);
    const a = h('a', { download: `velocity-bay-${Date.now()}.png`, href: c.toDataURL('image/png') });
    a.click();
    G.hud.toast('Photo saved');
  };
  document.getElementById('photo-exit').onclick = () => close();
  let orbitDrag = null;
  G.renderer.domElement.addEventListener('pointerdown', e => { if (G.rig.orbit?.free) orbitDrag = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointerup', () => (orbitDrag = null));
  addEventListener('pointermove', e => {
    if (!orbitDrag || !G.rig.orbit) return;
    G.rig.orbit.yaw -= (e.clientX - orbitDrag.x) * 0.006;
    G.rig.orbit.height = Math.max(0.3, Math.min(30, G.rig.orbit.height + (e.clientY - orbitDrag.y) * 0.03));
    orbitDrag = { x: e.clientX, y: e.clientY };
  });
  G.renderer.domElement.addEventListener('wheel', e => { if (G.rig.orbit?.free) G.rig.orbit.dist = Math.max(2.5, Math.min(40, G.rig.orbit.dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: true });

  // Menu keys (the game's own input is ignored while a menu is open).
  addEventListener('keydown', e => {
    if (!open) return;
    if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Escape' || (open === 'map' && e.code === 'KeyM') || (open === 'photo' && e.code === 'KeyP') || (open === 'mods' && (e.code === 'F2' || e.code === 'Backquote'))) { e.preventDefault(); close(); }
    if (open === 'photo') {
      const o = G.rig.orbit;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') o.yaw += 0.08;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') o.yaw -= 0.08;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') o.dist = Math.max(2.5, o.dist * 0.92);
      if (e.code === 'ArrowDown' || e.code === 'KeyS') o.dist = Math.min(40, o.dist * 1.08);
      if (e.code === 'Enter') document.getElementById('photo-shot').click();
    }
  });

  return {
    get open() { return open; },
    pause, openSelector, openShop, openMap, mods, photo, close,
    redrawMap() { if (open === 'map') drawMap(); },
    rainbow(dt) { if (G.mods.rainbow && G.player.vehicle) G.player.vehicle.view.paintMat.color.setHSL((G.clock * 0.15) % 1, 0.8, 0.5); },
  };
}
