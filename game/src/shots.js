// SOLMAR — staged screenshot scenes for the ?shot= path.
// Each scene builds a small moment from a fresh world, steps it a few
// seconds so traffic, police and the player settle, then hands back the
// screen to paint and the cash record to show.
import { DT, CAR, PLACES } from './config.js';
import { stepWorld } from './world.js';
import { startMission } from './missions.js';
import { spawnEnemies } from './combat.js';
import { spawnPoliceCar } from './police.js';
import { ACTIONS } from './input.js';

function clamp(v, lo, hi) {
  if (!isFinite(v)) return 0;
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function wrapAngle(a) {
  if (!isFinite(a)) return 0;
  let d = a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Steering toward a target point: aim at it, turn by the wrapped gap.
function steerToward(S, tx, ty) {
  const car = S.player && S.player.car;
  if (!car) return 0;
  if (!isFinite(tx) || !isFinite(ty)) return 0;
  if (!isFinite(car.x) || !isFinite(car.y) || !isFinite(car.angle)) return 0;
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const diff = wrapAngle(desired - car.angle);
  return clamp(diff * 2, -1, 1);
}

// A stand-in for the real keyboard/mouse state, aimed just ahead.
function makeCtl(S, accel) {
  const px = S.player && isFinite(S.player.x) ? S.player.x : 0;
  const py = S.player && isFinite(S.player.y) ? S.player.y : 0;
  return {
    actions: 0, dirX: 0, dirY: 0, accel: !!accel, brake: false,
    run: false, handbrake: false, mouseX: 0, mouseY: 0,
    mouseDown: false, aimX: px + 100, aimY: py,
  };
}

// Step the world for a number of seconds, re-aiming the wheel each tick
// when a driving target is given.
function stepWorldN(S, ctl, seconds, target) {
  const total = isFinite(seconds) ? Math.max(0, Math.round(seconds / DT)) : 0;
  for (let i = 0; i < total; i++) {
    if (target && S.player && S.player.car) {
      ctl.dirX = steerToward(S, target.x, target.y);
    }
    if (S.player && isFinite(S.player.x) && isFinite(S.player.y)) {
      ctl.aimX = S.player.x + 100;
      ctl.aimY = S.player.y;
    }
    stepWorld(S, ctl, DT);
  }
}

// Drop the player into a fresh car at a spot, facing a direction.
function putPlayerInCar(S, x, y, angle, kind, color, speed) {
  const car = {
    x: isFinite(x) ? x : 0, y: isFinite(y) ? y : 0,
    angle: isFinite(angle) ? angle : 0,
    speed: isFinite(speed) ? speed : 0,
    kind, color, r: 26, hp: 100, disabled: false,
    isPlayer: true, isPolice: false, marked: false, owned: true, cruise: 0,
  };
  S.cars.push(car);
  S.player.car = car;
  S.player.onFoot = false;
  S.player.x = car.x;
  S.player.y = car.y;
  S.player.angle = car.angle;
  return car;
}

// Spawn a police car, then park it exactly where the scene needs it.
function placePolice(S, x, y, angle, speed) {
  let car = null;
  try { car = spawnPoliceCar(S); } catch (e) { car = null; }
  if (!car || typeof car !== 'object') {
    const cops = (S.cars || []).filter((c) => c && c.isPolice);
    car = cops.length ? cops[cops.length - 1] : S.cars[S.cars.length - 1];
  }
  if (!car) return null;
  car.x = isFinite(x) ? x : 0;
  car.y = isFinite(y) ? y : 0;
  car.angle = isFinite(angle) ? angle : 0;
  car.speed = isFinite(speed) ? speed : 0;
  return car;
}

function cashOf(S) {
  return S.player && isFinite(S.player.cash) ? S.player.cash : 0;
}

function standOnFoot(S, x, y) {
  S.player.x = isFinite(x) ? x : 0;
  S.player.y = isFinite(y) ? y : 0;
  S.player.onFoot = true;
  S.player.car = null;
  S.player.angle = 0;
}

function chaseScene(S) {
  S.attract = false;
  startMission(S, 5);
  // No auto-spawned police during staging: only the three placed cars.
  S._policeSpawnCd = 999;
  putPlayerInCar(S, 880, 1440, 0, 'sports', '#c8102e', 350);
  // Pursuit, not a pile-up: police start 600-800 behind, staggered
  // across the lane so they don't rear-end each other, and close in
  // over the 2 s step without catching the car (sports outruns them).
  placePolice(S, 280, 1400, 0, 300);
  placePolice(S, 180, 1480, 0, 280);
  placePolice(S, 80, 1400, 0, 260);
  // Clear the chase lane so the car holds its speed instead of
  // T-boning crossing traffic; traffic still shows on other streets.
  for (const c of S.cars) {
    if (!c.isPlayer && !c.isPolice && Math.abs(c.y - 1440) < 90 && c.x > 880) c.y = 1800;
  }
  const ctl = makeCtl(S, true);
  stepWorldN(S, ctl, 2, { x: 2480, y: 1440 });
  return { screen: 'play', best: cashOf(S) };
}

function streetScene(S) {
  S.attract = false;
  startMission(S, 0);
  S.wanted = 1;
  standOnFoot(S, 1730, 1150);
  const ctl = makeCtl(S, false);
  stepWorldN(S, ctl, 4, null);
  return { screen: 'play', best: cashOf(S) };
}

function missionScene(S) {
  S.attract = false;
  startMission(S, 6);
  // No auto-spawned police during staging: only the one placed cruiser.
  S._policeSpawnCd = 999;
  const bx = PLACES.bank && isFinite(PLACES.bank.x) ? PLACES.bank.x : 1730;
  const by = PLACES.bank && isFinite(PLACES.bank.y) ? PLACES.bank.y : 1490;
  standOnFoot(S, bx + 40, by + 40);
  S.player.weapon = 'pistol';
  S.player.ammo = 24;
  // On the avenue/street corner, not inside the bank block: inside a
  // building, collide() shoves both gang members to the same edge point
  // and they render as one dot.
  spawnEnemies(S, 1680, 1440, 2);
  // The closing cruiser starts 1250 east on the street and drives west
  // toward the player: after the 2 s step it sits ~500 east, in frame
  // and chasing. (Starting it west of the player meant driving through
  // blocks, where it got stuck on a building face off-frame.)
  placePolice(S, S.player.x + 1250, 1440, Math.PI, 0);
  if (S.mission) S.mission.hold = 2;
  const ctl = makeCtl(S, false);
  stepWorldN(S, ctl, 2, null);
  return { screen: 'play', best: cashOf(S) };
}

function titleScene(S) {
  S.attract = true;
  S.player.x = 1730;
  S.player.y = 1150;
  S.player.onFoot = true;
  S.player.car = null;
  const ctl = makeCtl(S, false);
  stepWorldN(S, ctl, 8, null);
  return { screen: 'title', best: 0 };
}

export function stageShot(S, name) {
  if (name === 'chase') return chaseScene(S);
  if (name === 'street') return streetScene(S);
  if (name === 'mission') return missionScene(S);
  return titleScene(S);
}
