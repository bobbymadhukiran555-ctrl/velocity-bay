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

// Derive cheap normal and roughness maps from a colour canvas: paint and glass read smoother than the gritty base.
function surface(c, aniso, strength = 1.5, base = 0.86) {
  const w = c.width, h = c.height, src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const [nc, nctx] = canvas(w, h), [rc, rctx] = canvas(w, h);
  const norm = nctx.createImageData(w, h), rough = rctx.createImageData(w, h);
  const lumi = new Float32Array(w * h);
  for (let i = 0; i < lumi.length; i++) { const j = i * 4; lumi[i] = (src[j] * 0.3 + src[j + 1] * 0.59 + src[j + 2] * 0.11) / 255; }
  const lum = (x, y) => lumi[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength, dy = (lum(x, y + 1) - lum(x, y - 1)) * strength;
    const L = Math.hypot(dx, dy, 1);
    norm.data[i] = 128 - (dx / L) * 127; norm.data[i + 1] = 128 - (dy / L) * 127; norm.data[i + 2] = 128 + (1 / L) * 127; norm.data[i + 3] = 255;
    const g = Math.round(255 * Math.max(0.2, Math.min(1, base + 0.22 * (0.5 - lum(x, y)))));
    rough.data[i] = rough.data[i + 1] = rough.data[i + 2] = g; rough.data[i + 3] = 255;
  }
  nctx.putImageData(norm, 0, 0); rctx.putImageData(rough, 0, 0);
  return { normalMap: tex(nc, { srgb: false, aniso }), roughnessMap: tex(rc, { aniso }) };
}

// One 100 m city block: 10 m of street on each edge (streets are centred on tile edges), 4 m sidewalks, plaza inside.
export function cityTileTexture(aniso, scale = 1) {
  const S = Math.round(1024 * scale), px = S / 100;
  const [c, ctx] = canvas(S, S);
  speckle(ctx, S, S, '#3b3d40', 90, 30000);
  // Tyre polish and patched repairs on the asphalt.
  for (const band of [0, 90]) {
    ctx.fillStyle = 'rgba(15,15,16,0.16)';
    ctx.fillRect(band * px, 3 * px, 10 * px, 0.35 * px);
    ctx.fillRect(band * px, 7 * px, 10 * px, 0.35 * px);
  }
  ctx.fillStyle = 'rgba(20,20,22,0.22)';
  for (let i = 0; i < 14; i++) ctx.fillRect(Math.random() * S, (Math.random() < 0.5 ? Math.random() * 8 : 92 + Math.random() * 8) * px, (1 + Math.random() * 4) * px, (0.4 + Math.random() * 1.6) * px);
  ctx.fillStyle = '#8d8a84'; ctx.fillRect(10 * px, 10 * px, 80 * px, 80 * px);
  ctx.fillStyle = '#7a776f'; ctx.fillRect(14 * px, 14 * px, 72 * px, 72 * px);
  ctx.strokeStyle = 'rgba(40,40,40,0.35)'; ctx.lineWidth = 2;
  for (let i = 14; i <= 86; i += 4) {
    ctx.beginPath(); ctx.moveTo(i * px, 10 * px); ctx.lineTo(i * px, 14 * px); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i * px, 86 * px); ctx.lineTo(i * px, 90 * px); ctx.stroke();
  }
  for (let i = 18; i <= 82; i += 16) for (let j = 18; j <= 82; j += 16) {
    ctx.strokeStyle = 'rgba(55,55,55,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(i * px, j * px, 2.2 * px, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(90,90,90,0.35)';
    ctx.beginPath(); ctx.arc(i * px, j * px, 1.4 * px, 0, Math.PI * 2); ctx.stroke();
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
        ctx.fillRect(a * px, (band + s) * px, 3 * px, 0.6 * px);
        ctx.fillRect((band + s) * px, a * px, 0.6 * px, 3 * px);
      }
    }
  }
  if (scale > 1) {
    // Fine paving grain and worn kerb edges only pay off at high resolution.
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 6000; i++) ctx.fillRect(10 * px + Math.random() * 80 * px, 10 * px + Math.random() * 80 * px, Math.random() * px, Math.random() * px);
    ctx.strokeStyle = 'rgba(230,230,225,0.22)'; ctx.lineWidth = Math.max(1, 0.12 * px);
    for (const a of [10, 90]) {
      ctx.beginPath(); ctx.moveTo(a * px, 10 * px); ctx.lineTo(a * px, 90 * px); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10 * px, a * px); ctx.lineTo(90 * px, a * px); ctx.stroke();
    }
  }
  return { map: tex(c, { aniso }), ...surface(c, aniso, 1, 0.88) };
}

// Road ribbon: u across the road (0..1), v along it (1 repeat = 10 m).
export function roadTexture(aniso, scale = 1) {
  const W = Math.round(512 * scale), H = W, u = W / 512;
  const [c, ctx] = canvas(W, H);
  speckle(ctx, W, H, '#34363a', 96, Math.min(120000, Math.round(26000 * u * u)));
  ctx.fillStyle = 'rgba(120,118,112,0.10)';
  for (let i = 0; i < 22; i++) { const x = Math.random() * W, y = Math.random() * H; ctx.fillRect(x, y, (20 + Math.random() * 90) * u, (6 + Math.random() * 26) * u); }
  // Hairline cracks.
  ctx.strokeStyle = 'rgba(12,12,14,0.45)'; ctx.lineWidth = Math.max(1, u);
  for (let i = 0; i < 14; i++) {
    let x = Math.random() * W, y = Math.random() * H;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 26 * u; y += (12 + Math.random() * 30) * u; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // Grime builds up where wheels don't scrub.
  const shade = ctx.createLinearGradient(0, 0, W, 0);
  shade.addColorStop(0, 'rgba(12,12,13,0.35)'); shade.addColorStop(0.16, 'rgba(12,12,13,0)');
  shade.addColorStop(0.84, 'rgba(12,12,13,0)'); shade.addColorStop(1, 'rgba(12,12,13,0.35)');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#d8d4c4';
  ctx.fillRect(30 * u, 0, 10 * u, H); ctx.fillRect(W - 40 * u, 0, 10 * u, H);
  ctx.fillStyle = '#d9b43a';
  ctx.fillRect(W / 2 - 7 * u, 0, 5 * u, H); ctx.fillRect(W / 2 + 2 * u, 0, 5 * u, H);
  ctx.fillStyle = 'rgba(232,228,212,0.85)';
  for (const x of [W * 0.27, W * 0.73]) for (let y = 0; y < H * 0.45; y += 96 * u) ctx.fillRect(x - 3 * u, y, 6 * u, H * 0.45 - y - 24 * u);
  // Worn paint: tiny asphalt-coloured nicks so lines don't look printed.
  ctx.fillStyle = 'rgba(52,54,58,0.5)';
  for (let i = 0; i < Math.min(600, Math.round(130 * u * u)); i++) ctx.fillRect(Math.random() * W, Math.random() * H, (1 + Math.random() * 3) * u, (1 + Math.random() * 4) * u);
  if (scale > 1) {
    // Fine aggregate catches the light at high resolution.
    ctx.fillStyle = 'rgba(210,210,205,0.18)';
    for (let i = 0; i < 14000; i++) ctx.fillRect(Math.random() * W, Math.random() * H, u, u);
  }
  return { map: tex(c, { aniso }), ...surface(c, aniso, 1.6, 0.9) };
}

export function runwayTexture(aniso, scale = 1) {
  const W = Math.round(256 * scale), H = W, u = W / 256;
  const [c, ctx] = canvas(W, H);
  speckle(ctx, W, H, '#2f3033', 70, Math.min(32000, Math.round(8000 * u * u)));
  ctx.fillStyle = '#e9e9e2';
  ctx.fillRect(8 * u, 0, 4 * u, H); ctx.fillRect(W - 12 * u, 0, 4 * u, H);
  ctx.fillRect(W / 2 - 3 * u, 0, 6 * u, H * 0.5);
  return tex(c, { aniso });
}

// Facade: 8 x 16 window cells; one repeat = 24 m wide x 56 m tall. Emissive map lights some windows at night.
export function facadeTextures(aniso, scale = 1) {
  const W = Math.round(512 * scale), H = 2 * W, cols = 8, rows = 16, cw = W / cols, ch = H / rows;
  const [c, ctx] = canvas(W, H);
  const [e, ectx] = canvas(W, H);
  ctx.fillStyle = '#b3afa6'; ctx.fillRect(0, 0, W, H);
  ectx.fillStyle = '#000'; ectx.fillRect(0, 0, W, H);
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x = i * cw + cw * 0.14, y = j * ch + ch * 0.2, w = cw * 0.72, h = ch * 0.6;
      ctx.fillStyle = 'rgba(30,30,30,0.35)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, '#2a3a4c'); g.addColorStop(1, '#6d8399');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y, w * 0.45, h);
      if (Math.random() < 0.3) { ctx.fillStyle = 'rgba(220,225,230,0.22)'; ctx.fillRect(x, y + h * 0.35, w, 2); }
      if (scale > 1) {
        ctx.fillStyle = 'rgba(20,25,30,0.35)';
        ctx.fillRect(x + w / 2 - Math.max(1, cw * 0.012), y, Math.max(1, cw * 0.024), h);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x - cw * 0.03, y + h, w + cw * 0.06, Math.max(1, ch * 0.02));
      }
      if (Math.random() < 0.38) {
        const warm = 200 + Math.random() * 55;
        ectx.fillStyle = `rgb(${warm},${warm * 0.82},${warm * 0.55})`;
        ectx.fillRect(x, y, w, h);
      }
    }
  return { map: tex(c, { aniso }), emissive: tex(e, { aniso }), ...surface(c, aniso, 1.2, 0.55) };
}

export function detailTexture(aniso, scale = 1) {
  const S = Math.round(256 * scale);
  const [c, ctx] = canvas(S, S);
  speckle(ctx, S, S, '#d8d8d8', 160, 14000);
  return tex(c, { repeat: [300, 300], aniso });
}
