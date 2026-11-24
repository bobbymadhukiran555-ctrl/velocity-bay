// Keyboard, mouse, gamepad and on-screen touch buttons -> one input state. Edge actions are read once with consume().
import { readPad } from './logic/gamepad.js';
const HOLD = {
  throttle: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'], nitro: ['ShiftLeft', 'ShiftRight'], use: ['KeyF'], horn: ['KeyH'], fire: ['KeyK'],
};
const EDGE = {
  shiftUp: ['KeyE'], shiftDown: ['KeyQ'], camera: ['KeyC'], reset: ['KeyR'], lights: ['KeyL'], gearMode: ['KeyG'], timeSkip: ['KeyT'],
  interact: ['KeyF'], weapon: ['KeyX'], map: ['KeyM'], photo: ['KeyP'], pause: ['Escape'], selector: ['KeyV'], radio: ['KeyN'], mods: ['F2', 'Backquote'], help: ['F1'],
};

export function createInput(onFirstInput) {
  const held = new Set(), pressed = new Set(), codeTo = {};
  for (const [name, codes] of Object.entries({ ...HOLD, ...EDGE })) for (const c of codes) (codeTo[c] ??= []).push(name);
  let first = true, enabled = true, padPrev = [], padLook = { x: 0, y: 0 };
  const NO_LOOK = Object.freeze({ x: 0, y: 0 });
  const padHeld = new Set();
  const isHeld = n => held.has(n) || padHeld.has(n);
  const wake = () => { if (first) { first = false; onFirstInput(); } };

  addEventListener('keydown', e => {
    const names = codeTo[e.code];
    if (!names) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    e.preventDefault();
    wake();
    if (!enabled) return;
    for (const n of names) { if (!e.repeat && EDGE[n]) pressed.add(n); if (HOLD[n]) held.add(n); }
  });
  addEventListener('keyup', e => { for (const n of codeTo[e.code] || []) held.delete(n); });
  addEventListener('blur', () => held.clear());

  for (const el of document.querySelectorAll('[data-input]')) {
    const names = el.dataset.input.split(' ');
    const down = e => { e.preventDefault(); e.stopPropagation(); wake(); el.setPointerCapture?.(e.pointerId); for (const n of names) { if (HOLD[n]) held.add(n); if (EDGE[n]) pressed.add(n); } el.classList.add('on'); };
    const up = () => { for (const n of names) held.delete(n); el.classList.remove('on'); };
    el.addEventListener('pointerdown', down);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, up);
  }
  // Touch joystick (on foot): x = right, y = forward, each -1..1.
  const stick = { x: 0, y: 0, active: false }, stickEl = document.getElementById('stick'), knob = stickEl?.querySelector('.knob');
  if (stickEl) {
    const move = e => {
      const r = stickEl.getBoundingClientRect(), R = r.width / 2;
      let x = (e.clientX - r.left - R) / R, y = -(e.clientY - r.top - R) / R;
      const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
      stick.x = x; stick.y = y;
      knob.style.transform = `translate(${x * R * 0.6}px, ${-y * R * 0.6}px)`;
    };
    const end = () => { stick.active = false; stick.x = stick.y = 0; knob.style.transform = ''; };
    stickEl.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); wake(); stick.active = true; move(e); try { stickEl.setPointerCapture(e.pointerId); } catch {} });
    stickEl.addEventListener('pointermove', e => { if (stick.active) move(e); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) stickEl.addEventListener(ev, end);
  }
  addEventListener('pointerdown', wake);
  // Mouse: left button fires, wheel changes weapon (only on the game canvas).
  const canvasDown = e => { if (e.button === 0 && e.pointerType === 'mouse' && enabled) held.add('mouseFire'); };
  addEventListener('pointerup', () => held.delete('mouseFire'));

  return {
    attach(canvas) {
      canvas.addEventListener('pointerdown', canvasDown);
      canvas.addEventListener('wheel', e => { if (enabled) pressed.add('weapon'); }, { passive: true });
    },
    set enabled(v) { enabled = v; if (!v) { held.clear(); pressed.clear(); padHeld.clear(); } },
    read() {
      const pad = enabled ? navigator.getGamepads?.().find(p => p?.connected) : null;
      let pin = null;
      if (pad) {
        pin = readPad(pad, padPrev);
        padPrev = pin.buttons;
        padHeld.clear();
        for (const n of pin.held) padHeld.add(n);
        for (const n of pin.edges) pressed.add(n);
        padLook = pin.look;
        if (pin.held.length || pin.throttle || pin.brake || pin.steer || pin.pitch || pin.look.x || pin.look.y) wake();
      } else { padPrev = []; padHeld.clear(); padLook = NO_LOOK; }
      const steer = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
      const grip = pin && Math.hypot(pin.stick.x, pin.stick.y) > 0 ? pin.stick : null;
      return {
        throttle: Math.max(held.has('throttle') ? 1 : 0, pin?.throttle ?? 0),
        brake: Math.max(held.has('brake') ? 1 : 0, pin?.brake ?? 0),
        steer: steer || pin?.steer || 0,
        pitch: pin?.pitch ?? 0,
        handbrake: isHeld('handbrake'),
        nitro: isHeld('nitro'),
        stick: enabled && stick.active ? stick : grip,
        shiftUp: this.consume('shiftUp'),
        shiftDown: this.consume('shiftDown'),
      };
    },
    held: name => isHeld(name),
    look: () => (enabled ? padLook : NO_LOOK),
    consume(name) { const had = pressed.has(name); pressed.delete(name); return had; },
  };
}
