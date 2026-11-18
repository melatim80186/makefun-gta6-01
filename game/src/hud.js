// SOLMAR — Streets of Gold: HUD, minimap and menu screens. Canvas 2D only.
import { PALETTE, FONTS, AVENUES, STREETS, WATER_X } from './config.js';
import { MISSIONS, missionText } from './missions.js';

export const SCREENS = {
  TITLE: 'title',
  PLAY: 'play',
  PAUSED: 'paused',
  BUSTED: 'busted',
  WASTED: 'wasted',
  STORY: 'story',
};

// Vera's Garage and the Hot Wheels sports-car lot (spec coordinates).
const GARAGE = { x: 1030, y: 540 };
const HOT_WHEELS = { x: 2430, y: 1030 };

function pal(key, fallback) {
  return (PALETTE && PALETTE[key]) || fallback;
}
const GOLD = pal('gold', '#f2c14e');
const INK = pal('text', '#f5f1e6');
const MUTED = pal('muted', '#b8b2a2');
const RED = pal('red', '#e5484d');
const GREEN = pal('green', '#4caf6d');
const PANEL = pal('panel', 'rgba(12, 14, 20, 0.72)');
const MISSION_YELLOW = pal('missionYellow', '#ffd23e');
const CYAN = pal('objectiveCyan', '#35d0d8');

function font(size, display) {
  const stack = display ? (FONTS.display || 'sans-serif') : (FONTS.sans || 'sans-serif');
  return 'bold ' + size + 'px ' + stack;
}

// Rounded-rectangle path (works even where ctx.roundRect is missing).
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

// Dark translucent panel with a faint gold edge.
function panel(ctx, x, y, w, h) {
  rr(ctx, x, y, w, h, 10);
  ctx.fillStyle = PANEL;
  ctx.fill();
  ctx.strokeStyle = 'rgba(242, 193, 78, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// One five-pointed star; filled gold when lit, dull grey otherwise.
function star(ctx, cx, cy, r, lit) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = lit ? GOLD : 'rgba(200, 200, 200, 0.28)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawStars(ctx, x, y, wanted) {
  for (let i = 0; i < 5; i++) star(ctx, x + i * 26, y, 10, i < wanted);
}

// Resolve the mission step the player is on right now.
// S.mission.step is a NUMBER index into the job's step list.
function currentStep(S) {
  if (!S || !S.mission) return null;
  const def = MISSIONS && MISSIONS[S.mission.index];
  if (def && def.steps) return def.steps[S.mission.step || 0] || null;
  return null;
}

// Where the mission blip belongs, mirroring the world renderer's logic.
function missionTarget(S) {
  const step = currentStep(S);
  if (!step || !S.mission || S.storyDone) return null;
  if (step.type === 'reach' || step.type === 'hold' || step.type === 'earn') {
    return { x: step.x, y: step.y };
  }
  if (step.type === 'checkpoints') {
    const idx = (S.mission.cpIndex != null ? S.mission.cpIndex : step.cpIndex) || 0;
    return step.points ? step.points[Math.min(idx, step.points.length - 1)] : null;
  }
  if (step.type === 'stealMarked') {
    // The marked Comet lives in S.cars with marked:true.
    const car = (S.cars || []).find((c) => c.marked);
    return car ? { x: car.x, y: car.y } : HOT_WHEELS;
  }
  if (step.type === 'defeat') return { x: step.x, y: step.y };
  return GARAGE;
}

// Live minimap: green ground, blue water west, dark roads, blips.
function drawMinimap(ctx, S, x, y, w, h) {
  const sx = w / 3600, sy = h / 2800;
  const wx = typeof WATER_X === 'number' ? WATER_X : 240;
  panel(ctx, x - 5, y - 5, w + 10, h + 26);
  ctx.save();
  rr(ctx, x, y, w, h, 4);
  ctx.clip();
  ctx.fillStyle = '#3e7a44'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#2f6fb2'; ctx.fillRect(x, y, wx * sx, h);
  ctx.fillStyle = '#d9c48a'; ctx.fillRect(x + wx * sx, y, (480 - wx) * sx, h);
  ctx.strokeStyle = 'rgba(18, 18, 24, 0.85)';
  ctx.lineWidth = 3;
  for (const ax of AVENUES) { ctx.beginPath(); ctx.moveTo(x + ax * sx, y); ctx.lineTo(x + ax * sx, y + h); ctx.stroke(); }
  for (const st of STREETS) { ctx.beginPath(); ctx.moveTo(x, y + st * sy); ctx.lineTo(x + w, y + st * sy); ctx.stroke(); }
  const t = missionTarget(S);
  if (t) {
    const pr = 4 + Math.sin((S.time || 0) * 5) * 1.5;
    ctx.fillStyle = MISSION_YELLOW;
    ctx.beginPath(); ctx.arc(x + t.x * sx, y + t.y * sy, pr, 0, Math.PI * 2); ctx.fill();
  }
  const c = S.courier;
  if (c && c.x != null && c.y != null) {
    ctx.fillStyle = CYAN;
    ctx.beginPath(); ctx.arc(x + c.x * sx, y + c.y * sy, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = RED;
  // Foot cops live in S.cops alongside nothing else — no separate array.
  for (const cop of (S.cops || [])) {
    ctx.beginPath(); ctx.arc(x + cop.x * sx, y + cop.y * sy, 3, 0, Math.PI * 2); ctx.fill();
  }
  const p = S.player;
  if (p) {
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(x + p.x * sx, y + p.y * sy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x + p.x * sx, y + p.y * sy, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = INK;
  ctx.font = font(11, false);
  ctx.textAlign = 'center';
  ctx.fillText('SOLMAR', x + w / 2, y + h + 16);
  ctx.textAlign = 'left';
}

export function drawHud(ctx, S, view) {
  const p = S.player;
  const stats = S.stats || {};
  const gold = stats.goldFound ? stats.goldFound.length : 0;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // Top-left: cash, jobs, gold, health, weapon.
  panel(ctx, 12, 12, 252, 108);
  ctx.fillStyle = GOLD; ctx.font = font(24, true);
  ctx.fillText('$' + (p.cash || 0), 24, 42);
  ctx.fillStyle = INK; ctx.font = font(14, false);
  ctx.fillText('Jobs ' + (stats.missionsDone || 0) + '/8   Gold ' + gold + '/12', 24, 66);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(24, 76, 150, 12);
  ctx.fillStyle = (p.hp || 0) > 30 ? GREEN : RED;
  ctx.fillRect(24, 76, 150 * Math.max(0, (p.hp || 0) / 100), 12);
  ctx.fillStyle = MUTED; ctx.font = font(12, false);
  ctx.fillText('HP ' + Math.ceil(p.hp || 0), 182, 86);
  if (!p.car) {
    const armed = p.weapon === 'pistol' || (p.ammo || 0) > 0;
    ctx.fillStyle = INK; ctx.font = font(13, false);
    ctx.fillText(armed ? 'Pistol — ' + (p.ammo || 0) + ' rounds' : 'Fists', 24, 106);
  }
  // Top-right: wanted stars.
  panel(ctx, view.w - 212, 12, 200, 58);
  ctx.fillStyle = RED; ctx.font = font(15, true);
  ctx.fillText('WANTED', view.w - 200, 33);
  drawStars(ctx, view.w - 190, 50, S.wanted || 0);
  // Top-centre: mission line.
  const line = S.storyDone ? 'Story complete — free roam!' : missionText(S);
  if (line) {
    ctx.font = font(16, false);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillText(line, view.w / 2 + 1, 31);
    ctx.fillStyle = INK;
    ctx.fillText(line, view.w / 2, 30);
    ctx.textAlign = 'left';
  }
  // Bottom-right: minimap.
  drawMinimap(ctx, S, view.w - 216, view.h - 156, 200, 140);
  // Bottom-left: speedometer in a car, controls hint on foot.
  if (p.car) {
    panel(ctx, 12, view.h - 66, 220, 54);
    ctx.fillStyle = INK; ctx.font = font(22, true);
    ctx.fillText(Math.round(Math.abs(p.car.speed || 0) * 0.4) + ' km/h', 24, view.h - 40);
    ctx.fillStyle = MUTED; ctx.font = font(12, false);
    ctx.fillText('E to exit, Space handbrake', 24, view.h - 22);
  } else {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.font = font(13, false);
    ctx.fillText('WASD move · E car · F punch · Click shoot', 13, view.h - 19);
    ctx.fillStyle = MUTED;
    ctx.fillText('WASD move · E car · F punch · Click shoot', 12, view.h - 20);
  }
  // Centre toast.
  if (S.toastTime > 0 && S.toastText) {
    ctx.font = font(16, false);
    const tw = ctx.measureText(S.toastText).width + 32;
    panel(ctx, (view.w - tw) / 2, view.h * 0.3, tw, 40);
    ctx.fillStyle = INK; ctx.textAlign = 'center';
    ctx.fillText(S.toastText, view.w / 2, view.h * 0.3 + 26);
    ctx.textAlign = 'left';
  }
  // Hold-progress ring around the screen centre.
  const step = currentStep(S);
  if (step && step.type === 'hold' && S.mission.hold > 0 && step.seconds) {
    const frac = Math.min(1, S.mission.hold / step.seconds);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(view.w / 2, view.h / 2, 36, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(view.w / 2, view.h / 2, 36, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
  }
}

// Shared menu list: the selected row gets a gold bar with dark text.
function drawMenu(ctx, options, sel, cx, y0) {
  ctx.textAlign = 'center';
  options.forEach((opt, i) => {
    const y = y0 + i * 34;
    if (i === sel) {
      ctx.fillStyle = GOLD;
      ctx.fillRect(cx - 130, y - 20, 260, 28);
      ctx.fillStyle = '#14100a';
    } else if (opt.disabled) {
      ctx.fillStyle = 'rgba(180, 175, 160, 0.45)';
    } else {
      ctx.fillStyle = INK;
    }
    ctx.font = font(i === sel ? 19 : 17, true);
    ctx.fillText(opt.label, cx, y);
  });
  ctx.textAlign = 'left';
}

export function drawTitle(ctx, S, view, sel) {
  // Dark golden-hour wash, translucent so the living city shows through.
  const g = ctx.createLinearGradient(0, 0, 0, view.h);
  g.addColorStop(0, 'rgba(26, 18, 8, 0.86)');
  g.addColorStop(0.6, 'rgba(36, 26, 16, 0.84)');
  g.addColorStop(1, 'rgba(14, 12, 8, 0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.textAlign = 'center';
  ctx.fillStyle = GOLD;
  ctx.font = font(84, true);
  ctx.fillText('SOLMAR', view.w / 2, view.h * 0.32);
  ctx.fillStyle = INK;
  ctx.font = font(26, true);
  ctx.fillText('Streets of Gold', view.w / 2, view.h * 0.32 + 40);
  ctx.fillStyle = MUTED;
  ctx.font = font(15, false);
  ctx.fillText('You owe Vera Solano $5,000. Eight jobs. One way out.', view.w / 2, view.h * 0.32 + 72);
  drawMenu(ctx, [
    { label: 'Continue', disabled: !S.hasSave },
    { label: 'New Game' },
    { label: 'How to Play' },
  ], sel, view.w / 2, view.h * 0.55);
  ctx.fillStyle = MUTED;
  ctx.font = font(13, false);
  ctx.fillText('WASD move · E enter car · F punch · Click shoot · P pause · M mute', view.w / 2, view.h - 44);
  ctx.fillText('Progress autosaves after every job.', view.w / 2, view.h - 24);
  ctx.textAlign = 'left';
}

export function drawHowTo(ctx, S, view) {
  ctx.fillStyle = 'rgba(10, 10, 14, 0.88)';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.textAlign = 'center';
  ctx.fillStyle = GOLD; ctx.font = font(40, true);
  ctx.fillText('HOW TO PLAY', view.w / 2, 90);
  const lines = [
    'WASD / Arrows — move · Shift — run',
    'E — enter / exit a car (stealing raises your wanted level)',
    'F — punch · Click — shoot (aim with the mouse)',
    'Space — handbrake · H — horn · P / Esc — pause · M — mute',
    'Police chase you at higher wanted levels — 1.2 s beside a cop and you are BUSTED',
    'Lay Low Motors spray shops clear all wanted stars for $100',
    'Gold bars hide around the city — each is worth $250',
    'Blue markers are courier jobs — deliver in time for $150',
    'Finish all 8 jobs and bring $5,000 to Vera to clear your debt',
  ];
  ctx.fillStyle = INK; ctx.font = font(16, false);
  lines.forEach((ln, i) => ctx.fillText(ln, view.w / 2, 150 + i * 30));
  ctx.fillStyle = MUTED; ctx.font = font(15, false);
  ctx.fillText('Enter to go back', view.w / 2, 150 + lines.length * 30 + 20);
  ctx.textAlign = 'left';
}

export function drawPaused(ctx, S, view, sel) {
  ctx.fillStyle = 'rgba(8, 8, 12, 0.7)';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.textAlign = 'center';
  ctx.fillStyle = INK; ctx.font = font(44, true);
  ctx.fillText('PAUSED', view.w / 2, view.h * 0.3);
  const stats = S.stats || {};
  ctx.fillStyle = MUTED; ctx.font = font(16, false);
  ctx.fillText('Cash $' + (S.player.cash || 0) + '   Jobs ' + (stats.missionsDone || 0) + '/8   Gold ' + (stats.goldFound ? stats.goldFound.length : 0) + '/12', view.w / 2, view.h * 0.3 + 34);
  drawMenu(ctx, [{ label: 'Resume' }, { label: 'Restart Job' }, { label: 'Save & Quit' }], sel, view.w / 2, view.h * 0.48);
  ctx.textAlign = 'left';
}

export function drawBusted(ctx, S, view) {
  ctx.fillStyle = 'rgba(10, 6, 8, 0.78)';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.textAlign = 'center';
  const wasted = !!S.wasted;
  ctx.fillStyle = wasted ? RED : '#4d8fd1';
  ctx.font = font(64, true);
  ctx.fillText(wasted ? 'WASTED' : 'BUSTED', view.w / 2, view.h * 0.42);
  const fine = S.fine != null ? S.fine : Math.min(200, Math.floor((S.player.cash || 0) / 10));
  ctx.fillStyle = INK; ctx.font = font(18, false);
  ctx.fillText(wasted ? 'Hospital bill: $' + fine + '. The job failed.' : 'Busted! Fine: $' + fine + '. The job failed.', view.w / 2, view.h * 0.42 + 40);
  ctx.fillStyle = MUTED; ctx.font = font(15, false);
  ctx.fillText('Enter to continue', view.w / 2, view.h * 0.42 + 76);
  ctx.textAlign = 'left';
}

export function drawStoryComplete(ctx, S, view) {
  ctx.fillStyle = 'rgba(12, 10, 4, 0.72)';
  ctx.fillRect(0, 0, view.w, view.h);
  ctx.textAlign = 'center';
  ctx.fillStyle = GOLD; ctx.font = font(56, true);
  ctx.fillText('PAID IN FULL', view.w / 2, view.h * 0.42);
  ctx.fillStyle = INK; ctx.font = font(18, false);
  ctx.fillText('The debt is settled. Solmar is yours — free roam!', view.w / 2, view.h * 0.42 + 40);
  ctx.fillStyle = MUTED; ctx.font = font(15, false);
  ctx.fillText('Enter to keep playing', view.w / 2, view.h * 0.42 + 76);
  ctx.textAlign = 'left';
}
