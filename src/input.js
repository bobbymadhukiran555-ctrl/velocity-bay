// Keyboard, mouse and on-screen touch buttons -> one input state. Edge actions are read once with consume().
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
  let first = true, enabled = true;
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
    set enabled(v) { enabled = v; if (!v) { held.clear(); pressed.clear(); } },
    read() {
      return {
        throttle: held.has('throttle') ? 1 : 0,
        brake: held.has('brake') ? 1 : 0,
        steer: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0),
        handbrake: held.has('handbrake'),
        nitro: held.has('nitro'),
        stick: enabled && stick.active ? stick : null,
        shiftUp: this.consume('shiftUp'),
        shiftDown: this.consume('shiftDown'),
      };
    },
    held: name => held.has(name),
    consume(name) { const had = pressed.has(name); pressed.delete(name); return had; },
  };
}
