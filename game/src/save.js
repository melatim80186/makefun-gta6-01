// SOLMAR save data — localStorage only, never throws.
// A denied or unavailable store just means "no save", never a crash.

const SAVE_KEY = 'solmar.save.v1';
const BEST_KEY = 'solmar.best.v1';
const SAVE_VERSION = 1;

function read(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_err) {
    return null;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (_err) {
    // Storage denied or full — the game keeps running without a save.
  }
}

function remove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (_err) {
    // Nothing to do if the store is unavailable.
  }
}

export function saveGame(data) {
  const record = { version: SAVE_VERSION, ...(data || {}) };
  try {
    write(SAVE_KEY, JSON.stringify(record));
  } catch (_err) {
    // Serialisation failure — leave any previous save untouched.
  }
}

export function loadGame() {
  const raw = read(SAVE_KEY);
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_err) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || parsed.version !== SAVE_VERSION) {
    return null;
  }
  return parsed;
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  remove(SAVE_KEY);
}

export function readBest() {
  const raw = read(BEST_KEY);
  if (raw === null || raw === undefined) return 0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

export function saveBest(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return;
  write(BEST_KEY, String(amount));
}
