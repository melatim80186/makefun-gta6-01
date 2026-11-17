// hud.js — SOLMAR HUD, minimap and menu screens (canvas 2D, no assets).
// Draws over the world each frame: cash / health / wanted stars, the
// mission line, a live minimap, toasts and the hold-progress ring, plus
// the title, how-to-play, pause, busted/wasted and story screens.

export const SCREENS = {
  TITLE: 'title',
  PLAY: 'play',
  PAUSED: 'paused',
  BUSTED: 'busted',
  WASTED: 'wasted',
  STORY: 'story',
};

// World geometry, mirrored from the city grid so the minimap can draw
// roads without depending on any other module.
const WORLD_W = 3600;
const WORLD_H = 2800;
const AVENUES = [480, 880, 1280, 1680, 2080, 2480, 2880, 3280];
const STREETS = [360, 720, 1080, 1440, 1800, 2160, 2520];
const WATER_X = 240;

const COL = {
  panel: 'rgba(8, 12, 18, 0.72)',
  panelEdge: 'rgba(255, 255, 255, 0.14)',
  text: '#f5f1e6',
  muted: '#b8b2a2',
  gold: '#f2c14e',
  red: '#e5484d',
  green: '#58c472',
  cyan: '#4dd8e6',
  yellow: '#ffd94d',
  dark: '#11161d',
};
const FONT = '"Trebuchet MS", Verdana, sans-serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function viewSize(a, b) {
  if (a && typeof a === 'object') return { w: a.w ?? a.width ?? 1280, h: a.h ?? a.height ?? 720 };
  return { w: typeof a === 'number' ? a : 1280, h: typeof b === 'number' ? b : 720 };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Dark translucent panel with a thin light edge and rounded corners.
export function panel(ctx, x, y, w, h, alpha = 0.72) {
  ctx.save();
  ctx.fillStyle = `rgba(8, 12, 18, ${alpha})`;
  ctx.strokeStyle = COL.panelEdge;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function label(ctx, text, x, y, size = 14, color = COL.text, font = SANS, align = 'left') {
  ctx.save();
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

// Five wanted stars: gold filled up to the level, grey empty above it.
export function drawStars(ctx, x, y, level, size = 18) {
  const n = clamp(Math.round(level || 0), 0, 5);
  ctx.save();
  ctx.font = `${size}px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < n ? COL.gold : 'rgba(255, 255, 255, 0.28)';
    ctx.fillText('\u2605', x + i * (size + 2), y);
  }
  ctx.restore();
}

function missionTarget(world) {
  if (!world) return null;
  const m = world.mission;
  if (m) {
    if (typeof m.x === 'number' && typeof m.y === 'number') return m;
    if (m.target && typeof m.target.x === 'number') return m.target;
    if (m.step && typeof m.step.x === 'number') return m.step;
    if (m.point && typeof m.point.x === 'number') return m.point;
  }
  if (world.missionTarget && typeof world.missionTarget.x === 'number') return world.missionTarget;
  return null;
}

function courierPoint(world) {
  if (!world || !world.courier) return null;
  const c = world.courier;
  if (typeof c.x === 'number' && typeof c.y === 'number') return c;
  if (c.pickup && typeof c.pickup.x === 'number') return c.pickup;
  if (c.target && typeof c.target.x === 'number') return c.target;
  return null;
}

// Live minimap, 200x140: green ground, blue water strip on the west,
// dark roads, pulsing mission / courier blips, red police dots and a
// white player dot with a dark ring. Captioned SOLMAR underneath.
export function drawMinimap(ctx, world, x, y, w = 200, h = 140) {
  const sx = w / WORLD_W;
  const sy = h / WORLD_H;
  ctx.save();
  panel(ctx, x - 4, y - 4, w + 8, h + 22, 0.72);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#2f6b35';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#2f7fb8';
  ctx.fillRect(x, y, WATER_X * sx, h);
  ctx.fillStyle = '#d9c48a';
  ctx.fillRect(x + WATER_X * sx, y, (480 - WATER_X) * sx, h);
  ctx.strokeStyle = 'rgba(10, 14, 20, 0.85)';
  ctx.lineWidth = 2;
  for (const ax of AVENUES) {
    ctx.beginPath(); ctx.moveTo(x + ax * sx, y); ctx.lineTo(x + ax * sx, y + h); ctx.stroke();
  }
  for (const sy2 of STREETS) {
    ctx.beginPath(); ctx.moveTo(x, y + sy2 * sy); ctx.lineTo(x + w, y + sy2 * sy); ctx.stroke();
  }
  const t = (world && world.time) || 0;
  const pulse = 3 + Math.sin(t * 5) * 1.5;
  const mt = missionTarget(world);
  if (mt) {
    ctx.fillStyle = COL.yellow;
    ctx.beginPath(); ctx.arc(x + mt.x * sx, y + mt.y * sy, pulse + 1, 0, Math.PI * 2); ctx.fill();
  }
  const cp = courierPoint(world);
  if (cp) {
    ctx.fillStyle = COL.cyan;
    ctx.beginPath(); ctx.arc(x + cp.x * sx, y + cp.y * sy, 3, 0, Math.PI * 2); ctx.fill();
  }
  const cops = (world && (world.cops || world.police)) || [];
  ctx.fillStyle = COL.red;
  for (const c of cops) {
    if (typeof c.x !== 'number') continue;
    ctx.beginPath(); ctx.arc(x + c.x * sx, y + c.y * sy, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  const p = world && world.player;
  if (p && typeof p.x === 'number') {
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(x + p.x * sx, y + p.y * sy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x + p.x * sx, y + p.y * sy, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  label(ctx, 'SOLMAR', x + w / 2, y + h + 10, 11, COL.muted, SANS, 'center');
}

function missionLine(world) {
  if (!world) return '';
  if (typeof world.missionText === 'string' && world.missionText) return world.missionText;
  if (typeof world.missionLine === 'string' && world.missionLine) return world.missionLine;
  const m = world.mission;
  if (!m) return '';
  let line = m.title || m.name || '';
  const step = m.step || m.currentStep;
  if (step && step.label) line += ' — ' + step.label;
  else if (typeof m.stepLabel === 'string') line += ' — ' + m.stepLabel;
  if (typeof m.timeLeft === 'number') line += `  ${Math.max(0, Math.ceil(m.timeLeft))}s`;
  else if (typeof m.timer === 'number') line += `  ${Math.max(0, Math.ceil(m.timer))}s`;
  return line;
}

function toastText(world) {
  if (!world) return '';
  const t = world.toast ?? world.message;
  if (typeof t === 'string') return t;
  if (t && typeof t.text === 'string') {
    if (typeof t.until === 'number' && (world.time || 0) > t.until) return '';
    return t.text;
  }
  return '';
}

function holdFraction(world) {
  const m = world && world.mission;
  if (!m) return 0;
  if (typeof m.holdProgress === 'number') return clamp(m.holdProgress, 0, 1);
  // The live mission keeps hold seconds on the mission object and the
  // target on the current step (m.step), not on the step itself.
  const step = m.step || m.currentStep;
  if (step && step.type === 'hold' && typeof m.hold === 'number' && step.seconds) {
    return clamp(m.hold / step.seconds, 0, 1);
  }
  if (typeof m.holdTime === 'number' && typeof m.holdSeconds === 'number' && m.holdSeconds > 0) {
    return clamp(m.holdTime / m.holdSeconds, 0, 1);
  }
  return 0;
}

// In-game HUD. Signature: drawHud(ctx, world, w, h) — w/h may be a
// {w, h} view object instead.
export function drawHud(ctx, world, w, h) {
  const v = viewSize(w, h);
  const p = (world && world.player) || {};
  const stats = (world && world.stats) || {};
  const inCar = !!p.car;
  const cash = Math.floor(p.cash ?? world.cash ?? 0);
  const hp = clamp(p.hp ?? p.health ?? 100, 0, 100);
  panel(ctx, 12, 12, 228, inCar ? 74 : 96);
  label(ctx, `$${cash.toLocaleString('en-US')}`, 24, 30, 22, COL.gold, FONT);
  label(ctx, `Jobs ${stats.missionsDone ?? 0}/8   Gold ${stats.goldFound ?? 0}/12`, 24, 54, 13, COL.text);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(24, 64, 204, 10);
  ctx.fillStyle = hp > 30 ? COL.green : COL.red;
  ctx.fillRect(24, 64, 204 * (hp / 100), 10);
  if (!inCar) {
    const weapon = p.weapon === 'pistol' ? `Pistol  ${p.ammo ?? 0} rounds` : 'Fists — find a pistol pickup';
    label(ctx, weapon, 24, 92, 13, COL.muted);
  }
  panel(ctx, v.w - 172, 12, 160, 46);
  label(ctx, 'WANTED', v.w - 160, 28, 12, COL.muted);
  drawStars(ctx, v.w - 160, 46, world.wanted ?? 0, 16);
  const line = world.storyDone ? 'PAID IN FULL — free roam, Legend of Solmar'
    : missionLine(world);
  if (line) {
    const tw = ctx.measureText(line).width;
    panel(ctx, v.w / 2 - 210, 12, 420, 34);
    label(ctx, line, v.w / 2, 30, 14, COL.yellow, SANS, 'center');
    void tw;
  }
  drawMinimap(ctx, world, v.w - 212, v.h - 152);
  if (inCar) {
    const spd = Math.round(Math.abs((p.car && p.car.speed) || p.speed || 0) * 0.6);
    label(ctx, `${spd} km/h`, 24, v.h - 44, 26, COL.text, FONT);
    label(ctx, 'E exit   •   SPACE handbrake   •   H horn', 24, v.h - 18, 13, COL.muted);
  } else {
    label(ctx, 'WASD move   •   SHIFT run   •   E enter car   •   F punch   •   Click shoot', 24, v.h - 18, 13, COL.muted);
  }
  const toast = toastText(world);
  if (toast) {
    ctx.save();
    ctx.font = `15px ${SANS}`;
    const tw2 = ctx.measureText(toast).width;
    panel(ctx, v.w / 2 - tw2 / 2 - 14, v.h / 2 - 92, tw2 + 28, 32);
    label(ctx, toast, v.w / 2, v.h / 2 - 76, 15, COL.text, SANS, 'center');
    ctx.restore();
  }
  const hf = holdFraction(world);
  if (hf > 0 && hf < 1) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(v.w / 2, v.h / 2, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = COL.gold;
    ctx.beginPath(); ctx.arc(v.w / 2, v.h / 2, 34, -Math.PI / 2, -Math.PI / 2 + hf * Math.PI * 2); ctx.stroke();
    label(ctx, 'HOLD', v.w / 2, v.h / 2 + 52, 14, COL.gold, FONT, 'center');
    ctx.restore();
  }
}

function menu(ctx, options, selected, cx, y0) {
  options.forEach((opt, i) => {
    const y = y0 + i * 38;
    const on = i === selected;
    label(ctx, (on ? '\u25B8 ' : '') + opt, cx, y, on ? 22 : 19, on ? COL.gold : COL.text, FONT, 'center');
  });
}

function dim(ctx, w, h) { ctx.fillStyle = 'rgba(4, 6, 10, 0.62)'; ctx.fillRect(0, 0, w, h); }

export function drawTitle(ctx, w, h, selected = 0, hasSave = false) {
  const v = viewSize(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, v.h);
  g.addColorStop(0, 'rgba(6, 8, 14, 0.55)'); g.addColorStop(1, 'rgba(6, 8, 14, 0.88)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, v.w, v.h);
  label(ctx, 'SOLMAR', v.w / 2, v.h * 0.26, 84, COL.gold, FONT, 'center');
  label(ctx, '— STREETS OF GOLD —', v.w / 2, v.h * 0.26 + 56, 20, COL.text, FONT, 'center');
  label(ctx, 'You owe Vera Solano $5,000. Work the jobs. Pay it back. Own the city.', v.w / 2, v.h * 0.26 + 92, 15, COL.muted, SANS, 'center');
  const opts = hasSave ? ['Continue', 'New Game', 'How to Play'] : ['New Game', 'How to Play'];
  menu(ctx, opts, clamp(selected, 0, opts.length - 1), v.w / 2, v.h * 0.52);
  label(ctx, 'WASD move  •  E enter car  •  F punch  •  Click shoot  •  P pause  •  M mute', v.w / 2, v.h - 44, 13, COL.muted, SANS, 'center');
  label(ctx, 'Progress autosaves after every job.', v.w / 2, v.h - 22, 12, COL.muted, SANS, 'center');
}

export function drawHowToPlay(ctx, w, h) {
  const v = viewSize(w, h);
  dim(ctx, v.w, v.h);
  panel(ctx, v.w / 2 - 300, 60, 600, v.h - 120);
  label(ctx, 'HOW TO PLAY', v.w / 2, 96, 28, COL.gold, FONT, 'center');
  const rows = [
    'WASD / Arrows — move    SHIFT — run', 'E — steal / exit a car (+1 wanted star)',
    'F — punch    Click — shoot pistol (aim with mouse)', 'SPACE — handbrake    H — horn',
    'P / ESC — pause    M — mute', 'Steal cars, run 8 jobs for Vera, pay off $5,000.',
    'Find 12 hidden gold bars ($250 each). Courier jobs pay $150.',
    'Lay Low Motors clears your wanted stars for $100.',
    'Busted or wasted: lose $200 or 10% of your cash, job fails.',
    'Heat fades when no police are near. Cops on foot bust you up close.',
  ];
  rows.forEach((r, i) => label(ctx, r, v.w / 2, 140 + i * 30, 15, COL.text, SANS, 'center'));
  label(ctx, 'Press Enter to go back', v.w / 2, v.h - 92, 15, COL.gold, SANS, 'center');
}

export function drawPaused(ctx, world, w, h, selected = 0) {
  const v = viewSize(w, h);
  dim(ctx, v.w, v.h);
  panel(ctx, v.w / 2 - 220, v.h / 2 - 150, 440, 300);
  label(ctx, 'PAUSED', v.w / 2, v.h / 2 - 116, 30, COL.gold, FONT, 'center');
  const s = (world && world.stats) || {};
  const cash = Math.floor(((world && world.player) || {}).cash ?? world.cash ?? 0);
  label(ctx, `Cash $${cash.toLocaleString('en-US')}   Jobs ${s.missionsDone ?? 0}/8   Gold ${s.goldFound ?? 0}/12`, v.w / 2, v.h / 2 - 76, 14, COL.text, SANS, 'center');
  menu(ctx, ['Resume', 'Restart Job', 'Save & Quit'], clamp(selected, 0, 2), v.w / 2, v.h / 2 - 28);
}

export function drawBusted(ctx, world, w, h, kind) {
  const v = viewSize(w, h);
  const k = kind || (world && world.wasted ? 'wasted' : 'busted');
  dim(ctx, v.w, v.h);
  const title = k === 'wasted' ? 'WASTED' : 'BUSTED';
  label(ctx, title, v.w / 2, v.h / 2 - 30, 56, COL.red, FONT, 'center');
  const fine = (world && world.lastFine) ?? 200;
  const line = k === 'wasted'
    ? `Hospital bill: $${fine}. You wake up at Solmar General.`
    : `Fine: $${fine}. The cops drop you at Vera's Garage.`;
  label(ctx, line, v.w / 2, v.h / 2 + 24, 16, COL.text, SANS, 'center');
  label(ctx, 'Press Enter to continue', v.w / 2, v.h / 2 + 62, 15, COL.gold, SANS, 'center');
}

export function drawStoryComplete(ctx, world, w, h) {
  const v = viewSize(w, h);
  dim(ctx, v.w, v.h);
  label(ctx, 'PAID IN FULL', v.w / 2, v.h / 2 - 30, 52, COL.gold, FONT, 'center');
  label(ctx, 'The $5,000 is paid. Vera nods. Solmar is yours now.', v.w / 2, v.h / 2 + 22, 17, COL.text, SANS, 'center');
  label(ctx, 'Free roam — keep the gold, the cars and the streets. Press Enter to play on.', v.w / 2, v.h / 2 + 54, 15, COL.muted, SANS, 'center');
}
