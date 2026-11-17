// combat.js — SOLMAR: fists, pistol, gang enemies and damage.
// Enemies chase and shoot; the player punches up close or fires hitscan
// shots. All damage flows through the small helpers in this file.

const PUNCH_RANGE = 34;
const PUNCH_DAMAGE = 20;
const PUNCH_COOLDOWN = 0.35;
const SHOOT_COOLDOWN = 0.22;
const PISTOL_DAMAGE = 34;
const PISTOL_RANGE = 420;
const ENEMY_HP = 100;

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function sfx(S) {
  return S.audio || S.sfx || S.sound || null;
}

function puff(S, x, y, color, n = 6) {
  if (!S.particles) return;
  for (let i = 0; i < n; i++) {
    S.particles.push({
      x, y, vx: (Math.random() - 0.5) * 140, vy: (Math.random() - 0.5) * 140,
      life: 0.35 + Math.random() * 0.25, max: 0.6, color, size: 3 + Math.random() * 3,
    });
  }
}

function tracer(S, x1, y1, x2, y2) {
  if (S.tracers) S.tracers.push({ x1, y1, x2, y2, life: 0.12, max: 0.12 });
}

// Spawn a row of gang members at a turf position. Each has 100 HP and a
// staggered first shot so they do not all fire on the same frame.
export function spawnEnemies(S, x, y, count = 3) {
  S.enemies = S.enemies || [];
  S.defeated = 0;
  for (let i = 0; i < count; i++) {
    S.enemies.push({
      x: x + (i - (count - 1) / 2) * 56,
      y: y + (i % 2) * 30 - 15,
      hp: ENEMY_HP, maxHp: ENEMY_HP, down: false,
      shootCd: 0.9 + i * 0.35, angle: 0, speed: 130,
    });
  }
  return S.enemies;
}

// Punch: short cooldown, short animation, hits the nearest living enemy
// in range; otherwise shoves a nearby pedestrian to the ground.
export function tryPunch(S) {
  const p = S.player;
  if (!p || p.car || (p.punchCd || 0) > 0) return false;
  p.punchCd = PUNCH_COOLDOWN;
  p.punchAnim = 0.18;
  const snd = sfx(S);
  if (snd && snd.punch) snd.punch();
  let best = null, bestD = PUNCH_RANGE + 14;
  for (const e of S.enemies || []) {
    if (e.down) continue;
    const d = dist(p.x, p.y, e.x, e.y);
    if (d < bestD) { best = e; bestD = d; }
  }
  if (best) {
    damageEnemy(S, best, PUNCH_DAMAGE);
    return true;
  }
  for (const ped of S.peds || []) {
    if (ped.down) continue;
    if (dist(p.x, p.y, ped.x, ped.y) < PUNCH_RANGE + 16) {
      ped.down = true;
      ped.downT = 2.5;
      puff(S, ped.x, ped.y, '#ffffff', 4);
      return true;
    }
  }
  return true;
}

// Shoot: pistol only, on foot, costs one round. Hitscan — a tracer to
// max range and a hit test along the aim ray, 26 units of sideways slack.
export function tryShoot(S, tx, ty) {
  const p = S.player;
  if (!p || p.car || p.weapon !== 'pistol') return false;
  if ((p.ammo || 0) <= 0 || (p.shootCd || 0) > 0) return false;
  p.shootCd = SHOOT_COOLDOWN;
  p.ammo -= 1;
  // Aim: an explicit target point wins; otherwise the mouse aim the
  // world keeps fresh each step, falling back to the facing angle.
  const aim = (tx === undefined || ty === undefined)
    ? (typeof p.aim === 'number' ? p.aim : p.angle)
    : Math.atan2(ty - p.y, tx - p.x);
  p.angle = aim;
  const snd = sfx(S);
  if (snd && snd.shot) snd.shot();
  puff(S, p.x + Math.cos(aim) * 18, p.y + Math.sin(aim) * 18, '#ffd76a', 3);
  const ex = p.x + Math.cos(aim) * PISTOL_RANGE;
  const ey = p.y + Math.sin(aim) * PISTOL_RANGE;
  let best = null, bestT = PISTOL_RANGE;
  for (const e of S.enemies || []) {
    if (e.down) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const t = dx * Math.cos(aim) + dy * Math.sin(aim);
    if (t < 10 || t > PISTOL_RANGE) continue;
    const side = Math.abs(-dx * Math.sin(aim) + dy * Math.cos(aim));
    if (side < 26 && t < bestT) { best = e; bestT = t; }
  }
  if (best) {
    tracer(S, p.x, p.y, best.x, best.y);
    damageEnemy(S, best, PISTOL_DAMAGE);
  } else {
    tracer(S, p.x, p.y, ex, ey);
  }
  return true;
}

// Hurt one enemy. On death: mark it down, count the defeat, pay $40
// and drop a cash pickup where it fell.
export function damageEnemy(S, e, dmg) {
  if (!e || e.down) return;
  e.hp -= dmg;
  puff(S, e.x, e.y, '#ff5a5a', 5);
  if (e.hp > 0) return;
  e.hp = 0;
  e.down = true;
  S.defeated = (S.defeated || 0) + 1;
  if (S.player) S.player.cash = (S.player.cash || 0) + 40;
  if (S.pickups) S.pickups.push({ x: e.x, y: e.y, kind: 'cash', amount: 40, t: 0 });
  const snd = sfx(S);
  if (snd && snd.pickup) snd.pickup();
}

// Hurt the player, with a 0.5 s invulnerability window after each hit.
// At 0 HP the player is wasted.
export function damagePlayer(S, dmg) {
  const p = S.player;
  if (!p || p.hp <= 0) return;
  if ((p.invuln || 0) > 0) return;
  p.hp -= dmg;
  p.invuln = 0.5;
  puff(S, p.x, p.y, '#ff5a5a', 6);
  if (p.hp <= 0) {
    p.hp = 0;
    S.wasted = true;
  }
}

// Enemies chase within 380, close to 160, then shoot every ~0.9–1.6 s:
// 9 damage on foot, 6 to the player's car. Every shot leaves a tracer.
export function updateEnemies(S, dt) {
  const p = S.player;
  if (!p) return;
  for (const e of S.enemies || []) {
    if (e.down) continue;
    const d = dist(p.x, p.y, e.x, e.y);
    if (d > 380) { e.shootCd = Math.max(e.shootCd, 0.4); continue; }
    e.angle = Math.atan2(p.y - e.y, p.x - e.x);
    if (d > 160) {
      e.x += Math.cos(e.angle) * (e.speed || 130) * dt;
      e.y += Math.sin(e.angle) * (e.speed || 130) * dt;
      if (S.city && S.city.collide) S.city.collide(e, 12);
    } else {
      e.shootCd -= dt;
      if (e.shootCd <= 0) {
        e.shootCd = 0.9 + Math.random() * 0.7;
        tracer(S, e.x, e.y, p.x, p.y);
        const snd = sfx(S);
        if (snd && snd.shot) snd.shot();
        if (p.car) damageCar(S, p.car, 6);
        else damagePlayer(S, 9);
      }
    }
  }
}

// Hurt a car. Smoke on every hit; at 0 HP it is disabled, stops dead
// and blows out in an explosion puff.
export function damageCar(S, car, dmg) {
  if (!car || car.hp <= 0) return;
  car.hp -= dmg;
  puff(S, car.x, car.y, '#888888', 4);
  if (car.hp > 0) return;
  car.hp = 0;
  car.disabled = true;
  car.speed = 0;
  puff(S, car.x, car.y, '#ff8c1a', 16);
  puff(S, car.x, car.y, '#333333', 10);
  const snd = sfx(S);
  if (snd && snd.crash) snd.crash();
}
