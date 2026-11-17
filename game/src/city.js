// SOLMAR — Streets of Gold (make.fun gta6-01)
// City builder: turns the road grid into beach, park and built blocks,
// then hands the world its roads, buildings, palms and gold bars.

const WORLD_W = 3600;
const WORLD_H = 2800;
const ROAD_W = 72;
const HALF_ROAD = ROAD_W / 2;
const AVENUES = [480, 880, 1280, 1680, 2080, 2480, 2880, 3280];
const STREETS = [360, 720, 1080, 1440, 1800, 2160, 2520];
const WATER_X = 240;
const BEACH_X = 480;
const ROOFS = ['#c96f4a', '#d9a441', '#6b7a8c', '#9b7b8f', '#5f8f6a'];
const GLASS_ROOF = '#8fb8c9';

export function createCity(rng) {
  const blocks = [];
  const buildings = [];
  const palms = [];
  const xs = [0, ...AVENUES, WORLD_W];
  const ys = [0, ...STREETS, WORLD_H];

  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const x0 = xs[i] + (i === 0 ? 0 : HALF_ROAD);
      const y0 = ys[j] + (j === 0 ? 0 : HALF_ROAD);
      const x1 = xs[i + 1] - (i + 1 === xs.length - 1 ? 0 : HALF_ROAD);
      const y1 = ys[j + 1] - (j + 1 === ys.length - 1 ? 0 : HALF_ROAD);
      const w = x1 - x0;
      const h = y1 - y0;
      const cx = x0 + w / 2;
      const cy = y0 + h / 2;
      const downtown = cx > 1400 && cx < 2300 && cy > 650 && cy < 1900;
      let type = 'normal';
      if (x0 < 500) type = 'beach';
      else if (x0 > 2500 && y0 > 1900) type = 'park';
      const block = { x: x0, y: y0, w, h, cx, cy, type, downtown, buildings: [], palms: [] };
      blocks.push(block);
      if (type === 'park') {
        for (let p = 0; p < 10; p++) {
          const palm = { x: rng.range(x0 + 20, x1 - 20), y: rng.range(y0 + 20, y1 - 20) };
          block.palms.push(palm);
          palms.push(palm);
        }
        continue;
      }
      if (type === 'beach') continue;
      // Normal block: 2 buildings downtown, else 2-3, one per slot.
      const count = downtown ? 2 : rng.int(2, 3);
      const slots = [[0, 0], [1, 0], [0, 1], [1, 1]].sort(() => rng.next() - 0.5);
      const slotW = (w - 48) / 2;
      const slotH = (h - 48) / 2;
      for (let s = 0; s < count; s++) {
        const [gx, gy] = slots[s];
        const bw = rng.range(slotW * 0.55, slotW * 0.9);
        const bh = rng.range(slotH * 0.55, slotH * 0.9);
        const bx = x0 + 24 + gx * slotW + (slotW - bw) / 2;
        const by = y0 + 24 + gy * slotH + (slotH - bh) / 2;
        const b = {
          x: bx, y: by, w: bw, h: bh,
          cx: bx + bw / 2, cy: by + bh / 2,
          height: downtown ? rng.range(26, 60) : rng.range(8, 22),
          roof: downtown ? GLASS_ROOF : rng.pick(ROOFS),
          downtown,
        };
        block.buildings.push(b);
        buildings.push(b);
      }
      // Residential corners sometimes get a palm.
      if (!downtown && rng.next() < 0.5) {
        const palm = { x: rng.range(x0 + 20, x1 - 20), y: rng.range(y0 + 20, y1 - 20) };
        block.palms.push(palm);
        palms.push(palm);
      }
    }
  }

  // Beach palms run down the sand every ~170 units.
  for (let y = 120; y < WORLD_H; y += 170) {
    palms.push({ x: rng.range(280, 440), y: y + rng.range(-30, 30) });
  }

  // Twelve gold bars, one per randomly chosen normal block corner.
  const normalBlocks = blocks.filter((b) => b.type === 'normal');
  const shuffled = [...normalBlocks].sort(() => rng.next() - 0.5);
  const corners = [
    (b) => ({ x: b.x + 34, y: b.y + 34 }),
    (b) => ({ x: b.x + b.w - 34, y: b.y + 34 }),
    (b) => ({ x: b.x + 34, y: b.y + b.h - 34 }),
    (b) => ({ x: b.x + b.w - 34, y: b.y + b.h - 34 }),
  ];
  const goldSpots = shuffled.slice(0, 12).map((b, i) => {
    const spot = rng.pick(corners)(b);
    return { x: spot.x, y: spot.y, id: i };
  });

  const city = {
    w: WORLD_W,
    h: WORLD_H,
    roadWidth: ROAD_W,
    waterX: WATER_X,
    beachX: BEACH_X,
    avenues: AVENUES,
    streets: STREETS,
    blocks,
    buildings,
    palms,
    goldSpots,

    // True when the point sits on a road centreline band (plus margin).
    onRoad(x, y, margin = 0) {
      const m = HALF_ROAD + margin;
      for (const ax of AVENUES) if (Math.abs(x - ax) <= m) return true;
      for (const sy of STREETS) if (Math.abs(y - sy) <= m) return true;
      return false;
    },

    inWater(x) {
      return x < WATER_X;
    },

    // Push a circle out of every building it overlaps, then keep it
    // inside the world and out of the water. Mutates and returns e.
    // The radius defaults to 12: traffic and police call it with just
    // the moving object, the player passes its own radius.
    collide(e, r = 12) {
      for (const b of buildings) {
        const nx = Math.max(b.x, Math.min(e.x, b.x + b.w));
        const ny = Math.max(b.y, Math.min(e.y, b.y + b.h));
        const dx = e.x - nx;
        const dy = e.y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          e.x = nx + (dx / d) * r;
          e.y = ny + (dy / d) * r;
        } else {
          // Centre inside the building: exit along the shallowest side.
          const left = e.x - b.x;
          const right = b.x + b.w - e.x;
          const top = e.y - b.y;
          const bottom = b.y + b.h - e.y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) e.x = b.x - r;
          else if (m === right) e.x = b.x + b.w + r;
          else if (m === top) e.y = b.y - r;
          else e.y = b.y + b.h + r;
        }
      }
      e.x = Math.max(r, Math.min(WORLD_W - r, e.x));
      e.y = Math.max(r, Math.min(WORLD_H - r, e.y));
      if (e.x < WATER_X + r) e.x = WATER_X + r;
      return e;
    },

    // Closest point on any road centreline, with its travel angle:
    // vertical on an avenue, horizontal on a street.
    nearestRoadPoint(x, y) {
      let best = null;
      for (const ax of AVENUES) {
        const d = Math.abs(x - ax);
        if (!best || d < best.d) {
          best = { x: ax, y: Math.max(0, Math.min(WORLD_H, y)), angle: Math.PI / 2, d };
        }
      }
      for (const sy of STREETS) {
        const d = Math.abs(y - sy);
        if (!best || d < best.d) {
          best = { x: Math.max(0, Math.min(WORLD_W, x)), y: sy, angle: 0, d };
        }
      }
      return { x: best.x, y: best.y, angle: best.angle };
    },

    randomRoadPoint() {
      if (rng.next() < AVENUES.length / (AVENUES.length + STREETS.length)) {
        return { x: rng.pick(AVENUES), y: rng.range(0, WORLD_H), angle: Math.PI / 2 };
      }
      return { x: rng.range(0, WORLD_W), y: rng.pick(STREETS), angle: 0 };
    },

    // A road point stepped 62 to one side, onto the sidewalk.
    randomSidewalkPoint() {
      const p = city.randomRoadPoint();
      const side = rng.next() < 0.5 ? -62 : 62;
      if (p.angle === 0) return { x: p.x, y: p.y + side };
      return { x: p.x + side, y: p.y };
    },
  };

  return city;
}

export default createCity;
