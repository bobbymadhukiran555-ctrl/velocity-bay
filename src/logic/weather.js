// Dynamic weather: a slow random walk between states with smooth blends. Pure, no Three.js.
export const WEATHER = {
  clear:  { cloud: 0.05, fog: 0,    rain: 0,   wind: 0.2, lightning: 0 },
  cloudy: { cloud: 0.7,  fog: 0.1,  rain: 0,   wind: 0.4, lightning: 0 },
  fog:    { cloud: 0.5,  fog: 1,    rain: 0,   wind: 0.1, lightning: 0 },
  rain:   { cloud: 0.85, fog: 0.35, rain: 0.7, wind: 0.6, lightning: 0 },
  storm:  { cloud: 1,    fog: 0.45, rain: 1,   wind: 1,   lightning: 1 },
};
export const WEATHER_NAMES = Object.keys(WEATHER);
const NEXT = { clear: ['clear', 'cloudy', 'cloudy', 'fog'], cloudy: ['clear', 'rain', 'fog', 'cloudy'], fog: ['clear', 'cloudy'], rain: ['cloudy', 'storm', 'rain'], storm: ['rain'] };
const BLEND_S = 45;

export function createWeather(rnd = Math.random, start = 'clear') {
  const duration = () => 180 + rnd() * 300;
  const w = { name: start, target: start, timer: duration(), forced: null, wet: 0, params: { ...WEATHER[start] } };
  return {
    get name() { return w.target; },
    get forced() { return w.forced; },
    get wet() { return w.wet; },
    get params() { return w.params; },
    // name = a weather state, or 'auto' to go back to random changes.
    set(name, instant = false) {
      w.forced = name === 'auto' ? null : name;
      if (w.forced) w.target = w.forced;
      w.timer = duration();
      if (instant && w.forced) { Object.assign(w.params, WEATHER[w.forced]); w.wet = WEATHER[w.forced].rain > 0 ? 1 : 0; }
    },
    update(dt) {
      if (!w.forced && (w.timer -= dt) <= 0) {
        const opts = NEXT[w.target];
        w.target = opts[Math.floor(rnd() * opts.length)];
        w.timer = duration();
      }
      const goal = WEATHER[w.target], k = Math.min(1, dt / BLEND_S);
      for (const key in goal) w.params[key] += (goal[key] - w.params[key]) * k * 3;
      // Roads soak in about 40 s of rain and dry in about 2 minutes.
      w.wet = Math.min(1, Math.max(0, w.wet + (w.params.rain > 0.1 ? dt / 40 : -dt / 120)));
      return w.params;
    },
  };
}

// Tyre grip on wet roads.
export const wetGrip = wet => 1 - 0.18 * wet;
