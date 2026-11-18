// input.js — keyboard + mouse for SOLMAR (gta6-01).
// Edge-triggered actions: a key press queues one action bit on keydown;
// the world (or a menu) drains it with takeActions(mask). Held keys only
// feed the movement queries below, never the action queue.

export const ACTIONS = {
  CONFIRM: 1,
  PAUSE: 2,
  ENTER: 4,
  PUNCH: 8,
  SHOOT: 16,
  HORN: 32,
  MUTE: 64,
  HANDBRAKE: 128,
};

// Lowercased e.key -> action bit queued on a fresh (non-repeat) keydown.
const KEY_TO_ACTION = {
  enter: ACTIONS.CONFIRM,
  ' ': ACTIONS.CONFIRM,
  escape: ACTIONS.PAUSE,
  p: ACTIONS.PAUSE,
  e: ACTIONS.ENTER,
  f: ACTIONS.PUNCH,
  g: ACTIONS.SHOOT,
  h: ACTIONS.HORN,
  m: ACTIONS.MUTE,
};

// Keys that must never scroll the page when the game has focus.
const SCROLL_KEYS = new Set([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

export function createInput(canvas) {
  const held = new Set();
  let queued = 0;
  const mouseState = { x: 0, y: 0, down: false };

  function onKeyDown(e) {
    const key = e.key.toLowerCase();
    if (SCROLL_KEYS.has(key)) e.preventDefault();
    held.add(key);
    if (e.repeat) return;
    const action = KEY_TO_ACTION[key];
    if (action !== undefined) queued |= action;
    // Space doubles as the handbrake on top of confirm.
    if (key === ' ') queued |= ACTIONS.HANDBRAKE;
  }

  function onKeyUp(e) {
    held.delete(e.key.toLowerCase());
  }

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouseState.x = e.clientX - rect.left;
    mouseState.y = e.clientY - rect.top;
  }

  function onMouseDown(e) {
    onMouseMove(e);
    mouseState.down = true;
    queued |= ACTIONS.SHOOT;
  }

  function onMouseUp() {
    mouseState.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    // Movement vector from WASD or arrows, each component in -1..1.
    direction() {
      const x = (held.has('d') || held.has('arrowright') ? 1 : 0)
        - (held.has('a') || held.has('arrowleft') ? 1 : 0);
      const y = (held.has('s') || held.has('arrowdown') ? 1 : 0)
        - (held.has('w') || held.has('arrowup') ? 1 : 0);
      return { x, y };
    },
    accelerate() {
      return held.has('w') || held.has('arrowup');
    },
    brake() {
      return held.has('s') || held.has('arrowdown');
    },
    run() {
      return held.has('shift');
    },
    handbrake() {
      return held.has(' ');
    },
    mouse() {
      return { x: mouseState.x, y: mouseState.y, down: mouseState.down };
    },
    // Return the queued actions matching mask and clear exactly those
    // bits, so a menu can take only confirm/pause/mute while driving
    // actions stay queued for the world step.
    takeActions(mask = 0xff) {
      const taken = queued & mask;
      queued &= ~mask;
      return taken;
    },
  };
}
