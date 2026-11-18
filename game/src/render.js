// SOLMAR — Streets of Gold: canvas renderer.
// Top-down 2D view of the coastal city: streets, cars, people, markers.
import { PALETTE, PLACES, WORLD_W, WORLD_H, ROAD_W, AVENUES, STREETS, CAR } from './config.js';
import { MISSIONS } from './missions.js';

const WATER_X = 240;
const BEACH_X = 480;
const TAU = Math.PI * 2;

// Palette lookup with a safe fallback so a missing key never breaks drawing.
function col(key, fb) { return (PALETTE && PALETTE[key]) || fb; }
// city.js stores roof names, not colours — resolve them to palette keys.
const ROOF_COL = {
  terracotta: 'roofTerracotta', ochre: 'roofOchre', slate: 'roofSlate',
  mauve: 'roofMauve', green: 'roofGreen', glass: 'roofGlass',
};
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// Rounded-rect path helper.
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

// One car, drawn rotated to its heading: shadow, body, glass, wheels.
function drawCarShape(ctx, car) {
  const L = (CAR && CAR.length) || 52;
  const W = (CAR && CAR.width) || 26;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle || 0);
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath();
  ctx.ellipse(3, 4, L / 2 + 2, W / 2 + 2, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = car.color || '#c0392b';
  rr(ctx, -L / 2, -W / 2, L, W, 8);
  ctx.fill();
  // Dark glass: windshield + rear window.
  ctx.fillStyle = 'rgba(18,28,44,0.9)';
  rr(ctx, -L / 2 + 8, -W / 2 + 4, L * 0.30, W - 8, 4);
  ctx.fill();
  rr(ctx, L * 0.10, -W / 2 + 4, L * 0.26, W - 8, 4);
  ctx.fill();
  // Four wheels, slightly proud of the body.
  ctx.fillStyle = '#101010';
  const wy = W / 2 - 2;
  ctx.fillRect(-L / 2 + 6, -wy - 3, 11, 6);
  ctx.fillRect(L / 2 - 17, -wy - 3, 11, 6);
  ctx.fillRect(-L / 2 + 6, wy - 3, 11, 6);
  ctx.fillRect(L / 2 - 17, wy - 3, 11, 6);
  if (car.kind === 'taxi') {
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TAXI', 0, 0);
  }
  if (car.isPolice || car.kind === 'police') {
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(-L / 2 + 4, -3, L - 8, 6);
    ctx.fillStyle = '#123a7a';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PD', 0, 0);
  }
  ctx.restore();
}

// One person on foot. Down = floored, lying flat on the ground.
function drawPerson(ctx, x, y, angle, opts) {
  const o = opts || {};
  const a = angle || 0;
  ctx.save();
  ctx.translate(x, y);
  if (o.down) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 13, 6, a, 0, TAU);
    ctx.fill();
    ctx.fillStyle = o.shirt || '#888888';
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 5, a, 0, TAU);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 3, 9, 6, 0, 0, TAU);
  ctx.fill();
  if (o.isPlayer) {
    ctx.strokeStyle = col('playerRed', '#e03333');
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, TAU);
    ctx.stroke();
  }
  ctx.fillStyle = o.shirt || '#7a9a6a';
  ctx.beginPath();
  ctx.arc(0, 0, o.isPlayer ? 11 : 9, 0, TAU);
  ctx.fill();
  // Head, nudged toward the facing direction.
  ctx.fillStyle = col('pedSkin', '#e8b98a');
  ctx.beginPath();
  ctx.arc(Math.cos(a) * 3, Math.sin(a) * 3, 5, 0, TAU);
  ctx.fill();
  if (o.isPlayer) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12);
    ctx.lineTo(Math.cos(a) * 20, Math.sin(a) * 20);
    ctx.stroke();
  }
  ctx.restore();
}

// Factory: owns the canvas context and the camera (centre + zoom).
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const R = {
    ctx,
    x: WORLD_W / 2,
    y: WORLD_H / 2,
    zoom: 1,
    w: 0,
    h: 0,
    resize() {
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      canvas.width = this.w;
      canvas.height = this.h;
    },
    screenToWorld(sx, sy) {
      return {
        x: this.x + (sx - this.w / 2) / this.zoom,
        y: this.y + (sy - this.h / 2) / this.zoom,
      };
    },
    drawWorld(S) { drawWorldFrame(this, S); },
  };
  R.resize();
  return R;
}

// One palm: dark trunk dot + green crown with a light touch.
function drawPalm(ctx, x, y) {
  ctx.fillStyle = '#6b4a2a';
  ctx.beginPath();
  ctx.arc(x, y, 2.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = col('palm', '#3f8f3a');
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.arc(x - 2, y - 2, 4, 0, TAU);
  ctx.fill();
}

// The city itself: ground, water + sand, blocks, roads, buildings, palms.
function drawCity(ctx, S) {
  ctx.fillStyle = col('grass', '#7fae5a');
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  // Deep water west of the beach, sand between water and the first avenue.
  ctx.fillStyle = col('deepWater', '#1c5f8a');
  ctx.fillRect(0, 0, WATER_X, WORLD_H);
  ctx.fillStyle = col('sand', '#e0c98f');
  ctx.fillRect(WATER_X, 0, BEACH_X - WATER_X, WORLD_H);
  // Shimmer lines drifting down the water.
  const t = S.time || 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const yy = (i * 373 + t * 30) % WORLD_H;
    ctx.moveTo(12, yy);
    ctx.lineTo(WATER_X - 12, yy);
  }
  ctx.stroke();
  // Blocks: park green, beach sand, everything else sidewalk grey.
  const blocks = (S.city && S.city.blocks) || [];
  for (const b of blocks) {
    if (b.kind === 'park') ctx.fillStyle = col('park', '#5da24a');
    else if (b.kind === 'beach') ctx.fillStyle = col('sand', '#e0c98f');
    else ctx.fillStyle = col('sidewalk', '#b9b3a4');
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  // Asphalt roads over the blocks.
  ctx.fillStyle = col('asphalt', '#3c3f45');
  for (const ax of AVENUES) ctx.fillRect(ax - ROAD_W / 2, 0, ROAD_W, WORLD_H);
  for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_W / 2, WORLD_W, ROAD_W);
  // Yellow dashed centrelines down every road.
  ctx.strokeStyle = col('laneYellow', '#e8c33a');
  ctx.lineWidth = 3;
  ctx.setLineDash([20, 24]);
  ctx.beginPath();
  for (const ax of AVENUES) { ctx.moveTo(ax, 0); ctx.lineTo(ax, WORLD_H); }
  for (const sy of STREETS) { ctx.moveTo(0, sy); ctx.lineTo(WORLD_W, sy); }
  ctx.stroke();
  ctx.setLineDash([]);
  // Buildings with a height-offset shadow and a light roof edge, then palms.
  for (const b of blocks) {
    for (const bd of b.buildings || []) {
      const off = (bd.hgt || 12) * 0.3;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(bd.x + off, bd.y + off, bd.w, bd.h);
      // Roof names from city.js map onto the palette's roof colours.
      ctx.fillStyle = col(ROOF_COL[bd.roof] || 'roofTerracotta', '#b5673f');
      ctx.fillRect(bd.x, bd.y, bd.w, bd.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(bd.x + 1, bd.y + 1, bd.w - 2, bd.h - 2);
    }
    for (const pm of b.palms || []) drawPalm(ctx, pm.x, pm.y);
  }
  for (const pm of ((S.city && S.city.beachPalms) || [])) drawPalm(ctx, pm.x, pm.y);
}

// Pickups: pulsing gold bars, ammo discs, health crosses, cash coins.
function drawPickups(ctx, S) {
  const pulse = 1 + 0.18 * Math.sin((S.time || 0) * 4);
  for (const pk of S.pickups || []) {
    ctx.save();
    ctx.translate(pk.x, pk.y);
    if (pk.kind === 'gold') {
      const s = 11 * pulse;
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = col('gold', '#f5c542');
      ctx.fillRect(-s, -s * 0.55, s * 2, s * 1.1);
      ctx.strokeStyle = '#a87c10';
      ctx.lineWidth = 2;
      ctx.strokeRect(-s, -s * 0.55, s * 2, s * 1.1);
    } else if (pk.kind === 'ammo') {
      ctx.fillStyle = '#222222';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, TAU);
      ctx.fill();
      ctx.fillStyle = col('gold', '#f5c542');
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#222222';
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, TAU);
      ctx.fill();
    } else if (pk.kind === 'health') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, TAU);
      ctx.fill();
      ctx.fillStyle = col('red', '#e03333');
      ctx.fillRect(-2.5, -8, 5, 16);
      ctx.fillRect(-8, -2.5, 16, 5);
    } else {
      // Cash coin with a $ stamped on it.
      ctx.fillStyle = col('gold', '#f5c542');
      ctx.beginPath();
      ctx.arc(0, 0, 9 * pulse, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#a87c10';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 9 * pulse, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#7a5c08';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 1);
    }
    ctx.restore();
  }
}

// Objective marker: pulsing ring, arrowhead above, light column, label.
function drawMarker(ctx, x, y, color, label) {
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  const ring = 26 + 5 * Math.sin(now * 5);
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = color;
  ctx.fillRect(x - 14, y - 110, 28, 110);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, ring, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y - 52);
  ctx.lineTo(x - 10, y - 68);
  ctx.lineTo(x + 10, y - 68);
  ctx.closePath();
  ctx.fill();
  if (label) {
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(label, x + 1, y - 71);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x, y - 72);
  }
  ctx.restore();
}

// The two Lay Low spray-shop pads: dark pad, gold border, LAY LOW text.
function drawSprayPads(ctx) {
  for (const spot of [PLACES.layLowNorth, PLACES.layLowSouth]) {
    if (!spot) continue;
    ctx.save();
    ctx.translate(spot.x, spot.y);
    ctx.fillStyle = 'rgba(20,20,26,0.85)';
    rr(ctx, -75, -45, 150, 90, 10);
    ctx.fill();
    ctx.strokeStyle = col('gold', '#f5c542');
    ctx.lineWidth = 3;
    rr(ctx, -75, -45, 150, 90, 10);
    ctx.stroke();
    ctx.fillStyle = col('gold', '#f5c542');
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LAY LOW', 0, 0);
    ctx.restore();
  }
}

// Where the mission marker points, by the current step type.
// S.mission.step is a NUMBER index into the job's step list.
function missionTarget(S) {
  const m = S.mission;
  if (!m || m.index == null || m.index < 0) return null;
  const def = MISSIONS && MISSIONS[m.index];
  const step = (def && def.steps && def.steps[m.step]) || null;
  if (!step) return null;
  const garage = PLACES.garage || { x: 1030, y: 540 };
  if (step.type === 'steal') return { x: garage.x, y: garage.y, label: 'GARAGE' };
  if (step.type === 'stealMarked') {
    const marked = (S.cars || []).find((c) => c.marked);
    if (marked) return { x: marked.x, y: marked.y, label: 'COMET' };
    const hw = PLACES.hotWheels || { x: 2430, y: 1030 };
    return { x: hw.x, y: hw.y, label: 'HOT WHEELS' };
  }
  if (step.type === 'checkpoints') {
    const pts = step.points || [];
    const pt = pts[m.cpIndex || 0] || pts[0];
    return pt ? { x: pt.x, y: pt.y, label: 'CHECKPOINT ' + ((m.cpIndex || 0) + 1) } : null;
  }
  if (typeof step.x === 'number' && typeof step.y === 'number') {
    return { x: step.x, y: step.y, label: step.label || 'TARGET' };
  }
  return null;
}

// One frame: camera follows the player, world draws in layers, warm wash on top.
function drawWorldFrame(R, S) {
  const ctx = R.ctx;
  const p = S.player || { x: WORLD_W / 2, y: WORLD_H / 2, angle: 0 };
  const pc = p.car || null;
  const tx = pc ? pc.x : p.x;
  const ty = pc ? pc.y : p.y;
  R.zoom = lerp(R.zoom || 1, pc ? 0.9 : 1.15, 0.08);
  if (!Number.isFinite(R.zoom) || R.zoom <= 0.2) R.zoom = 1;
  if (Number.isFinite(tx)) R.x = tx;
  if (Number.isFinite(ty)) R.y = ty;
  ctx.fillStyle = '#20242a';
  ctx.fillRect(0, 0, R.w, R.h);
  ctx.save();
  ctx.translate(R.w / 2, R.h / 2);
  ctx.scale(R.zoom, R.zoom);
  ctx.translate(-R.x, -R.y);
  drawCity(ctx, S);
  drawSprayPads(ctx);
  drawPickups(ctx, S);
  const mt = missionTarget(S);
  if (mt) drawMarker(ctx, mt.x, mt.y, col('missionYellow', '#ffd23e'), mt.label);
  const co = S.courier;
  if (co && co.phase === 'pickup') drawMarker(ctx, co.x, co.y, col('objectiveCyan', '#35d0e0'), 'PICKUP');
  else if (co && co.phase === 'deliver') drawMarker(ctx, co.tx, co.ty, col('objectiveCyan', '#35d0e0'), 'DELIVER');
  // Cars, with the player's car last so it sits on top.
  const cars = (S.cars || []).slice();
  for (const c of cars) if (c !== pc) drawCarShape(ctx, c);
  if (pc) drawCarShape(ctx, pc);
  // Police light halos, alternating red and blue.
  const flash = Math.floor((S.time || 0) * 4) % 2 === 0;
  for (const c of cars) {
    if (!c.isPolice) continue;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = flash ? '#ff2a2a' : '#2a6bff';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 34, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  for (const pd of S.peds || []) drawPerson(ctx, pd.x, pd.y, pd.angle, { shirt: pd.shirt, down: pd.down });
  for (const cp of S.cops || []) drawPerson(ctx, cp.x, cp.y, cp.angle, { shirt: col('copBlue', '#2a6bff') });
  for (const e of S.enemies || []) drawPerson(ctx, e.x, e.y, e.angle, { shirt: '#8a2a2a', down: e.down });
  if (!pc) {
    drawPerson(ctx, p.x, p.y, p.angle, { shirt: col('playerWhite', '#f2f2f2'), isPlayer: true });
    if (p.punchCd > 0.2) {
      // Punch flash: a small arc ahead of the fist.
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(p.angle) * 26, p.y + Math.sin(p.angle) * 26, 10, p.angle - 0.9, p.angle + 0.9);
      ctx.stroke();
      ctx.restore();
    }
  }
  for (const tr of S.tracers || []) {
    ctx.save();
    ctx.globalAlpha = clamp(tr.life || 0, 0, 1);
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tr.x1, tr.y1);
    ctx.lineTo(tr.x2, tr.y2);
    ctx.stroke();
    ctx.restore();
  }
  for (const pt of S.particles || []) {
    ctx.save();
    ctx.globalAlpha = clamp((pt.life || 0) / (pt.maxLife || 1), 0, 1);
    ctx.fillStyle = pt.color || '#ffffff';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size || 3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // Golden-hour radial vignette over the whole frame.
  const vg = ctx.createRadialGradient(R.w / 2, R.h / 2, Math.min(R.w, R.h) * 0.42, R.w / 2, R.h / 2, Math.max(R.w, R.h) * 0.75);
  vg.addColorStop(0, 'rgba(255,190,90,0)');
  vg.addColorStop(1, 'rgba(255,160,40,0.20)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, R.w, R.h);
}
