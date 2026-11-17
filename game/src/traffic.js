// traffic.js — SOLMAR ambient traffic and pedestrians.
// Cars cruise the road grid and turn at intersections; pedestrians
// stroll the sidewalks and run when trouble gets close.

// Ten paint colours for ordinary traffic. Taxis ignore this list:
 // they always wear yellow.
const CAR_COLOURS = ['#e8e6e1', '#c0c4c8', '#2b2f36', '#b3392f', '#2f6db3',
  '#3f7d4e', '#6b6f75', '#d97b2b', '#7a5a9e', '#2e8f86'];

// Shirt colours for pedestrians walking the sidewalks.
const SHIRT_COLOURS = ['#d94f3d', '#3d7dd9', '#e8c33d', '#4fae5a',
  '#9e5ad9', '#e07b9e', '#5ad9d1', '#f2f2f2'];

// Shortest-turn angle lerp: from 170deg to -170deg takes the
// 20-degree shortcut across the seam, never the long way round.
export function lerpAngle(a, b, t) {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

// One of the four axis-aligned headings: east, south, west, north.
function axisHeading(rng) {
  return Math.floor(rng.next() * 4) * (Math.PI / 2);
}

// Spawn a traffic car on a random road point, already pointing
// along the road, cruising at its own speed.
export function spawnTrafficCar(city, rng) {
  const p = city.randomRoadPoint(rng);
  const roll = rng.next();
  const kind = roll < 0.55 ? 'sedan' : roll < 0.8 ? 'taxi' : 'truck';
  const colour = kind === 'taxi' ? '#f7c948' : rng.pick(CAR_COLOURS);
  const angle = typeof p.angle === 'number' ? p.angle + (rng.next() < 0.5 ? 0 : Math.PI)
    : axisHeading(rng);
  return {
    x: p.x, y: p.y,
    angle, targetAngle: angle,
    speed: 0,
    cruise: rng.range(95, 150),
    kind, colour,
    turnWait: rng.range(0.5, 2),
  };
}

// Spawn a pedestrian on a random sidewalk point, strolling
// toward another random sidewalk point.
export function spawnPedestrian(city, rng) {
  const start = city.randomSidewalkPoint(rng);
  const dest = city.randomSidewalkPoint(rng);
  return {
    x: start.x, y: start.y,
    angle: rng.range(0, Math.PI * 2),
    r: 12,
    shirt: rng.pick(SHIRT_COLOURS),
    tx: dest.x, ty: dest.y,
    fleeing: false,
    down: false,
  };
}

// ---- updates ----

// One traffic car for one step: maybe turn at an intersection,
// steer back to the centreline, brake for the car ahead.
export function updateTrafficCar(car, dt, city, cars, rng) {
  car.turnWait -= dt;
  // A crossing road is near when the ground just to our side is
  // road too: probe one car-width sideways off the centreline.
  const side = car.angle + Math.PI / 2;
  const px = car.x + Math.cos(side) * 55, py = car.y + Math.sin(side) * 55;
  const roll = rng ? rng.next() : Math.random();
  if (car.turnWait <= 0 && city.onRoad(px, py)) {
    car.turnWait = rng ? rng.range(1.5, 4) : 2.5;
    if (roll < 0.3) car.targetAngle += (roll < 0.15 ? 1 : -1) * (Math.PI / 2);
  }
  // Steer toward the target heading, nudged back to the centreline.
  const near = city.nearestRoadPoint(car.x, car.y);
  const nx = -Math.sin(car.targetAngle), ny = Math.cos(car.targetAngle);
  const lateral = (car.x - near.x) * nx + (car.y - near.y) * ny;
  const correction = -Math.max(-0.35, Math.min(0.35, lateral * 0.03));
  car.angle = lerpAngle(car.angle, car.targetAngle + correction, Math.min(1, dt * 3.5));
  // Brake to a stop for a car ahead on our lane, inside the gap.
  let targetSpeed = car.cruise;
  for (const other of cars) {
    if (other === car) continue;
    const dx = other.x - car.x, dy = other.y - car.y;
    const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const sideGap = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (ahead > 0 && ahead < 70 && sideGap < 26) { targetSpeed = 0; break; }
  }
  const rate = targetSpeed > car.speed ? 200 : 500;
  car.speed += Math.max(-rate * dt, Math.min(rate * dt, targetSpeed - car.speed));
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // Wrap around the city edge so the streets never run out of cars.
  if (car.x < -80) car.x += 3760; if (car.x > 3680) car.x -= 3760;
  if (car.y < -80) car.y += 2960; if (car.y > 2880) car.y -= 2960;
}

// One pedestrian for one step: run from danger, otherwise stroll.
// Threat is the player (or the world state holding it): danger counts
// only while the player is wanted or driving.
export function updatePedestrian(ped, dt, city, threat, rng) {
  if (ped.down) return;
  const p = (threat && threat.player) || threat || {};
  const wanted = threat ? (threat.wanted ?? p.wanted ?? 0) : 0;
  const driving = threat ? (threat.driving ?? p.driving ?? p.inCar ?? !!p.car) : false;
  const dx = ped.x - (p.x || 0), dy = ped.y - (p.y || 0);
  const dist = Math.hypot(dx, dy);
  const dangerous = (wanted > 0 || driving) && p.x !== undefined;
  if (dangerous && dist < 180) ped.fleeing = true;
  if (ped.fleeing && dist > 320) ped.fleeing = false;
  let speed = 55;
  if (ped.fleeing) {
    speed = 190;
    ped.angle = Math.atan2(dy, dx);
  } else {
    const tx = ped.tx - ped.x, ty = ped.ty - ped.y;
    if (Math.hypot(tx, ty) < 20) {
      const dest = rng ? city.randomSidewalkPoint(rng) : null;
      if (dest) { ped.tx = dest.x; ped.ty = dest.y; }
      else { ped.tx = ped.x - tx; ped.ty = ped.y - ty; }
    } else ped.angle = Math.atan2(ty, tx);
  }
  ped.x += Math.cos(ped.angle) * speed * dt;
  ped.y += Math.sin(ped.angle) * speed * dt;
  city.collide(ped);
}
