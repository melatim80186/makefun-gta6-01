// SOLMAR combat — fists, pistol, gang enemies and damage.
// Enemies chase the player, shoot back, and drop cash when beaten.
import { PLAYER, CAR, MONEY } from './config.js';
import { MISSIONS } from './missions.js';
import { addWanted } from './police.js';

function dist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.sqrt(dx * dx + dy * dy);
  return Number.isFinite(d) ? d : 0;
}

function burst(S, x, y, color, n, speed, size, life) {
  if (!S.particles) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.6);
    S.particles.push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life, maxLife: life,
      color, size: size * (0.7 + Math.random() * 0.6),
    });
  }
}

function nearestEnemy(S, x, y, maxD) {
  let best = null;
  let bestD = maxD;
  for (const e of S.enemies) {
    if (!e || e.down) continue;
    const d = dist(x, y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

export function spawnEnemies(S, x, y, count) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const n = Math.max(0, Math.floor(count) || 0);
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * 46;
    S.enemies.push({
      x: x + off, y,
      angle: 0, hp: 100,
      shootCd: 0.5 + i * 0.4,
      down: false, r: 13,
    });
  }
}

export function tryPunch(S) {
  const p = S.player;
  if (!p || !p.onFoot) return;
  if (p.punchCd > 0) return;
  p.punchCd = PLAYER.punchCooldown;
  const reach = PLAYER.punchRange + 12;
  const foe = nearestEnemy(S, p.x, p.y, reach);
  if (foe) {
    damageEnemy(S, foe, PLAYER.punchDamage);
    if (S.audio) S.audio.punch();
    return;
  }
  let best = null;
  let bestD = reach;
  for (const ped of S.peds || []) {
    if (!ped || ped.down) continue;
    const d = dist(p.x, p.y, ped.x, ped.y);
    if (d < bestD) { bestD = d; best = ped; }
  }
  if (best) {
    best.down = true;
    if (S.audio) S.audio.punch();
  }
}

export function tryShoot(S, aimX, aimY) {
  const p = S.player;
  if (!p || !p.onFoot) return;
  if (p.weapon !== 'pistol') return;
  if (p.ammo <= 0 || p.shootCd > 0) return;
  if (!Number.isFinite(aimX) || !Number.isFinite(aimY)) return;
  p.ammo -= 1;
  p.shootCd = PLAYER.shootCooldown;
  const ang = Math.atan2(aimY - p.y, aimX - p.x);
  const range = PLAYER.pistolRange;
  const ex = p.x + Math.cos(ang) * range;
  const ey = p.y + Math.sin(ang) * range;
  if (S.tracers) S.tracers.push({ x1: p.x, y1: p.y, x2: ex, y2: ey, life: 0.08 });
  burst(S, p.x + Math.cos(ang) * 20, p.y + Math.sin(ang) * 20, '#ffd76a', 3, 60, 3, 0.12);
  let best = null;
  let bestAlong = range;
  for (const e of S.enemies) {
    if (!e || e.down) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const along = dx * Math.cos(ang) + dy * Math.sin(ang);
    if (along < 0 || along > range) continue;
    const side = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
    if (side > 26) continue;
    if (along < bestAlong) { bestAlong = along; best = e; }
  }
  if (best) damageEnemy(S, best, PLAYER.pistolDamage);
  if (S.audio) S.audio.shot();
}

export function damageEnemy(S, enemy, dmg) {
  if (!enemy || enemy.down) return;
  if (!Number.isFinite(dmg)) return;
  enemy.hp -= dmg;
  burst(S, enemy.x, enemy.y, '#ff5544', 5, 90, 3, 0.25);
  if (enemy.hp > 0) return;
  enemy.down = true;
  const m = S.mission ? MISSIONS[S.mission.index] : null;
  const step = m && m.steps ? m.steps[S.mission.step] : null;
  if (step && step.type === 'defeat') S.mission.defeated += 1;
  if (S.stats) S.stats.kills += 1;
  S.player.cash += 40;
  if (S.pickups) S.pickups.push({ kind: 'cash', x: enemy.x, y: enemy.y, amount: 40, id: 'drop' + S.time });
  if (S.audio) S.audio.pickup();
}

export function damagePlayer(S, dmg) {
  const p = S.player;
  if (!p || p.invuln > 0) return;
  if (!Number.isFinite(dmg)) return;
  p.hp -= dmg;
  p.invuln = 0.5;
  if (p.hp <= 0) { p.hp = 0; S.wasted = true; }
}

export function updateEnemies(S, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const p = S.player;
  for (const e of S.enemies) {
    if (!e || e.down) continue;
    const d = dist(e.x, e.y, p.x, p.y);
    if (d >= 380) continue;
    e.angle = Math.atan2(p.y - e.y, p.x - e.x);
    if (d > 160) {
      const step = 95 * dt;
      e.x += Math.cos(e.angle) * step;
      e.y += Math.sin(e.angle) * step;
    } else {
      e.shootCd -= dt;
      if (e.shootCd <= 0) {
        e.shootCd = 0.9 + Math.random() * 0.7;
        const target = p.car || p;
        if (S.tracers) S.tracers.push({ x1: e.x, y1: e.y, x2: target.x, y2: target.y, life: 0.08 });
        if (p.car) damageCar(S, p.car, 6);
        else damagePlayer(S, 9);
      }
    }
    if (S.city && S.city.collide) S.city.collide(e);
  }
}

export function damageCar(S, car, dmg) {
  if (!car || !Number.isFinite(dmg)) return;
  car.hp -= dmg;
  burst(S, car.x, car.y, '#888888', 4, 50, 4, 0.4);
  if (car.hp > 0 || car.disabled) return;
  car.disabled = true;
  car.speed = 0;
  burst(S, car.x, car.y, '#ff7a1a', 14, 160, 7, 0.6);
  if (S.audio) S.audio.crash();
}
