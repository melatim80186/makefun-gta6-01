import { WORLD_W, WORLD_H, ROAD_W, AVENUES, STREETS, BEACH_X, WATER_X } from './config.js';

// Roof colours for ordinary (non-downtown) buildings.
const ROOFS = ['terracotta', 'ochre', 'slate', 'mauve', 'green'];
const MARGIN = 24; // inset of buildings inside their block
const GAP = 12; // gap between buildings sharing a block

function inDowntown(x, y) {
  return x >= 1400 && x <= 2300 && y >= 650 && y <= 1900;
}

// Split a block's inner area into 2-3 buildings along its longer side.
function makeBuildings(rng, b) {
  const n = rng.int(2, 3);
  const list = [];
  const ix = b.x + MARGIN;
  const iy = b.y + MARGIN;
  const iw = b.w - MARGIN * 2;
  const ih = b.h - MARGIN * 2;
  const wide = iw >= ih;
  for (let i = 0; i < n; i++) {
    let bx, by, bw, bh;
    if (wide) {
      bw = (iw - GAP * (n - 1)) / n;
      bh = ih;
      bx = ix + i * (bw + GAP);
      by = iy;
    } else {
      bw = iw;
      bh = (ih - GAP * (n - 1)) / n;
      bx = ix;
      by = iy + i * (bh + GAP);
    }
    const downtown = inDowntown(bx + bw / 2, by + bh / 2);
    list.push({
      x: bx, y: by, w: bw, h: bh,
      hgt: downtown ? rng.range(26, 60) : rng.range(8, 22),
      roof: downtown ? 'glass' : rng.pick(ROOFS),
    });
  }
  return list;
}

// Scatter n palms at random spots inside a block.
function scatterPalms(rng, b, n) {
  const palms = [];
  for (let i = 0; i < n; i++) {
    palms.push({ x: rng.range(b.x + 16, b.x + b.w - 16), y: rng.range(b.y + 16, b.y + b.h - 16) });
  }
  return palms;
}

export function createCity(rng) {
  const xs = [0, ...AVENUES, WORLD_W];
  const ys = [0, ...STREETS, WORLD_H];
  const blocks = [];
  const normalBlocks = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const x0 = xs[i] + (i === 0 ? 0 : ROAD_W / 2);
      const x1 = xs[i + 1] - (i + 1 === xs.length - 1 ? 0 : ROAD_W / 2);
      const y0 = ys[j] + (j === 0 ? 0 : ROAD_W / 2);
      const y1 = ys[j + 1] - (j + 1 === ys.length - 1 ? 0 : ROAD_W / 2);
      const b = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, kind: 'normal', buildings: [], palms: [] };
      if (b.x < BEACH_X + 20) {
        b.kind = 'beach';
      } else if (b.x > 2500 && b.y > 1900) {
        b.kind = 'park';
        b.palms = scatterPalms(rng, b, 10);
      } else {
        b.buildings = makeBuildings(rng, b);
        if (rng.next() < 0.35) b.palms = scatterPalms(rng, b, 1);
        normalBlocks.push(b);
      }
      blocks.push(b);
    }
  }

  // Twelve hidden gold bars: one tucked into a corner of a random normal block.
  const goldSpots = [];
  const pool = [...normalBlocks];
  for (let i = 0; i < 12 && pool.length > 0; i++) {
    const idx = rng.int(0, pool.length - 1);
    const b = pool.splice(idx, 1)[0];
    const cx = rng.next() < 0.5 ? b.x + 30 : b.x + b.w - 30;
    const cy = rng.next() < 0.5 ? b.y + 30 : b.y + b.h - 30;
    goldSpots.push({ x: cx, y: cy });
  }

  // Palms marching down the sand, roughly every 170 units.
  const beachPalms = [];
  for (let y = 120; y < WORLD_H - 60; y += 170) {
    beachPalms.push({ x: rng.range(280, 440), y: y + rng.range(-20, 20) });
  }

  function onRoad(x, y, margin = 0) {
    const half = ROAD_W / 2 + margin;
    for (const ax of AVENUES) if (Math.abs(x - ax) <= half) return true;
    for (const sy of STREETS) if (Math.abs(y - sy) <= half) return true;
    return false;
  }

  function inWater(x, y) {
    return x < WATER_X;
  }

  // Push a circle {x, y, r} out of every building it overlaps, then clamp
  // it inside the world and out of the water. Mutates the object in place.
  function collide(o) {
    for (const b of blocks) {
      for (const r of b.buildings) {
        const cx = Math.max(r.x, Math.min(o.x, r.x + r.w));
        const cy = Math.max(r.y, Math.min(o.y, r.y + r.h));
        const dx = o.x - cx;
        const dy = o.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= o.r * o.r) continue;
        if (d2 > 0) {
          const d = Math.sqrt(d2);
          if (!isFinite(d) || d === 0) continue;
          const push = (o.r - d) / d;
          o.x += dx * push;
          o.y += dy * push;
        } else {
          // Centre inside the building: exit along the shallowest side.
          const left = o.x - r.x;
          const right = r.x + r.w - o.x;
          const top = o.y - r.y;
          const bottom = r.y + r.h - o.y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) o.x = r.x - o.r;
          else if (m === right) o.x = r.x + r.w + o.r;
          else if (m === top) o.y = r.y - o.r;
          else o.y = r.y + r.h + o.r;
        }
      }
    }
    o.x = Math.max(WATER_X + o.r, Math.min(WORLD_W - o.r, o.x));
    o.y = Math.max(o.r, Math.min(WORLD_H - o.r, o.y));
  }

  function nearestRoadPoint(x, y) {
    const cx = Math.max(0, Math.min(WORLD_W, x));
    const cy = Math.max(0, Math.min(WORLD_H, y));
    let best = null;
    let bestD = Infinity;
    for (const ax of AVENUES) {
      const d = Math.abs(cx - ax);
      if (d < bestD) { bestD = d; best = { x: ax, y: cy, angle: Math.PI / 2 }; }
    }
    for (const sy of STREETS) {
      const d = Math.abs(cy - sy);
      if (d < bestD) { bestD = d; best = { x: cx, y: sy, angle: 0 }; }
    }
    return best;
  }

  function randomRoadPoint() {
    if (rng.next() < AVENUES.length / (AVENUES.length + STREETS.length)) {
      return { x: rng.pick(AVENUES), y: rng.range(0, WORLD_H), angle: Math.PI / 2 };
    }
    return { x: rng.range(0, WORLD_W), y: rng.pick(STREETS), angle: 0 };
  }

  function randomSidewalkPoint() {
    const p = randomRoadPoint();
    const side = rng.next() < 0.5 ? -62 : 62;
    if (p.angle === 0) p.y += side;
    else p.x += side;
    return { x: p.x, y: p.y };
  }

  return {
    blocks, goldSpots, beachPalms,
    onRoad, inWater, collide, nearestRoadPoint, randomRoadPoint, randomSidewalkPoint,
  };
}
