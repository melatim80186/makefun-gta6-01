// hud.js — SOLMAR HUD, minimap and menus.
// Everything the player reads on screen: cash, health, wanted stars,
// the mission line, the live minimap, toasts, and the title/pause/
// busted/wasted/story screens. Canvas 2D only, no network.

import { PALETTE, FONTS, PLACES } from './config.js';
import { missionText, missionTarget } from './missions.js';

export const SCREENS = {
  TITLE: 'title',
  PLAY: 'play',
  PAUSED: 'paused',
  BUSTED: 'busted',
  WASTED: 'wasted',
  STORY: 'story',
};

function stateOf(world) {
  if (!world) return {};
  return world.state || world;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Dark translucent panel with a soft gold edge.
export function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.panel;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(242, 193, 78, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Five wanted stars: gold filled up to the wanted level, grey after.
export function drawStars(ctx, x, y, wanted) {
  const level = Math.max(0, Math.min(5, wanted || 0));
  ctx.font = 'bold 20px ' + FONTS.display;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < level ? PALETTE.gold : 'rgba(160, 160, 150, 0.45)';
    ctx.fillText('\u2605', x + i * 24, y);
  }
}

// Live minimap: whole city shrunk to a small panel.
export function drawMinimap(ctx, world, x, y, w, h) {
  const state = stateOf(world);
  const city = state.city || {};
  const worldW = (city.worldW || city.width) || 3600;
  const worldH = (city.worldH || city.height) || 2800;
  const sx = w / worldW;
  const sy = h / worldH;
  panel(ctx, x - 4, y - 4, w + 8, h + 8);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  // Green ground with a blue water strip on the west edge.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(x, y, 240 * sx, h);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(x + 240 * sx, y, 240 * sx, h);
  // Dark roads.
  ctx.fillStyle = PALETTE.asphalt;
  const avenues = city.avenues || [480, 880, 1280, 1680, 2080, 2480, 2880, 3280];
  const streets = city.streets || [360, 720, 1080, 1440, 1800, 2160, 2520];
  for (const ax of avenues) ctx.fillRect(x + ax * sx - 2, y, 4, h);
  for (const sy2 of streets) ctx.fillRect(x, y + sy2 * sy - 2, w, 4);
  // Pulsing yellow mission blip.
  let target = null;
  try { target = missionTarget(state); } catch (e) { target = null; }
  if (target) {
    const pulse = 3 + Math.sin(Date.now() / 180) * 1.5;
    ctx.fillStyle = PALETTE.missionYellow;
    ctx.beginPath();
    ctx.arc(x + target.x * sx, y + target.y * sy, pulse + 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cyan courier blip.
  const courier = state.courier;
  if (courier && (courier.active || courier.stage === 'pickup' || courier.stage === 'delivery')) {
    ctx.fillStyle = PALETTE.objectiveCyan;
    ctx.beginPath();
    ctx.arc(x + courier.x * sx, y + courier.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Red police dots.
  const cops = state.cops || [];
  ctx.fillStyle = PALETTE.red;
  for (const cop of cops) {
    ctx.beginPath();
    ctx.arc(x + cop.x * sx, y + cop.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // White player dot with a dark ring.
  const p = state.player;
  if (p) {
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(x + p.x * sx, y + p.y * sy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x + p.x * sx, y + p.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 11px ' + FONTS.display;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('SOLMAR', x, y + h + 14);
}

// ---- in-game HUD ----

function toastText(state) {
  const t = state.toast;
  if (!t) return '';
  if (typeof t === 'string') return t;
  if (typeof t.text === 'string') return t.text;
  return '';
}

export function drawHud(ctx, world, view) {
  const state = stateOf(world);
  const p = state.player || {};
  const stats = state.stats || {};
  const w = view.w;
  const h = view.h;

  // Top-left: cash, missions/gold counts, health bar, weapon line.
  panel(ctx, 12, 12, 220, 96);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 24px ' + FONTS.display;
  ctx.fillText('$' + Math.floor(p.cash || 0), 24, 40);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '13px ' + FONTS.sans;
  ctx.fillText('Jobs ' + (stats.missionsDone || 0) + '/8   Gold ' + (stats.goldFound || 0) + '/12', 24, 62);
  const hp = Math.max(0, Math.min(100, p.hp || 0));
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(24, 70, 196, 12);
  ctx.fillStyle = hp > 30 ? PALETTE.green : PALETTE.red;
  ctx.fillRect(24, 70, 196 * (hp / 100), 12);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 10px ' + FONTS.sans;
  ctx.fillText('HP ' + Math.round(hp), 26, 79);
  if (!p.car) {
    const weapon = p.weapon || 'Fists';
    const ammo = weapon === 'Pistol' ? ' — ' + (p.ammo || 0) + ' rounds' : '';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '13px ' + FONTS.sans;
    ctx.fillText(weapon + ammo, 24, 100);
  }

  // Top-right: WANTED + stars.
  panel(ctx, w - 196, 12, 184, 52);
  ctx.fillStyle = PALETTE.red;
  ctx.font = 'bold 14px ' + FONTS.display;
  ctx.fillText('WANTED', w - 184, 30);
  drawStars(ctx, w - 184, 50, state.wanted || 0);

  // Top-centre: mission line, or the story-complete line.
  let line = '';
  try { line = missionText(state) || ''; } catch (e) { line = ''; }
  if (state.storyDone) line = 'Legend of Solmar — free roam';
  if (line) {
    ctx.font = 'bold 15px ' + FONTS.sans;
    const tw = ctx.measureText(line).width;
    panel(ctx, (w - tw) / 2 - 14, 12, tw + 28, 34);
    ctx.fillStyle = PALETTE.missionYellow;
    ctx.textAlign = 'center';
    ctx.fillText(line, w / 2, 35);
    ctx.textAlign = 'left';
  }

  // Minimap bottom-right (map bottom ~28px above viewport bottom so the
  // SOLMAR caption below it stays fully visible).
  drawMinimap(ctx, world, w - 212, h - 168, 200, 140);

  // Bottom-left: speedometer in a car, controls hint on foot.
  if (p.car) {
    const kmh = Math.round((p.car.speed || 0) * 0.4);
    panel(ctx, 12, h - 76, 170, 64);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 30px ' + FONTS.display;
    ctx.fillText(kmh + '', 24, h - 42);
    ctx.font = '12px ' + FONTS.sans;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('km/h', 24, h - 24);
    ctx.fillText('E exit   S brake', 92, h - 30);
  } else {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '13px ' + FONTS.sans;
    ctx.fillText('WASD move  Shift run  E car  F punch  Click shoot  H horn  P pause', 14, h - 14);
  }

  // Centre toast.
  const toast = toastText(state);
  if (toast) {
    ctx.font = 'bold 17px ' + FONTS.sans;
    const tw = ctx.measureText(toast).width;
    panel(ctx, (w - tw) / 2 - 14, h / 2 - 58, tw + 28, 36);
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'center';
    ctx.fillText(toast, w / 2, h / 2 - 33);
    ctx.textAlign = 'left';
  }

  // Hold-progress ring around screen centre while a hold step is part-way.
  const m = state.mission;
  if (m && m.job && !m.complete && !m.failed) {
    const step = m.job.steps[m.stepIndex];
    if (step && step.type === 'hold' && m.holdTime > 0) {
      const frac = Math.min(1, m.holdTime / (step.seconds || 1));
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = PALETTE.missionYellow;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 46, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = PALETTE.text;
      ctx.font = 'bold 16px ' + FONTS.sans;
      ctx.textAlign = 'center';
      ctx.fillText(Math.ceil((step.seconds || 0) - m.holdTime) + 's', w / 2, h / 2 + 6);
      ctx.textAlign = 'left';
    }
  }
}

// ---- screens ----

function menuList(ctx, options, selected, cx, y0, visible) {
  ctx.textAlign = 'center';
  options.forEach((opt, i) => {
    if (!visible(i)) return;
    const y = y0 + i * 44;
    const isSel = i === selected;
    ctx.font = (isSel ? 'bold 24px ' : '20px ') + FONTS.display;
    ctx.fillStyle = isSel ? PALETTE.gold : PALETTE.text;
    if (isSel) ctx.fillText('\u25B8 ' + opt + ' \u25C2', cx, y);
    else ctx.fillText(opt, cx, y);
  });
  ctx.textAlign = 'left';
}

export function drawTitle(ctx, view, selected, hasSave) {
  const w = view.w;
  const h = view.h;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(8, 10, 18, 0.88)');
  grad.addColorStop(0.6, 'rgba(20, 16, 8, 0.82)');
  grad.addColorStop(1, 'rgba(8, 10, 18, 0.92)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 84px ' + FONTS.display;
  ctx.fillText('SOLMAR', w / 2, h * 0.32);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'italic 26px ' + FONTS.display;
  ctx.fillText('Streets of Gold', w / 2, h * 0.32 + 40);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '17px ' + FONTS.sans;
  ctx.fillText('You owe Vera Solano $5,000.', w / 2, h * 0.32 + 78);
  ctx.fillText('Work it off, one job at a time — or die trying.', w / 2, h * 0.32 + 102);
  const options = ['Continue', 'New Game', 'How to Play'];
  menuList(ctx, options, selected, w / 2, h * 0.55, (i) => i !== 0 || hasSave);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '13px ' + FONTS.sans;
  ctx.fillText('Enter select   Up/Down move   P pause   M mute', w / 2, h - 56);
  ctx.fillText('Progress autosaves after every job.', w / 2, h - 34);
  ctx.textAlign = 'left';
}

export function drawHowToPlay(ctx, view) {
  const w = view.w;
  const h = view.h;
  ctx.fillStyle = 'rgba(8, 10, 18, 0.92)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 40px ' + FONTS.display;
  ctx.fillText('HOW TO PLAY', w / 2, 90);
  const lines = [
    'WASD / Arrows — move and drive      Shift — run',
    'E — enter / exit a car      Space — handbrake',
    'F — punch      Click — shoot the pistol      H — horn',
    'P / Esc — pause      M — mute',
    '',
    'Steal cars, run Vera\'s eight jobs, and pay off $5,000.',
    'Stealing a car or hitting a pedestrian raises your wanted level.',
    'Foot cops next to you for 1.2s will bust you.',
    'Drive into a Lay Low Motors pad ($100) to clear your wanted level.',
    'Find 12 hidden gold bars ($250 each) and run courier jobs ($150).',
    'Getting busted or wasted costs $200 or 10% of your cash.',
  ];
  ctx.fillStyle = PALETTE.text;
  ctx.font = '17px ' + FONTS.sans;
  lines.forEach((line, i) => ctx.fillText(line, w / 2, 150 + i * 32));
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '15px ' + FONTS.sans;
  ctx.fillText('Enter to go back', w / 2, h - 40);
  ctx.textAlign = 'left';
}

export function drawPaused(ctx, view, world, selected) {
  const state = stateOf(world);
  const stats = state.stats || {};
  const w = view.w;
  const h = view.h;
  ctx.fillStyle = 'rgba(8, 10, 18, 0.7)';
  ctx.fillRect(0, 0, w, h);
  panel(ctx, w / 2 - 220, h / 2 - 170, 440, 340);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 36px ' + FONTS.display;
  ctx.fillText('PAUSED', w / 2, h / 2 - 118);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '16px ' + FONTS.sans;
  ctx.fillText('Cash $' + Math.floor((state.player || {}).cash || 0), w / 2, h / 2 - 78);
  ctx.fillText('Jobs done ' + (stats.missionsDone || 0) + '/8   Gold ' + (stats.goldFound || 0) + '/12', w / 2, h / 2 - 52);
  if (state.best) ctx.fillText('Best cash $' + Math.floor(state.best), w / 2, h / 2 - 26);
  menuList(ctx, ['Resume', 'Restart Job', 'Save & Quit'], selected, w / 2, h / 2 + 22, () => true);
  ctx.textAlign = 'left';
}

export function drawBusted(ctx, view, world) {
  const state = stateOf(world);
  const w = view.w;
  const h = view.h;
  const wasted = !!state.wasted;
  ctx.fillStyle = wasted ? 'rgba(40, 8, 8, 0.82)' : 'rgba(8, 12, 40, 0.82)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = wasted ? PALETTE.red : '#4a7ad8';
  ctx.font = 'bold 72px ' + FONTS.display;
  ctx.fillText(wasted ? 'WASTED' : 'BUSTED', w / 2, h / 2 - 20);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '19px ' + FONTS.sans;
  ctx.fillText(
    wasted
      ? 'Hospital bill: $200 or 10% of your cash. The job is blown.'
      : 'Fine: $200 or 10% of your cash. The job is blown.',
    w / 2, h / 2 + 30,
  );
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '15px ' + FONTS.sans;
  ctx.fillText('Enter to continue', w / 2, h / 2 + 70);
  ctx.textAlign = 'left';
}

export function drawStoryComplete(ctx, view, world) {
  const state = stateOf(world);
  const w = view.w;
  const h = view.h;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(20, 16, 4, 0.9)');
  grad.addColorStop(1, 'rgba(8, 10, 18, 0.92)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = 'bold 64px ' + FONTS.display;
  ctx.fillText('PAID IN FULL', w / 2, h / 2 - 30);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'italic 24px ' + FONTS.display;
  ctx.fillText('Legend of Solmar', w / 2, h / 2 + 16);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '17px ' + FONTS.sans;
  ctx.fillText('The debt is done. Solmar is yours — free roam, keep the gold coming.', w / 2, h / 2 + 52);
  ctx.fillText('Enter to keep playing', w / 2, h / 2 + 90);
  ctx.textAlign = 'left';
}
