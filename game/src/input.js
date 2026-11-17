// input.js — keyboard + mouse for SOLMAR (gta6-01).
// Edge-triggered actions are queued on keydown; movement, run,
// handbrake and the mouse are held state read live each step.

export const ACTION = {
  CONFIRM: 1,
  PAUSE: 2,
  ENTER_CAR: 4,
  PUNCH: 8,
  SHOOT: 16,
  HORN: 32,
  MUTE: 64,
  HANDBRAKE: 128,
};

const SCROLL_KEYS = new Set([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

export function createInput(canvas) {
  const keys = new Set();
  let queued = 0;
  const mouse = { x: 0, y: 0, down: false };

  function down(...names) {
    return names.some((name) => keys.has(name));
  }

  function updateMouse(event) {
    try {
      if (canvas && typeof canvas.getBoundingClientRect === 'function') {
        const rect = canvas.getBoundingClientRect();
        mouse.x = event.clientX - rect.left;
        mouse.y = event.clientY - rect.top;
      } else {
        mouse.x = event.clientX || 0;
        mouse.y = event.clientY || 0;
      }
    } catch (err) {
      // A bad mouse event must never break the game loop.
    }
  }

  function onKeyDown(event) {
    const key = String(event.key || '').toLowerCase();
    if (SCROLL_KEYS.has(key) && event.preventDefault) event.preventDefault();
    keys.add(key);
    if (event.repeat) return;
    if (key === 'enter' || key === ' ') queued |= ACTION.CONFIRM;
    if (key === ' ') queued |= ACTION.HANDBRAKE;
    if (key === 'escape' || key === 'p') queued |= ACTION.PAUSE;
    if (key === 'e') queued |= ACTION.ENTER_CAR;
    if (key === 'f') queued |= ACTION.PUNCH;
    if (key === 'g') queued |= ACTION.SHOOT;
    if (key === 'h') queued |= ACTION.HORN;
    if (key === 'm') queued |= ACTION.MUTE;
  }

  function onKeyUp(event) {
    keys.delete(String(event.key || '').toLowerCase());
  }

  function onMouseMove(event) {
    updateMouse(event);
  }

  function onMouseDown(event) {
    updateMouse(event);
    mouse.down = true;
    queued |= ACTION.SHOOT;
  }

  function onMouseUp() {
    mouse.down = false;
  }

  function onBlur() {
    keys.clear();
    mouse.down = false;
  }

  function takeActions(mask = 0xff) {
    const taken = queued & mask;
    queued &= ~mask;
    return taken;
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
  }
  if (canvas && typeof canvas.addEventListener === 'function') {
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
  }

  return {
    mouse,
    get direction() {
      const x = (down('d', 'arrowright') ? 1 : 0) - (down('a', 'arrowleft') ? 1 : 0);
      const y = (down('s', 'arrowdown') ? 1 : 0) - (down('w', 'arrowup') ? 1 : 0);
      return { x, y };
    },
    get accelerate() { return down('w', 'arrowup'); },
    get brake() { return down('s', 'arrowdown'); },
    get run() { return down('shift'); },
    get handbrake() { return down(' '); },
    takeActions,
    destroy() {
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
      }
      if (canvas && typeof canvas.removeEventListener === 'function') {
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('mousedown', onMouseDown);
        canvas.removeEventListener('mouseup', onMouseUp);
        canvas.removeEventListener('mouseleave', onMouseUp);
      }
    },
  };
}
