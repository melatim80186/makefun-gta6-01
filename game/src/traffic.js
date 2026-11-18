// SOLMAR traffic — background cars and sidewalk walkers for the city.
// Cars cruise the road grid, turn at junctions and queue behind each
// other; pedestrians stroll the pavements and scatter from trouble.
import { TRAFFIC, PEDS, CAR, WORLD_W, WORLD_H } from './config.js';

const TAXI_YELLOW = '#f7c948';
const PAINT = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#e67e22', '#ecf0f1', '#2c3e50', '#16a085', '#d35400', '#7f8c8d'];
const SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#ecf0f1'];

const TAU = Math.PI * 2;

function snapAxis(angle) {
  const step = Math.PI / 2;
  return Math.round(angle / step) * step;
}

export function angleLerp(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  const out = a + d * t;
  return isFinite(out) ? out : a;
}

export function spawnTrafficCar(city, rng) {
  const spot = city.randomRoadPoint();
  const roll = rng.next();
  const kind = roll < 0.6 ? 'sedan' : roll < 0.82 ? 'taxi' : 'truck';
  const cruise = rng.range(TRAFFIC.speedMin, TRAFFIC.speedMax);
  const car = {
    x: spot.x, y: spot.y,
    angle: snapAxis(spot.angle),
    speed: cruise, cruise,
    kind,
    color: kind === 'taxi' ? TAXI_YELLOW : rng.pick(PAINT),
    r: 26, hp: CAR.hp, disabled: false,
    isPlayer: false, isPolice: false, marked: false,
  };
  if (!isFinite(car.x)) car.x = 0;
  if (!isFinite(car.y)) car.y = 0;
  if (!isFinite(car.cruise)) car.cruise = TRAFFIC.speedMin;
  car.speed = car.cruise;
  return car;
}

export function spawnPedestrian(city, rng) {
  const spot = city.randomSidewalkPoint();
  const goal = city.randomSidewalkPoint();
  return {
    x: spot.x, y: spot.y,
    angle: rng.range(0, TAU),
    shirt: rng.pick(SHIRTS),
    down: false, fleeing: false,
    tx: goal.x, ty: goal.y,
    speed: 0, r: 13,
  };
}

// Road centrelines from the spec grid: avenues run north-south, streets
// run east-west. Used to spot junctions and steer cars back on-centre.
const AVENUES = [480, 880, 1280, 1680, 2080, 2480, 2880, 3280];
const STREETS = [360, 720, 1080, 1440, 1800, 2160, 2520];

function nearestOf(list, v) {
  let best = list[0];
  let bd = Infinity;
  for (const n of list) {
    const d = Math.abs(n - v);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

export function updateTrafficCar(car, dt, city, cars) {
  if (!car || car.disabled) return;
  if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
  dt = Math.min(dt, 0.1);
  const px = car.x, py = car.y, pa = car.angle, ps = car.speed;
  const horizontal = Math.abs(Math.cos(car.angle)) >= Math.abs(Math.sin(car.angle));
  const ax = nearestOf(AVENUES, car.x);
  const sy = nearestOf(STREETS, car.y);
  const atJunction = Math.abs(car.x - ax) < 42 && Math.abs(car.y - sy) < 42;
  if (atJunction && Math.random() < 0.35 * dt) {
    // Turn onto the crossing road, picking either direction along it.
    car.angle = horizontal
      ? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2)
      : (Math.random() < 0.5 ? 0 : Math.PI);
  } else {
    // Steer toward a point ahead on the nearest centreline.
    const aheadX = car.x + Math.cos(car.angle) * 120;
    const aheadY = car.y + Math.sin(car.angle) * 120;
    const want = horizontal
      ? Math.atan2(sy - car.y, aheadX - car.x)
      : Math.atan2(aheadY - car.y, ax - car.x);
    car.angle = angleLerp(car.angle, want, Math.min(1, 2.2 * dt));
  }
  // Brake when another car is ahead on the same lane.
  const hx = Math.cos(car.angle), hy = Math.sin(car.angle);
  let blocked = false;
  for (const o of cars || []) {
    if (o === car || !o || o.disabled) continue;
    const oHoriz = Math.abs(Math.cos(o.angle)) >= Math.abs(Math.sin(o.angle));
    if (oHoriz !== horizontal) continue;
    const dx = o.x - car.x, dy = o.y - car.y;
    const ahead = dx * hx + dy * hy;
    if (ahead <= 0 || ahead > TRAFFIC.spacing) continue;
    if (Math.abs(-dx * hy + dy * hx) < 30) { blocked = true; break; }
  }
  if (blocked) car.speed = Math.max(0, car.speed - 500 * dt);
  else if (car.speed < car.cruise) car.speed = Math.min(car.cruise, car.speed + 140 * dt);
  else if (car.speed > car.cruise) car.speed = Math.max(car.cruise, car.speed - 200 * dt);
  if (!isFinite(car.speed)) car.speed = ps;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (car.x < 0) car.x = WORLD_W;
  else if (car.x > WORLD_W) car.x = 0;
  if (car.y < 0) car.y = WORLD_H;
  else if (car.y > WORLD_H) car.y = 0;
  if (!isFinite(car.x)) car.x = px;
  if (!isFinite(car.y)) car.y = py;
  if (!isFinite(car.angle)) car.angle = pa;
}

export function updatePedestrian(ped, dt, city, danger) {
  if (!ped || ped.down) return;
  if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
  dt = Math.min(dt, 0.1);
  const px = ped.x, py = ped.y;
  const safe = danger || { x: 0, y: 0, active: false };
  const dx = ped.x - safe.x, dy = ped.y - safe.y;
  const dist = Math.hypot(dx, dy);
  if (safe.active && dist < 180) ped.fleeing = true;
  else if (!safe.active || dist > 320) ped.fleeing = false;
  let mx = 0, my = 0, spd = 0;
  if (ped.fleeing && dist > 0) {
    mx = dx / dist; my = dy / dist; spd = PEDS.flee;
  } else {
    if (!isFinite(ped.tx) || !isFinite(ped.ty)) {
      const goal = city.randomSidewalkPoint();
      ped.tx = goal.x; ped.ty = goal.y;
    }
    const gx = ped.tx - ped.x, gy = ped.ty - ped.y;
    const gd = Math.hypot(gx, gy);
    if (gd < 14) {
      const goal = city.randomSidewalkPoint();
      ped.tx = goal.x; ped.ty = goal.y;
    } else {
      mx = gx / gd; my = gy / gd; spd = PEDS.walk;
    }
  }
  if (spd > 0) {
    ped.x += mx * spd * dt;
    ped.y += my * spd * dt;
    ped.angle = Math.atan2(my, mx);
    ped.speed = spd;
  } else {
    ped.speed = 0;
  }
  if (city && typeof city.collide === 'function') city.collide(ped);
  if (!isFinite(ped.x)) ped.x = px;
  if (!isFinite(ped.y)) ped.y = py;
  if (!isFinite(ped.angle)) ped.angle = 0;
}
