// SOLMAR — Streets of Gold (make.fun gta6-01)
// Boot, screens and the fixed-step loop: title, play, pause, busted,
// wasted and story-complete, plus the deterministic ?shot= scenes.
// Plain ES modules, no network: every import lives under game/src/.

import { FIXED_DT } from './config.js';
import { createWorld } from './world.js';
import { createRenderer } from './render.js';
import {
  SCREENS,
  drawHud,
  drawTitle,
  drawHowToPlay,
  drawPaused,
  drawBusted,
  drawStoryComplete,
} from './hud.js';
import { ACTION, createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  saveGame,
  loadGame,
  hasSave,
  clearSave,
  readBest,
  saveBest,
} from './save.js';
import { stageShot, SHOT_NAMES } from './shots.js';

// ---- Query: ?shot=<scene> for screenshots, ?seed=<n> to fix the city.
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot') || null;
const seedText = params.get('seed');
const seed = seedText !== null && seedText !== ''
  ? (Number(seedText) >>> 0)
  : Math.floor(Math.random() * 2 ** 32);

// ---- Boot: canvas, sound, world, renderer, input.
const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const ctx = canvas.getContext('2d');
const audio = createAudio();
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const input = createInput(canvas);
// The renderer is the world's camera: mouse aim needs screenToWorld.
world.camera = renderer;

// ---- Screen-reader status line (visually hidden #status paragraph).
function announce(text) {
  if (statusEl) statusEl.textContent = text;
}

// ---- Fit the canvas to the window; the renderer follows on resize.
function fitCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  renderer.resize();
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

// ---- Screen + menu state.
let screen = SCREENS.TITLE;
let showHowTo = false;
let titleSelected = 0;
let pauseSelected = 0;
let lastMenuDir = 0; // edge trigger for up/down menu movement
let storyShown = false; // story-complete screen shows once per run
let best = 0;
try { best = readBest(); } catch (e) { best = 0; }

// ---- Save access never throws: a denied or corrupt save just plays on.
function safeHasSave() {
  try { return hasSave(); } catch (e) { return false; }
}
function loadGameSafe() {
  try { return loadGame(); } catch (e) { return null; }
}
function saveGameSafe() {
  try { saveGame(world.state); } catch (e) { /* storage denied */ }
}
function saveBestSafe(cash) {
  try { saveBest(cash); } catch (e) { /* storage denied */ }
}

// ---- Mute anywhere: M toggles sound on every screen.
function handleMute(bits) {
  if (bits & ACTION.MUTE) {
    audio.setMuted(!audio.isMuted());
    announce(audio.isMuted() ? 'Sound muted.' : 'Sound on.');
  }
}

// Menus take ONLY confirm/pause/mute: driving actions (E, F, click)
// stay queued so the world step still receives them.
function menuBits() {
  const bits = input.takeActions(ACTION.CONFIRM | ACTION.PAUSE | ACTION.MUTE);
  handleMute(bits);
  return bits;
}

// Edge-triggered up/down: one step per fresh press, not per frame held.
function menuStep(selected, count) {
  const dir = input.direction.y;
  if (dir !== 0 && dir !== lastMenuDir) {
    selected = (selected + dir + count) % count;
    audio.click();
  }
  lastMenuDir = dir;
  return selected;
}

// Title menu: Continue only exists when a save is present.
function titleItems() {
  const items = [];
  if (safeHasSave()) items.push('Continue');
  items.push('New Game');
  items.push('How to Play');
  return items;
}

// ---- Start a game: fresh wipes the save and resets the world,
// Continue resets then applies the save on top of the fresh state.
function startGame(fresh) {
  audio.unlock();
  input.takeActions(0xff); // drain anything queued on the menus
  storyShown = false;
  if (fresh) {
    try { clearSave(); } catch (e) { /* storage denied */ }
    world.reset();
  } else {
    const save = loadGameSafe();
    world.reset();
    if (save) applySave(save);
  }
  world.state.attract = false;
  screen = SCREENS.PLAY;
  announce('Playing SOLMAR — Streets of Gold.');
}

// Restore a save: cash, position, gold found, stats, and the current
// job restarts — the mission index steps one back, job starts in 2 s.
function applySave(save) {
  const s = world.state;
  try {
    if (Number.isFinite(save.cash)) s.player.cash = save.cash;
    if (Number.isFinite(save.playerX)) s.player.x = save.playerX;
    if (Number.isFinite(save.playerY)) s.player.y = save.playerY;
    if (Array.isArray(save.goldFound)) s.goldFound = save.goldFound.slice();
    if (s.stats) {
      if (Number.isFinite(save.carsStolen)) s.stats.carsStolen = save.carsStolen;
      if (Number.isFinite(save.missionsDone)) s.stats.missionsDone = save.missionsDone;
    }
    s.storyDone = !!save.storyDone;
    s.mission = null;
    if (s.storyDone) {
      s.missionIndex = Number.isFinite(save.missionIndex) ? save.missionIndex : 0;
      s.nextMissionIn = 9999; // story finished: free roam, no more jobs
    } else {
      s.missionIndex = Math.max(0, (save.missionIndex || 0) - 1);
      s.nextMissionIn = 2;
    }
  } catch (e) { /* a bad save never breaks the game */ }
}

// ---- Per-screen ticks (one fixed step each).
function tickTitle() {
  const s = world.state;
  s.attract = true; // the city lives behind the title
  world.step(FIXED_DT, input);
  const bits = menuBits();
  if (showHowTo) {
    if (bits & ACTION.CONFIRM) { showHowTo = false; audio.click(); }
    return;
  }
  const items = titleItems();
  if (titleSelected >= items.length) titleSelected = 0;
  titleSelected = menuStep(titleSelected, items.length);
  if (bits & ACTION.CONFIRM) {
    const choice = items[titleSelected];
    audio.click();
    if (choice === 'Continue') startGame(false);
    else if (choice === 'New Game') startGame(true);
    else if (choice === 'How to Play') showHowTo = true;
  }
}

function tickPlay() {
  const s = world.state;
  const bits = menuBits();
  if (bits & ACTION.PAUSE) {
    screen = SCREENS.PAUSED;
    pauseSelected = 0;
    announce('Paused.');
    return;
  }
  world.step(FIXED_DT, input);
  if (s.player.cash > best) { best = s.player.cash; saveBestSafe(best); }
  if (s.busted || s.wasted) {
    saveGameSafe();
    screen = s.busted ? SCREENS.BUSTED : SCREENS.WASTED;
    audio.busted();
    announce(s.busted ? 'Busted. You paid a fine.' : 'Wasted. You woke up in hospital.');
    return;
  }
  if (s.storyDone && !storyShown) {
    storyShown = true;
    screen = SCREENS.STORY;
    announce('Paid in full. Legend of Solmar.');
  }
}

function tickPaused() {
  const s = world.state;
  const items = ['Resume', 'Restart Job', 'Save & Quit'];
  const bits = menuBits();
  pauseSelected = menuStep(pauseSelected, items.length);
  if (bits & ACTION.PAUSE) { screen = SCREENS.PLAY; announce('Playing.'); return; }
  if (!(bits & ACTION.CONFIRM)) return;
  audio.click();
  const choice = items[pauseSelected];
  if (choice === 'Resume') {
    screen = SCREENS.PLAY;
  } else if (choice === 'Restart Job') {
    s.mission = null; // current job restarts; the index stays
    s.nextMissionIn = 0.5;
    screen = SCREENS.PLAY;
    announce('Job restarted.');
  } else if (choice === 'Save & Quit') {
    saveGameSafe();
    screen = SCREENS.TITLE;
    showHowTo = false;
    titleSelected = 0;
    announce('Game saved. Title screen.');
  }
}

function tickBusted() {
  const s = world.state;
  const bits = menuBits();
  if (bits & ACTION.CONFIRM) {
    s.busted = false;
    s.wasted = false;
    screen = SCREENS.PLAY;
    announce('Back on the streets.');
  }
}

function tickStory() {
  const bits = menuBits();
  if (bits & ACTION.CONFIRM) {
    screen = SCREENS.PLAY;
    announce('Free roam. Legend of Solmar.');
  }
}

function tick() {
  if (screen === SCREENS.TITLE) tickTitle();
  else if (screen === SCREENS.PLAY) tickPlay();
  else if (screen === SCREENS.PAUSED) tickPaused();
  else if (screen === SCREENS.BUSTED || screen === SCREENS.WASTED) tickBusted();
  else if (screen === SCREENS.STORY) tickStory();
}

// ---- Frame painter: the world, then the screen on top of it.
function paint() {
  const view = renderer.view;
  renderer.drawWorld(world);
  if (screen === SCREENS.PLAY) {
    drawHud(ctx, world, view);
  } else if (screen === SCREENS.TITLE) {
    if (showHowTo) drawHowToPlay(ctx, view);
    else drawTitle(ctx, view, titleSelected, safeHasSave());
  } else if (screen === SCREENS.PAUSED) {
    drawHud(ctx, world, view);
    drawPaused(ctx, view, world, pauseSelected);
  } else if (screen === SCREENS.BUSTED || screen === SCREENS.WASTED) {
    drawHud(ctx, world, view);
    drawBusted(ctx, view, world);
  } else if (screen === SCREENS.STORY) {
    drawHud(ctx, world, view);
    drawStoryComplete(ctx, view, world);
  }
}

// ---- Fixed-step loop: 1/60 s steps, max 0.25 s frame, max 5 steps.
let last = 0;
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!last) last = now;
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  if (dt < 0) dt = 0;
  acc += dt;
  let steps = 0;
  while (acc >= FIXED_DT && steps < 5) { tick(); acc -= FIXED_DT; steps += 1; }
  if (steps === 5) acc = 0;
  paint();
}

// Tab-hide auto-pauses a live game.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === SCREENS.PLAY) {
    screen = SCREENS.PAUSED;
    pauseSelected = 0;
    announce('Paused.');
  }
});

// ---- Shot path: stage the scene, paint twice, signal ready.
if (shotName) {
  try {
    const name = Array.isArray(SHOT_NAMES) && SHOT_NAMES.includes(shotName)
      ? shotName : 'title';
    const shot = stageShot(world, name);
    screen = shot.screen || SCREENS.TITLE;
    if (shot.best) best = shot.best;
  } catch (e) {
    screen = SCREENS.TITLE; // a failed stage still yields a title shot
  }
  paint();
  paint();
  window.__shotReady = true;
} else {
  // ---- Game path: title over the living city, then the loop.
  world.state.attract = true;
  announce('SOLMAR — Streets of Gold. Title screen.');
  requestAnimationFrame(frame);
}
