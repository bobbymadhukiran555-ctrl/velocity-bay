import { MAP_HALF, ROADS, zoneAt, SEA_LEVEL, naturalHeight } from './logic/map.js';
import { clockText } from './logic/daynight.js';

const ZONE_NAMES = { downtown: 'Downtown', highway: 'Bay Ring Highway', mountains: 'Granite Peaks', desert: 'Dust Flats', airport: 'Velocity Airfield', beach: 'Sunset Beach', docks: 'Iron Docks', outskirts: 'Outskirts' };
const PX_PER_M = 0.5;

function renderMapImage() {
  const S = MAP_HALF * 2 * PX_PER_M, c = document.createElement('canvas');
  c.width = c.height = S;
  // Terrain colours at half resolution (it's a minimap), scaled up.
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

export function createHud() {
  const $ = id => document.getElementById(id);
  const el = { speed: $('speed'), gear: $('gear'), rpm: $('rpm-fill'), nitro: $('nitro-fill'), clock: $('clock'), zone: $('zone'), money: $('money'), mode: $('gear-mode'), toast: $('toast') };
  const mini = $('minimap'), mctx = mini.getContext('2d');
  const mapImg = renderMapImage();
  let lastZone = '', toastTimer = 0;

  return {
    toast(text, secs = 2.5) { el.toast.textContent = text; el.toast.classList.add('show'); toastTimer = secs; },
    update(dt, car, t01, money) {
      el.speed.textContent = Math.round(car.speedKmh);
      el.gear.textContent = car.gearText;
      el.rpm.style.width = `${Math.min(100, (car.state.rpm / 7200) * 100)}%`;
      el.rpm.classList.toggle('red', car.state.rpm > 6600);
      el.nitro.style.width = `${car.state.nitro * 100}%`;
      el.clock.textContent = clockText(t01);
      el.money.textContent = `$${money.toLocaleString()}`;
      el.mode.textContent = car.state.gearMode === 'auto' ? 'AUTO' : 'MANUAL';
      const p = car.mesh.position, zone = ZONE_NAMES[zoneAt(p.x, p.z)];
      if (zone !== lastZone) { lastZone = zone; el.zone.textContent = zone; el.zone.classList.remove('flash'); void el.zone.offsetWidth; el.zone.classList.add('flash'); }
      if (toastTimer > 0 && (toastTimer -= dt) <= 0) el.toast.classList.remove('show');

      const W = mini.width, h = car.heading;
      mctx.clearRect(0, 0, W, W);
      mctx.save();
      mctx.beginPath(); mctx.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); mctx.clip();
      mctx.fillStyle = '#183a54'; mctx.fillRect(0, 0, W, W);
      mctx.translate(W / 2, W / 2);
      mctx.rotate(h - Math.PI / 2);
      const k = 0.45 / PX_PER_M * (W / 180);
      mctx.scale(k, k);
      mctx.drawImage(mapImg, -(p.x + MAP_HALF) * PX_PER_M, -(p.z + MAP_HALF) * PX_PER_M);
      mctx.restore();
      mctx.fillStyle = '#ff3b3b';
      mctx.beginPath(); mctx.moveTo(W / 2, W / 2 - 9); mctx.lineTo(W / 2 + 6, W / 2 + 7); mctx.lineTo(W / 2, W / 2 + 3); mctx.lineTo(W / 2 - 6, W / 2 + 7); mctx.fill();
    },
  };
}
