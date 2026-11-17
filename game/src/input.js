// input.js — keyboard + mouse for SOLMAR.
// Held keys drive movement and driving; presses queue edge-triggered
// action bits. takeActions(mask) lets a menu consume only the bits it
// cares about (confirm / pause / mute) and leave the rest queued, so
// driving actions are never swallowed by a menu.
// Action bits: one bit per edge-triggered action. Consumers use the
// ACT_* names (world step) and the ACTIONS object (menu screens);
// ACTION_* spellings are kept as aliases for the same bits.
export const ACT_CONFIRM = 1 << 0;
export const ACT_PAUSE = 1 << 1;
export const ACT_ENTER = 1 << 2;
export const ACT_PUNCH = 1 << 3;
export const ACT_SHOOT = 1 << 4;
export const ACT_HORN = 1 << 5;
export const ACT_MUTE = 1 << 6;
export const ACT_HANDBRAKE = 1 << 7;
export const ACT_ALL = (1 << 8) - 1;
export const ACTION_CONFIRM = ACT_CONFIRM;
export const ACTION_PAUSE = ACT_PAUSE;
export const ACTION_ENTER_CAR = ACT_ENTER;
export const ACTION_PUNCH = ACT_PUNCH;
export const ACTION_SHOOT = ACT_SHOOT;
export const ACTION_HORN = ACT_HORN;
export const ACTION_MUTE = ACT_MUTE;
export const ACTION_HANDBRAKE = ACT_HANDBRAKE;
export const ACTION_ALL = ACT_ALL;
export const ACTIONS = {
  CONFIRM: ACT_CONFIRM,
  PAUSE: ACT_PAUSE,
  ENTER: ACT_ENTER,
  PUNCH: ACT_PUNCH,
  SHOOT: ACT_SHOOT,
  HORN: ACT_HORN,
  MUTE: ACT_MUTE,
  HANDBRAKE: ACT_HANDBRAKE,
};

const SCROLL_KEYS = new Set([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false };
  let queued = 0;

  function queue(bit) {
    queued |= bit;
  }

  function onKeyDown(event) {
    const key = event.key.toLowerCase();
    if (SCROLL_KEYS.has(key)) event.preventDefault();
    if (event.repeat) return;
    keys.add(key);
    if (key === 'enter' || key === ' ') queue(ACTION_CONFIRM);
    if (key === 'escape' || key === 'p') queue(ACTION_PAUSE);
    if (key === 'e') queue(ACTION_ENTER_CAR);
    if (key === 'f') queue(ACTION_PUNCH);
    if (key === 'g') queue(ACTION_SHOOT);
    if (key === 'h') queue(ACTION_HORN);
    if (key === 'm') queue(ACTION_MUTE);
    if (key === ' ') queue(ACTION_HANDBRAKE);
  }

  function onKeyUp(event) {
    keys.delete(event.key.toLowerCase());
  }

  function trackMouse(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  }

  function onMouseDown(event) {
    trackMouse(event);
    mouse.down = true;
    queue(ACTION_SHOOT);
  }

  function onMouseUp(event) {
    trackMouse(event);
    mouse.down = false;
  }

  function onBlur() {
    keys.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mousemove', trackMouse);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function isDown(...names) {
    return names.some((name) => keys.has(name));
  }

  return {
    mouse,
    // Movement / driving state as methods, so the world step and the
    // staged screenshot scenes can share one input shape: direction(),
    // accelerate(), brake(), run() and handbrake() are all plain calls.
    down(key) {
      return keys.has(key.toLowerCase());
    },
    direction() {
      const x = (isDown('d', 'arrowright') ? 1 : 0) - (isDown('a', 'arrowleft') ? 1 : 0);
      const y = (isDown('s', 'arrowdown') ? 1 : 0) - (isDown('w', 'arrowup') ? 1 : 0);
      return { x, y };
    },
    accelerate() {
      return isDown('w', 'arrowup');
    },
    brake() {
      return isDown('s', 'arrowdown');
    },
    run() {
      return isDown('shift');
    },
    handbrake() {
      return isDown(' ');
    },
    takeActions(mask = ACTION_ALL) {
      const taken = queued & mask;
      queued &= ~mask;
      return taken;
    },
  };
}
