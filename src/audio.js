// All sound is synthesised: no audio files to load or license.
export function createAudio() {
  let ctx = null, engA, engB, filter, engGain, skidGain, nitroGain;

  function noiseSource() {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start();
    return s;
  }

  return {
    start() {
      if (ctx) { ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return; // no audio support: play silently
      ctx = new AC();
      const master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
      filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 3;
      engGain = ctx.createGain(); engGain.gain.value = 0;
      engA = ctx.createOscillator(); engA.type = 'sawtooth';
      engB = ctx.createOscillator(); engB.type = 'square';
      const bGain = ctx.createGain(); bGain.gain.value = 0.45;
      engA.connect(filter); engB.connect(bGain).connect(filter);
      filter.connect(engGain).connect(master);
      engA.start(); engB.start();

      const skidF = ctx.createBiquadFilter(); skidF.type = 'bandpass'; skidF.frequency.value = 1900; skidF.Q.value = 2.5;
      skidGain = ctx.createGain(); skidGain.gain.value = 0;
      noiseSource().connect(skidF).connect(skidGain).connect(master);

      const nitroF = ctx.createBiquadFilter(); nitroF.type = 'highpass'; nitroF.frequency.value = 2500;
      nitroGain = ctx.createGain(); nitroGain.gain.value = 0;
      noiseSource().connect(nitroF).connect(nitroGain).connect(master);
    },
    update(car) {
      if (!ctx) return;
      const t = ctx.currentTime, s = car.state, f = (s.rpm / 60) * 3; // 6-cylinder firing frequency
      engA.frequency.setTargetAtTime(f, t, 0.03);
      engB.frequency.setTargetAtTime(f * 0.5, t, 0.03);
      filter.frequency.setTargetAtTime(300 + s.throttle * 2200 + s.rpm * 0.15, t, 0.05);
      engGain.gain.setTargetAtTime(0.06 + s.throttle * 0.1, t, 0.05);
      skidGain.gain.setTargetAtTime(Math.max(0, s.slip - 0.25) * 0.5, t, 0.05);
      nitroGain.gain.setTargetAtTime(s.nitroOn ? 0.12 : 0, t, 0.1);
    },
    suspend() { ctx?.suspend(); },
  };
}
