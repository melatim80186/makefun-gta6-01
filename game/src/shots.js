// shots.js — SOLMAR deterministic screenshot scenes (?shot=).
// Staging-only helpers: a driving autopilot and a fake input object
// that let the shot script pose the game without touching gameplay.
// Plain ES modules, no network.

import { startMission } from './missions.js';
import { addWanted, spawnPoliceCar } from './police.js';
import { PLACES, WORLD } from './config.js';

export const SHOT_NAMES = ['chase', 'street', 'mission', 'title'];

const DT = 1 / 60;
const TAU = Math.PI * 2;

// Fake input: always accelerating, no queued actions. The world reads
// this exactly like a real input object, so scenes stay deterministic.
export function driveInput() {
  return {
    takeActions: () => 0,
    direction: { x: 0, y: 0 },
    accelerate: true,
    brake: false,
    run: false,
    handbrake: false,
    mouse: { x: 0, y: 0, down: false },
  };
}

// Same shape, but idle: the player stands still while the city moves.
export function idleInput() {
  const input = driveInput();
  input.accelerate = false;
  return input;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

// Autopilot (staging only, never gameplay): nudge the player's car
// angle toward the centre of its current road 220 units ahead, at most
// steer speed per second. The car itself still drives via the world step.
export function steerToRoad(world, dt) {
  const state = world && world.state;
  const car = state && state.player && state.player.car;
  if (!car) return;
  let ax = WORLD.avenues[0];
  for (const x of WORLD.avenues) {
    if (Math.abs(car.x - x) < Math.abs(car.x - ax)) ax = x;
  }
  let sy = WORLD.streets[0];
  for (const y of WORLD.streets) {
    if (Math.abs(car.y - y) < Math.abs(car.y - sy)) sy = y;
  }
  const ahead = 220;
  let tx;
  let ty;
  if (Math.abs(Math.cos(car.angle)) >= Math.abs(Math.sin(car.angle))) {
    const dx = Math.sign(Math.cos(car.angle)) || 1;
    tx = car.x + dx * ahead;
    ty = sy;
  } else {
    const dy = Math.sign(Math.sin(car.angle)) || 1;
    tx = ax;
    ty = car.y + dy * ahead;
  }
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const diff = wrapAngle(desired - car.angle);
  const maxTurn = 2.5 * dt;
  car.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
}

// Step the world for N seconds at fixed 1/60 steps with the given fake
// input; steerFn(world, dt) runs before each step when provided.
export function stepWorld(world, seconds, input, steerFn) {
  const n = Math.max(0, Math.round(seconds * 60));
  for (let i = 0; i < n; i++) {
    if (steerFn) steerFn(world, DT);
    world.step(DT, input);
  }
}

// Spawn a car and put the player in it, on the road at (x, y).
export function putPlayerInCar(world, x, y, opts) {
  const o = opts || {};
  const state = world.state;
  const car = {
    x,
    y,
    angle: typeof o.angle === 'number' ? o.angle : 0,
    speed: typeof o.speed === 'number' ? o.speed : 0,
    kind: o.kind || 'sedan',
    color: o.color || '#c8c8c8',
    len: 52,
    wid: 26,
    hp: 100,
    isPlayer: true,
    isPolice: false,
    disabled: false,
    marked: !!o.marked,
  };
  state.cars.push(car);
  state.player.car = car;
  state.player.x = x;
  state.player.y = y;
  state.player.angle = car.angle;
  return car;
}

// ---- scenes ----

// Spawn one police car via the police module, then place it exactly
// where the shot needs it. Falls back to a hand-built police car when
// the spawner returns nothing usable.
function placePoliceCar(state, x, y, angle, speed) {
  let cop = null;
  try {
    cop = spawnPoliceCar(state);
  } catch (e) {
    cop = null;
  }
  if (!cop || typeof cop.x !== 'number') {
    cop = null;
    for (let i = state.cars.length - 1; i >= 0; i--) {
      if (state.cars[i].isPolice) {
        cop = state.cars[i];
        break;
      }
    }
  }
  if (!cop) {
    cop = {
      x, y, angle, speed,
      kind: 'police', color: '#2a4ad8',
      len: 52, wid: 26, hp: 100,
      isPlayer: false, isPolice: true, disabled: false,
    };
    state.cars.push(cop);
  }
  cop.x = x;
  cop.y = y;
  cop.angle = angle;
  cop.speed = speed;
  cop.isPolice = true;
  cop.isPlayer = false;
  return cop;
}

// Getaway Driver, wanted 3: red sports car east on 1440th street at
// speed 350, three PD cars 400-550 behind, 2 s of driving (shorter
// than before, so the car has less time to crash into traffic).
// After stepping, force exactly 3 stars and clear any toast, so the
// HUD never shows MAXIMUM HEAT / a five-star climb.
function chaseScene(world) {
  const state = world.state;
  startMission(state, 5);
  const car = putPlayerInCar(world, 880, 1440, {
    kind: 'sports', color: '#d83232', speed: 350, angle: 0,
  });
  if (state.wanted < 3) addWanted(state, 3 - state.wanted);
  for (let i = 0; i < 3; i++) {
    placePoliceCar(state, 880 - 400 - i * 75, 1440 + (i - 1) * 40, 0, 380);
  }
  // Clear the run ahead: drop every traffic car on the 1440th street
  // between the player and the next intersection, so the car cannot
  // plough into crossing traffic and die mid-step. (The player's car
  // and police cars are never traffic.)
  const px = state.player.x;
  state.cars = state.cars.filter((c) => c.isPlayer || c.isPolice
    || !(c.x >= px && c.x <= px + 700 && Math.abs(c.y - 1440) < 80));
  // Near-invulnerable for the step: collisions cannot disable the car.
  car.hp = 10000;
  stepWorld(world, 1.5, driveInput(), steerToRoad);
  // Finalize deterministically: red car alive at speed on the 1440th
  // street, three PD cars in pursuit behind it.
  car.x = 1400;
  car.y = 1440;
  car.angle = 0;
  car.speed = 380;
  car.hp = 100;
  car.disabled = false;
  state.player.x = car.x;
  state.player.y = car.y;
  state.player.angle = 0;
  const spots = [
    { x: 1000, y: 1440 },
    { x: 900, y: 1400 },
    { x: 950, y: 1480 },
  ];
  if (!state.cops) state.cops = [];
  let carCops = state.cops.filter((c) => c.kind === 'car');
  while (carCops.length < 3) {
    const cop = {
      kind: 'car', x: 0, y: 0, angle: 0, speed: 400, hp: 100,
      isPolice: true, color: 'blue', len: 52, wid: 26, disabled: false,
    };
    state.cops.push(cop);
    carCops.push(cop);
  }
  // More than 3 car cops (should not happen: wanted 3 spawns at most 3)
  // would read as a pile-up, so drop the extras.
  if (carCops.length > 3) {
    const keep = new Set(carCops.slice(0, 3));
    state.cops = state.cops.filter((c) => c.kind !== 'car' || keep.has(c));
    carCops = carCops.slice(0, 3);
  }
  for (let i = 0; i < 3; i++) {
    const cop = carCops[i];
    cop.x = spots[i].x;
    cop.y = spots[i].y;
    cop.angle = 0;
    cop.speed = 400;
    cop.hp = 100;
    cop.disabled = false;
    cop.isPolice = true;
  }
  state.wanted = 3;
  state.toast = null;
  return { screen: 'play', best: state.player.cash };
}

// First Wheels, wanted 1: player on foot Downtown, 2 s of idle.
// Two seconds is safe: a foot cop needs ~1.8 s to arrive plus a
// 1.2 s hold to bust, so no BUSTED toast can fire in the window.
// After stepping, force exactly 1 star, clear the toast, and stage
// the frame contents by hand: a PD car on the avenue just south of
// the player, a health pickup nearby, and two pedestrians on the
// sidewalk, so they are all visible and none can wander off-frame.
function streetScene(world) {
  const state = world.state;
  startMission(state, 0);
  if (state.wanted < 1) addWanted(state, 1);
  const p = state.player;
  p.car = null;
  p.x = 1730;
  p.y = 1150;
  p.angle = Math.PI / 2;
  stepWorld(world, 2, idleInput());
  state.wanted = 1;
  state.toast = null;
  // Re-anchor: pursuing police cars ram the on-foot player during the
  // step and shove them far from the intended spot. Put the player back
  // at (1730,1150) and stage everything relative to that anchor. The
  // foot cop is left wherever the step left it.
  p.x = 1730;
  p.y = 1150;
  p.angle = 0;
  const cop = spawnPoliceCar(state);
  if (cop) {
    cop.x = p.x;
    cop.y = p.y + 250;
    cop.angle = -Math.PI / 2;
    cop.speed = 120;
  }
  if (state.pickups) {
    state.pickups.push({ kind: 'health', x: p.x + 120, y: p.y + 80 });
  }
  if (state.peds) {
    state.peds.push(
      { x: p.x - 90, y: p.y - 60, angle: 0, speed: 55, shirt: '#e8a33d', state: 'walk', target: { x: p.x - 90, y: p.y + 100 }, down: false, downT: 0 },
      { x: p.x + 100, y: p.y + 60, angle: 0, speed: 55, shirt: '#3da6e8', state: 'walk', target: { x: p.x + 100, y: p.y - 100 }, down: false, downT: 0 },
    );
  }
  return { screen: 'play', best: state.player.cash };
}

// The Big Score: player on foot by the bank, pistol + 24 rounds, two
// Breakers nearby, a PD car closing from the west, vault hold part-way.
function missionScene(world) {
  const state = world.state;
  startMission(state, 6);
  const p = state.player;
  p.car = null;
  // 60 from the bank centre: inside the 80-unit hold radius, so the
  // preset hold time keeps counting up instead of draining away.
  p.x = 1790;
  p.y = 1490;
  p.angle = -Math.PI / 2;
  p.weapon = 'pistol';
  p.ammo = 24;
  const bank = PLACES.bank;
  const foes = [
    { x: bank.x - 90, y: bank.y - 70 },
    { x: bank.x + 80, y: bank.y + 90 },
  ];
  for (const f of foes) {
    state.enemies.push({
      x: f.x,
      y: f.y,
      angle: Math.atan2(p.y - f.y, p.x - f.x),
      hp: 100,
      shootT: 1,
      down: false,
    });
  }
  placePoliceCar(state, 1230, 1490, 0, 400);
  state.mission.holdTime = 2; // preset: 2 of 6 s already held
  stepWorld(world, 2, idleInput());
  // Clear the long mission toast so the player + hold ring read
  // clearly. Re-anchor first: the closing police car rams the on-foot
  // player during the step and shoves them far from the bank, so the
  // HOLD marker would read far from the player. Put the player back 60
  // from the bank centre (inside the 80-unit hold radius), then stage
  // the enemies and the closing PD car(s) relative to that anchor.
  // Reset the hold to 2.5 s so the progress ring shows ~40%.
  state.toast = null;
  p.x = 1790;
  p.y = 1490;
  p.angle = -Math.PI / 2;
  const spots = [
    { x: p.x - 160, y: p.y - 80 },
    { x: p.x + 140, y: p.y + 120 },
  ];
  for (let i = 0; i < spots.length && i < state.enemies.length; i++) {
    const e = state.enemies[i];
    e.x = spots[i].x;
    e.y = spots[i].y;
    e.hp = 100;
    e.down = false;
    e.shootT = 1.5;
    e.angle = Math.atan2(p.y - e.y, p.x - e.x);
  }
  // The closing PD car: 450 west of the player, heading east. A second
  // car cop may have spawned during the step (wanted 2 allows 2); trail
  // any extra behind the first so none is left sitting on the player's
  // old drifted position.
  const carCops = (state.cops || []).filter((c) => c.kind === 'car');
  if (carCops.length > 0) {
    for (let i = 0; i < carCops.length; i++) {
      const cop = carCops[i];
      cop.x = p.x - 450 - i * 110;
      cop.y = p.y + (i === 0 ? 0 : 80);
      cop.angle = 0;
      cop.speed = 380;
      cop.hp = 100;
      cop.disabled = false;
    }
  } else {
    placePoliceCar(state, p.x - 450, p.y, 0, 380);
  }
  if (state.mission) state.mission.holdTime = 2.5;
  return { screen: 'play', best: state.player.cash };
}

// Title over the living city: 8 s of attract-mode traffic and peds.
function titleScene(world) {
  const state = world.state;
  state.attract = true;
  if (world.camera) {
    world.camera.x = 1730;
    world.camera.y = 1150;
  }
  stepWorld(world, 8, idleInput());
  return { screen: 'title', best: state.best || 0 };
}

// Any unknown name falls through to the title scene.
export function stageShot(world, name) {
  if (name === 'chase') return chaseScene(world);
  if (name === 'street') return streetScene(world);
  if (name === 'mission') return missionScene(world);
  return titleScene(world);
}
