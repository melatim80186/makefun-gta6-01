// SOLMAR — Streets of Gold: the city. One seeded build of the whole
// coastal grid: roads, blocks, buildings, palms and hidden gold bars.
// Grid numbers are the spec: 8 avenues, 7 streets, 3600 x 2800 world.

const WORLD_W = 3600;
const WORLD_H = 2800;
const ROAD_W = 72;
const WATER_X = 240;
const BEACH_X = 500;

const AVENUES = [480, 880, 1280, 1680, 2080, 2480, 2880, 3280];
const STREETS = [360, 720, 1080, 1440, 1800, 2160, 2520];

const ROOF_COLOURS = ['#c96f4a', '#d9a441', '#5a6b7a', '#9b7b8f', '#5f8f5a'];
const GLASS_ROOF = '#8fb4c7';

const HALF_ROAD = ROAD_W / 2;
const MARGIN = 24;

function isDowntown(cx, cy) {
  return cx >= 1400 && cx <= 2300 && cy >= 650 && cy <= 1900;
}

export function createCity(rng) {
  const blocks = [];
  const xs = [0, ...AVENUES, WORLD_W];
  const ys = [0, ...STREETS, WORLD_H];

  for (let ci = 0; ci < xs.length - 1; ci++) {
    for (let ri = 0; ri < ys.length - 1; ri++) {
      const x = xs[ci] + HALF_ROAD;
      const y = ys[ri] + HALF_ROAD;
      const w = xs[ci + 1] - xs[ci] - ROAD_W;
      const h = ys[ri + 1] - ys[ri] - ROAD_W;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const kind = x < BEACH_X ? 'beach'
        : (x > 2500 && y > 1900 ? 'park' : 'normal');
      const block = { x, y, w, h, kind, buildings: [], palms: [] };

      if (kind === 'normal') {
        const downtown = isDowntown(cx, cy);
        const count = downtown ? 2 : rng.int(2, 3);
        const slotW = (w - MARGIN * 2) / count;
        for (let i = 0; i < count; i++) {
          const bw = slotW * rng.range(0.6, 0.85);
          const bh = (h - MARGIN * 2) * rng.range(0.4, 0.7);
          const bx = x + MARGIN + i * slotW + (slotW - bw) / 2;
          const by = y + MARGIN
            + rng.range(0, Math.max(0, h - MARGIN * 2 - bh));
          const height = downtown ? rng.range(26, 60) : rng.range(8, 22);
          const roof = downtown ? GLASS_ROOF : rng.pick(ROOF_COLOURS);
          block.buildings.push({ x: bx, y: by, w: bw, h: bh, height, roof });
        }
        if (!downtown && rng.next() < 0.5) {
          block.palms.push({
            x: x + rng.range(30, w - 30),
            y: y + rng.range(30, h - 30),
          });
        }
      } else if (kind === 'park') {
        for (let i = 0; i < 10; i++) {
          block.palms.push({
            x: x + rng.range(20, w - 20),
            y: y + rng.range(20, h - 20),
          });
        }
      }
      blocks.push(block);
    }
  }

  // Palms run down the sand, roughly every 170 units.
  const beachPalms = [];
  for (let y = 120; y < WORLD_H; y += 170 + rng.range(-20, 20)) {
    beachPalms.push({ x: rng.range(280, 440), y });
  }

  // Twelve gold bars, one tucked on the corner of a random normal block.
  const normal = blocks.filter((b) => b.kind === 'normal');
  const goldSpots = [];
  const used = new Set();
  while (goldSpots.length < 12 && used.size < normal.length) {
    const b = rng.pick(normal);
    if (used.has(b)) continue;
    used.add(b);
    const corner = rng.int(0, 3);
    goldSpots.push({
      x: corner % 2 === 0 ? b.x + 26 : b.x + b.w - 26,
      y: corner < 2 ? b.y + 26 : b.y + b.h - 26,
      id: goldSpots.length,
      found: false,
    });
  }

  return {
    avenues: AVENUES,
    streets: STREETS,
    roadWidth: ROAD_W,
    worldW: WORLD_W,
    worldH: WORLD_H,
    blocks,
    beachPalms,
    goldSpots,
    onRoad(x, y, margin = 0) { return isOnRoad(this, x, y, margin); },
    inWater(x) { return x < WATER_X; },
    nearestRoadPoint(x, y) { return nearestRoad(this, x, y); },
    randomRoadPoint() { return randomRoad(this, rng); },
    randomSidewalkPoint() { return randomSidewalk(this, rng); },
  };
}

// ---- Query helpers (hoisted, so the city object above can use them) ----

function isOnRoad(city, x, y, margin = 0) {
  const m = city.roadWidth / 2 + margin;
  for (const ax of city.avenues) if (Math.abs(x - ax) <= m) return true;
  for (const sy of city.streets) if (Math.abs(y - sy) <= m) return true;
  return false;
}

function nearestRoad(city, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const ax of city.avenues) {
    const d = Math.abs(x - ax);
    if (d < bestD) {
      bestD = d;
      best = { x: ax, y: Math.max(0, Math.min(y, city.worldH)), orientation: 'v' };
    }
  }
  for (const sy of city.streets) {
    const d = Math.abs(y - sy);
    if (d < bestD) {
      bestD = d;
      best = { x: Math.max(0, Math.min(x, city.worldW)), y: sy, orientation: 'h' };
    }
  }
  return best;
}

function randomRoad(city, rng) {
  if (rng.next() < city.avenues.length / (city.avenues.length + city.streets.length)) {
    return { x: rng.pick(city.avenues), y: rng.range(0, city.worldH), orientation: 'v' };
  }
  return { x: rng.range(0, city.worldW), y: rng.pick(city.streets), orientation: 'h' };
}

function randomSidewalk(city, rng) {
  const p = randomRoad(city, rng);
  const side = rng.pick([-1, 1]);
  if (p.orientation === 'v') p.x += side * 62;
  else p.y += side * 62;
  return p;
}

// Push a circle out of every building it overlaps, then clamp it inside
// the world and out of the water. Returns the corrected {x, y}.
export function collide(city, x, y, r) {
  for (const block of city.blocks) {
    for (const b of block.buildings) {
      const cx = Math.max(b.x, Math.min(x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(y, b.y + b.h));
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        y = cy + (dy / d) * r;
      } else {
        // Circle centre is inside the building: exit via the nearest face.
        const left = x - b.x + r;
        const right = b.x + b.w - x + r;
        const top = y - b.y + r;
        const bottom = b.y + b.h - y + r;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.x - r;
        else if (m === right) x = b.x + b.w + r;
        else if (m === top) y = b.y - r;
        else y = b.y + b.h + r;
      }
    }
  }
  x = Math.max(WATER_X + r, Math.min(x, city.worldW - r));
  y = Math.max(r, Math.min(y, city.worldH - r));
  return { x, y };
}
