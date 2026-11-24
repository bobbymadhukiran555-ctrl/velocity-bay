// Keyboard + on-screen touch buttons -> one input state. Edge actions are read once with consume().
const HOLD = {
  throttle: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'], nitro: ['ShiftLeft', 'ShiftRight'],
};
const EDGE = { shiftUp: ['KeyE'], shiftDown: ['KeyQ'], camera: ['KeyC'], reset: ['KeyR'], lights: ['KeyL'], gearMode: ['KeyG'], timeSkip: ['KeyT'], help: ['KeyH'] };

export function createInput(onFirstInput) {
  const held = new Set(), pressed = new Set();
  const codeTo = {};
  for (const [name, codes] of Object.entries({ ...HOLD, ...EDGE })) for (const c of codes) codeTo[c] = name;
  let first = true;
  const wake = () => { if (first) { first = false; onFirstInput(); } };

  addEventListener('keydown', e => {
    const name = codeTo[e.code];
    if (!name) return;
    e.preventDefault();
    wake();
    if (!e.repeat && EDGE[name]) pressed.add(name);
    held.add(name);
  });
  addEventListener('keyup', e => { const n = codeTo[e.code]; if (n) held.delete(n); });
  addEventListener('blur', () => held.clear());

  for (const el of document.querySelectorAll('[data-input]')) {
    const name = el.dataset.input;
    const down = e => { e.preventDefault(); wake(); el.setPointerCapture?.(e.pointerId); held.add(name); if (EDGE[name]) pressed.add(name); el.classList.add('on'); };
    const up = () => { held.delete(name); el.classList.remove('on'); };
    el.addEventListener('pointerdown', down);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, up);
  }
  addEventListener('pointerdown', wake);

  return {
    read() {
      return {
        throttle: held.has('throttle') ? 1 : 0,
        brake: held.has('brake') ? 1 : 0,
        steer: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0),
        handbrake: held.has('handbrake'),
        nitro: held.has('nitro'),
        shiftUp: this.consume('shiftUp'),
        shiftDown: this.consume('shiftDown'),
      };
    },
    consume(name) { const had = pressed.has(name); pressed.delete(name); return had; },
  };
}
