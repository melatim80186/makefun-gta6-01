// SOLMAR — world state and step: the city, the player, cars, missions.
// Built fresh from the spec: fixed-step state, arcade driving, wanted heat,
// and the NaN guards that keep a bad tick from poisoning the whole run.
import { DT, WORLD_W, WORLD_H, PLAYER, CAR, TRAFFIC, PEDS, MONEY, PLACES } from './config.js';
import { createRng } from './random.js';
import { createCity } from './city.js';
import { spawnTrafficCar, spawnPedestrian, updateTrafficCar, updatePedestrian } from './traffic.js';
import { addWanted, updatePolice } from './police.js';
import { spawnEnemies, tryPunch, tryShoot, damagePlayer, updateEnemies, damageCar } from './combat.js';
import { MISSIONS, startMission, updateMission, startCourier, updateCourier } from './missions.js';
import { saveGame } from './save.js';
import { ACTIONS } from './input.js';

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function showToast(S, text, time) {
  S.toastText = text;
  S.toastTime = time || 2.5;
}

function autosave(S) {
  saveGame({
    cash: S.player.cash,
    missionIndex: S.nextMissionIndex,
    goldFound: [...S.stats.goldFound],
    px: S.player.x,
    py: S.player.y,
    carsStolen: S.stats.carsStolen,
    missionsDone: S.stats.missionsDone,
    storyDone: S.storyDone,
  });
}

function nearestCar(S, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of S.cars) {
    if (car.disabled) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function createWorld(seed) {
  const rng = createRng(seed);
  const city = createCity(rng);
  const S = {
    seed, rng, city, time: 0,
    player: {
      x: 1030, y: 540, angle: 0, hp: 100, cash: 0, car: null,
      weapon: 'none', ammo: 0, punchCd: 0, shootCd: 0, invuln: 0,
      onFoot: true, r: 13,
    },
    cars: [], peds: [], cops: [], enemies: [], pickups: [],
    particles: [], tracers: [],
    wanted: 0, quietTime: 0, decayTimer: 0, mission: null,
    courier: { phase: 'idle', x: 0, y: 0, tx: 0, ty: 0, timer: 0, cooldown: 0 },
    flags: { stole: false, stoleMarked: false, spawnMarked: false, spawnEnemiesAt: null },
    stats: { carsStolen: 0, missionsDone: 0, goldFound: [], kills: 0 },
    toastText: '', toastTime: 0, busted: false, wasted: false, storyDone: false,
    nextMissionIn: 3, nextMissionIndex: 0, sprayCd: 0,
    audio: null, camera: null, attract: false,
  };
  for (let i = 0; i < TRAFFIC.count; i++) {
    const car = spawnTrafficCar(city, rng);
    if (car) { car.r = 26; S.cars.push(car); }
  }
  for (let i = 0; i < PEDS.count; i++) {
    const ped = spawnPedestrian(city, rng);
    if (ped) S.peds.push(ped);
  }
  for (let i = 0; i < 12; i++) {
    const spot = city.goldSpots[i];
    if (spot) S.pickups.push({ kind: 'gold', x: spot.x, y: spot.y, amount: MONEY.gold, id: 'gold' + i });
  }
  for (let i = 0; i < 3; i++) {
    const p = city.randomRoadPoint(rng);
    if (p) S.pickups.push({ kind: 'ammo', x: p.x, y: p.y, amount: 24, id: 'ammo' + i });
  }
  for (let i = 0; i < 2; i++) {
    const p = city.randomRoadPoint(rng);
    if (p) S.pickups.push({ kind: 'health', x: p.x, y: p.y, amount: 0, id: 'health' + i });
  }
  return S;
}

// Enter the nearest car, or step out beside the one the player is driving.
function enterExitCar(S) {
  const p = S.player;
  if (p.car) {
    const car = p.car;
    const side = car.angle + Math.PI / 2;
    p.x = car.x + 40 * Math.cos(side);
    p.y = car.y + 40 * Math.sin(side);
    p.angle = car.angle;
    car.isPlayer = false;
    car.speed = 0;
    p.car = null;
    p.onFoot = true;
    S.city.collide(p);
    return;
  }
  const car = nearestCar(S, p.x, p.y, 64);
  if (!car) return;
  if (car.isPolice) addWanted(S, 2);
  else if (!car.owned) addWanted(S, 1);
  if (!car.owned) {
    S.stats.carsStolen++;
    S.flags.stole = true;
  }
  car.owned = true;
  if (car.marked) S.flags.stoleMarked = true;
  p.car = car;
  car.isPlayer = true;
  p.onFoot = false;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
}

export function stepWorld(S, ctl, dt) {
  const p = S.player;
  S.time += dt;
  if (S.toastTime > 0) S.toastTime = Math.max(0, S.toastTime - dt);
  if (S.sprayCd > 0) S.sprayCd = Math.max(0, S.sprayCd - dt);
  if (p.punchCd > 0) p.punchCd = Math.max(0, p.punchCd - dt);
  if (p.shootCd > 0) p.shootCd = Math.max(0, p.shootCd - dt);
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);

  // Always alive, even in attract mode or after busted/wasted.
  for (const car of S.cars) {
    if (!car.isPlayer && !car.disabled) updateTrafficCar(car, dt, S.city, S.cars);
  }
  const danger = {
    x: p.x, y: p.y,
    active: S.wanted > 0 || (p.car && Math.abs(p.car.speed) > 60),
  };
  for (const ped of S.peds) updatePedestrian(ped, dt, S.city, danger);
  updateEnemies(S, dt);
  updatePolice(S, dt);

  if (S.attract || S.busted || S.wasted) {
    fadeEffects(S, dt);
    return;
  }

  const acts = ctl.actions || 0;
  if (acts & ACTIONS.ENTER) enterExitCar(S);
  if (acts & ACTIONS.PUNCH) tryPunch(S);
  if (acts & ACTIONS.SHOOT) tryShoot(S, ctl.aimX, ctl.aimY);
  if ((acts & ACTIONS.HORN) && S.audio) S.audio.horn();

  if (!p.car) {
    // On foot: face the mouse aim, walk or run, stay out of buildings.
    const aim = Math.atan2(ctl.aimY - p.y, ctl.aimX - p.x);
    if (isFinite(aim)) p.angle = aim;
    const len = Math.hypot(ctl.dirX, ctl.dirY);
    if (len > 0.001) {
      const speed = ctl.run ? PLAYER.run : PLAYER.walk;
      p.x += (ctl.dirX / len) * speed * dt;
      p.y += (ctl.dirY / len) * speed * dt;
      if (!isFinite(p.x) || !isFinite(p.y)) { p.x = 1030; p.y = 540; }
      S.city.collide(p);
    }
  }

  if (p.car && !p.car.disabled) {
    const car = p.car;
    if (ctl.accel) car.speed += CAR.accel * dt;
    if (ctl.brake) car.speed -= CAR.brake * dt;
    if (!ctl.accel && !ctl.brake) {
      car.speed *= Math.max(0, 1 - CAR.drag * dt);
      if (Math.abs(car.speed) < 8) car.speed = 0;
    }
    const top = car.kind === 'sports' ? CAR.sportsMax : CAR.maxSpeed;
    car.speed = clamp(car.speed, -CAR.reverseMax, top);
    const steerFactor = clamp(car.speed / 240, -1, 1);
    if (ctl.handbrake) {
      car.angle += ctl.dirX * CAR.steer * 1.6 * steerFactor * dt;
      car.speed *= Math.max(0, 1 - 1.2 * dt);
    } else {
      car.angle += ctl.dirX * CAR.steer * steerFactor * dt;
    }
    if (!isFinite(car.angle)) car.angle = 0;
    const prevX = car.x;
    const prevY = car.y;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (!isFinite(car.x) || !isFinite(car.y) || !isFinite(car.speed)) {
      car.x = prevX;
      car.y = prevY;
      car.speed = 0;
    }
    const beforeX = car.x;
    const beforeY = car.y;
    S.city.collide(car);
    if ((car.x !== beforeX || car.y !== beforeY) && Math.abs(car.speed) > 300) {
      damageCar(S, car, 15);
      car.speed *= 0.4;
      if (S.audio) S.audio.crash();
    }
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (car.speed > 50) {
      for (const ped of S.peds) {
        if (!ped.down && Math.hypot(ped.x - car.x, ped.y - car.y) < 26 + 13) {
          ped.down = true;
          addWanted(S, 1);
        }
      }
    }
  }

  // Car-car collisions: push apart, share the normal velocity, damage on
  // hard hits. The dist guards are what stop a NaN from ever spreading.
  for (let i = 0; i < S.cars.length; i++) {
    const a = S.cars[i];
    if (a.disabled) continue;
    for (let j = i + 1; j < S.cars.length; j++) {
      const b = S.cars[j];
      if (b.disabled) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= CAR.length || !isFinite(dist) || dist <= 0.001) continue;
      const overlap = CAR.length - dist;
      const nx = dx / dist;
      const ny = dy / dist;
      a.x -= nx * overlap / 2;
      a.y -= ny * overlap / 2;
      b.x += nx * overlap / 2;
      b.y += ny * overlap / 2;
      const vax = a.speed * Math.cos(a.angle);
      const vay = a.speed * Math.sin(a.angle);
      const vbx = b.speed * Math.cos(b.angle);
      const vby = b.speed * Math.sin(b.angle);
      const vnA = vax * nx + vay * ny;
      const vnB = vbx * nx + vby * ny;
      const rel = vnB - vnA;
      if (rel > 180) {
        const dmg = Math.min(30, (rel - 180) * 0.15);
        damageCar(S, a, dmg);
        damageCar(S, b, dmg);
        if ((a.isPlayer && b.isPolice) || (b.isPlayer && a.isPolice)) addWanted(S, 1);
      }
      const avg = (vnA + vnB) / 2;
      a.speed += avg - vnA;
      b.speed += avg - vnB;
      if (!isFinite(a.speed)) a.speed = 0;
      if (!isFinite(b.speed)) b.speed = 0;
    }
  }

  // Pickups: gold, ammo, health, cash.
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  for (let i = S.pickups.length - 1; i >= 0; i--) {
    const pk = S.pickups[i];
    if (Math.hypot(pk.x - px, pk.y - py) >= 30) continue;
    if (pk.kind === 'gold') {
      p.cash += MONEY.gold;
      S.stats.goldFound.push(pk.id);
      showToast(S, '+$250 gold bar', 2.5);
      if (S.audio) S.audio.cash();
    } else if (pk.kind === 'ammo') {
      p.weapon = 'pistol';
      p.ammo += 24;
      showToast(S, 'Pistol +24 rounds', 2.5);
      if (S.audio) S.audio.pickup();
    } else if (pk.kind === 'health') {
      p.hp = PLAYER.maxHp;
      showToast(S, 'Health restored', 2.5);
      if (S.audio) S.audio.pickup();
    } else if (pk.kind === 'cash') {
      p.cash += pk.amount;
      showToast(S, '+$' + pk.amount, 2.5);
      if (S.audio) S.audio.cash();
    }
    S.pickups.splice(i, 1);
  }

  // Lay Low spray shops: clear the heat for $100 while driving.
  if (p.car && S.wanted > 0 && p.cash >= MONEY.spray && S.sprayCd <= 0) {
    const nearShop =
      Math.hypot(px - PLACES.layLowNorth.x, py - PLACES.layLowNorth.y) < 100 ||
      Math.hypot(px - PLACES.layLowSouth.x, py - PLACES.layLowSouth.y) < 100;
    if (nearShop) {
      S.wanted = 0;
      p.cash -= MONEY.spray;
      S.sprayCd = 12;
      showToast(S, 'Lay Low — heat cleared', 3);
      if (S.audio) S.audio.cash();
    }
  }

  // Mission spawns, progress, rewards, and the courier side job.
  if (S.flags.spawnMarked && !S.cars.some((c) => c.marked)) {
    S.cars.push({
      x: PLACES.hotWheels.x, y: PLACES.hotWheels.y, angle: 0, speed: 0,
      kind: 'sports', color: '#ffd21f', r: 26, hp: 100, disabled: false,
      isPlayer: false, isPolice: false, marked: true, owned: false, cruise: 0,
    });
    S.flags.spawnMarked = false;
  }
  if (S.flags.spawnEnemiesAt) {
    const sp = S.flags.spawnEnemiesAt;
    spawnEnemies(S, sp.x, sp.y, sp.count || 3);
    S.flags.spawnEnemiesAt = null;
  }
  if (S.mission) {
    const r = updateMission(S, dt);
    if (r === 'complete') {
      const job = MISSIONS[S.mission.index];
      p.cash += job.reward;
      S.stats.missionsDone++;
      S.nextMissionIndex++;
      showToast(S, 'Job complete +$' + job.reward, 3);
      if (S.audio) S.audio.missionDone();
      if (S.nextMissionIndex >= MISSIONS.length) {
        S.storyDone = true;
        showToast(S, 'PAID IN FULL — Legend of Solmar', 6);
      } else {
        S.nextMissionIn = 4;
      }
      autosave(S);
      S.mission = null;
    } else if (r === 'failed') {
      S.mission = null;
      S.nextMissionIn = 6;
      showToast(S, 'Job failed — retrying', 3);
    }
  } else if (!S.storyDone) {
    S.nextMissionIn -= dt;
    if (S.nextMissionIn <= 0) startMission(S, S.nextMissionIndex);
  }

  if (!S.mission) {
    if (S.courier.phase === 'idle' && S.stats.missionsDone >= 1) startCourier(S);
    updateCourier(S, dt);
  }

  fadeEffects(S, dt);
  if (S.audio) {
    S.audio.setEngine(p.car ? Math.abs(p.car.speed) / CAR.maxSpeed : 0, !!p.car);
    S.audio.setSiren(S.wanted > 0);
  }
}

function fadeEffects(S, dt) {
  for (let i = S.particles.length - 1; i >= 0; i--) {
    S.particles[i].life -= dt;
    if (S.particles[i].life <= 0) S.particles.splice(i, 1);
  }
  for (let i = S.tracers.length - 1; i >= 0; i--) {
    S.tracers[i].life -= dt;
    if (S.tracers[i].life <= 0) S.tracers.splice(i, 1);
  }
}

export function respawnPlayer(S) {
  const p = S.player;
  const fine = Math.min(MONEY.bustFine, Math.floor(p.cash * 0.1));
  p.cash -= fine;
  if (S.busted) {
    p.x = PLACES.garage.x;
    p.y = PLACES.garage.y;
  } else {
    p.x = PLACES.general.x;
    p.y = PLACES.general.y;
  }
  p.hp = PLAYER.maxHp;
  p.angle = 0;
  for (const car of S.cars) car.isPlayer = false;
  p.car = null;
  p.onFoot = true;
  S.wanted = 0;
  S.cops = [];
  S.cars = S.cars.filter((c) => !c.isPolice);
  S.enemies = [];
  if (S.mission) {
    S.mission = null;
    S.nextMissionIn = 6;
  }
  const wasBusted = S.busted;
  S.busted = false;
  S.wasted = false;
  showToast(S, wasBusted ? 'Busted — $' + fine + ' fine' : 'Wasted — hospital bill $' + fine, 3);
  autosave(S);
}
