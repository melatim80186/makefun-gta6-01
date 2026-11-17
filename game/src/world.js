// world.js — SOLMAR state and step: the living city, the player on foot
// and behind the wheel, pickups, spray shops, missions, respawn.
import { PLAYER, CAR, TRAFFIC, PEDS, WANTED, MONEY, PLACES, FIXED_DT } from './config.js';
import { createRng } from './random.js';
import { createCity, collide } from './city.js';
import { saveGame, loadGame, readBest, saveBest } from './save.js';
import { createAudio } from './audio.js';
import { ACTION } from './input.js';
import { MISSIONS, startMission, updateMission, startCourier, updateCourier } from './missions.js';
import { spawnTrafficCar, spawnPedestrian, updateTrafficCar, updatePedestrian } from './traffic.js';
import { addWanted, updatePolice } from './police.js';
import { spawnEnemies, updateEnemies, tryPunch, tryShoot, damagePlayer, damageCar } from './combat.js';

function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Gameplay actions the world owns. Menus take confirm/pause/mute first in
// main.js, so the world takes only these bits and leaves the rest queued.
const GAMEPLAY_MASK = ACTION.ENTER_CAR | ACTION.PUNCH | ACTION.SHOOT | ACTION.HORN | ACTION.MUTE;

// city.js exports standalone collide(city, x, y, r), but police and
// traffic call state.city.collide(obj, r). Attach the method form here.
function attachCollide(city) {
  city.collide = (obj, r) => {
    const fixed = collide(city, obj.x, obj.y, r);
    obj.x = fixed.x;
    obj.y = fixed.y;
    return fixed;
  };
}

const AMMO_SPOTS = [[880, 720], [2080, 1440], [2880, 2160]];
const HEALTH_SPOTS = [[1680, 1080], [2480, 1800]];

// Build a fresh state object for a seed: city, player, traffic,
// pedestrians, pickups, and every counter the HUD reads.
function buildState(seed) {
  const rng = createRng(seed);
  const city = createCity(rng);
  attachCollide(city);
  const audio = createAudio();
  const spawn = city.nearestRoadPoint(PLACES.garage.x, PLACES.garage.y);
  const state = {
    time: 0, seed, rng, city, audio,
    player: {
      x: spawn.x, y: spawn.y, angle: 0, hp: PLAYER.maxHp, cash: 0, car: null,
      weapon: 'fists', ammo: 0, punchT: 0, shootT: 0, punchAnim: 0, invulnT: 0,
    },
    cars: [], peds: [], cops: [], enemies: [],
    pickups: [], particles: [], tracers: [],
    wanted: 0, quietTime: 0, coolTime: 0,
    mission: null, missionIndex: 0,
    courier: { active: false, phase: 'idle', stage: 'idle', x: 0, y: 0, timer: 0, cooldown: 0 },
    flags: { carStolen: false, cometStolen: false, defeated: 0, spawnComet: false, spawnBreakers: false },
    stats: { carsStolen: 0, missionsDone: 0, goldFound: 0, earned: 0 },
    goldFound: 0, toast: null, busted: false, wasted: false,
    storyDone: false, nextMissionIn: 3, sprayCooldown: 0,
    best: readBest(), attract: false,
  };
  for (let i = 0; i < TRAFFIC.count; i++) state.cars.push(spawnTrafficCar(city, rng));
  for (let i = 0; i < PEDS.count; i++) state.peds.push(spawnPedestrian(city, rng));
  for (const spot of city.goldSpots) state.pickups.push({ kind: 'gold', x: spot.x, y: spot.y, id: spot.id });
  for (const [x, y] of AMMO_SPOTS) state.pickups.push({ kind: 'ammo', x, y });
  for (const [x, y] of HEALTH_SPOTS) state.pickups.push({ kind: 'health', x, y });
  return state;
}

// Nearest drivable car to a point, inside maxDist, or null.
function nearestCar(state, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (car.disabled) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function createWorld(seed) {
  const s = seed == null ? (Math.random() * 0xffffffff) >>> 0 : seed >>> 0;
  const world = { state: buildState(s), camera: null };
  // Rebuild from a fresh factory call. Copy the fresh STATE object —
  // copying the world object would wipe the state entirely.
  world.reset = () => { world.state = buildState(s); };
  world.playerCar = () => {
    const p = world.state.player;
    return p && p.car ? p.car : null;
  };
  world.nearestCar = (x, y, maxDist) => nearestCar(world.state, x, y, maxDist);
  world.step = (dt, input) => stepWorld(world, dt, input);
  return world;
}

// ---- Part B: entering/exiting cars, on-foot movement ----

// E near a car steals it (traffic +1 star, police +2). E in a car parks
// it and steps out beside it.
function tryEnterExit(state) {
  const p = state.player;
  if (p.car) {
    const car = p.car;
    car.isPlayer = false; car.parked = true; car.speed = 0;
    const side = car.angle + Math.PI / 2;
    p.x = car.x + Math.cos(side) * 40;
    p.y = car.y + Math.sin(side) * 40;
    state.city.collide(p, PLAYER.radius);
    p.angle = car.angle;
    p.car = null;
    return;
  }
  let car = nearestCar(state, p.x, p.y, 64);
  let policeCar = null;
  for (const cop of state.cops) {
    if (cop.kind !== 'car' || cop.disabled) continue;
    if (dist(p.x, p.y, cop.x, cop.y) < 64) { policeCar = cop; break; }
  }
  if (policeCar && (!car || dist(p.x, p.y, policeCar.x, policeCar.y) < dist(p.x, p.y, car.x, car.y))) {
    car = policeCar;
    const idx = state.cops.indexOf(policeCar);
    if (idx >= 0) state.cops.splice(idx, 1);
    if (typeof car.cruise !== 'number') car.cruise = 130;
    state.cars.push(car);
  }
  if (!car) return;
  addWanted(state, car.isPolice ? 2 : 1);
  state.flags.carStolen = true;
  if (car.marked) state.flags.cometStolen = true;
  state.stats.carsStolen += 1;
  car.isPlayer = true; car.parked = false;
  p.car = car;
  p.x = car.x; p.y = car.y;
  p.angle = car.angle; state.audio.click();
}

// WASD/arrows on foot: walk 210, run 320 with Shift. Buildings and the
// water edge push the player back out via collide.
function stepOnFoot(state, dt, input) {
  const p = state.player;
  const dir = (input && input.direction) || { x: 0, y: 0 };
  const len = Math.hypot(dir.x, dir.y);
  if (len > 0) {
    const speed = input && input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    p.x += (dir.x / len) * speed * dt; p.y += (dir.y / len) * speed * dt;
    state.city.collide(p, PLAYER.radius);
  }
}

// Cooldown timers tick down every step, never below zero.
function tickCooldowns(state, dt) {
  const p = state.player;
  p.punchT = Math.max(0, p.punchT - dt);
  p.shootT = Math.max(0, p.shootT - dt);
  p.punchAnim = Math.max(0, p.punchAnim - dt);
  p.invulnT = Math.max(0, p.invulnT - dt);
  state.sprayCooldown = Math.max(0, state.sprayCooldown - dt);
}

// Pickups: gold +$250, ammo +24 and the pistol, health to full, cash to pocket.
function collectPickups(state) {
  const p = state.player;
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    const pk = state.pickups[i];
    if (dist(p.x, p.y, pk.x, pk.y) >= 44) continue;
    state.pickups.splice(i, 1);
    if (pk.kind === 'gold') {
      p.cash += MONEY.goldValue;
      state.stats.goldFound += 1; state.goldFound += 1;
      state.stats.earned += MONEY.goldValue;
      const spot = state.city.goldSpots[pk.id];
      if (spot) spot.found = true;
      state.toast = { text: 'Gold bar found — +$' + MONEY.goldValue, t: 3 };
      state.audio.cash();
    } else if (pk.kind === 'ammo') {
      p.weapon = 'pistol'; p.ammo += 24;
      state.toast = { text: 'Pistol — 24 rounds', t: 3 };
      state.audio.pickup();
    } else if (pk.kind === 'health') {
      p.hp = PLAYER.maxHp;
      state.toast = { text: 'Health restored', t: 3 };
      state.audio.pickup();
    } else if (pk.kind === 'cash') {
      const amount = pk.amount || 0;
      p.cash += amount;
      state.stats.earned += amount;
      state.audio.cash();
    }
  }
}

// Lay Low Motors: in a car, wanted, $100 in hand, on the pad — heat gone, cash gone.
function trySpray(state) {
  const p = state.player;
  if (!p.car || state.wanted <= 0 || state.sprayCooldown > 0 || p.cash < MONEY.sprayCost) return;
  const pads = [PLACES.sprayNorth, PLACES.spraySouth];
  for (const pad of pads) {
    if (dist(p.x, p.y, pad.x, pad.y) < 100) {
      state.wanted = 0; p.cash -= MONEY.sprayCost; state.sprayCooldown = 12;
      state.toast = { text: 'Lay Low — heat cleared, -$' + MONEY.sprayCost, t: 3 };
      state.audio.cash();
      return;
    }
  }
}

// Keep the courier's two views in sync: missions.js drives `stage`,
// the HUD/minimap read `phase` + `active`.
function syncCourier(state) {
  const c = state.courier;
  if (!c || !c.stage) return;
  c.phase = c.stage;
  c.active = c.stage === 'pickup' || c.stage === 'delivery';
}

// ---- Part C: driving, collisions, respawn ----

// Arcade driving: accel, brake/reverse, drag, speed-scaled steering, handbrake drift.
function stepDriving(state, dt, input) {
  const p = state.player; const car = p.car;
  if (!car) return;
  const maxSpeed = car.kind === 'sports' ? CAR.sportsMaxSpeed : CAR.maxSpeed;
  if (input.accelerate) car.speed += CAR.accel * dt;
  if (input.brake) car.speed -= (car.speed > 0 ? CAR.brake : CAR.accel) * dt;
  const drag = input.handbrake ? 0.15 : CAR.drag;
  car.speed -= car.speed * drag * dt;
  car.speed = clamp(car.speed, -CAR.reverseMax, maxSpeed);
  const steerScale = clamp(Math.abs(car.speed) / 260, 0, 1), steerBoost = input.handbrake ? 1.5 : 1;
  const steer = (input.direction ? input.direction.x : 0) * CAR.steer * steerScale * steerBoost;
  car.angle += steer * Math.sign(car.speed || 1) * dt;
  car.x += Math.cos(car.angle) * car.speed * dt; car.y += Math.sin(car.angle) * car.speed * dt;
  const beforeX = car.x; const beforeY = car.y;
  state.city.collide(car, 26);
  if (dist(beforeX, beforeY, car.x, car.y) > 0.5) {
    if (Math.abs(car.speed) > 300) {
      damageCar(state, car, Math.round((Math.abs(car.speed) - 300) / 10)); state.audio.crash();
    }
    car.speed *= 0.3;
  }
  p.x = car.x; p.y = car.y; p.angle = car.angle;
}

// Car–car bumps: push apart, share speed, damage over relative 180.
function collideCars(state) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i]; const b = cars[j];
      let dx = b.x - a.x; let dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      if (d >= 48) continue;
      if (d < 0.01) { dx = 1; dy = 0; d = 1; }
      const nx = dx / d; const ny = dy / d;
      const push = (48 - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      const avx = Math.cos(a.angle) * a.speed, avy = Math.sin(a.angle) * a.speed;
      const bvx = Math.cos(b.angle) * b.speed, bvy = Math.sin(b.angle) * b.speed;
      const closing = Math.abs((bvx - avx) * nx + (bvy - avy) * ny);
      const avg = (a.speed + b.speed) / 2;
      a.speed = avg; b.speed = avg;
      if (closing > 180) {
        const dmg = Math.round((closing - 180) / 20);
        damageCar(state, a, dmg);
        damageCar(state, b, dmg);
        state.audio.crash();
      }
    }
  }
}

// Running over a pedestrian floors them and adds a star.
function runOverPeds(state) {
  const car = state.player.car;
  if (!car || Math.abs(car.speed) < 60) return;
  for (const ped of state.peds) {
    if (ped.down) continue;
    if (dist(car.x, car.y, ped.x, ped.y) < 36) {
      ped.down = true; ped.downT = 4;
      addWanted(state, 1);
      state.audio.punch();
    }
  }
}

// Ramming a police car damages it (+1 star, once per second); on foot, a fast police car hurts the player.
function ramPolice(state, dt) {
  const car = state.player.car;
  for (const cop of state.cops) {
    if (cop.kind !== 'car') continue;
    cop.ramCd = Math.max(0, (cop.ramCd || 0) - dt);
    const d = dist(state.player.x, state.player.y, cop.x, cop.y);
    if (car) {
      if (d >= 48) continue;
      const nx = (cop.x - car.x) / (d || 1); const ny = (cop.y - car.y) / (d || 1);
      cop.x += nx * (48 - d); cop.y += ny * (48 - d);
      if (Math.abs(car.speed) > 120 && cop.ramCd <= 0) {
        damageCar(state, cop, 20);
        addWanted(state, 1);
        cop.ramCd = 1;
        car.speed *= 0.7;
        state.audio.crash();
      }
    } else if (d < 34 && Math.abs(cop.speed || 0) > 150) {
      const nx = (state.player.x - cop.x) / (d || 1); const ny = (state.player.y - cop.y) / (d || 1);
      state.player.x += nx * 20; state.player.y += ny * 20;
      state.city.collide(state.player, PLAYER.radius);
      damagePlayer(state, 8);
    }
  }
}

// Busted or wasted: fine, respawn at garage/hospital, heat cleared, cops gone, job blown.
// The flag stays set until main.js shows the screen and clears it on Enter.
function respawn(state) {
  const p = state.player;
  const wasted = !!state.wasted;
  const fine = Math.min(MONEY.bustFine, Math.floor(p.cash * 0.1));
  p.cash -= fine;
  if (p.car) {
    p.car.isPlayer = false; p.car.parked = true; p.car.speed = 0;
    p.car = null;
  }
  const home = wasted ? PLACES.hospital : PLACES.garage;
  const spawn = state.city.nearestRoadPoint(home.x, home.y);
  p.x = spawn.x; p.y = spawn.y;
  p.hp = PLAYER.maxHp;
  p.invulnT = 2;
  state.wanted = 0; state.cops.length = 0;
  if (state.mission) { state.mission = null; state.nextMissionIn = 6; }
  state.toast = { text: (wasted ? 'WASTED' : 'BUSTED') + ' — $' + fine + ' gone.', t: 4 };
  state.audio.busted();
  saveGame(state);
}

// ---- Part D: missions, master step ----

// Mission spawns run once each; complete pays out and chains the next
// job, failed retries the same one after 6 s.
function stepMissions(state, dt) {
  if (state.flags.spawnComet) {
    state.flags.spawnComet = false;
    state.cars.push({ x: PLACES.sportsCar.x, y: PLACES.sportsCar.y, angle: 0, speed: 0, cruise: 0, kind: 'sports', color: '#f7c948', len: 52, wid: 26, hp: 100, isPlayer: false, isPolice: false, marked: true, parked: true });
  }
  if (state.flags.spawnBreakers) {
    state.flags.spawnBreakers = false;
    spawnEnemies(state, PLACES.turf.x, PLACES.turf.y, 3);
  }
  if (state.mission) {
    const res = updateMission(state, dt);
    if (res === 'complete') {
      const reward = state.mission.job.reward;
      state.player.cash += reward;
      state.stats.missionsDone += 1; state.stats.earned += reward;
      state.missionIndex += 1; state.mission = null;
      if (state.missionIndex >= MISSIONS.length) { state.storyDone = true; state.nextMissionIn = 0; }
      else state.nextMissionIn = 4;
      state.toast = { text: 'Job complete — +$' + reward, t: 4 };
      state.audio.missionDone();
      saveGame(state);
    } else if (res === 'failed') {
      state.mission = null;
      state.nextMissionIn = 6;
      state.toast = { text: 'Job failed — Vera wants another run.', t: 4 };
    }
    return;
  }
  if (!state.storyDone && state.missionIndex < MISSIONS.length) {
    state.nextMissionIn -= dt;
    if (state.nextMissionIn <= 0) startMission(state, state.missionIndex);
  }
}

// Master step: time, toast, always-on street life, then — unless
// attract mode — input, aim, actions, player, collisions, pickups,
// spray, missions, courier, effects, audio, respawn.
function stepWorld(world, dt, input) {
  const state = world.state;
  if (!state || !(dt > 0)) return;
  state.time += dt;
  if (typeof state.toast === 'string') state.toast = { text: state.toast, t: 3 };
  if (state.toast && typeof state.toast === 'object') { state.toast.t = (state.toast.t == null ? 3 : state.toast.t) - dt; if (state.toast.t <= 0) state.toast = null; }
  const city = state.city;
  const cars = state.cars;
  for (const car of cars) {
    if (!car.isPlayer && !car.parked && !car.disabled) updateTrafficCar(car, dt, city, cars);
  }
  for (const ped of state.peds) updatePedestrian(ped, dt, city, state.player, state.wanted);
  updateEnemies(state, dt);
  updatePolice(state, dt);
  if (state.attract) return;
  const inputObj = input || {};
  const p = state.player;
  let aim = { x: p.x + Math.cos(p.angle) * 60, y: p.y + Math.sin(p.angle) * 60 };
  const mouse = inputObj.mouse || { x: 0, y: 0 };
  if (world.camera && typeof world.camera.screenToWorld === 'function') {
    try { const w = world.camera.screenToWorld(mouse.x, mouse.y); if (w && typeof w.x === 'number') aim = w; } catch (e) {}
  }
  const aimAngle = Math.atan2(aim.y - p.y, aim.x - p.x);
  if (!p.car) p.angle = aimAngle;
  let acts = 0;
  if (inputObj.takeActions) {
    try { acts = inputObj.takeActions(GAMEPLAY_MASK) || 0; } catch (e) { acts = 0; }
  }
  if (acts & ACTION.MUTE) state.audio.setMuted(!state.audio.isMuted());
  if (acts & ACTION.ENTER_CAR) tryEnterExit(state);
  if ((acts & ACTION.PUNCH) && !p.car) tryPunch(state);
  if ((acts & ACTION.SHOOT) && !p.car) tryShoot(state, aim.x, aim.y);
  if ((acts & ACTION.HORN) && p.car) state.audio.horn();
  if (p.car) stepDriving(state, dt, inputObj);
  else stepOnFoot(state, dt, inputObj);
  tickCooldowns(state, dt);
  collideCars(state);
  runOverPeds(state);
  ramPolice(state, dt);
  collectPickups(state);
  trySpray(state);
  stepMissions(state, dt);
  updateCourier(state, dt);
  syncCourier(state);
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.t -= dt;
    if (pt.vx) pt.x += pt.vx * dt;
    if (pt.vy) pt.y += pt.vy * dt;
    if (pt.t <= 0) state.particles.splice(i, 1);
  }
  for (let i = state.tracers.length - 1; i >= 0; i--) {
    const tr = state.tracers[i];
    tr.t -= dt;
    if (tr.t <= 0) state.tracers.splice(i, 1);
  }
  const car = p.car;
  const top = car ? (car.kind === 'sports' ? CAR.sportsMaxSpeed : CAR.maxSpeed) : 1;
  state.audio.setEngine(car ? Math.abs(car.speed) / top : 0, !!car);
  state.audio.setSiren(state.wanted > 0);
  if (state.busted || state.wasted) {
    if (!state._respawned) { respawn(state); state._respawned = true; }
  } else {
    state._respawned = false;
  }
}
