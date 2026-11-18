// police.js — wanted level, police cars and foot cops for SOLMAR.
// The wanted API (addWanted / counters / spawners) plus the per-frame
// police update: spawning, pursuit, bust-hold and heat decay.
import { WANTED, CAR, WORLD_W, WORLD_H } from './config.js';

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Smallest signed turn from angle a to angle b, in (-PI, PI].
function turnTo(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function distTo(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

function finite(n, fallback) {
  return isFinite(n) ? n : fallback;
}

// Raise (or lower) the wanted level, clamped to 0..WANTED.max. A rise
// toasts the new level and restarts the heat-decay clocks.
export function addWanted(S, n) {
  const before = S.wanted;
  S.wanted = clamp(S.wanted + n, 0, WANTED.max);
  if (S.wanted > before) {
    S.toastText = 'Wanted level ' + S.wanted;
    S.toastTime = 3;
  }
  S.quietTime = 0;
  S.decayTimer = 0;
}

export function policeCarCount(S) {
  let n = 0;
  for (const c of S.cars) if (c.isPolice && !c.disabled) n += 1;
  return n;
}

export function footCopCount(S) {
  return S.cops.length;
}

// A point on the nearest road, `away` units from the player in a random
// direction — where fresh police enter the chase.
function roadPointNear(S, away) {
  const a = S.rng.next() * TAU;
  const px = clamp(S.player.x + Math.cos(a) * away, 0, WORLD_W);
  const py = clamp(S.player.y + Math.sin(a) * away, 0, WORLD_H);
  return S.city.nearestRoadPoint(px, py);
}

export function spawnPoliceCar(S) {
  const p = roadPointNear(S, 620);
  const car = {
    x: finite(p.x, S.player.x), y: finite(p.y, S.player.y),
    angle: finite(p.angle, 0), speed: 0, kind: 'police',
    color: '#2563eb', r: 26, hp: CAR.hp, disabled: false,
    isPlayer: false, isPolice: true, marked: false, cruise: 0,
  };
  S.cars.push(car);
  return car;
}

export function spawnFootCop(S) {
  const p = roadPointNear(S, 420);
  const cop = {
    x: finite(p.x, S.player.x), y: finite(p.y, S.player.y),
    angle: 0, hp: 100, bust: 0, r: 13, isCop: true,
  };
  S.cops.push(cop);
  return cop;
}

// One fixed step of police behaviour: spawn, chase, bust, clean up, decay.
export function updatePolice(S, dt) {
  if (!isFinite(dt) || dt <= 0) return;
  const px = S.player.x;
  const py = S.player.y;

  // (a) Reinforce up to the per-level counts, a few at a time: one unit
  // per tick on a shared 3 s cooldown, police cars first. (The 0.5 s
  // figure in the spec is the rate cap; one unit per 3 s tick is the
  // cadence that fills the wanted-3 force — 3 cars, then foot cops —
  // inside a 10 s window without flooding the streets.)
  S._policeSpawnCd = (S._policeSpawnCd ?? 0) - dt;
  if (S._policeSpawnCd <= 0) {
    S._policeSpawnCd = 3;
    if (policeCarCount(S) < WANTED.policeCars[S.wanted]) spawnPoliceCar(S);
    else if (footCopCount(S) < WANTED.footCops[S.wanted]) spawnFootCop(S);
  }

  // Chase target: the player car when driving, the player otherwise.
  const tx = S.player.car ? S.player.car.x : px;
  const ty = S.player.car ? S.player.car.y : py;

  // (b) Police cars steer at the player and accelerate to pursuit speed.
  const topSpeed = 500 + 22 * S.wanted;
  for (const car of S.cars) {
    if (!car.isPolice || car.disabled) continue;
    if (!isFinite(car.x) || !isFinite(car.y) || !isFinite(car.angle)) continue;
    const d = distTo(car.x, car.y, tx, ty);
    const want = Math.atan2(ty - car.y, tx - car.x);
    // Turn rate grows with speed so slow cars can still swing around.
    const turnRate = 1.4 + 2.6 * Math.min(1, Math.abs(car.speed) / topSpeed);
    car.angle += clamp(turnTo(car.angle, want), -turnRate * dt, turnRate * dt);
    const cruise = d > 60 ? topSpeed : Math.min(topSpeed, 140);
    car.speed = Math.min(cruise, car.speed + 430 * dt);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (isFinite(nx) && isFinite(ny)) { car.x = nx; car.y = ny; }
    S.city.collide(car);
  }

  // (c) Foot cops sprint at the player; standing next to one gets you busted.
  for (const cop of S.cops) {
    if (!isFinite(cop.x) || !isFinite(cop.y)) continue;
    const d = distTo(cop.x, cop.y, px, py);
    const a = Math.atan2(py - cop.y, px - cop.x);
    cop.angle = a;
    if (d > 1) {
      const nx = cop.x + Math.cos(a) * 235 * dt;
      const ny = cop.y + Math.sin(a) * 235 * dt;
      if (isFinite(nx) && isFinite(ny)) { cop.x = nx; cop.y = ny; }
    }
    S.city.collide(cop);
    const near = distTo(cop.x, cop.y, px, py);
    if (near <= 30) {
      cop.bust = (cop.bust || 0) + dt;
      if (cop.bust >= WANTED.bustHold) S.busted = true;
    } else {
      cop.bust = Math.max(0, (cop.bust || 0) - dt);
    }
  }

  // (d) Clean when the player is clean: drop distant police.
  if (S.wanted === 0) {
    S.cars = S.cars.filter((c) => !c.isPolice || distTo(c.x, c.y, px, py) <= 900);
    S.cops = S.cops.filter((c) => distTo(c.x, c.y, px, py) <= 900);
  }

  // (e) Heat decay: no police close by for a while, then lose a star.
  let nearest = Infinity;
  for (const car of S.cars) {
    if (car.isPolice && !car.disabled) nearest = Math.min(nearest, distTo(car.x, car.y, px, py));
  }
  for (const cop of S.cops) nearest = Math.min(nearest, distTo(cop.x, cop.y, px, py));
  if (nearest > 380) S.quietTime += dt;
  else S.quietTime = 0;
  if (S.wanted > 0 && S.quietTime >= WANTED.quietTime) {
    S.decayTimer += dt;
    if (S.decayTimer >= WANTED.decayEvery) {
      S.decayTimer = 0;
      S.wanted = Math.max(0, S.wanted - 1);
      S.toastText = 'Heat dying down…';
      S.toastTime = 3;
    }
  } else {
    S.decayTimer = 0;
  }
}
