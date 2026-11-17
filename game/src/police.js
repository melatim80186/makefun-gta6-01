// police.js — wanted stars, police cars and foot cops for SOLMAR.
// Plain state object, no imports: the world owns the state, this file
// only reads and mutates it (player, wanted, cops, city, rng).

export const POLICE_CARS_PER_LEVEL = [0, 1, 2, 3, 4, 5];
export const FOOT_COPS_PER_LEVEL = [0, 1, 1, 2, 2, 3];

const MAX_WANTED = 5;
const CAR_SPAWN_DIST = 620;
const FOOT_SPAWN_DIST = 420;

function rand(state) {
  return state.rng && typeof state.rng.next === 'function'
    ? state.rng.next()
    : Math.random();
}

function showToast(state, text) {
  state.toast = text;
  state.toastTime = 3;
  state.message = text;
  state.messageTime = 3;
}

function angleToPlayer(state, x, y) {
  return Math.atan2(state.player.y - y, state.player.x - x);
}

// Raise (or lower) the wanted level, clamped to 0-5. A rise shows a
// toast and restarts the quiet timer, so heat cannot decay at once.
export function addWanted(state, n) {
  const before = state.wanted || 0;
  const next = Math.max(0, Math.min(MAX_WANTED, before + n));
  state.wanted = next;
  state.quietTime = 0;
  state.coolTime = 0;
  if (next > before) {
    showToast(state, next >= MAX_WANTED
      ? 'MAXIMUM HEAT — FIVE STARS!'
      : `WANTED LEVEL UP — ${next} STAR${next > 1 ? 'S' : ''}!`);
  }
  return next;
}

export function countPoliceCars(state) {
  let n = 0;
  for (const cop of state.cops || []) if (cop.kind === 'car') n++;
  return n;
}

export function countFootCops(state) {
  let n = 0;
  for (const cop of state.cops || []) if (cop.kind === 'foot') n++;
  return n;
}

// A point on the nearest road about `dist` away from the player, in a
// random direction, so police arrive from off-screen, not on top of you.
export function pickSpawnPoint(state, dist) {
  const a = rand(state) * Math.PI * 2;
  const tx = state.player.x + Math.cos(a) * dist;
  const ty = state.player.y + Math.sin(a) * dist;
  if (state.city && typeof state.city.nearestRoadPoint === 'function') {
    const p = state.city.nearestRoadPoint(tx, ty);
    if (p && typeof p.x === 'number' && typeof p.y === 'number') return { x: p.x, y: p.y };
  }
  if (state.city && typeof state.city.randomRoadPoint === 'function') {
    const p = state.city.randomRoadPoint();
    if (p && typeof p.x === 'number' && typeof p.y === 'number') return { x: p.x, y: p.y };
  }
  return { x: tx, y: ty };
}

export function spawnPoliceCar(state) {
  const p = pickSpawnPoint(state, CAR_SPAWN_DIST);
  const car = { kind: 'car', x: p.x, y: p.y, angle: angleToPlayer(state, p.x, p.y), speed: 0, hp: 100, isPolice: true, color: 'blue', len: 52, wid: 26 };
  (state.cops || (state.cops = [])).push(car);
  return car;
}

export function spawnFootCop(state) {
  const p = pickSpawnPoint(state, FOOT_SPAWN_DIST);
  const cop = { kind: 'foot', x: p.x, y: p.y, angle: angleToPlayer(state, p.x, p.y), speed: 235, bustHold: 0 };
  (state.cops || (state.cops = [])).push(cop);
  return cop;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Step the police: spawn up to the per-level counts (at most one car
// and one foot cop per tick), chase the player, bust on a long grab,
// clear out when the player is clean, and let the heat cool off.
export function updatePolice(state, dt) {
  if (!state.cops) state.cops = [];
  if (!state.player) return;
  const wanted = Math.max(0, Math.min(MAX_WANTED, state.wanted || 0));

  if (wanted > 0) {
    if (countPoliceCars(state) < POLICE_CARS_PER_LEVEL[wanted]) spawnPoliceCar(state);
    if (countFootCops(state) < FOOT_COPS_PER_LEVEL[wanted]) spawnFootCop(state);
  }

  let nearest = Infinity;
  for (let i = state.cops.length - 1; i >= 0; i--) {
    const cop = state.cops[i];
    const dx = state.player.x - cop.x;
    const dy = state.player.y - cop.y;
    const d = Math.hypot(dx, dy);
    if (d < nearest) nearest = d;
    if (wanted === 0 && d > 900) { state.cops.splice(i, 1); continue; }

    if (cop.kind === 'car') {
      const top = 500 + 22 * wanted;
      const desired = Math.atan2(dy, dx);
      // Turn rate scales with speed: fast cars turn wider, slow ones sharp.
      const turnRate = 2.8 * (1.1 - 0.5 * (cop.speed / top));
      cop.angle += clamp(wrapAngle(desired - cop.angle), -turnRate * dt, turnRate * dt);
      cop.speed = Math.min(top, (cop.speed || 0) + 430 * dt);
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      if (state.city && typeof state.city.collide === 'function') state.city.collide(cop, 26);
    } else {
      cop.angle = Math.atan2(dy, dx);
      cop.x += Math.cos(cop.angle) * 235 * dt;
      cop.y += Math.sin(cop.angle) * 235 * dt;
      if (state.city && typeof state.city.collide === 'function') state.city.collide(cop, 13);
      if (d < 30) {
        cop.bustHold = (cop.bustHold || 0) + dt;
        if (cop.bustHold >= 1.2) state.busted = true;
      } else {
        cop.bustHold = 0;
      }
    }
  }

  // Heat decay: no police within 380 for 8 s, then lose a star per 6 s.
  if (wanted > 0 && nearest > 380) {
    state.quietTime = (state.quietTime || 0) + dt;
    if (state.quietTime >= 8) {
      state.coolTime = (state.coolTime || 0) + dt;
      if (state.coolTime >= 6) {
        state.coolTime = 0;
        state.wanted = wanted - 1;
        showToast(state, 'Heat cooling off — one star down.');
      }
    }
  } else {
    state.quietTime = 0;
    state.coolTime = 0;
  }
}
