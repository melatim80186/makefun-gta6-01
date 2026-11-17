// Seeded random numbers for SOLMAR: same seed, same city every time.
// mulberry32 is a tiny, fast generator that is good enough for placement
// and traffic variation, and it keeps screenshots reproducible via ?seed=.

export function createRng(seed) {
  // Force the seed into an unsigned 32-bit integer so any input works.
  let state = (seed >>> 0) || 0x9e3779b9;

  function next() {
    // mulberry32 step: scramble the state, then fold it into [0, 1).
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function range(min, max) {
    return min + next() * (max - min);
  }

  function int(min, max) {
    // Inclusive on both ends, so int(1, 3) can return 1, 2 or 3.
    return Math.floor(range(min, max + 1));
  }

  function pick(list) {
    if (!list || list.length === 0) return undefined;
    return list[Math.floor(next() * list.length)];
  }

  return { next, range, int, pick };
}
