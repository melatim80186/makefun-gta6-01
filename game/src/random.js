// Seeded random numbers for SOLMAR — same seed, same city every time.
// Mulberry32: small, fast, and deterministic across runs and browsers.

export function createRng(seed) {
  // Normalise the seed to an unsigned 32-bit state; 0 would lock the
  // generator, so fall back to a fixed non-zero value instead.
  let state = (seed >>> 0) || 0x9e3779b9;

  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function range(min, max) {
    return min + next() * (max - min);
  }

  function int(min, max) {
    // Inclusive on both ends, so int(1, 6) can roll a 6.
    return Math.floor(range(min, max + 1));
  }

  function pick(arr) {
    if (!arr || arr.length === 0) return undefined;
    return arr[Math.floor(next() * arr.length)];
  }

  return { next, range, int, pick };
}
