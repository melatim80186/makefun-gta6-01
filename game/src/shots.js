// shots.js — deterministic screenshot scenes for SOLMAR (?shot=<name>&seed=1).
// Each scene stages one fixed moment of the game, steps the world a few
// seconds so traffic, police and particles settle, then hands back the
// screen the painter should draw. Nothing here rolls dice at run time:
// the seed already fixed the city, so the same query frames the same shot.

import { startMission } from './missions.js';
import { addWanted } from './police.js';
import { AVENUES, STREETS } from './config.js';

const DT = 1 / 60;
const FIRST_JOB = 0; // First Wheels
const CHASE_JOB = 5; // Getaway Driver
const BIG_SCORE_JOB = 6; // The Big Score

// Fake input for staged scenes: always accelerating, never acting.
// It speaks the same method shape as the real keyboard input, and the
// driving scenes steer it by replacing the direction it returns.
function makeFakeInput() {
  let dir = { x: 0, y: 0 };
  return {
    direction: () => dir,
    setDirection(d) { dir = d; },
    accelerate: () => true,
    brake: () => false,
    run: () => false,
    handbrake: () => false,
    mouse: { x: 640, y: 360, down: false },
    takeActions: () => 0,
  };
}

// Driving autopilot: hold the road the car is travelling along and
// steer back onto it when pushed off. The road is picked by distance
// off its centreline, discounted by how well its direction matches the
// car's heading — a car heading east belongs on a street even when an
// avenue is nearer, or it turns into a block. The return value is a
// steering signal, not a world direction: the signed turn from the
// car's heading toward the target point, so left/right come out right.
function autopilotDirection(world) {
  const s = world.state;
  const car = s.player.car;
  if (!car) return { x: 1, y: 0 };
  let ax = AVENUES[0], ad = Infinity;
  for (const x of AVENUES) { const d = Math.abs(car.x - x); if (d < ad) { ad = d; ax = x; } }
  let sy = STREETS[0], sd = Infinity;
  for (const y of STREETS) { const d = Math.abs(car.y - y); if (d < sd) { sd = d; sy = y; } }
  const heading = car.angle;
  const avenueAngle = Math.sin(heading) >= 0 ? Math.PI / 2 : -Math.PI / 2;
  const streetAngle = Math.cos(heading) >= 0 ? 0 : Math.PI;
  const avenueScore = ad - 240 * Math.abs(Math.cos(avenueAngle - heading));
  const streetScore = sd - 240 * Math.abs(Math.cos(streetAngle - heading));
  let tx, ty;
  if (avenueScore < streetScore) {
    tx = ax + Math.cos(avenueAngle) * 220;
    ty = car.y + Math.sin(avenueAngle) * 220;
  } else {
    tx = car.x + Math.cos(streetAngle) * 220;
    ty = sy + Math.sin(streetAngle) * 220;
  }
  const want = Math.atan2(ty - car.y, tx - car.x);
  const steer = Math.max(-1, Math.min(1, Math.sin(want - heading) * 2));
  return { x: steer, y: 0 };
}

// Step the world for N seconds at the fixed 60 Hz step, steering with
// the autopilot while the player is driving, standing still otherwise.
// The fake input is swapped in for the duration and the real input is
// restored after, so the staged scene never touches the keyboard.
function stepWorld(world, seconds, input) {
  const steps = Math.round(seconds / DT);
  const prev = world.input;
  world.input = input;
  for (let i = 0; i < steps; i++) {
    if (world.state.player.car) input.setDirection(autopilotDirection(world));
    world.step(DT);
  }
  world.input = prev;
}

// Spawn a car at (x, y) and put the player in the driver's seat at speed.
function putPlayerInCar(world, x, y, angle, speed, kind, color) {
  const s = world.state;
  const car = {
    id: s.ids.car++,
    x, y, angle, speed,
    kind, color,
    hp: 100, maxSpeed: kind === 'sports' ? 660 : 520,
    stolen: true,
  };
  s.cars.push(car);
  s.player.car = car;
  s.player.carId = car.id;
  s.player.inCar = true;
  s.player.x = x;
  s.player.y = y;
  s.player.angle = angle;
  return car;
}

// Park a police car at an exact spot, lights on, already chasing.
// Police live in the cops list (kind 'car'), so the pursuit update
// drives them at the player instead of the traffic update.
function placePoliceCar(world, x, y, angle, speed) {
  const car = {
    kind: 'car', police: true,
    x, y, angle, speed,
    hp: 100, maxSpeed: 560, r: 20, bust: 0,
  };
  world.state.cops.push(car);
  return car;
}

// Drop one armed gang member on foot at (x, y), facing the player.
function placeEnemy(world, x, y) {
  const s = world.state;
  const enemy = {
    x, y,
    angle: Math.atan2(s.player.y - y, s.player.x - x),
    hp: 100, shootCd: 1.0, speed: 130, down: false,
  };
  s.enemies.push(enemy);
  return enemy;
}

// The cash record the HUD shows next to the title screen.
function bestScore(world) {
  const s = world.state;
  return s.bestCash || (s.stats && s.stats.bestCash) || 0;
}

// Cover: Getaway Driver, wanted 3. Red sports car mid-street east at
// 350, three police cars 300–460 behind it, 2 s of driving — long
// enough to settle, short enough the cruisers trail in frame instead
// of piling onto the player or falling off the left edge.
function sceneChase(world) {
  startMission(world.state, CHASE_JOB);
  putPlayerInCar(world, 1150, 1440, 0, 350, 'sports', '#d21f2b');
  placePoliceCar(world, 850, 1440, 0, 330);
  placePoliceCar(world, 770, 1470, 0, 320);
  placePoliceCar(world, 690, 1410, 0, 310);
  stepWorld(world, 2, makeFakeInput());
  return { screen: 'play', best: bestScore(world) };
}

// On foot Downtown at an intersection, wanted 1, traffic and peds
// moving around the player. 2 s so the scene settles — longer and the
// foot cop that spawns with the star reaches the standing player and
// busts them mid-shot (4 s did exactly that).
function sceneStreet(world) {
  const s = world.state;
  startMission(world.state, FIRST_JOB);
  addWanted(world, 1);
  s.player.x = 1730;
  s.player.y = 1150;
  s.player.angle = 0;
  stepWorld(world, 2, makeFakeInput());
  return { screen: 'play', best: bestScore(world) };
}

// The Big Score: player on foot by the bank (1730, 1490) with the pistol
// and 24 rounds, 2 enemies nearby, a police car closing in, vault hold
// already 2 of 6 s in. 2 s so tracers and the ring read on camera.
function sceneMission(world) {
  const s = world.state;
  startMission(world.state, BIG_SCORE_JOB);
  // Inside the vault hold radius (bank 1730,1490, r 80) so the preset
  // 2 s of hold actually accumulates and the progress ring draws.
  s.player.x = 1730;
  s.player.y = 1450;
  s.player.angle = Math.PI / 2;
  s.player.weapon = 'pistol';
  s.player.ammo = 24;
  placeEnemy(world, 1650, 1380);
  placeEnemy(world, 1810, 1420);
  placePoliceCar(world, 1500, 1490, 0, 300);
  if (s.mission) s.mission.hold = 2;
  stepWorld(world, 2, makeFakeInput());
  return { screen: 'play', best: bestScore(world) };
}

// Title over the living city: 8 s of attract-mode traffic and peds
// with the camera parked Downtown. The camera follows the player, so
// the player is parked Downtown too. Any unknown name lands here too.
function sceneTitle(world) {
  const s = world.state;
  world.attract = true;
  s.player.x = 1850;
  s.player.y = 1275;
  stepWorld(world, 8, makeFakeInput());
  return { screen: 'title', best: bestScore(world) };
}

// Stage one named scene and return the screen to draw plus the best score.
export function stageShot(name, world) {
  if (name === 'chase') return sceneChase(world);
  if (name === 'street') return sceneStreet(world);
  if (name === 'mission') return sceneMission(world);
  return sceneTitle(world);
}
