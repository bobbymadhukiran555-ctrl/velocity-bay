import { MAP_HALF, ROADS, zoneAt, SEA_LEVEL, naturalHeight } from './logic/map.js';
import { clockText } from './logic/daynight.js';
import { POIS, EVENTS, SPEED_CAMS, RAMPS, GANGS } from './logic/places.js';
import { WEAPONS } from './combat.js';

export const ZONE_NAMES = { downtown: 'Downtown', highway: 'Bay Ring Highway', mountains: 'Granite Peaks', desert: 'Dust Flats', airport: 'Velocity Airfield', beach: 'Sunset Beach', docks: 'Iron Docks', outskirts: 'Outskirts' };
export const PX_PER_M = 0.5;
const WEATHER_LABEL = { clear: 'Clear', cloudy: 'Cloudy', fog: 'Fog', rain: 'Rain', storm: 'Storm' };

export function renderMapImage() {
  const S = MAP_HALF * 2 * PX_PER_M, c = document.createElement('canvas');
  c.width = c.height = S;
  const half = S / 2, small = document.createElement('canvas');
  small.width = small.height = half;
  const sctx = small.getContext('2d'), img = sctx.createImageData(half, half);
  for (let j = 0; j < half; j++)
    for (let i = 0; i < half; i++) {
      const x = (i * 2) / PX_PER_M - MAP_HALF, z = (j * 2) / PX_PER_M - MAP_HALF, h = naturalHeight(x, z), zone = zoneAt(x, z);
      let col = [52, 74, 44];
      if (h < SEA_LEVEL) col = [24, 58, 84];
      else if (zone === 'downtown') col = [70, 72, 76];
      else if (zone === 'desert') col = [150, 128, 88];
      else if (zone === 'beach') col = [170, 156, 120];
      else if (zone === 'airport' || zone === 'docks') col = [80, 80, 82];
      else if (h > 60) col = [96, 92, 88];
      img.data.set([...col, 255], (j * half + i) * 4);
    }
  sctx.putImageData(img, 0, 0);
  const ctx = c.getContext('2d');
  ctx.drawImage(small, 0, 0, S, S);
  const toPx = p => [(p.x + MAP_HALF) * PX_PER_M, (p.z + MAP_HALF) * PX_PER_M];
  ctx.fillStyle = 'rgba(200,60,60,.12)';
  for (const g of GANGS) ctx.fillRect(...toPx({ x: g.x0, z: g.z0 }), (g.x1 - g.x0) * PX_PER_M, (g.z1 - g.z0) * PX_PER_M);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const r of ROADS) {
    ctx.strokeStyle = r.kind === 'street' ? '#c8c8c8' : '#e8d27a';
    ctx.lineWidth = Math.max(3, r.width * PX_PER_M);
    ctx.beginPath();
    r.points.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](...toPx(p)));
    if (r.closed) ctx.closePath();
    ctx.stroke();
  }
  ctx.fillStyle = '#d9d9d9';
  ctx.fillRect((-1040 + MAP_HALF) * PX_PER_M, (-400 + MAP_HALF) * PX_PER_M, 60 * PX_PER_M, 1100 * PX_PER_M);
  return c;
}

// Icons shared by the minimap and the full map.
const POI_ICON = { garage: ['G', '#3ddc84'], spray: ['S', '#3aa0ff'], dealer: ['C', '#b06cff'], arms: ['A', '#ff8a3a'], shop: ['$', '#e05252'], bank: ['B', '#4a7bd0'], police: ['P', '#3355aa'], hospital: ['H', '#e8e8e8'], atm: ['$', '#0e7c66'] };
const EVENT_ICON = { race: ['R', '#ff3b3b'], timetrial: ['T', '#31e1ff'], drift: ['D', '#ff4fd8'], drag: ['Q', '#ff9f1a'], pursuit: ['!', '#4f7bff'] };
export function blips(G, full) {
  const out = [];
  for (const p of POIS) if (full || !['atm', 'shop'].includes(p.type)) out.push({ x: p.x, z: p.z, icon: POI_ICON[p.type], label: p.label });
  if (!G.activity) {
    for (const e of EVENTS) out.push({ x: e.start.x, z: e.start.z, icon: EVENT_ICON[e.type], label: e.name, edge: full ? false : true });
    const m = G.pois?.nextMission();
    if (m) out.push({ x: m.start.x, z: m.start.z, icon: ['M', '#ffd23a'], label: `Mission: ${m.name}`, edge: true, big: true });
  }
  if (full) {
    for (const c of SPEED_CAMS) out.push({ x: c.x, z: c.z, icon: ['◉', '#e0b000'], label: 'Speed camera', small: true });
    for (const r of RAMPS) if (r.stunt && !G.save.stunts.includes(r.id)) out.push({ x: r.x, z: r.z, icon: ['★', '#aaa'], label: 'Stunt jump', small: true });
  }
  return out;
}

export function drawIcon(ctx, x, y, [ch, color], r = 8) {
  ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, 6.29); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.29); ctx.fill();
  ctx.fillStyle = color === '#e8e8e8' || color === '#ffd23a' || color === '#31e1ff' ? '#111' : '#fff';
  ctx.font = `bold ${Math.round(r * 1.3)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ch, x, y + 0.5);
}

export function createHud(G) {
  const $ = id => document.getElementById(id);
  const el = Object.fromEntries(['speed', 'gear', 'rpm-fill', 'nitro-fill', 'clock', 'zone', 'money', 'gear-mode', 'toast', 'dash', 'wanted', 'health-fill', 'vhealth-fill', 'weapon', 'objective', 'info', 'banner', 'prompt', 'bag', 'bust', 'bust-fill', 'hit', 'flash', 'fps', 'hud'].map(k => [k, $(k)]));
  const mini = $('minimap'), mctx = mini.getContext('2d');
  const mapImg = renderMapImage();
  let lastZone = '', toastT = 0, bannerT = 0, last = {};
  const set = (k, v) => { if (last[k] !== v) { last[k] = v; el[k].textContent = v; } };

  return {
    mapImg,
    toast(text, secs = 2.5) { el.toast.textContent = text; el.toast.classList.add('show'); toastT = secs; },
    banner(title, sub = '', kind = '') {
      el.banner.innerHTML = '';
      const h = document.createElement('div'); h.className = 'title'; h.textContent = title;
      const s = document.createElement('div'); s.className = 'sub'; s.textContent = sub;
      el.banner.append(h, s);
      el.banner.className = `show ${kind}`;
      bannerT = kind === 'count' ? 0.9 : 3.5;
    },
    objective(t) { set('objective', t); el.objective.classList.toggle('show', !!t); },
    info(t) { set('info', t); el.info.classList.toggle('show', !!t); },
    prompt(t) { set('prompt', t); el.prompt.classList.toggle('show', !!t); },
    hit() { el.hit.classList.remove('on'); void el.hit.offsetWidth; el.hit.classList.add('on'); },
    flash() { el.flash.classList.remove('on'); void el.flash.offsetWidth; el.flash.classList.add('on'); },
    update(dt) {
      const P = G.player, v = P.mode === 'car' ? P.vehicle : null;
      el.dash.classList.toggle('hidden', !v);
      if (v) {
        set('speed', String(Math.round(v.speedKmh)));
        set('gear', v.gearText);
        el['rpm-fill'].style.width = `${Math.min(100, (v.state.rpm / 7200) * 100)}%`;
        el['rpm-fill'].classList.toggle('red', v.state.rpm > 6600);
        el['nitro-fill'].style.width = `${v.state.nitro * 100}%`;
        el['vhealth-fill'].style.width = `${v.health * 100}%`;
        set('gear-mode', v.state.gearMode === 'auto' ? 'AUTO' : 'MANUAL');
      }
      el['health-fill'].style.width = `${P.health}%`;
      const w = WEAPONS[P.weapon];
      set('weapon', w.melee ? w.name : `${w.name}  ${G.mods.infAmmo ? '∞' : P.weapons[P.weapon]}`);
      set('clock', `${clockText(G.t01)} · ${WEATHER_LABEL[G.weather.name]}`);
      set('money', `$${Math.round(G.money).toLocaleString()}`);
      set('bag', G.bag > 0 ? `Bag $${G.bag.toLocaleString()}` : '');
      const stars = G.wanted.stars;
      const sTxt = '★'.repeat(stars) + '☆'.repeat(5 - stars);
      set('wanted', stars ? sTxt : '');
      el.wanted.classList.toggle('search', G.wanted.searching);
      el.bust.classList.toggle('show', G.police.bust > 0);
      el['bust-fill'].style.width = `${G.police.bust * 100}%`;
      const p = P.target(), zone = ZONE_NAMES[zoneAt(p.x, p.z)];
      if (zone !== lastZone) { lastZone = zone; el.zone.textContent = zone; el.zone.classList.remove('flash'); void el.zone.offsetWidth; el.zone.classList.add('flash'); }
      if (toastT > 0 && (toastT -= dt) <= 0) el.toast.classList.remove('show');
      if (bannerT > 0 && (bannerT -= dt) <= 0) el.banner.classList.remove('show');
      this.minimap(p, v ? v.heading : P.yaw);
    },
    minimap(p, h) {
      const W = mini.width, k = (0.45 / PX_PER_M) * (W / 180), s = PX_PER_M * k, th = h - Math.PI / 2;
      const c = Math.cos(th), sn = Math.sin(th);
      const toMini = (x, z) => { const ux = (x - p.x) * s, uy = (z - p.z) * s; return [W / 2 + ux * c - uy * sn, W / 2 + ux * sn + uy * c]; };
      mctx.clearRect(0, 0, W, W);
      mctx.save();
      mctx.beginPath(); mctx.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); mctx.clip();
      mctx.fillStyle = '#183a54'; mctx.fillRect(0, 0, W, W);
      mctx.translate(W / 2, W / 2); mctx.rotate(th); mctx.scale(k, k);
      mctx.drawImage(mapImg, -(p.x + MAP_HALF) * PX_PER_M, -(p.z + MAP_HALF) * PX_PER_M);
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      // Search area while the cops look for you.
      if (G.wanted.searching && G.wanted.lastSeen) {
        const [x, y] = toMini(G.wanted.lastSeen.x, G.wanted.lastSeen.z);
        mctx.fillStyle = 'rgba(255,40,40,.18)'; mctx.beginPath(); mctx.arc(x, y, (60 + 20 * G.wanted.stars) * s, 0, 6.29); mctx.fill();
      }
      const route = G.gps.route;
      if (route?.length > 1) {
        mctx.strokeStyle = '#c64bff'; mctx.lineWidth = 4; mctx.lineJoin = 'round'; mctx.beginPath();
        route.forEach((q, i) => mctx[i ? 'lineTo' : 'moveTo'](...toMini(q.x, q.z)));
        mctx.stroke();
      }
      const R = W / 2 - 9;
      const put = (x, z, icon, edge, r = 7) => {
        let [mx, my] = toMini(x, z);
        const dx = mx - W / 2, dy = my - W / 2, d = Math.hypot(dx, dy);
        if (d > R) { if (!edge) return; mx = W / 2 + (dx / d) * R; my = W / 2 + (dy / d) * R; }
        drawIcon(mctx, mx, my, icon, r);
      };
      for (const b of blips(G, false)) put(b.x, b.z, b.icon, b.edge, b.big ? 8 : 6.5);
      if (G.gps.target) put(G.gps.target.x, G.gps.target.z, ['•', G.activity ? '#ffd23a' : '#c64bff'], true, 6);
      const flashOn = Math.floor(G.clock * 4) % 2 === 0;
      for (const v of G.fleet.list) if (v.role === 'police' && !v.dead) { const q = v.body.translation(); const [mx, my] = toMini(q.x, q.z); mctx.fillStyle = flashOn ? '#ff3030' : '#3060ff'; mctx.fillRect(mx - 3, my - 3, 6, 6); }
      for (const hm of G.humans.list) if ((hm.role === 'cop' || (hm.role === 'gang' && hm.hostile)) && hm.state !== 'dead') { const [mx, my] = toMini(hm.x, hm.z); mctx.fillStyle = hm.role === 'cop' ? '#6fa0ff' : '#ff4040'; mctx.beginPath(); mctx.arc(mx, my, 2.5, 0, 6.29); mctx.fill(); }
      if (G.police.heli.on) put(G.police.heli.x, G.police.heli.z, ['✈', '#3060ff'], true, 6);
      mctx.restore();
      mctx.fillStyle = '#ff3b3b';
      mctx.beginPath(); mctx.moveTo(W / 2, W / 2 - 9); mctx.lineTo(W / 2 + 6, W / 2 + 7); mctx.lineTo(W / 2, W / 2 + 3); mctx.lineTo(W / 2 - 6, W / 2 + 7); mctx.fill();
    },
  };
}
