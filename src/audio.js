// All sound is synthesised with WebAudio: no audio files to load or license. Includes a 3-station procedural radio.
const STATIONS = [
  { name: 'Bay Wave 88.1', style: 'wave', bpm: 100, root: 45, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 4] },
  { name: 'Dust FM 94.5', style: 'lofi', bpm: 82, root: 50, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 3, 6, 4], swing: 0.14 },
  { name: 'Pulse 101.3', style: 'house', bpm: 124, root: 41, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 0, 5, 6] },
];
const hz = m => 440 * 2 ** ((m - 69) / 12);

export function createAudio(G) {
  let ctx = null, master, sfx, music, noiseBuf;
  const loops = {};
  let station = -1, nextNote = 0, step = 0, radioTimer = null, rnd = 1;

  const noise = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(); return s; };
  function loop(name, filterType, freq, q = 1) {
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    noise().connect(f).connect(g).connect(sfx);
    loops[name] = { f, g };
  }
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const atten = p => (p ? 1 / (1 + Math.hypot(p.x - G.focus.x, p.z - G.focus.z) / 18) : 1);

  function burst({ type = 'lowpass', freq = 800, q = 1, peak = 0.5, decay = 0.3, at = 0, bus = sfx, thump = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime + at, s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); env(g, t, 0.005, peak, decay);
    s.connect(f).connect(g).connect(bus); s.start(t, Math.random()); s.stop(t + decay + 0.1);
    if (thump) tone({ type: 'sine', f0: thump, f1: thump * 0.4, peak: peak * 0.8, decay: decay * 0.8, at, bus });
  }
  function tone({ type = 'sine', f0 = 440, f1 = f0, peak = 0.2, decay = 0.2, attack = 0.005, at = 0, bus = sfx, filter = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + decay);
    env(g, t, attack, peak, decay);
    let out = o;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); out = f; }
    out.connect(g).connect(bus); o.start(t); o.stop(t + attack + decay + 0.05);
  }

  // ---- Radio ----
  function playStep(t, st) {
    const s = STATIONS[st], beat16 = 60 / s.bpm / 4, i = step % 16, bar = Math.floor(step / 16) % 4;
    const deg = s.prog[bar], chord = [0, 2, 4, 6].map(k => s.root + 12 + s.scale[(deg + k) % 7] + 12 * Math.floor((deg + k) / 7));
    const bus = music, R = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    const kick = () => tone({ f0: 150, f1: 42, peak: 0.9, decay: 0.28, at: t - ctx.currentTime, bus });
    const snare = (p = 0.35) => { burst({ type: 'highpass', freq: 1600, peak: p, decay: 0.16, at: t - ctx.currentTime, bus }); tone({ type: 'triangle', f0: 190, f1: 160, peak: p * 0.5, decay: 0.08, at: t - ctx.currentTime, bus }); };
    const hat = (p = 0.08, d = 0.04) => burst({ type: 'highpass', freq: 7500, peak: p, decay: d, at: t - ctx.currentTime, bus });
    const bass = (m, d, type = 'sawtooth') => tone({ type, f0: hz(m), peak: 0.32, decay: d, at: t - ctx.currentTime, bus, filter: 420 });
    const note = (m, d, type, p, filter, attack = 0.01) => tone({ type, f0: hz(m), peak: p, decay: d, attack, at: t - ctx.currentTime, bus, filter });
    if (s.style === 'wave') {
      if (i === 0 || i === 8) kick();
      if (i === 4 || i === 12) snare(0.4);
      if (i % 2 === 0) hat();
      if (i % 2 === 0) bass(s.root + s.scale[deg % 7] - 12 * (i % 4 === 0 ? 0 : -1) - 12, beat16 * 1.8);
      if (i === 0) for (const m of chord.slice(0, 3)) { note(m, beat16 * 15, 'sawtooth', 0.05, 1100, 0.25); note(m + 0.07, beat16 * 15, 'sawtooth', 0.04, 1100, 0.25); }
      note(chord[i % 4] + 12, beat16 * 0.9, 'square', 0.035, 2200);
    } else if (s.style === 'lofi') {
      if (i === 0 || i === 7 || i === 10) kick();
      if (i === 4 || i === 12) snare(0.22);
      if (i % 2 === 0) hat(0.05, 0.05);
      if (i === 0 || i === 6 || i === 10) bass(s.root + s.scale[deg % 7] - 12, beat16 * 3, 'triangle');
      if (i === 0 || i === 10) for (const m of chord) note(m, beat16 * 6, 'triangle', 0.06, 900, 0.02);
      if (i % 4 === 2 && R() < 0.45) note(s.root + 24 + s.scale[Math.floor(R() * 5)], beat16 * 2, 'sine', 0.06, 1500);
      if (R() < 0.2) burst({ type: 'highpass', freq: 3000, peak: 0.015, decay: 0.02, at: t - ctx.currentTime, bus });
    } else {
      if (i % 4 === 0) kick();
      if (i === 4 || i === 12) snare(0.3);
      if (i % 4 === 2) hat(0.12, 0.18); else hat(0.04, 0.03);
      if (i % 4 === 2 || i % 4 === 3) bass(s.root + s.scale[deg % 7], beat16 * 0.9);
      if (i === 3 || i === 11) for (const m of chord.slice(0, 3)) note(m + 12, beat16 * 1.2, 'sawtooth', 0.045, 1800);
    }
  }
  function scheduler() {
    if (!ctx || station < 0) return;
    const s = STATIONS[station], beat16 = 60 / s.bpm / 4;
    while (nextNote < ctx.currentTime + 0.15) {
      const swing = s.swing && step % 2 ? s.swing * beat16 : 0;
      playStep(nextNote + swing, station);
      nextNote += beat16; step++;
    }
  }

  const api = {
    start() {
      if (ctx) { ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return; // no audio support: play silently
      ctx = new AC();
      master = ctx.createGain(); master.connect(ctx.destination);
      sfx = ctx.createGain(); sfx.connect(master);
      music = ctx.createGain(); music.connect(master);
      api.setVolume(G.settings.volume, G.settings.music);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // Engine: two oscillators through a low-pass filter.
      const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.Q.value = 3;
      const eg = ctx.createGain(); eg.gain.value = 0;
      const a = ctx.createOscillator(), b = ctx.createOscillator(), bg = ctx.createGain();
      a.type = 'sawtooth'; b.type = 'square'; bg.gain.value = 0.45;
      a.connect(ef); b.connect(bg).connect(ef); ef.connect(eg).connect(sfx); a.start(); b.start();
      loops.engine = { a, b, f: ef, g: eg };
      loop('skid', 'bandpass', 1900, 2.5);
      loop('nitro', 'highpass', 2500);
      loop('rain', 'bandpass', 4000, 0.5);
      loop('wind', 'lowpass', 500);
      loop('city', 'lowpass', 260);
      loop('heli', 'lowpass', 300);
      const heliAm = ctx.createOscillator(), heliDepth = ctx.createGain(); heliAm.frequency.value = 17; heliDepth.gain.value = 0;
      heliAm.connect(heliDepth).connect(loops.heli.g.gain); heliAm.start(); loops.heliDepth = heliDepth;
      const sir = ctx.createOscillator(), sg = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      sir.type = 'sawtooth'; sir.frequency.value = 900; lfo.frequency.value = 0.45; lg.gain.value = 380; sg.gain.value = 0;
      lfo.connect(lg).connect(sir.frequency);
      const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 2200;
      sir.connect(sf).connect(sg).connect(sfx); sir.start(); lfo.start();
      loops.siren = { g: sg };
      const h1 = ctx.createOscillator(), h2 = ctx.createOscillator(), hg = ctx.createGain(), hf = ctx.createBiquadFilter();
      h1.type = h2.type = 'square'; h1.frequency.value = 392; h2.frequency.value = 494; hg.gain.value = 0; hf.type = 'lowpass'; hf.frequency.value = 1800;
      h1.connect(hf); h2.connect(hf); hf.connect(hg).connect(sfx); h1.start(); h2.start();
      loops.horn = { g: hg };
      radioTimer = setInterval(scheduler, 30);
    },
    suspend() { ctx?.suspend(); },
    setVolume(v, m) { if (!ctx) return; master.gain.value = v; music.gain.value = m * 0.55; },
    get station() { return station < 0 ? 'Radio off' : STATIONS[station].name; },
    nextStation() {
      station = station + 1 >= STATIONS.length ? -1 : station + 1;
      if (ctx) { nextNote = ctx.currentTime + 0.25; step = 0; burst({ type: 'bandpass', freq: 2000, peak: 0.12, decay: 0.25, bus: music }); }
      return api.station;
    },
    update(dt) {
      if (!ctx) return;
      const t = ctx.currentTime, P = G.player, v = P.mode === 'car' ? P.vehicle : null, set = (p, val, k = 0.05) => p.setTargetAtTime(val, t, k);
      const e = loops.engine;
      if (v && !G.paused) {
        const s = v.state, f = (s.rpm / 60) * (v.spec.kind === 'bike' ? 2 : 3) * (v.spec.mass > 2500 ? 0.7 : 1);
        set(e.a.frequency, f, 0.03); set(e.b.frequency, f * 0.5, 0.03);
        set(e.f.frequency, 300 + s.throttle * 2200 + s.rpm * 0.15);
        set(e.g.gain, v.dead ? 0 : 0.06 + s.throttle * 0.1);
        set(loops.skid.g.gain, Math.max(0, s.slip - 0.25) * 0.5);
        set(loops.nitro.g.gain, s.nitroOn ? 0.12 : 0, 0.1);
        set(loops.wind.g.gain, Math.min(0.12, v.speedKmh / 1500));
        set(loops.horn.g.gain, s.horn ? 0.12 : 0, 0.01);
      } else for (const k of ['skid', 'nitro', 'wind']) set(loops[k].g.gain, 0);
      if (!v || G.paused) { set(e.g.gain, 0); set(loops.horn.g.gain, 0, 0.01); }
      // Sirens: loudest nearby police car with its lights on.
      let siren = 0;
      for (const u of G.fleet.list) if (u.state.siren) { const p = u.body.translation(); siren = Math.max(siren, 1 - Math.hypot(p.x - G.focus.x, p.z - G.focus.z) / 260); }
      set(loops.siren.g.gain, G.paused ? 0 : Math.max(0, siren) * 0.06);
      const hd = G.police.heli.on ? Math.max(0, 1 - Math.hypot(G.police.heli.x - G.focus.x, G.police.heli.z - G.focus.z) / 300) : 0;
      set(loops.heli.g.gain, hd * 0.25); set(loops.heliDepth.gain, hd * 0.2);
      const w = G.weather.params;
      set(loops.rain.g.gain, G.paused ? 0 : w.rain * (v ? 0.07 : 0.12), 0.5);
      const down = Math.abs(G.focus.x) < 450 && Math.abs(G.focus.z) < 450;
      set(loops.city.g.gain, G.paused ? 0 : down ? 0.05 : 0.015, 0.5);
      // Birds by day, crickets at night (when it's dry).
      if (!G.paused && w.rain < 0.1 && Math.random() < dt * 0.4) {
        if (G.night < 0.3 && !down) { const f = 2500 + Math.random() * 1500; tone({ f0: f, f1: f * 1.3, peak: 0.02, decay: 0.08 }); tone({ f0: f * 1.1, f1: f * 0.9, peak: 0.02, decay: 0.08, at: 0.12 }); }
        else if (G.night > 0.7) for (let i = 0; i < 3; i++) tone({ f0: 4300, peak: 0.01, decay: 0.03, at: i * 0.06 });
      }
      music.gain.setTargetAtTime(v && station >= 0 && !G.paused ? G.settings.music * 0.55 : 0, t, 0.3);
    },
    crash(strength, p) { burst({ freq: 500 + strength * 1500, peak: Math.min(0.8, 0.15 + strength * 0.6) * atten(p), decay: 0.25 + strength * 0.4, thump: 90 }); },
    thud(p) { tone({ f0: 120, f1: 60, peak: 0.25 * atten(p), decay: 0.15 }); },
    gun(kind, dist) { const a = 1 / (1 + dist / 25); burst({ type: 'lowpass', freq: kind === 'smg' ? 2500 : 1800, peak: 0.45 * a, decay: kind === 'smg' ? 0.08 : 0.18, thump: kind === 'smg' ? 0 : 140 }); },
    swing() { burst({ type: 'bandpass', freq: 900, q: 2, peak: 0.08, decay: 0.12 }); },
    boom(dist) { const a = 1 / (1 + dist / 40); burst({ freq: 300, peak: 0.9 * a, decay: 1.6, thump: 70 }); burst({ freq: 2000, peak: 0.3 * a, decay: 0.4 }); },
    thunder() { const d = 0.4 + Math.random() * 2; burst({ freq: 160, peak: 0.6, decay: 3, at: d }); burst({ freq: 700, peak: 0.2, decay: 0.6, at: d }); },
    cash() { tone({ type: 'triangle', f0: 1320, peak: 0.12, decay: 0.12 }); tone({ type: 'triangle', f0: 1760, peak: 0.12, decay: 0.25, at: 0.08 }); },
    beep(f = 880) { tone({ type: 'square', f0: f, peak: 0.08, decay: 0.15, filter: 3000 }); },
    win() { [0, 4, 7, 12].forEach((s, i) => tone({ type: 'triangle', f0: hz(72 + s), peak: 0.12, decay: 0.3, at: i * 0.11 })); },
    fail() { [7, 3, 0, -5].forEach((s, i) => tone({ type: 'triangle', f0: hz(64 + s), peak: 0.1, decay: 0.3, at: i * 0.15 })); },
    alarm() { for (let i = 0; i < 10; i++) tone({ type: 'square', f0: i % 2 ? 1250 : 900, peak: 0.05, decay: 0.2, at: i * 0.25, filter: 2500 }); },
  };
  return api;
}
