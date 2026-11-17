// world.js — SOLMAR state + step: player, cars, missions, police, pickups.
// createWorld({ seed, input, audio }) builds a fresh city and state;
// stepWorld(world, dt) advances one fixed 1/60 s step. Each subsystem
// is called in its own shape: traffic takes (city, rng), combat and
// missions take the STATE (which also carries city + audio for them),
// police takes the WORLD. State is rebuilt by buildState(); reset()
// swaps in a fresh STATE object — never the world object (the old
// reference bug).
import { DT, PLAYER, CAR, TRAFFIC, PEDS, MONEY, PLACES } from './config.js';
import { createRng } from './random.js';
import { createCity } from './city.js';
import {
  spawnTrafficCar, spawnPedestrian, updateTrafficCar, updatePedestrian,
} from './traffic.js';
import { addWanted, updatePolice } from './police.js';
import {
  spawnEnemies, tryPunch, tryShoot, updateEnemies, damageCar,
} from './combat.js';
import {
  MISSIONS, startMission, updateMission, missionText, missionTarget,
  startCourier, updateCourier,
} from './missions.js';
import { saveGame } from './save.js';
import {
  ACT_ENTER, ACT_PUNCH, ACT_SHOOT, ACT_HORN, ACT_MUTE,
} from './input.js';

const TAU = Math.PI * 2;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

// Fixed pickup spots: three pistol caches and two health kits on the grid.
const AMMO_SPOTS = [[880, 720], [2080, 1440], [2880, 2160]];
const HEALTH_SPOTS = [[1280, 1080], [2480, 1800]];

function buildState(world) {
  const { city } = world;
  const s = {
    time: 0,
    player: {
      x: PLACES.garage.x, y: PLACES.garage.y + 60, angle: -Math.PI / 2,
      hp: PLAYER.maxHp, cash: 0, inCar: false, carId: null, car: null,
      weapon: 'fists', ammo: 0, punchCd: 0, shootCd: 0, hurtCd: 0,
      punching: 0, speed: 0, aim: -Math.PI / 2,
    },
    cars: [], peds: [], cops: [], enemies: [],
    pickups: [], particles: [], tracers: [],
    wanted: 0, quietTime: 0, heatTimer: 0,
    mission: null, missionIndex: 0, courier: null, courierCd: 0,
    flags: { stoleCar: false, stoleMarked: false, defeated: 0 },
    stats: { carsStolen: 0, missionsDone: 0, goldFound: 0, pedsHit: 0, cashEarned: 0 },
    toast: { text: '', until: 0 },
    busted: false, wasted: false, storyDone: false,
    nextMissionIn: 3, sprayCd: 0, missionSpawned: {},
    ids: { car: 1, ped: 1, pickup: 1 },
    goldFoundIds: [],
  };
  world.state = s; // let spawners read state (ids) while filling it
  // Combat / missions read state.city and state.audio off the state,
  // so attach them here (reset rebuilds the state, not the world).
  s.city = world.city;
  s.audio = world.audio;
  for (let i = 0; i < TRAFFIC.count; i++) {
    const car = spawnTrafficCar(world.city, world.rng);
    car.id = s.ids.car++;
    car.hp = CAR.hp;
    s.cars.push(car);
  }
  for (let i = 0; i < PEDS.count; i++) s.peds.push(spawnPedestrian(world.city, world.rng));
  city.goldSpots.forEach((spot, i) => {
    s.pickups.push({ id: s.ids.pickup++, kind: 'gold', x: spot.x, y: spot.y, goldId: i });
  });
  for (const [x, y] of AMMO_SPOTS) s.pickups.push({ id: s.ids.pickup++, kind: 'ammo', x, y });
  for (const [x, y] of HEALTH_SPOTS) s.pickups.push({ id: s.ids.pickup++, kind: 'health', x, y });
  return s;
}

export function createWorld(opts = {}) {
  const world = {
    seed: opts.seed ?? 1,
    rng: null, city: null, state: null,
    input: opts.input ?? null,
    audio: opts.audio ?? null,
    screenToWorld: opts.screenToWorld ?? null,
    attract: !!opts.attract,
  };
  world.rng = createRng(world.seed);
  world.city = createCity(world.rng);
  world.state = buildState(world);
  world.reset = (seed) => resetWorld(world, seed);
  world.step = (dt) => stepWorld(world, dt);
  world.saveNow = () => saveNow(world);
  world.playerCar = () => playerCar(world);
  world.nearestCar = (x, y, d) => nearestCar(world, x, y, d);
  return world;
}

// Rebuild the STATE from a fresh factory call. The world object (city,
// rng, input, audio, methods) survives; only state is replaced.
export function resetWorld(world, seed) {
  if (seed !== undefined && seed !== null && seed !== world.seed) {
    world.seed = seed;
    world.rng = createRng(seed);
    world.city = createCity(world.rng);
  }
  world.state = buildState(world);
  return world;
}

export function playerCar(world) {
  const s = world.state;
  if (!s.player.inCar || s.player.carId === null) return null;
  return s.cars.find((c) => c.id === s.player.carId) ?? null;
}

// Nearest drivable car within maxDist, police cruisers included.
export function nearestCar(world, x, y, maxDist) {
  let best = null; let bestD = maxDist;
  const police = world.state.cops.filter((c) => c.kind === 'car');
  const all = [...world.state.cars, ...police];
  for (const car of all) {
    if (car.disabled) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function addToast(world, text, secs = 4) {
  world.state.toast = { text, until: world.state.time + secs };
}

export function giveCash(world, amount) {
  const s = world.state;
  s.player.cash += amount;
  s.stats.cashEarned += amount;
}

export function addParticles(world, x, y, color, n, speed = 120) {
  const s = world.state;
  for (let i = 0; i < n; i++) {
    const a = world.rng.next() * TAU;
    const v = speed * (0.4 + world.rng.next() * 0.8);
    s.particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: 0.5 + world.rng.next() * 0.4, maxLife: 0.9, color, size: 2 + world.rng.next() * 3,
    });
  }
}

// E: get in the nearest car, or get out of the one being driven.
// Stealing a traffic car is +1 wanted, a police car +2.
export function tryEnterCar(world) {
  const s = world.state; const p = s.player;
  if (p.inCar) { exitCar(world); return; }
  const car = nearestCar(world, p.x, p.y, 64);
  if (!car) return;
  // A cruiser lives in the cops list until it is stolen; moving it to
  // the traffic list keeps it drivable and stops police chasing it.
  const pi = s.cops.indexOf(car);
  if (pi >= 0) { s.cops.splice(pi, 1); s.cars.push(car); }
  p.inCar = true; p.carId = car.id; p.car = car;
  car.driver = 'player';
  if (!car.stolen) {
    car.stolen = true;
    s.stats.carsStolen++;
    s.flags.stoleCar = true;
    if (car.marked) s.flags.stoleMarked = true;
    if (car.police) {
      addWanted(world, 2);
      addToast(world, 'Stole a PD cruiser! +2 wanted', 4);
    } else {
      addWanted(world, 1);
      addToast(world, 'Car stolen! +1 wanted', 4);
    }
  }
}

export function exitCar(world) {
  const s = world.state; const p = s.player;
  const car = playerCar(world);
  if (!car) { p.inCar = false; p.carId = null; p.car = null; return; }
  car.speed = 0; car.vx = 0; car.vy = 0; car.driver = null;
  const side = car.angle + Math.PI / 2;
  p.x = car.x + Math.cos(side) * 42;
  p.y = car.y + Math.sin(side) * 42;
  world.city.collide(p, PLAYER.radius);
  p.angle = car.angle;
  p.inCar = false; p.carId = null; p.car = null;
}

// Aim the pistol from the mouse position through the camera.
function updateAim(world) {
  const s = world.state; const p = s.player;
  if (!world.input || !world.screenToWorld) return;
  const m = world.input.mouse;
  const wpt = world.screenToWorld(m.x, m.y);
  p.aim = Math.atan2(wpt.y - p.y, wpt.x - p.x);
}

// On-foot step: WASD/arrows, Shift to run, buildings block the way.
function stepOnFoot(world, dt) {
  const s = world.state; const p = s.player;
  const input = world.input;
  const dir = input ? input.direction() : { x: 0, y: 0 };
  const run = input ? input.run() : false;
  const speed = run ? PLAYER.run : PLAYER.walk;
  const len = Math.hypot(dir.x, dir.y);
  if (len > 0.01) {
    p.x += (dir.x / len) * speed * dt;
    p.y += (dir.y / len) * speed * dt;
    p.angle = Math.atan2(dir.y, dir.x);
    p.speed = speed;
  } else p.speed = 0;
  const fixed = world.city.collide(p, PLAYER.radius);
  p.x = fixed.x; p.y = fixed.y;
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);
  p.hurtCd = Math.max(0, p.hurtCd - dt);
  if (p.punching > 0) p.punching -= dt;
}

// Driving: arcade physics — accel/brake/reverse, speed-scaled steering,
// handbrake drift, drag. Velocity lerps toward the heading at grip.
function stepDriving(world, dt) {
  const s = world.state; const p = s.player;
  const car = playerCar(world);
  if (!car || car.disabled) { p.inCar = false; p.carId = null; p.car = null; return; }
  const input = world.input;
  const accel = input ? input.accelerate() : false;
  const brake = input ? input.brake() : false;
  const hand = input ? input.handbrake() : false;
  const dir = input ? input.direction() : { x: 0, y: 0 };
  const maxSpeed = car.kind === 'sports' ? CAR.sportsMax : CAR.max;
  if (accel) car.speed += CAR.accel * dt;
  if (brake) car.speed -= (car.speed > 0 ? CAR.brake : CAR.accel * 0.5) * dt;
  if (hand) car.speed -= Math.sign(car.speed) * CAR.brake * 0.6 * dt;
  car.speed = clamp(car.speed - car.speed * CAR.drag * dt, -CAR.reverseMax, maxSpeed);
  const steerScale = clamp(Math.abs(car.speed) / 200, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.angle += dir.x * CAR.steer * steerScale * dt * (hand ? 1.6 : 1);
  car.vx = car.vx ?? 0; car.vy = car.vy ?? 0;
  const tx = Math.cos(car.angle) * car.speed, ty = Math.sin(car.angle) * car.speed;
  const k = Math.min(1, (hand ? 2.5 : CAR.grip) * dt);
  car.vx += (tx - car.vx) * k; car.vy += (ty - car.vy) * k;
  car.x += car.vx * dt; car.y += car.vy * dt;
  p.x = car.x; p.y = car.y; p.angle = car.angle; p.speed = Math.abs(car.speed);
  const bx = car.x, by = car.y;
  world.city.collide(car, CAR.width);
  if (dist(bx, by, car.x, car.y) > 0.5) {
    if (Math.abs(car.speed) > 300) {
      damageCar(s, car, (Math.abs(car.speed) - 300) / 12);
      world.audio?.crash?.();
      addParticles(world, car.x, car.y, '#ffb347', 10, 160);
    }
    car.speed *= 0.4; car.vx *= 0.3; car.vy *= 0.3;
  }
  runOverPeds(world, car);
}

// Driving over a pedestrian knocks them down: +1 wanted.
function runOverPeds(world, car) {
  const s = world.state;
  if (Math.abs(car.speed) < 40) return;
  for (const ped of s.peds) {
    if (ped.down || dist(car.x, car.y, ped.x, ped.y) >= 30) continue;
    ped.down = true; ped.downTime = 4; s.stats.pedsHit++;
    addWanted(world, 1); addToast(world, 'Pedestrian hit! +1 wanted', 3);
    addParticles(world, ped.x, ped.y, '#ff5d5d', 8, 120);
  }
}

// Car–car collisions: push apart, share speed, damage over rel. 180.
// Ramming a police car with the player's car is +1 wanted (2 s per cruiser).
function collideCars(world, dt) {
  const s = world.state;
  const pc = playerCar(world);
  const police = s.cops.filter((c) => c.kind === 'car');
  for (const cop of police) cop.ramCd = Math.max(0, (cop.ramCd ?? 0) - dt);
  const all = [...s.cars, ...police];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]; const b = all[j];
      if (a.disabled && b.disabled) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= 44 || d === 0) continue;
      const nx = dx / d; const ny = dy / d; const push = (44 - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      const rel = Math.abs((a.speed ?? 0) - (b.speed ?? 0));
      const avg = ((a.speed ?? 0) + (b.speed ?? 0)) / 2;
      a.speed = avg; b.speed = avg;
      if (rel > 180) {
        damageCar(s, a, (rel - 180) / 15); damageCar(s, b, (rel - 180) / 15);
        world.audio?.crash?.();
        const cop = a.police ? a : (b.police ? b : null);
        const mine = pc && (a.id === pc.id || b.id === pc.id);
        if (cop && mine && (cop.ramCd ?? 0) <= 0) {
          cop.ramCd = 2; addWanted(world, 1); addToast(world, 'Rammed a PD cruiser! +1 wanted', 3);
        }
      }
    }
  }
}

// Pickups: gold +$250, ammo (pistol + 24), health (full), cash drops.
function stepPickups(world) {
  const s = world.state; const p = s.player;
  for (let i = s.pickups.length - 1; i >= 0; i--) {
    const pk = s.pickups[i];
    if (dist(p.x, p.y, pk.x, pk.y) > (p.inCar ? 36 : 30)) continue;
    if (pk.kind === 'gold') {
      giveCash(world, MONEY.gold); s.stats.goldFound++; s.goldFoundIds.push(pk.goldId);
      addToast(world, `Gold bar! +$${MONEY.gold} (${s.stats.goldFound}/12)`, 4);
      world.audio?.cash?.();
    } else if (pk.kind === 'ammo') {
      p.weapon = 'pistol'; p.ammo += 24;
      addToast(world, 'Pistol picked up! +24 rounds', 4); world.audio?.pickup?.();
    } else if (pk.kind === 'health') {
      p.hp = PLAYER.maxHp;
      addToast(world, 'Health restored', 3); world.audio?.pickup?.();
    } else if (pk.kind === 'cash') {
      giveCash(world, pk.amount ?? 40); world.audio?.cash?.();
    }
    addParticles(world, pk.x, pk.y, '#ffd23e', 10, 140);
    s.pickups.splice(i, 1);
  }
}

// Lay Low Motors: drive onto a pad while wanted, $100 clears all stars.
function stepSpray(world) {
  const s = world.state; const p = s.player;
  if (!p.inCar || s.wanted === 0 || p.cash < MONEY.spray || s.sprayCd > 0) return;
  for (const key of ['sprayNorth', 'spraySouth']) {
    const shop = PLACES[key];
    if (shop && dist(p.x, p.y, shop.x, shop.y) < 100) {
      s.wanted = 0; s.quietTime = 0; s.heatTimer = 0; p.cash -= MONEY.spray; s.sprayCd = 12;
      addToast(world, `Lay Low Motors — heat cleared! -$${MONEY.spray}`, 4); world.audio?.cash?.();
      addParticles(world, shop.x, shop.y, '#ffd23e', 14, 160);
      return;
    }
  }
}

// Mission step: one-time spawns, advance, complete/fail, auto-start.
// First job auto-starts 3 s after New Game; next starts 4 s after a
// completion, a failed job retries after 6 s.
// Snapshot the run in the shape saveGame stores: cash and position
// live under player, counts under stats, found gold as an id list.
function saveNow(world) {
  const s = world.state;
  saveGame({
    cash: s.player.cash,
    missionIndex: s.missionIndex,
    goldFound: s.goldFoundIds.slice(),
    playerX: s.player.x,
    playerY: s.player.y,
    carsStolen: s.stats.carsStolen,
    missionsDone: s.stats.missionsDone,
    storyDone: s.storyDone,
  });
}

function stepMissions(world, dt) {
  const s = world.state;
  if (s.storyDone) return;
  if (!s.mission) {
    s.nextMissionIn -= dt;
    if (s.nextMissionIn > 0) return;
    if (s.missionIndex >= MISSIONS.length) { s.storyDone = true; return; }
    startMission(s, s.missionIndex);
    return;
  }
  const m = s.mission;
  const steps = m.def?.steps ?? m.steps ?? [];
  if (steps.some((st) => st.type === 'stealMarked') && !s.missionSpawned.comet) {
    s.missionSpawned.comet = true; spawnMarkedComet(world);
  }
  const defeat = steps.find((st) => st.type === 'defeat');
  if (defeat && !s.missionSpawned.enemies) {
    s.missionSpawned.enemies = true;
    spawnEnemies(s, defeat.x ?? PLACES.turf.x, defeat.y ?? PLACES.turf.y, defeat.count ?? 3);
  }
  const result = updateMission(s, dt);
  if (result === 'complete') {
    const reward = m.def?.reward ?? m.reward ?? 0;
    giveCash(world, reward); s.stats.missionsDone++;
    s.missionSpawned = {}; s.mission = null; s.missionIndex++;
    addToast(world, `Job complete! +$${reward}`, 5); world.audio?.missionDone?.();
    if (s.missionIndex >= MISSIONS.length) {
      s.storyDone = true;
      addToast(world, 'PAID IN FULL — Legend of Solmar!', 6);
    } else s.nextMissionIn = 4;
    saveNow(world);
  } else if (result === 'failed') {
    s.mission = null; s.missionSpawned = {}; s.nextMissionIn = 6;
    addToast(world, 'Job failed — retrying in 6 s', 4);
  }
}

function spawnMarkedComet(world) {
  const s = world.state;
  const comet = spawnTrafficCar(world.city, world.rng);
  comet.id = s.ids.car++;
  comet.hp = CAR.hp;
  comet.kind = 'sports'; comet.color = '#ffd23e'; comet.marked = true;
  comet.x = PLACES.hotWheels.x; comet.y = PLACES.hotWheels.y; comet.angle = 0;
  comet.speed = 0; comet.vx = 0; comet.vy = 0; comet.cruise = 0; comet.parked = true;
  s.markedCar = comet;
  s.cars.push(comet);
  addToast(world, 'The yellow Comet is Downtown — steal it!', 5);
}

// Courier side job: appears after the first story job, only in free roam.
function stepCourier(world, dt) {
  const s = world.state;
  if (s.courierCd > 0) s.courierCd -= dt;
  if (s.courier) {
    const r = updateCourier(s, dt);
    if (r === 'complete' || r === 'delivered') world.audio?.cash?.();
    return;
  }
  if (!s.mission && s.stats.missionsDone >= 1 && s.courierCd <= 0) startCourier(s);
}

// Busted / wasted: fine, respawn, clear heat and police, job retries.
function respawn(world) {
  const s = world.state; const p = s.player;
  const kind = s.busted ? 'busted' : 'wasted';
  const fine = Math.min(MONEY.bustFine, Math.floor(p.cash * 0.1));
  p.cash -= fine; p.hp = PLAYER.maxHp;
  p.inCar = false; p.carId = null; p.car = null; p.aim = -Math.PI / 2;
  const spot = kind === 'busted' ? PLACES.garage : PLACES.hospital;
  p.x = spot.x; p.y = spot.y + 60; p.angle = -Math.PI / 2;
  s.wanted = 0; s.quietTime = 0; s.heatTimer = 0; s.cops = [];
  s.busted = false; s.wasted = false;
  if (s.mission) { s.mission = null; s.nextMissionIn = 6; }
  addToast(world, `${kind === 'busted' ? 'BUSTED' : 'WASTED'}! -$${fine}`, 5);
  world.audio?.busted?.();
  saveNow(world);
}

function fadeList(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i];
    it.life -= dt;
    if (it.x !== undefined) { it.x += (it.vx ?? 0) * dt; it.y += (it.vy ?? 0) * dt; }
    if (it.life <= 0) list.splice(i, 1);
  }
}

// Master step: the living city always moves; input only outside attract.
export function stepWorld(world, dt = DT) {
  const s = world.state;
  s.time += dt;
  if (s.sprayCd > 0) s.sprayCd -= dt;
  // Traffic brakes for the car ahead, police cruisers included.
  const police = s.cops.filter((c) => c.kind === 'car');
  const roadCars = [...s.cars, ...police];
  for (const car of s.cars) {
    if (car.disabled || car.stolen || car.parked || car.id === s.player.carId) continue;
    updateTrafficCar(car, dt, world.city, roadCars, world.rng);
  }
  for (const ped of s.peds) updatePedestrian(ped, dt, world.city, s, world.rng);
  updateEnemies(s, dt);
  updatePolice(world, dt);
  if (!world.attract) {
    const input = world.input;
    const actions = input ? input.takeActions(ACT_ENTER | ACT_PUNCH | ACT_SHOOT | ACT_HORN | ACT_MUTE) : 0;
    if ((actions & ACT_MUTE) && world.audio) world.audio.setMuted(!world.audio.isMuted());
    updateAim(world);
    if (actions & ACT_ENTER) tryEnterCar(world);
    if (actions & ACT_PUNCH) tryPunch(s);
    if (actions & ACT_SHOOT) tryShoot(s);
    if (actions & ACT_HORN) world.audio?.horn?.();
    if (s.player.inCar) stepDriving(world, dt); else stepOnFoot(world, dt);
    collideCars(world, dt);
    stepPickups(world);
    stepSpray(world);
    stepMissions(world, dt);
    stepCourier(world, dt);
  }
  // HUD + markers read these straight off the state.
  s.missionText = s.mission ? missionText(s) : '';
  s.missionTarget = s.mission ? missionTarget(s) : null;
  fadeList(s.particles, dt);
  fadeList(s.tracers, dt);
  const car = playerCar(world);
  const top = car ? (car.kind === 'sports' ? CAR.sportsMax : CAR.max) : 1;
  world.audio?.setEngine?.(s.player.inCar && car ? Math.abs(car.speed) / top : 0);
  world.audio?.setSiren?.(s.wanted > 0);
  if (s.busted || s.wasted) respawn(world);
}
