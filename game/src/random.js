// Seeded random numbers for SOLMAR — mulberry32.
// Same seed always produces the same sequence, so the city,
// traffic and pedestrians are reproducible (see ?seed= in main.js).

export function createRng(seed) {
  let a = seed >>> 0;
  function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function range(min, max) {
    return min + next() * (max - min);
  }
  function int(min, max) {
    return Math.floor(range(min, max + 1));
  }
  function pick(array) {
    return array[Math.floor(next() * array.length)];
  }
  return { next, range, int, pick };
}
