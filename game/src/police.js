// police.js — wanted stars, police spawns and pursuit for SOLMAR.
// Crimes and story jobs raise the wanted level (0–5 stars). Police cars
// and foot officers spawn on nearby roads and chase the player; lose
// them, lay low, and the stars cool off one at a time.

import { WANTED } from './config.js';

// ---- small helpers ---------------------------------------------------

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Shortest signed turn from angle a toward angle b, in (-PI, PI].
function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function toast(state, text, seconds) {
  // Same shape the HUD reads: { text, until } so the line expires.
  state.toast = { text, until: (state.time || 0) + (seconds || 3) };
  state.message = text;
}

// ---- wanted level ----------------------------------------------------

export function addWanted(world, n) {
  const s = world.state;
  const before = s.wanted;
  s.wanted = clamp(s.wanted + n, 0, WANTED.max);
  if (s.wanted > before) {
    toast(s, 'Wanted level ' + s.wanted + ' — the law is on you!', 3);
    s.quietTime = 0;
    s.decayT = 0;
  }
  return s.wanted;
}

// Set the level exactly (story jobs set it on start).
export function setWanted(world, level) {
  const s = world.state;
  const before = s.wanted;
  s.wanted = clamp(level, 0, WANTED.max);
  if (s.wanted > before) {
    toast(s, 'Wanted level ' + s.wanted + ' — the law is on you!', 3);
  }
  s.quietTime = 0;
  s.decayT = 0;
  return s.wanted;
}

// ---- counters --------------------------------------------------------

export function policeCarCount(world) {
  let n = 0;
  for (const c of world.state.cops) if (c.kind === 'car') n++;
  return n;
}

export function footCopCount(world) {
  let n = 0;
  for (const c of world.state.cops) if (c.kind === 'foot') n++;
  return n;
}

// ---- spawning --------------------------------------------------------

// Pick a point on the nearest road `distance` away from the player in
// a random direction, snapped onto the road centreline.
function spawnPoint(world, distance) {
  const s = world.state;
  const a = Math.random() * Math.PI * 2;
  const x = s.player.x + Math.cos(a) * distance;
  const y = s.player.y + Math.sin(a) * distance;
  return world.city.nearestRoadPoint(x, y);
}

export function spawnPoliceCar(world) {
  const p = spawnPoint(world, 620);
  const car = { kind: 'car', police: true, x: p.x, y: p.y, angle: p.angle, speed: 0, r: 20, bust: 0 };
  world.state.cops.push(car);
  return car;
}

export function spawnFootCop(world) {
  const p = spawnPoint(world, 420);
  const cop = { kind: 'foot', x: p.x, y: p.y, angle: p.angle, speed: 0, r: 12, bust: 0 };
  world.state.cops.push(cop);
  return cop;
}

// ---- per-frame update --------------------------------------------------

export function updatePolice(world, dt) {
  const s = world.state;
  const p = s.player;
  const level = s.wanted;

  // Reinforcements arrive a few at a time, not all at once.
  s.spawnT = (s.spawnT || 0) + dt;
  if (s.spawnT >= 0.6) {
    s.spawnT = 0;
    if (policeCarCount(world) < WANTED.cars[level]) spawnPoliceCar(world);
    if (footCopCount(world) < WANTED.foot[level]) spawnFootCop(world);
  }

  let nearest = Infinity;
  for (let i = s.cops.length - 1; i >= 0; i--) {
    const c = s.cops[i];
    const d = dist(c.x, c.y, p.x, p.y);
    if (d < nearest) nearest = d;

    // Hopelessly distant units give up; a clean player sheds tails fast.
    if (d > 1600 || (level === 0 && d > 600)) {
      s.cops.splice(i, 1);
      continue;
    }

    if (c.kind === 'car') {
      // Chase: steer toward the player, turn rate easing off with speed.
      const top = 500 + 22 * level;
      const want = Math.atan2(p.y - c.y, p.x - c.x);
      const turn = Math.max(1.4, 3.2 - c.speed / 350);
      c.angle = angleLerp(c.angle, want, Math.min(1, turn * dt));
      c.speed = Math.min(top, c.speed + 380 * dt);
      c.x += Math.cos(c.angle) * c.speed * dt;
      c.y += Math.sin(c.angle) * c.speed * dt;
      world.city.collide(c);
    } else {
      // Foot cops sprint at the player and hold them for the bust.
      const want = Math.atan2(p.y - c.y, p.x - c.x);
      c.angle = angleLerp(c.angle, want, Math.min(1, 6 * dt));
      c.x += Math.cos(c.angle) * 235 * dt;
      c.y += Math.sin(c.angle) * 235 * dt;
      world.city.collide(c);
      if (!p.car && d < 30) {
        c.bust += dt;
        if (c.bust >= WANTED.bustHold) s.busted = true;
      } else {
        c.bust = Math.max(0, c.bust - dt);
      }
    }
  }

  // Heat decay: no cop within 380 for a while, then lose a star per 6 s.
  if (level > 0 && nearest > 380) {
    s.quietTime = (s.quietTime || 0) + dt;
    if (s.quietTime >= WANTED.quiet) {
      s.decayT = (s.decayT || 0) + dt;
      if (s.decayT >= WANTED.decay) {
        s.decayT = 0;
        s.wanted = level - 1;
        toast(s, s.wanted > 0 ? 'Heat cooling off — wanted level ' + s.wanted : 'You lost them. Clean.', 3);
      }
    }
  } else {
    s.quietTime = 0;
    s.decayT = 0;
  }
}
