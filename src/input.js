// Keyboard, mouse, gamepad and on-screen touch buttons -> one input state. Edge actions are read once with consume().
import { readPad } from './logic/gamepad.js';
const HOLD = {
  throttle: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'], nitro: ['ShiftLeft', 'ShiftRight'], use: ['KeyF'], horn: ['KeyH'], fire: ['KeyK'], aim: [], land: ['KeyB'],
};
const EDGE = {
  shiftUp: ['KeyE'], shiftDown: ['KeyQ'], camera: ['KeyC'], reset: ['KeyR'], lights: ['KeyL'], gearMode: ['KeyG'], timeSkip: ['KeyT'],
  interact: ['KeyF'], weapon: ['KeyX'], map: ['KeyM'], photo: ['KeyP'], pause: ['Escape'], selector: ['KeyV'], radio: ['KeyN'], mods: ['F2', 'Backquote'], help: ['F1'],
};

export function createInput(onFirstInput) {
  const held = new Set(), pressed = new Set(), codeTo = {};
  for (const [name, codes] of Object.entries({ ...HOLD, ...EDGE })) for (const c of codes) (codeTo[c] ??= []).push(name);
  let first = true, enabled = true, padPrev = [], padLook = { x: 0, y: 0 }, mouseDX = 0, mouseDY = 0, gameCanvas = null;
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
    const down = e => { e.preventDefault(); e.stopPropagation(); wake(); try { el.setPointerCapture?.(e.pointerId); } catch {} for (const n of names) { if (HOLD[n]) held.add(n); if (EDGE[n]) pressed.add(n); } el.classList.add('on'); };
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
  // Touch look pad (right side of the screen while on foot): drag to turn and tilt the view.
  const lookEl = document.getElementById('lookpad');
  let touchLook = false;
  if (lookEl) {
    let id = null, lx = 0, ly = 0;
    lookEl.addEventListener('pointerdown', e => { wake(); id = e.pointerId; lx = e.clientX; ly = e.clientY; try { lookEl.setPointerCapture(id); } catch {} });
    lookEl.addEventListener('pointermove', e => { if (e.pointerId !== id) return; mouseDX += (e.clientX - lx) * 1.5; mouseDY += (e.clientY - ly) * 1.5; touchLook = true; lx = e.clientX; ly = e.clientY; });
    for (const ev of ['pointerup', 'pointercancel']) lookEl.addEventListener(ev, e => { if (e.pointerId === id) id = null; });
  }
  addEventListener('pointerdown', wake);
  // Mouse: click locks the pointer, left fires, right aims (focus), wheel changes weapon.
  const canvasDown = e => {
    if (!enabled || e.pointerType !== 'mouse') return;
    if (e.button === 0) {
      held.add('mouseFire');
      if (document.pointerLockElement !== gameCanvas) gameCanvas?.requestPointerLock?.();
    } else if (e.button === 2) held.add('aim');
  };
  addEventListener('pointerup', e => { if (e.button === 0) held.delete('mouseFire'); if (e.button === 2) held.delete('aim'); });
  addEventListener('mousemove', e => {
    if (document.pointerLockElement !== gameCanvas) return;
    mouseDX += e.movementX; mouseDY += e.movementY;
  });
  addEventListener('pointerlockchange', () => { held.delete('mouseFire'); held.delete('aim'); });

  return {
    attach(canvas) {
      gameCanvas = canvas;
      canvas.addEventListener('pointerdown', canvasDown);
      canvas.addEventListener('contextmenu', e => e.preventDefault());
      canvas.addEventListener('wheel', e => { if (enabled) pressed.add('weapon'); }, { passive: true });
    },
    set enabled(v) { enabled = v; if (!v) { held.clear(); pressed.clear(); padHeld.clear(); mouseDX = mouseDY = 0; } },
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
        land: isHeld('land'),
        handbrake: isHeld('handbrake'),
        nitro: isHeld('nitro'),
        aim: isHeld('aim'),
        stick: enabled && stick.active ? stick : grip,
        shiftUp: this.consume('shiftUp'),
        shiftDown: this.consume('shiftDown'),
      };
    },
    held: name => isHeld(name),
    look: () => (enabled ? padLook : NO_LOOK),
    mouseDelta() { const d = { x: mouseDX, y: mouseDY, touch: touchLook }; mouseDX = mouseDY = 0; touchLook = false; return d; },
    pointerLocked: () => document.pointerLockElement === gameCanvas,
    consume(name) { const had = pressed.has(name); pressed.delete(name); return had; },
  };
}
