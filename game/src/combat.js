// combat.js — fists, pistol, gang enemies and damage for SOLMAR.
// Plain functions over the world state; no rendering, no network.

import { PLAYER, CAR } from './config.js';
import { addWanted } from './police.js';
import { collide } from './city.js';

const ENEMY_HP = 100;
const ENEMY_ROW_SPACING = 42;
const PUNCH_MARGIN = 8;
const SHOOT_SIDEWAYS = 26;
const ENEMY_CHASE_RANGE = 380;
const ENEMY_SHOOT_RANGE = 160;
const ENEMY_DAMAGE = 9;
const ENEMY_CAR_DAMAGE = 6;
const CASH_DROP = 40;

function rand(state) {
  return state.rng && typeof state.rng.next === 'function'
    ? state.rng.next()
    : Math.random();
}

function sound(state, name) {
  const a = state.audio;
  if (a && typeof a[name] === 'function') { try { a[name](); } catch (e) {} }
}

function addParticle(state, x, y, vx, vy, life, color, size) {
  if (!state.particles) state.particles = [];
  state.particles.push({ x, y, vx, vy, life, maxLife: life, color, size });
}

function addTracer(state, x1, y1, x2, y2) {
  if (!state.tracers) state.tracers = [];
  state.tracers.push({ x1, y1, x2, y2, life: 0.08 });
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// Spawn a row of gang members at a turf spot, each with 100 HP and a
// staggered first shot, and reset the mission defeat counter.
export function spawnEnemies(state, x, y, count) {
  if (!state.enemies) state.enemies = [];
  if (!state.flags) state.flags = {};
  state.flags.defeated = 0;
  const n = Math.max(0, count || 0);
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * ENEMY_ROW_SPACING;
    state.enemies.push({
      x: x + off,
      y: y + (i % 2 ? 14 : -14),
      angle: 0,
      hp: ENEMY_HP,
      shootT: 0.6 + i * 0.4,
      down: false,
    });
  }
  return state.enemies;
}

// Punch: 0.35 s cooldown, a short swing animation, 20 damage to the
// nearest enemy in reach, else a nearby pedestrian gets shoved down.
export function tryPunch(state) {
  const p = state.player;
  if (!p || (p.punchT || 0) > 0) return false;
  p.punchT = PLAYER.punchCooldown;
  p.punchAnim = 0.25;
  sound(state, 'punch');
  const reach = PLAYER.punchRange + PUNCH_MARGIN;
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies || []) {
    if (e.down) continue;
    const d = dist(p.x, p.y, e.x, e.y);
    if (d <= reach && d < bestD) { best = e; bestD = d; }
  }
  if (best) { damageEnemy(state, best, PLAYER.punchDamage); return true; }
  let ped = null;
  let pedD = Infinity;
  for (const q of state.peds || []) {
    if (q.down) continue;
    const d = dist(p.x, p.y, q.x, q.y);
    if (d <= reach && d < pedD) { ped = q; pedD = d; }
  }
  if (ped) {
    ped.down = true;
    ped.downT = 2;
    addWanted(state, 1);
  }
  return true;
}

// Shoot the pistol: on foot only, needs ammo and a cooled trigger.
// Instant hitscan — a tracer to max range, a muzzle flash, and the
// nearest enemy near the aim ray takes the hit.
export function tryShoot(state, aimX, aimY) {
  const p = state.player;
  if (!p || p.weapon !== 'pistol' || p.car) return false;
  if ((p.ammo || 0) <= 0 || (p.shootT || 0) > 0) return false;
  p.shootT = PLAYER.shootCooldown;
  p.ammo -= 1;
  const dx = aimX - p.x;
  const dy = aimY - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const range = PLAYER.pistolRange;
  const ex = p.x + ux * range;
  const ey = p.y + uy * range;
  addTracer(state, p.x, p.y, ex, ey);
  addParticle(state, p.x + ux * 18, p.y + uy * 18, 0, 0, 0.08, '#ffd94a', 6);
  sound(state, 'shot');
  let best = null;
  let bestT = Infinity;
  for (const e of state.enemies || []) {
    if (e.down) continue;
    const along = (e.x - p.x) * ux + (e.y - p.y) * uy;
    if (along < 0 || along > range) continue;
    const side = Math.abs((e.x - p.x) * uy - (e.y - p.y) * ux);
    if (side <= SHOOT_SIDEWAYS && along < bestT) { best = e; bestT = along; }
  }
  if (best) damageEnemy(state, best, PLAYER.pistolDamage);
  return true;
}

// Hurt an enemy; on death it drops, counts as a defeat, pays $40 in
// cash and leaves a cash pickup on the ground.
export function damageEnemy(state, enemy, dmg) {
  if (!enemy || enemy.down) return;
  enemy.hp -= dmg;
  addParticle(state, enemy.x, enemy.y, 0, -30, 0.25, '#e03a2a', 5);
  if (enemy.hp > 0) return;
  enemy.hp = 0;
  enemy.down = true;
  if (!state.flags) state.flags = {};
  state.flags.defeated = (state.flags.defeated || 0) + 1;
  if (state.player) {
    state.player.cash = (state.player.cash || 0) + CASH_DROP;
    if (state.stats) state.stats.earned = (state.stats.earned || 0) + CASH_DROP;
  }
  if (!state.pickups) state.pickups = [];
  state.pickups.push({
    kind: 'cash', x: enemy.x, y: enemy.y, amount: CASH_DROP,
    id: 'cash-' + ((state.nextPickupId = (state.nextPickupId || 0) + 1)),
  });
  sound(state, 'pickup');
}

// Hurt the player; a 0.5 s invulnerability window blocks rapid hits.
// At 0 HP the player is wasted.
export function damagePlayer(state, dmg) {
  const p = state.player;
  if (!p || (p.invulnT || 0) > 0 || p.hp <= 0) return;
  p.hp = Math.max(0, p.hp - dmg);
  p.invulnT = 0.5;
  if (p.hp <= 0) state.wasted = true;
}

// Step the gang: chase the player inside 380, close to 160 and then
// shoot every ~0.9–1.6 s — 9 damage on foot, 6 against the player's car.
export function updateEnemies(state, dt) {
  const p = state.player;
  if (!p) return;
  for (const e of state.enemies || []) {
    if (e.down) continue;
    const d = dist(p.x, p.y, e.x, e.y);
    const target = p.car || null;
    if (d < ENEMY_CHASE_RANGE) {
      const tx = target ? target.x : p.x;
      const ty = target ? target.y : p.y;
      e.angle = Math.atan2(ty - e.y, tx - e.x);
      if (d > ENEMY_SHOOT_RANGE) {
        e.x += Math.cos(e.angle) * 150 * dt;
        e.y += Math.sin(e.angle) * 150 * dt;
      } else {
        e.shootT -= dt;
        if (e.shootT <= 0) {
          e.shootT = 0.9 + rand(state) * 0.7;
          addTracer(state, e.x, e.y, tx, ty);
          sound(state, 'shot');
          if (target) damageCar(state, target, ENEMY_CAR_DAMAGE);
          else damagePlayer(state, ENEMY_DAMAGE);
        }
      }
    }
    if (typeof collide === 'function' && state.city) {
      const fixed = collide(state.city, e.x, e.y, 13);
      if (fixed) { e.x = fixed.x; e.y = fixed.y; }
    }
  }
}

// Hurt a car: smoke while it takes hits, and at 0 HP it is disabled,
// stops dead, blows up and plays the crash sound.
export function damageCar(state, car, dmg) {
  if (!car || car.disabled) return;
  car.hp = (car.hp ?? CAR.maxHp) - dmg;
  addParticle(state, car.x, car.y, 0, -40, 0.4, '#8a8a8a', 7);
  if (car.hp > 0) return;
  car.hp = 0;
  car.disabled = true;
  car.speed = 0;
  for (let i = 0; i < 10; i++) {
    addParticle(state, car.x, car.y, (rand(state) - 0.5) * 220, (rand(state) - 0.5) * 220, 0.5 + rand(state) * 0.4, i % 2 ? '#f2a13a' : '#e03a2a', 6 + rand(state) * 5);
  }
  sound(state, 'crash');
}
