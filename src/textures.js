import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function speckle(ctx, w, h, base, spread, n) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = Math.floor((Math.random() - 0.5) * spread);
    ctx.fillStyle = `rgba(${128 + v},${128 + v},${128 + v},0.07)`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

function tex(c, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// One 100 m city block: 10 m of street on each edge (streets are centred on tile edges), 4 m sidewalks, plaza inside.
export function cityTileTexture(aniso) {
  const S = 1024, px = S / 100;
  const [c, ctx] = canvas(S, S);
  speckle(ctx, S, S, '#3b3d40', 90, 30000);
  ctx.fillStyle = '#8d8a84';
  ctx.fillRect(10 * px, 10 * px, 80 * px, 80 * px);
  ctx.fillStyle = '#7a776f';
  ctx.fillRect(14 * px, 14 * px, 72 * px, 72 * px);
  ctx.strokeStyle = 'rgba(40,40,40,0.35)';
  ctx.lineWidth = 2;
  for (let i = 14; i <= 86; i += 4) {
    ctx.beginPath(); ctx.moveTo(i * px, 10 * px); ctx.lineTo(i * px, 14 * px); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i * px, 86 * px); ctx.lineTo(i * px, 90 * px); ctx.stroke();
  }
  // Dashed centre lines on the tile edges (half on each side of the wrap).
  ctx.fillStyle = '#e8e2c8';
  for (let i = 12; i < 88; i += 6) {
    ctx.fillRect(i * px, -0.15 * px, 3 * px, 0.3 * px); ctx.fillRect(i * px, S - 0.15 * px, 3 * px, 0.3 * px);
    ctx.fillRect(-0.15 * px, i * px, 0.3 * px, 3 * px); ctx.fillRect(S - 0.15 * px, i * px, 0.3 * px, 3 * px);
  }
  // Zebra crossings at the four corners.
  ctx.fillStyle = 'rgba(235,235,225,0.85)';
  for (const a of [11, 86]) {
    for (let s = 0.5; s < 10; s += 1.2) {
      for (const band of [0, 90]) {
        ctx.fillRect(a * px, (band + s) * px, 3 * px, 0.6 * px); // across the horizontal streets
        ctx.fillRect((band + s) * px, a * px, 0.6 * px, 3 * px); // across the vertical streets
      }
    }
  }
  return tex(c, { aniso });
}

// Road ribbon: u across the road (0..1), v along it (1 repeat = 10 m).
export function roadTexture(aniso) {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  speckle(ctx, W, H, '#38393c', 80, 9000);
  ctx.fillStyle = '#d8d4c4';
  ctx.fillRect(6, 0, 4, H); ctx.fillRect(W - 10, 0, 4, H);
  ctx.fillStyle = '#d9b43a';
  ctx.fillRect(W / 2 - 3, 0, 2.5, H); ctx.fillRect(W / 2 + 0.5, 0, 2.5, H);
  ctx.fillStyle = 'rgba(232,228,212,0.9)';
  for (const x of [W * 0.27, W * 0.73]) ctx.fillRect(x - 1.5, 0, 3, H * 0.45);
  return tex(c, { aniso });
}

export function runwayTexture(aniso) {
  const W = 256, H = 256;
  const [c, ctx] = canvas(W, H);
  speckle(ctx, W, H, '#2f3033', 70, 8000);
  ctx.fillStyle = '#e9e9e2';
  ctx.fillRect(8, 0, 4, H); ctx.fillRect(W - 12, 0, 4, H);
  ctx.fillRect(W / 2 - 3, 0, 6, H * 0.5);
  return tex(c, { aniso });
}

// Facade: 8 x 16 window cells; one repeat = 24 m wide x 56 m tall. Emissive map lights some windows at night.
export function facadeTextures(aniso) {
  const W = 512, H = 1024, cols = 8, rows = 16, cw = W / cols, ch = H / rows;
  const [c, ctx] = canvas(W, H);
  const [e, ectx] = canvas(W, H);
  ctx.fillStyle = '#b3afa6'; ctx.fillRect(0, 0, W, H);
  ectx.fillStyle = '#000'; ectx.fillRect(0, 0, W, H);
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x = i * cw + cw * 0.14, y = j * ch + ch * 0.2, w = cw * 0.72, h = ch * 0.6;
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, '#2a3a4c'); g.addColorStop(1, '#6d8399');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y, w * 0.45, h);
      if (Math.random() < 0.38) {
        const warm = 200 + Math.random() * 55;
        ectx.fillStyle = `rgb(${warm},${warm * 0.82},${warm * 0.55})`;
        ectx.fillRect(x, y, w, h);
      }
    }
  return { map: tex(c, { aniso }), emissive: tex(e, { aniso }) };
}

export function detailTexture(aniso) {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  speckle(ctx, S, S, '#d8d8d8', 160, 14000);
  return tex(c, { repeat: [300, 300], aniso });
}
