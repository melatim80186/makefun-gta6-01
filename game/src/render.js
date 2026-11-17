// SOLMAR — Streets of Gold (make.fun gta6-01): the renderer.
// Canvas 2D only: a following camera, the coastal city, cars, people,
// markers, tracers and particles, finished with a golden-hour vignette.
import { PALETTE, FONTS, PLACES, WORLD } from './config.js';
import { missionTarget } from './missions.js';

const TAU = Math.PI * 2;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

// Rounded-rect path (ctx.roundRect is not in every headless build).
function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const renderer = {
    canvas,
    ctx,
    view: { w: 0, h: 0 },
    camera: { x: WORLD.width / 2, y: WORLD.height / 2, zoom: 1 },
    dpr: 1,
    resize() {
      const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
      const w = canvas.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1280);
      const h = canvas.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 720);
      renderer.dpr = dpr;
      renderer.view.w = w;
      renderer.view.h = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    },
    screenToWorld(sx, sy) {
      const c = renderer.camera;
      return {
        x: c.x + (sx - renderer.view.w / 2) / c.zoom,
        y: c.y + (sy - renderer.view.h / 2) / c.zoom,
      };
    },
    drawWorld(world) { drawWorldImpl(renderer, world); },
  };
  renderer.resize();
  return renderer;
}

// A top-down car: shadow, rounded body, dark glass, four wheels.
// kind 'taxi' gets a TAXI label; police cars get a stripe + PD.
export function drawCarShape(ctx, car) {
  if (!car) return;
  const len = car.len || 52;
  const wid = car.wid || 26;
  const halfL = len / 2;
  const halfW = wid / 2;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle || 0);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(2, 4, halfL + 3, halfW + 3, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#14141a';
  const wx = halfL - 11;
  const wy = halfW - 1;
  ctx.fillRect(-wx - 4, -wy - 4, 9, 6);
  ctx.fillRect(wx - 5, -wy - 4, 9, 6);
  ctx.fillRect(-wx - 4, wy - 2, 9, 6);
  ctx.fillRect(wx - 5, wy - 2, 9, 6);
  ctx.fillStyle = car.color || '#c8c8c8';
  rr(ctx, -halfL, -halfW, len, wid, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(18, 26, 36, 0.92)';
  rr(ctx, halfL - 15, -halfW + 4, 9, wid - 8, 3);
  ctx.fill();
  rr(ctx, -halfL + 6, -halfW + 4, 9, wid - 8, 3);
  ctx.fill();
  if (car.isPolice) {
    ctx.fillStyle = 'rgba(245, 245, 240, 0.95)';
    ctx.fillRect(-6, -halfW, 12, wid);
    ctx.fillStyle = '#1a2a6a';
    ctx.font = 'bold 9px ' + FONTS.sans;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PD', 0, 0);
  }
  if (car.kind === 'taxi') {
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 8px ' + FONTS.sans;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TAXI', 0, 0);
  }
  if (car.disabled) {
    ctx.fillStyle = 'rgba(120, 120, 120, 0.5)';
    ctx.beginPath();
    ctx.arc(halfL - 8, 0, 7, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// A top-down person: shadow, shirt circle, skin head. Down = lying flat.
// The player gets a bigger body, a thick red ring and a white facing tick.
export function drawPerson(ctx, x, y, angle, opts = {}) {
  const shirt = opts.shirt || '#8a8a8a';
  const skin = opts.skin || PALETTE.pedSkin;
  const a = angle || 0;
  ctx.save();
  ctx.translate(x, y);
  if (opts.down) {
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 15, 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 7, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(15, 0, 5, 0, TAU);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 11, 9, 0, 0, TAU);
  ctx.fill();
  const bodyR = opts.isPlayer ? 13 : 10;
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.arc(0, 0, bodyR, 0, TAU);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(Math.cos(a) * 3, Math.sin(a) * 3, 6, 0, TAU);
  ctx.fill();
  if (opts.isPlayer) {
    ctx.strokeStyle = PALETTE.playerAccent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
    ctx.lineTo(Math.cos(a) * 22, Math.sin(a) * 22);
    ctx.stroke();
  }
  if (opts.punch) {
    ctx.strokeStyle = 'rgba(255, 240, 160, 0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 26, Math.sin(a) * 26, 8, a - 0.7, a + 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

// The city: grass, water + sand on the west, park and sidewalk blocks,
// asphalt roads with dashed centrelines, buildings, palms.
function drawCity(ctx, city, camera, time) {
  const w = city.worldW || WORLD.width;
  const h = city.worldH || WORLD.height;
  const rw = city.roadWidth || WORLD.roadWidth;
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = PALETTE.deepWater;
  ctx.fillRect(0, 0, 120, h);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(120, 0, 120, h);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(240, 0, 240, h);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 2;
  for (let y = 40; y < h; y += 90) {
    const wob = Math.sin((time || 0) * 0.7 + y * 0.05) * 14;
    ctx.beginPath();
    ctx.moveTo(20 + wob, y);
    ctx.lineTo(200 + wob, y);
    ctx.stroke();
  }
  for (const b of city.blocks || []) {
    ctx.fillStyle = b.kind === 'park' ? PALETTE.park : PALETTE.sidewalk;
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  ctx.fillStyle = PALETTE.asphalt;
  for (const ax of city.avenues || []) ctx.fillRect(ax - rw / 2, 0, rw, h);
  for (const sy of city.streets || []) ctx.fillRect(0, sy - rw / 2, w, rw);
  ctx.strokeStyle = PALETTE.laneYellow;
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 24]);
  ctx.beginPath();
  for (const ax of city.avenues || []) { ctx.moveTo(ax, 0); ctx.lineTo(ax, h); }
  for (const sy of city.streets || []) { ctx.moveTo(0, sy); ctx.lineTo(w, sy); }
  ctx.stroke();
  ctx.setLineDash([]);
  for (const b of city.blocks || []) {
    for (const bd of b.buildings || []) {
      const off = (bd.height || 10) * 0.35;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(bd.x + off, bd.y + off, bd.w, bd.h);
      ctx.fillStyle = bd.roof || PALETTE.roofSlate;
      ctx.fillRect(bd.x, bd.y, bd.w, bd.h);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bd.x, bd.y + 1);
      ctx.lineTo(bd.x + bd.w, bd.y + 1);
      ctx.stroke();
    }
    for (const p of b.palms || []) drawPalm(ctx, p.x, p.y);
  }
  for (const p of city.beachPalms || []) drawPalm(ctx, p.x, p.y);
}

// A palm: dark trunk dot with a five-leaf crown.
function drawPalm(ctx, x, y) {
  ctx.fillStyle = '#6a4a2a';
  ctx.beginPath();
  ctx.arc(x, y, 2.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = PALETTE.palm;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.4;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 4, 0, TAU);
    ctx.fill();
  }
}

// Pickups, gently pulsing: gold bars, ammo discs, health crosses, cash.
function drawPickups(ctx, pickups, time) {
  const t = time || 0;
  for (const p of pickups || []) {
    if (!p || typeof p.x !== 'number') continue;
    const pulse = 1 + 0.15 * Math.sin(t * 4 + p.x * 0.01 + p.y * 0.01);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(pulse, pulse);
    if (p.kind === 'gold') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(0, 3, 12, 6, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(-9, -5, 18, 10);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(-9, -5, 18, 3);
    } else if (p.kind === 'ammo') {
      ctx.fillStyle = '#2a2a30';
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, TAU);
      ctx.fill();
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, TAU);
      ctx.fill();
    } else if (p.kind === 'health') {
      ctx.fillStyle = '#f5f5f0';
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, TAU);
      ctx.fill();
      ctx.fillStyle = PALETTE.red;
      ctx.fillRect(-2.5, -7, 5, 14);
      ctx.fillRect(-7, -2.5, 14, 5);
    } else if (p.kind === 'cash') {
      ctx.fillStyle = PALETTE.green;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#e8ffe8';
      ctx.font = 'bold 11px ' + FONTS.sans;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 0.5);
    }
    ctx.restore();
  }
}

// Pulsing objective marker: light column, ring, arrowhead, optional label.
function drawMarker(ctx, x, y, color, label, pulse) {
  const p = pulse == null ? 1 : pulse;
  const ringR = 16 + 5 * Math.sin(p * 4);
  ctx.save();
  const grad = ctx.createLinearGradient(0, y - 90, 0, y);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  grad.addColorStop(1, color);
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = grad;
  ctx.fillRect(x - 6, y - 90, 12, 90);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, ringR, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - ringR - 16);
  ctx.lineTo(x - 8, y - ringR - 4);
  ctx.lineTo(x + 8, y - ringR - 4);
  ctx.closePath();
  ctx.fill();
  if (label) {
    ctx.font = 'bold 13px ' + FONTS.sans;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.strokeText(label, x, y - ringR - 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x, y - ringR - 20);
  }
  ctx.restore();
}

// The two Lay Low Motors spray pads: dark pad, gold border, LAY LOW text.
function drawSprayPads(ctx) {
  for (const key of ['sprayNorth', 'spraySouth']) {
    const s = PLACES[key];
    if (!s) continue;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.fillStyle = 'rgba(20, 20, 26, 0.9)';
    rr(ctx, -70, -45, 140, 90, 8);
    ctx.fill();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 3;
    rr(ctx, -70, -45, 140, 90, 8);
    ctx.stroke();
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 15px ' + FONTS.display;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LAY LOW', 0, -8);
    ctx.fillStyle = '#f5f2e8';
    ctx.font = '11px ' + FONTS.sans;
    ctx.fillText('spray shop · $100', 0, 12);
    ctx.restore();
  }
}

// The frame: ease the camera zoom (0.9 in a car, 1.15 on foot), centre on
// the player, then draw city, pads, pickups, markers, cars, people,
// tracers and particles — and a golden-hour vignette over the top.
function drawWorldImpl(renderer, world) {
  const ctx = renderer.ctx;
  const state = (world && world.state) || {};
  const city = state.city || {};
  const player = state.player || { x: 1800, y: 1400, angle: 0 };
  const time = state.time || 0;
  const inCar = !!player.car;
  const cam = renderer.camera;
  cam.zoom = lerp(cam.zoom, inCar ? 0.9 : 1.15, 0.08);
  const vw = renderer.view.w / cam.zoom;
  const vh = renderer.view.h / cam.zoom;
  const w = city.worldW || WORLD.width;
  const h = city.worldH || WORLD.height;
  cam.x = vw >= w ? w / 2 : clamp(player.x, vw / 2, w - vw / 2);
  cam.y = vh >= h ? h / 2 : clamp(player.y, vh / 2, h - vh / 2);

  ctx.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);
  ctx.clearRect(0, 0, renderer.view.w, renderer.view.h);
  ctx.save();
  ctx.translate(renderer.view.w / 2, renderer.view.h / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);

  drawCity(ctx, city, cam, time);
  drawSprayPads(ctx);
  drawPickups(ctx, state.pickups, time);

  const mission = state.mission;
  if (mission && mission.job && !mission.complete && !mission.failed) {
    const step = mission.job.steps && mission.job.steps[mission.stepIndex];
    const target = missionTarget(state);
    if (target) {
      drawMarker(ctx, target.x, target.y, PALETTE.missionYellow, mission.job.title, time);
    } else if (step && step.type === 'steal') {
      drawMarker(ctx, PLACES.garage.x, PLACES.garage.y, PALETTE.missionYellow, mission.job.title, time);
    }
  }
  const courier = state.courier;
  if (courier && typeof courier.x === 'number'
    && (courier.stage === 'pickup' || courier.stage === 'deliver' || courier.active || courier.phase)) {
    const label = (courier.stage === 'deliver' || courier.phase === 'deliver') ? 'Deliver' : 'Pickup';
    drawMarker(ctx, courier.x, courier.y, PALETTE.objectiveCyan, label, time);
  }

  const cars = state.cars || [];
  const playerCar = player.car;
  for (const car of cars) {
    if (!car || car === playerCar || car.isPlayer) continue;
    drawCarShape(ctx, car);
  }
  if (playerCar) drawCarShape(ctx, playerCar);
  else {
    const pc = cars.find((c) => c && c.isPlayer);
    if (pc) drawCarShape(ctx, pc);
  }
  const flash = Math.floor(time * 4) % 2 === 0;
  for (const car of cars) {
    if (!car || !car.isPolice) continue;
    const halo = ctx.createRadialGradient(car.x, car.y, 4, car.x, car.y, 46);
    halo.addColorStop(0, flash ? 'rgba(224, 58, 42, 0.55)' : 'rgba(42, 74, 216, 0.55)');
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(car.x, car.y, 46, 0, TAU);
    ctx.fill();
  }
  for (const ped of state.peds || []) {
    if (ped) drawPerson(ctx, ped.x, ped.y, ped.angle || 0, { shirt: ped.shirt, down: ped.down });
  }
  for (const cop of state.cops || []) {
    if (!cop) continue;
    if (cop.kind === 'car') {
      drawCarShape(ctx, { x: cop.x, y: cop.y, angle: cop.angle || 0, isPolice: true, color: PALETTE.copBlue, len: 52, wid: 26 });
    } else {
      drawPerson(ctx, cop.x, cop.y, cop.angle || 0, { shirt: PALETTE.copBlue });
    }
  }
  for (const e of state.enemies || []) {
    if (e) drawPerson(ctx, e.x, e.y, e.angle || 0, { shirt: '#a02828', down: e.down });
  }
  if (!inCar) {
    drawPerson(ctx, player.x, player.y, player.angle || 0, {
      shirt: PALETTE.playerWhite, skin: PALETTE.pedSkin, isPlayer: true, punch: player.punchAnim > 0,
    });
  }
  for (const t of state.tracers || []) {
    if (!t) continue;
    ctx.strokeStyle = 'rgba(255, 230, 120, ' + clamp(t.life == null ? 1 : t.life, 0, 1) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(t.x2, t.y2);
    ctx.stroke();
  }
  for (const p of state.particles || []) {
    if (!p) continue;
    ctx.globalAlpha = p.maxLife ? clamp(p.life / p.maxLife, 0, 1) : 1;
    ctx.fillStyle = p.color || '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size || 3, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  const cx = renderer.view.w / 2;
  const cy = renderer.view.h / 2;
  const r = Math.max(renderer.view.w, renderer.view.h) * 0.72;
  const vig = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
  vig.addColorStop(0, 'rgba(255, 170, 60, 0)');
  vig.addColorStop(1, 'rgba(255, 140, 40, 0.22)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, renderer.view.w, renderer.view.h);
}
