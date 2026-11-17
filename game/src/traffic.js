// traffic.js — SOLMAR street life: traffic cars and pedestrians.
// Plain ES module, no imports. Cars drive the road grid, pedestrians
// stroll the sidewalks and run when trouble gets too close.

// Ten body colours for ordinary traffic. Taxis ignore this list:
// a taxi is always yellow, so it reads at a glance.
const CAR_COLORS = [
  '#c0392b', '#2980b9', '#27ae60', '#e67e22', '#8e44ad',
  '#ecf0f1', '#2c3e50', '#e84393', '#16a085', '#7f8c8d',
];
const TAXI_YELLOW = '#f7c948';

// Eight shirt colours for pedestrians on the sidewalk.
const SHIRT_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#ecf0f1', '#1abc9c', '#e67e22',
];

// Move angle `a` toward angle `b` by fraction `t`, always taking the
// shortest way around the circle (never the long way round).
export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Wrap an angle difference to (-PI, PI].
function wrapAngle(d) {
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

// The two axis-aligned headings a road of the given orientation runs:
// avenues run north/south, streets run east/west.
function roadHeadings(orientation) {
  return orientation === 'v' ? [Math.PI / 2, -Math.PI / 2] : [0, Math.PI];
}

// The road heading closest to `ref`, with how far away it is (wrapped).
// A road's axis has two equivalents (there and back); the one nearest
// the car's heading is the direction the car is travelling along it.
function closestHeading(orientation, ref) {
  const cands = roadHeadings(orientation);
  let best = cands[0];
  let bestD = Math.abs(wrapAngle(cands[0] - ref));
  for (let i = 1; i < cands.length; i++) {
    const d = Math.abs(wrapAngle(cands[i] - ref));
    if (d < bestD) { bestD = d; best = cands[i]; }
  }
  return { angle: best, dist: bestD };
}

// Spawn one traffic car on a random road point, heading along that
// road (north/south on an avenue, east/west on a street — never
// diagonally across a block). Kind is weighted toward sedans, with
// taxis and trucks mixed in; cruise speed is 95-150.
export function spawnTrafficCar(city, rng) {
  const p = city.randomRoadPoint(rng);
  const headings = roadHeadings(p.orientation);
  const roll = rng.next();
  const kind = roll < 0.58 ? 'sedan' : roll < 0.83 ? 'taxi' : 'truck';
  const cruise = rng.range(95, 150);
  return {
    x: p.x,
    y: p.y,
    angle: rng.pick(headings),
    speed: cruise,
    cruise,
    kind,
    color: kind === 'taxi' ? TAXI_YELLOW : rng.pick(CAR_COLORS),
    len: 52,
    wid: 26,
    hp: 100,
    isPlayer: false,
    isPolice: false,
  };
}

// Spawn one pedestrian on a random sidewalk point, strolling toward
// another random sidewalk point at walking speed.
export function spawnPedestrian(city, rng) {
  const p = city.randomSidewalkPoint(rng);
  const target = city.randomSidewalkPoint(rng);
  return {
    x: p.x,
    y: p.y,
    angle: Math.atan2(target.y - p.y, target.x - p.x),
    speed: 55,
    shirt: rng.pick(SHIRT_COLORS),
    state: 'walk',
    target: { x: target.x, y: target.y },
    down: false,
    downT: 0,
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// A throwaway RNG-shaped object (next/range/int/pick) backed by
// Math.random, for when an update needs a fresh sidewalk point but
// no seeded RNG was passed in.
function localRng() {
  return {
    next: () => Math.random(),
    range: (a, b) => a + Math.random() * (b - a),
    int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  };
}

// Drive one traffic car for a step: steer back toward the nearest
// road centreline, sometimes turn onto the crossing road at an
// intersection, brake to a stop for the car ahead, then move. Cars
// wrap around the city edge so traffic never runs out.
export function updateTrafficCar(car, dt, city, cars) {
  if (!car || dt <= 0) return;
  car.turnCd = Math.max(0, (car.turnCd || 0) - dt);
  const near = city.nearestRoadPoint(car.x, car.y);
  const dx = near.x - car.x;
  const dy = near.y - car.y;
  const offRoad = Math.hypot(dx, dy);
  // Heading along the nearest road, in the car's direction of travel.
  // Just after a turn the car is crossing its old road, square to it,
  // so no equivalent of that road is close — then trust the heading
  // itself instead of snapping the car sideways.
  const roadMatch = closestHeading(near.orientation, car.angle);
  let roadAngle = roadMatch.dist > Math.PI / 3 ? car.angle : roadMatch.angle;
  let desired;
  if (offRoad > 80) {
    // Far from every centreline: steer straight at the nearest road
    // point instead of the lateral rule.
    desired = Math.atan2(dy, dx);
  } else {
    // Probe ahead: if the road just ahead runs across ours, we are at
    // an intersection, so sometimes turn onto the crossing road — but
    // only when the crossing itself is close, not while still
    // approaching it. The probe sits on our own centreline, so asking
    // for its nearest road would always answer our own road — instead
    // check the perpendicular grid lines directly: for a car heading
    // along an avenue, a crossing street is one whose centreline the
    // probe lies within half a road width of (and vice versa).
    const vertical = Math.abs(Math.sin(car.angle)) > Math.abs(Math.cos(car.angle));
    const px = car.x + Math.cos(car.angle) * 70;
    const py = car.y + Math.sin(car.angle) * 70;
    let ix = null, iy = null;
    if (vertical) {
      let crossY = null;
      for (const sy of city.streets) {
        if (Math.abs(py - sy) <= 36) { crossY = sy; break; }
      }
      if (crossY !== null) {
        let ax = city.avenues[0], best = Math.abs(car.x - ax);
        for (const a of city.avenues) {
          const d = Math.abs(car.x - a);
          if (d < best) { best = d; ax = a; }
        }
        ix = ax; iy = crossY;
      }
    } else {
      let crossX = null;
      for (const ax of city.avenues) {
        if (Math.abs(px - ax) <= 36) { crossX = ax; break; }
      }
      if (crossX !== null) {
        let sy = city.streets[0], best = Math.abs(car.y - sy);
        for (const s of city.streets) {
          const d = Math.abs(car.y - s);
          if (d < best) { best = d; sy = s; }
        }
        ix = crossX; iy = sy;
      }
    }
    const atJunction = ix !== null && Math.hypot(ix - car.x, iy - car.y) < 34.6;
    if (atJunction && car.turnCd <= 0 && Math.random() < 0.3) {
      car.angle += Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      roadAngle = car.angle;
      car.turnCd = 2.5;
    }
    // Steer toward the centreline: aim along the road, nudged gently
    // sideways toward the nearest centreline point.
    const lateral = -dx * Math.sin(roadAngle) + dy * Math.cos(roadAngle);
    desired = roadAngle + clamp(lateral * 0.012, -0.3, 0.3);
  }
  car.angle = angleLerp(car.angle, desired, Math.min(1, dt * 3));
  // Brake to 0 when another car is within spacing 70 ahead, same lane.
  let target = car.cruise;
  if (cars) {
    for (const other of cars) {
      if (other === car) continue;
      const ox = other.x - car.x;
      const oy = other.y - car.y;
      const fwd = ox * Math.cos(car.angle) + oy * Math.sin(car.angle);
      const side = Math.abs(-ox * Math.sin(car.angle) + oy * Math.cos(car.angle));
      if (fwd > 0 && fwd < 70 && side < 30) { target = 0; break; }
    }
  }
  if (target < car.speed) car.speed = Math.max(target, car.speed - 500 * dt);
  else car.speed = Math.min(target, car.speed + 180 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  // Wrap around the city edge (3600 x 2800) so traffic never runs out.
  const M = 80, W = 3600, H = 2800;
  if (car.x < -M) car.x += W + M * 2;
  else if (car.x > W + M) car.x -= W + M * 2;
  if (car.y < -M) car.y += H + M * 2;
  else if (car.y > H + M) car.y -= H + M * 2;
}

// Walk one pedestrian for a step. While the player is wanted or
// driving, danger within 180 makes the ped flee at 190; a fleeing ped
// calms down once the player is past 320. Otherwise stroll to a
// random sidewalk point at 55. Collide keeps peds out of water and
// buildings. A floored ped stays down until downT runs out.
export function updatePedestrian(ped, dt, city, player, wanted) {
  if (!ped || dt <= 0) return;
  if (ped.down) {
    ped.downT -= dt;
    if (ped.downT <= 0) { ped.down = false; ped.downT = 0; }
    return;
  }
  const px = player ? player.x : 0;
  const py = player ? player.y : 0;
  const dist = Math.hypot(ped.x - px, ped.y - py);
  const driving = !!(player && (player.inCar || player.driving || player.car));
  const danger = (wanted > 0 || driving) && dist < 180;
  if (ped.state === 'flee' && dist > 320) {
    ped.state = 'walk';
    const t = city.randomSidewalkPoint(localRng());
    ped.target = { x: t.x, y: t.y };
  }
  if (danger || ped.state === 'flee') {
    ped.state = 'flee';
    ped.speed = 190;
    ped.angle = angleLerp(ped.angle, Math.atan2(ped.y - py, ped.x - px), Math.min(1, dt * 8));
  } else {
    ped.state = 'walk';
    ped.speed = 55;
    if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 24) {
      const t = city.randomSidewalkPoint(localRng());
      ped.target = { x: t.x, y: t.y };
    }
    ped.angle = angleLerp(ped.angle, Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x), Math.min(1, dt * 6));
  }
  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  if (city.collide) {
    const fixed = city.collide(ped, 12);
    if (fixed && typeof fixed.x === 'number') { ped.x = fixed.x; ped.y = fixed.y; }
  }
}
