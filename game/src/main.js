// SOLMAR — Streets of Gold. Boot, menus and the fixed-step game loop:
// this file wires the world, renderer, input and audio together and owns
// every screen change (title, play, pause, busted, wasted, story).

import { DT } from './config.js';
import { createAudio } from './audio.js';
import { createInput, ACTIONS } from './input.js';
import { createWorld, stepWorld, respawnPlayer } from './world.js';
import { createRenderer } from './render.js';
import {
  SCREENS, drawHud, drawTitle, drawHowTo,
  drawPaused, drawBusted, drawStoryComplete,
} from './hud.js';
import { stageShot } from './shots.js';
import {
  saveGame, loadGame, hasSave, clearSave, readBest, saveBest,
} from './save.js';

// ---- Boot: seed, canvas, and every subsystem the game needs. ----
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot') || '';
const seedParam = params.get('seed');
const seed = seedParam === null
  ? Math.floor(Math.random() * 2 ** 32)
  : parseInt(seedParam, 10) >>> 0;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const ctx = canvas.getContext('2d');

const audio = createAudio();
const input = createInput(canvas);
let S = createWorld(seed);
const renderer = createRenderer(canvas);
S.audio = audio;
S.camera = renderer;
S.attract = true;
S.hasSave = hasSave();
renderer.resize();
window.addEventListener('resize', () => renderer.resize());

function announce(text) {
  status.textContent = text;
}

// ---- Screenshot path: stage the scene, paint it twice, signal ready. ----
if (shotName) {
  const { screen: shotScreen, best: shotBest } = stageShot(S, shotName);
  const view = { w: canvas.width, h: canvas.height };
  for (let pass = 0; pass < 2; pass++) {
    renderer.drawWorld(S);
    if (shotScreen === 'play') drawHud(ctx, S, view);
    else drawTitle(ctx, S, view, 1);
  }
  window.__shotReady = true;
}

// ---- Game path state. ----
let screen = SCREENS.TITLE;
let sel = 1; // title menu: 0 Continue, 1 New Game, 2 How to Play
let pausedSel = 0; // pause menu: 0 Resume, 1 Restart Job, 2 Save & Quit
let storyShown = false;
let lastDir = 0; // edge trigger for menu up/down

// Start a run: fresh clears the save and rebuilds the world, otherwise
// the saved run is restored on top of the current world.
function startGame(fresh) {
  audio.unlock();
  input.takeActions(0xFF);
  if (fresh) {
    clearSave();
    const freshS = createWorld(seed);
    Object.assign(S, freshS);
    S.audio = audio;
    S.camera = renderer;
    storyShown = false;
  } else {
    const d = loadGame();
    if (d) {
      S.player.cash = d.cash;
      S.player.x = d.px;
      S.player.y = d.py;
      S.stats.missionsDone = d.missionsDone || 0;
      S.stats.carsStolen = d.carsStolen || 0;
      S.stats.goldFound = [...(d.goldFound || [])];
      S.pickups = S.pickups.filter(
        (p) => p.kind !== 'gold' || !S.stats.goldFound.includes(p.id),
      );
      S.nextMissionIndex = d.missionIndex || 0;
      S.nextMissionIn = 2;
      S.storyDone = !!d.storyDone;
      storyShown = S.storyDone;
    }
  }
  S.attract = false;
  S.hasSave = hasSave();
  screen = SCREENS.PLAY;
  announce('Game started');
}

function moveSel(delta) {
  // Walk the title menu, skipping Continue when there is no save.
  do {
    sel = (sel + delta + 3) % 3;
  } while (sel === 0 && !S.hasSave);
}

function movePausedSel(delta) {
  pausedSel = (pausedSel + delta + 3) % 3;
}

function quitToTitle() {
  saveGame({
    cash: S.player.cash,
    missionIndex: S.nextMissionIndex,
    goldFound: S.stats.goldFound,
    px: S.player.x,
    py: S.player.y,
    carsStolen: S.stats.carsStolen,
    missionsDone: S.stats.missionsDone,
    storyDone: S.storyDone,
  });
  S.attract = true;
  S.hasSave = true;
  screen = SCREENS.TITLE;
  announce('Game saved');
}

// One fixed step on any menu screen: only confirm/pause/mute are taken,
// so driving actions stay queued for the world step.
function stepMenu() {
  const acts = input.takeActions(ACTIONS.CONFIRM | ACTIONS.PAUSE | ACTIONS.MUTE);
  if (acts & ACTIONS.MUTE) audio.setMuted(!audio.isMuted());

  const dirY = input.direction().y;
  const dir = dirY < 0 ? -1 : dirY > 0 ? 1 : 0;
  if (dir !== 0 && lastDir === 0) {
    if (screen === SCREENS.TITLE) moveSel(dir);
    else if (screen === SCREENS.PAUSED) movePausedSel(dir);
  }
  lastDir = dir;

  if (screen === SCREENS.TITLE) {
    if (acts & ACTIONS.CONFIRM) {
      if (sel === 0) startGame(false);
      else if (sel === 1) startGame(true);
      else screen = 'howto';
    }
    // Pause does nothing on the title screen.
  } else if (screen === 'howto') {
    if (acts & ACTIONS.CONFIRM) screen = SCREENS.TITLE;
  } else if (screen === SCREENS.PAUSED) {
    if (acts & ACTIONS.PAUSE) screen = SCREENS.PLAY;
    else if (acts & ACTIONS.CONFIRM) {
      if (pausedSel === 0) screen = SCREENS.PLAY;
      else if (pausedSel === 1) {
        S.mission = null;
        S.nextMissionIn = 0.5;
        screen = SCREENS.PLAY;
      } else quitToTitle();
    }
  } else if (screen === SCREENS.BUSTED || screen === SCREENS.WASTED) {
    if (acts & ACTIONS.CONFIRM) {
      respawnPlayer(S);
      screen = SCREENS.PLAY;
    }
  } else if (screen === SCREENS.STORY) {
    if (acts & ACTIONS.CONFIRM) screen = SCREENS.PLAY;
  }
}

// One fixed step while playing: build the control block from live input,
// step the world, then catch busted/wasted/story transitions and the
// best-cash record.
function stepPlay() {
  if (S.busted) { screen = SCREENS.BUSTED; return; }
  if (S.wasted) { screen = SCREENS.WASTED; return; }
  const m = input.mouse();
  const aim = renderer.screenToWorld(m.x, m.y);
  const ctl = {
    actions: input.takeActions(0xFF),
    dirX: input.direction().x,
    dirY: input.direction().y,
    accel: input.accelerate(),
    brake: input.brake(),
    run: input.run(),
    handbrake: input.handbrake(),
    mouseX: m.x,
    mouseY: m.y,
    mouseDown: m.down,
    aimX: aim.x,
    aimY: aim.y,
  };
  if (ctl.actions & ACTIONS.MUTE) audio.setMuted(!audio.isMuted());
  if (ctl.actions & ACTIONS.PAUSE) {
    pausedSel = 0;
    screen = SCREENS.PAUSED;
    return;
  }
  stepWorld(S, ctl, DT);
  if (S.busted) screen = SCREENS.BUSTED;
  else if (S.wasted) screen = SCREENS.WASTED;
  else if (S.storyDone && !storyShown) {
    storyShown = true;
    screen = SCREENS.STORY;
  }
  if (S.player.cash > readBest()) saveBest(S.player.cash);
}

// ---- Fixed-step loop and frame painter. ----
let last = performance.now();
let acc = 0;

function stepOnce() {
  if (screen === SCREENS.PLAY) stepPlay();
  else stepMenu();
}

function paint() {
  const view = { w: canvas.width, h: canvas.height };
  if (screen === SCREENS.PLAY) {
    renderer.drawWorld(S);
    drawHud(ctx, S, view);
  } else if (screen === SCREENS.TITLE) {
    renderer.drawWorld(S);
    drawTitle(ctx, S, view, sel);
  } else if (screen === 'howto') {
    drawHowTo(ctx, S, view);
  } else if (screen === SCREENS.PAUSED) {
    renderer.drawWorld(S);
    drawHud(ctx, S, view);
    drawPaused(ctx, S, view, pausedSel);
  } else if (screen === SCREENS.BUSTED || screen === SCREENS.WASTED) {
    renderer.drawWorld(S);
    drawBusted(ctx, S, view);
  } else if (screen === SCREENS.STORY) {
    drawStoryComplete(ctx, S, view);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min((now - last) / 1000, 0.25);
  last = now;
  acc += elapsed;
  while (acc >= DT) {
    acc -= DT;
    stepOnce();
  }
  paint();
}

// Hiding the tab pauses the game instead of letting the world run on.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === SCREENS.PLAY) {
    pausedSel = 0;
    screen = SCREENS.PAUSED;
  }
});

if (!shotName) requestAnimationFrame(frame);
