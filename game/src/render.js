// render.js — SOLMAR canvas renderer (Canvas 2D only).
//
// Owns the camera, the city painting, cars, people, pickups, markers
// and the golden-hour wash over every frame. The world hands this
// module its state each frame; this module never mutates game state.
// Everything here is drawn from shapes — no images, no network.

// ---- World geometry (mirrors the city grid in the design) ----
const WORLD_W = 3600;
const WORLD_H = 2800;
const ROAD_W = 72;
const AVENUES = [480, 880, 1280, 1680, 2080, 2480, 2880, 3280];
const STREETS = [360, 720, 1080, 1440, 1800, 2160, 2520];
const WATER_X = 240; // west of this is water
const BEACH_X = 480; // water..beach is sand
const SPRAY_SHOPS = [{ x: 1330, y: 2210 }, { x: 2930, y: 410 }];

// ---- Palette ----
const C = {
  grass: '#7fae5a', dryGrass: '#a9b96a', sand: '#e8d49a', water: '#3f8fb5',
  deepWater: '#2f6f96', asphalt: '#3c3f46', lane: '#e8c84a', sidewalk: '#9aa0a3',
  curb: '#7d838a', park: '#5d9b4e', palm: '#2f7d4f', trunk: '#7a5a38',
  player: '#f5f2ea', accent: '#d8342c', cop: '#2b5fd9', skin: '#e8b98d',
  gold: '#f2c14e', red: '#d8342c', green: '#3fae5a', mission: '#f2c14e',
  objective: '#37c8e8', dark: '#1c1f26',
};
const ROOFS = ['#b5673f', '#c08a3e', '#5a6b7d', '#8a6a7d', '#5f8a5a'];
const GLASS = '#7fa3b5';

// Rounded-rect path helper (works even where ctx.roundRect is absent).
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

// ---- Cars ----
// Draws one car at its position/angle: shadow, rounded body, dark
// windows, four wheels, plus TAXI roof text or a PD stripe + label.
function drawCarShape(ctx, car) {
  const len = car.len || car.length || (car.kind === 'truck' ? 66 : 52);
  const wid = car.wid || car.width || (car.kind === 'truck' ? 30 : 26);
  let col = car.color;
  if (!col) col = car.kind === 'taxi' ? '#f2c14e'
    : car.police ? '#2b5fd9' : '#c23b2e';
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle || 0);
  // Soft shadow, offset down-right so the car lifts off the road.
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  rr(ctx, -len / 2 + 3, -wid / 2 + 4, len, wid, 8);
  ctx.fill();
  // Wheels: four dark blocks poking out of the body sides.
  ctx.fillStyle = '#16181c';
  const wx = len / 2 - 11;
  const wy = wid / 2 - 1;
  rr(ctx, -wx, -wy - 3, 12, 6, 2); ctx.fill();
  rr(ctx, wx - 12, -wy - 3, 12, 6, 2); ctx.fill();
  rr(ctx, -wx, wy - 3, 12, 6, 2); ctx.fill();
  rr(ctx, wx - 12, wy - 3, 12, 6, 2); ctx.fill();
  // Body.
  ctx.fillStyle = col;
  rr(ctx, -len / 2, -wid / 2, len, wid, 8);
  ctx.fill();
  // Dark cabin glass.
  ctx.fillStyle = 'rgba(20,28,36,0.85)';
  rr(ctx, -len * 0.16, -wid / 2 + 4, len * 0.34, wid - 8, 5);
  ctx.fill();
  // Taxi: roof sign text. Police: white stripe + PD doors.
  if (car.kind === 'taxi') {
    ctx.fillStyle = '#1c1f26';
    ctx.font = 'bold 9px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TAXI', 0, 0);
  } else if (car.police) {
    ctx.fillStyle = '#f5f2ea';
    ctx.fillRect(-len * 0.05, -wid / 2, len * 0.1, wid);
    ctx.fillStyle = '#1c1f26';
    ctx.font = 'bold 9px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PD', len * 0.28, 0);
  }
  ctx.restore();
}

// ---- People ----
// Down pose when floored; otherwise shadow, shirt circle, skin head,
// and for the player a larger body, a thick red ring, a white facing tick.
function drawPerson(ctx, x, y, angle, o = {}) {
  const shirt = o.shirt || '#7d8aa0';
  const skin = o.skin || C.skin;
  const r = o.isPlayer ? 13 : 11;
  const a = angle || 0;
  ctx.save();
  ctx.translate(x, y);
  if (o.down) {
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(3, 4, r + 4, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shirt;
    ctx.beginPath(); ctx.ellipse(0, 0, r + 3, r * 0.65, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(r + 6, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  // Shadow, then body, then head pushed toward the facing angle.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(2, 3, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shirt;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(Math.cos(a) * 5, Math.sin(a) * 5, o.isPlayer ? 7.5 : 6.5, 0, Math.PI * 2);
  ctx.fill();
  if (o.isPlayer) {
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(0, 0, r + 5, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (r + 2), Math.sin(a) * (r + 2));
    ctx.lineTo(Math.cos(a) * (r + 10), Math.sin(a) * (r + 10));
    ctx.stroke();
  }
  ctx.restore();
}

// One palm: a trunk dot and a three-lobe crown.
function drawPalm(ctx, x, y) {
  ctx.fillStyle = C.trunk;
  ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.palm;
  ctx.beginPath(); ctx.arc(x - 5, y - 4, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 5, y - 4, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y + 5, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.arc(x - 2, y - 5, 2, 0, Math.PI * 2); ctx.fill();
}

// ---- City ----
// Grass ground, water + sand strips on the west, shimmer lines on the
// water, park blocks green, normal blocks sidewalk-grey, asphalt roads
// with yellow dashed centrelines, buildings with a height-offset shadow
// and a light roof edge, palms on park / beach / residential corners.
function drawCity(ctx, city, time) {
  // Ground: grass everywhere, then the coast overwrites the west edge.
  ctx.fillStyle = C.grass;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.fillStyle = C.deepWater;
  ctx.fillRect(0, 0, WATER_X, WORLD_H);
  ctx.fillStyle = C.water;
  ctx.fillRect(0, 0, WATER_X - 24, WORLD_H);
  ctx.fillStyle = C.sand;
  ctx.fillRect(WATER_X, 0, BEACH_X - WATER_X, WORLD_H);
  // Shimmer: a few pale lines drifting down the water with time.
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const sy = ((i * 317 + time * 26) % WORLD_H);
    const sx = 30 + (i % 3) * 62;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 46, sy);
    ctx.stroke();
  }
  // Blocks: park green, normal sidewalk-grey; beach blocks stay sand.
  const blocks = (city && city.blocks) || [];
  for (const b of blocks) {
    if (b.type === 'park') {
      ctx.fillStyle = C.park;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    } else if (b.type === 'normal') {
      ctx.fillStyle = C.sidewalk;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
  }
  // Roads: asphalt strips over the blocks, then dashed centrelines.
  ctx.fillStyle = C.asphalt;
  for (const ax of AVENUES) ctx.fillRect(ax - ROAD_W / 2, 0, ROAD_W, WORLD_H);
  for (const sy of STREETS) ctx.fillRect(0, sy - ROAD_W / 2, WORLD_W, ROAD_W);
  ctx.strokeStyle = C.lane;
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 22]);
  ctx.beginPath();
  for (const ax of AVENUES) { ctx.moveTo(ax, 0); ctx.lineTo(ax, WORLD_H); }
  for (const sy of STREETS) { ctx.moveTo(0, sy); ctx.lineTo(WORLD_W, sy); }
  ctx.stroke();
  ctx.setLineDash([]);
  // Buildings: height-offset shadow, body, light roof edge.
  for (const b of blocks) {
    if (!b.buildings) continue;
    for (const bd of b.buildings) {
      const hgt = bd.height || bd.hgt || 14;
      const col = bd.color || ROOFS[(bd.x + bd.y) % ROOFS.length];
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(bd.x + 5, bd.y + hgt * 0.25 + 4, bd.w, bd.h);
      ctx.fillStyle = bd.glass ? GLASS : col;
      ctx.fillRect(bd.x, bd.y, bd.w, bd.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(bd.x + 1, bd.y + 1, bd.w - 2, bd.h - 2);
      if (bd.glass) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.moveTo(bd.x + 5, bd.y + bd.h - 5);
        ctx.lineTo(bd.x + bd.w - 5, bd.y + 5);
        ctx.stroke();
      }
    }
    if (b.palms) for (const p of b.palms) drawPalm(ctx, p.x, p.y);
  }
  // Beach palms run down the sand every ~170 units.
  if (city && city.beachPalms) {
    for (const p of city.beachPalms) drawPalm(ctx, p.x, p.y);
  } else {
    for (let py = 200; py < WORLD_H; py += 170) drawPalm(ctx, 360, py);
  }
}

// ---- Pickups ----
// Pulsing gold bars, ammo discs, health crosses, cash coins.
function drawPickups(ctx, pickups, time) {
  if (!pickups) return;
  for (const p of pickups) {
    if (p.taken) continue;
    const pulse = 1 + 0.15 * Math.sin(time * 4 + p.x * 0.01 + p.y * 0.013);
    const r = (p.kind === 'gold' ? 12 : 11) * pulse;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(2, 3, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    if (p.kind === 'gold') {
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = C.gold;
      ctx.fillRect(-9, -5, 18, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(-9, -5, 18, 3);
      ctx.strokeStyle = '#8a6410';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-9, -5, 18, 10);
    } else if (p.kind === 'ammo') {
      ctx.fillStyle = '#2c2f36';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d8a83c';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2c2f36';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'health') {
      ctx.fillStyle = '#f5f2ea';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.red;
      ctx.fillRect(-2.5, -8, 5, 16);
      ctx.fillRect(-8, -2.5, 16, 5);
    } else { // cash
      ctx.fillStyle = '#3fae5a';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d8f0c0';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#eaffea';
      ctx.font = 'bold 11px Trebuchet MS, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 0.5);
    }
    ctx.restore();
  }
}

// ---- Marker ----
// Pulsing ring, bobbing arrowhead, light column, optional label.
function drawMarker(ctx, x, y, label, color, time) {
  const col = color || C.mission;
  const bob = Math.sin(time * 3) * 4;
  const ringR = 26 + Math.sin(time * 3) * 4;
  ctx.save();
  // Light column rising from the point.
  const grad = ctx.createLinearGradient(0, y - 110, 0, y);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(1, col + '55');
  ctx.fillStyle = grad;
  ctx.fillRect(x - 7, y - 110, 14, 110);
  // Pulsing ground ring.
  ctx.strokeStyle = col;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, ringR, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  // Arrowhead bobbing above the ring.
  ctx.beginPath();
  ctx.moveTo(x, y - 44 + bob);
  ctx.lineTo(x - 9, y - 60 + bob);
  ctx.lineTo(x + 9, y - 60 + bob);
  ctx.closePath();
  ctx.fill();
  // Optional label on a dark pill above the arrow.
  if (label) {
    ctx.font = 'bold 13px Trebuchet MS, sans-serif';
    const w = ctx.measureText(label).width + 16;
    ctx.fillStyle = 'rgba(20,22,28,0.85)';
    rr(ctx, x - w / 2, y - 88 + bob, w, 22, 11);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y - 77 + bob);
  }
  ctx.restore();
}

// ---- Spray shops ----
// Two Lay Low pads: dark pad, gold border, "LAY LOW" text.
function drawSprayPads(ctx, time) {
  for (const s of SPRAY_SHOPS) {
    const glow = 0.55 + 0.25 * Math.sin(time * 2 + s.x);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    rr(ctx, -62, -38, 124, 76, 10);
    ctx.fill();
    ctx.fillStyle = '#2e3138';
    rr(ctx, -60, -40, 120, 80, 10);
    ctx.fill();
    ctx.strokeStyle = `rgba(242,193,78,${glow})`;
    ctx.lineWidth = 3;
    rr(ctx, -60, -40, 120, 80, 10);
    ctx.stroke();
    ctx.fillStyle = C.gold;
    ctx.font = 'bold 14px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LAY LOW', 0, -8);
    ctx.fillStyle = '#cfd3d8';
    ctx.font = '11px Trebuchet MS, sans-serif';
    ctx.fillText('SPRAY $100', 0, 12);
    ctx.restore();
  }
}

// Where the mission marker belongs, by step type. Returns null when the
// current step has no fixed point (e.g. "steal any car").
function missionTarget(st) {
  const m = st.mission;
  if (!m || !m.step) return null;
  const s = m.step;
  if (s.target && typeof s.target.x === 'number') return { x: s.target.x, y: s.target.y, label: s.label || '' };
  if (s.type === 'reach' || s.type === 'hold' || s.type === 'earn') {
    return { x: s.x, y: s.y, label: s.label || (s.type === 'hold' ? 'HOLD' : 'GO') };
  }
  if (s.type === 'checkpoints' && s.points && s.points.length) {
    const i = Math.min(m.checkpoint || 0, s.points.length - 1);
    const p = s.points[i];
    return { x: p.x, y: p.y, label: `CHECKPOINT ${i + 1}/${s.points.length}` };
  }
  if (s.type === 'defeat') {
    return { x: s.x, y: s.y, label: s.label || 'TURF' };
  }
  if (s.type === 'stealMarked') {
    if (st.markedCar) return { x: st.markedCar.x, y: st.markedCar.y, label: 'COMET' };
    return { x: 2430, y: 1030, label: 'COMET' };
  }
  return null;
}

// ---- Renderer factory ----
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { w: 1280, h: 720 };
  const camera = { x: 1800, y: 1400, zoom: 1.15 };

  function resize() {
    const w = canvas.clientWidth || window.innerWidth || 1280;
    const h = canvas.clientHeight || window.innerHeight || 720;
    canvas.width = w;
    canvas.height = h;
    view.w = w;
    view.h = h;
  }

  function screenToWorld(sx, sy) {
    return {
      x: camera.x + (sx - view.w / 2) / camera.zoom,
      y: camera.y + (sy - view.h / 2) / camera.zoom,
    };
  }

  // ---- The frame ----
  // Zoom toward 0.9 in a car / 1.15 on foot, centre on the player, then
  // city, spray pads, pickups, markers, cars (player's last), halos,
  // pedestrians, cops, enemies, the player, tracers, particles, and a
  // golden-hour radial vignette over the whole frame.
  function drawWorld(st) {
    const p = st.player || { x: 1800, y: 1400, angle: 0 };
    const targetZoom = p.car ? 0.9 : 1.15;
    camera.zoom += (targetZoom - camera.zoom) * 0.08;
    camera.x = p.x;
    camera.y = p.y;
    const time = st.time || 0;
    const flash = Math.floor(time * 4) % 2 === 0;

    ctx.fillStyle = '#101216';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.save();
    ctx.translate(view.w / 2, view.h / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    drawCity(ctx, st.city, time);
    drawSprayPads(ctx, time);
    drawPickups(ctx, st.pickups, time);

    const mt = missionTarget(st);
    if (mt) drawMarker(ctx, mt.x, mt.y, mt.label, C.mission, time);
    if (st.courier && st.courier.active && typeof st.courier.x === 'number') {
      drawMarker(ctx, st.courier.x, st.courier.y, 'COURIER', C.objective, time);
    }

    // Police live in one cops list: kind 'car' entries draw as cars
    // (with the light halo), kind 'foot' entries draw as people.
    const cars = st.cars || [];
    const policeCars = (st.cops || []).filter((c) => c.kind === 'car');
    const pc = p.car || null;
    const drawOneCar = (car) => {
      drawCarShape(ctx, car);
      if (car.police) {
        ctx.fillStyle = flash ? 'rgba(255,60,50,0.35)' : 'rgba(60,120,255,0.35)';
        ctx.beginPath(); ctx.arc(car.x, car.y, 46, 0, Math.PI * 2); ctx.fill();
      }
    };
    for (const car of cars) if (car !== pc) drawOneCar(car);
    for (const car of policeCars) if (car !== pc) drawOneCar(car);
    if (pc) drawOneCar(pc);

    for (const ped of st.peds || st.pedestrians || []) {
      drawPerson(ctx, ped.x, ped.y, ped.angle || 0, { shirt: ped.shirt, down: ped.down });
    }
    for (const cop of (st.cops || []).filter((c) => c.kind === 'foot')) {
      drawPerson(ctx, cop.x, cop.y, cop.angle || 0, { shirt: '#2b5fd9', down: cop.down });
    }
    for (const e of st.enemies || []) {
      drawPerson(ctx, e.x, e.y, e.angle || 0, { shirt: '#8a2f2f', down: e.down || e.hp <= 0 });
    }
    // The player, with a white punch flash while punching.
    drawPerson(ctx, p.x, p.y, p.angle || 0, { shirt: '#f5f2ea', isPlayer: true, down: p.down });
    if (p.punchTimer > 0 || p.punching) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(p.angle || 0) * 22, p.y + Math.sin(p.angle || 0) * 22, 12, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (st.tracers) {
      for (const t of st.tracers) {
        const x2 = t.x2 !== undefined ? t.x2 : t.x + Math.cos(t.angle || 0) * (t.len || 300);
        const y2 = t.y2 !== undefined ? t.y2 : t.y + Math.sin(t.angle || 0) * (t.len || 300);
        ctx.strokeStyle = `rgba(255,240,170,${Math.max(0, Math.min(1, t.life || 1))})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(t.x1 !== undefined ? t.x1 : t.x, t.y1 !== undefined ? t.y1 : t.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
    if (st.particles) {
      for (const pt of st.particles) {
        const a = Math.max(0, Math.min(1, (pt.life || 0) / (pt.maxLife || 1)));
        ctx.fillStyle = pt.color || 'rgba(255,200,90,0.9)';
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size || 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Golden-hour radial vignette over the frame.
    const vg = ctx.createRadialGradient(
      view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.42,
      view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.75);
    vg.addColorStop(0, 'rgba(255,180,80,0)');
    vg.addColorStop(0.7, 'rgba(255,170,60,0.05)');
    vg.addColorStop(1, 'rgba(20,10,0,0.28)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  resize();
  return {
    canvas, ctx, view, camera, resize, screenToWorld,
    drawWorld, draw: drawWorld,
    drawCity, drawPickups, drawMarker, drawSprayPads,
    drawCarShape, drawPerson,
  };
}
