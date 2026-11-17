// SOLMAR save game — localStorage, versioned, never throws.
// Save key: solmar.save.v1. Best-cash record key: solmar.best.v1.
// Every storage access is guarded: if the browser denies storage
// (private mode, disabled cookies) the game just plays unsaved.

const SAVE_KEY = 'solmar.save.v1';
const BEST_KEY = 'solmar.best.v1';
const VERSION = 1;

function safeGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    // Storage denied — ignore, the game keeps running.
  }
}

function safeRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (e) {
    // Storage denied — nothing to clear.
  }
}

// Persist the current game. `state` is the world state object.
export function saveGame(state) {
  const data = {
    version: VERSION,
    cash: state.player.cash,
    missionIndex: state.missionIndex,
    goldFound: state.goldFound,
    playerX: state.player.x,
    playerY: state.player.y,
    carsStolen: state.stats.carsStolen,
    missionsDone: state.stats.missionsDone,
    storyDone: state.storyDone,
  };
  safeSet(SAVE_KEY, JSON.stringify(data));
}

// Restore a saved game, or null when there is no save or the
// stored version does not match (old saves are ignored, not crashed on).
export function loadGame() {
  const raw = safeGet(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== VERSION) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  safeRemove(SAVE_KEY);
}

// Best cash record: the most money the player has ever held.
export function readBest() {
  const raw = safeGet(BEST_KEY);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function saveBest(cash) {
  if (cash > readBest()) safeSet(BEST_KEY, String(cash));
}
