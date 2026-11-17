// Save / best-cash persistence for SOLMAR, on localStorage.
// Every storage access is guarded: in a browser that denies storage
// (private mode, blocked cookies) nothing here may ever throw.

const SAVE_KEY = 'solmar.save.v1';
const BEST_KEY = 'solmar.best.v1';
const SAVE_VERSION = 1;

function safeGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (err) {
    // Storage denied or full: the game keeps running without a save.
  }
}

function safeRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (err) {
    // Nothing to do if storage is unavailable.
  }
}

// Store a snapshot of the run: cash, how far the story has got, which
// gold bars were already found, where the player stands, and the stats.
export function saveGame(data) {
  const record = {
    version: SAVE_VERSION,
    cash: data.cash || 0,
    missionIndex: data.missionIndex || 0,
    goldFound: Array.isArray(data.goldFound) ? data.goldFound.slice() : [],
    playerX: data.playerX || 0,
    playerY: data.playerY || 0,
    carsStolen: data.carsStolen || 0,
    missionsDone: data.missionsDone || 0,
    storyDone: !!data.storyDone,
  };
  safeSet(SAVE_KEY, JSON.stringify(record));
}

// Returns the saved record, or null when there is no save, the JSON is
// broken, or it was written by a different save version.
export function loadGame() {
  const raw = safeGet(SAVE_KEY);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw);
    if (!record || record.version !== SAVE_VERSION) return null;
    return record;
  } catch (err) {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  safeRemove(SAVE_KEY);
}

// Best cash ever held, kept separately so quitting never loses the record.
export function readBest() {
  const raw = safeGet(BEST_KEY);
  const value = raw === null ? 0 : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function saveBest(cash) {
  const amount = Number(cash) || 0;
  if (amount > readBest()) safeSet(BEST_KEY, String(amount));
}
